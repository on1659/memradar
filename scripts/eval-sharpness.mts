#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * memradar sharpness eval — 카테고리별 변별력 진단 (dev-only)
 *
 * 9 카테고리 USAGE 차원 각각의 진술-역진술 변별 성공률을 측정한다.
 * 외부 정답 없는 분류 도메인에서 "정확도" 대신 "변별력(sharpness)" 을 보는 척도.
 *
 * 입력:
 *   - src/lib/usageProfile.ts: USAGE_CATEGORIES (9개 카테고리 메타, read-only)
 *   - scripts/eval-sharpness-statements.json: 카테고리별 진술 (편집 가능)
 *
 * 사용:
 *   npx tsx scripts/eval-sharpness.mts [--pairs N] [--seed S]
 *
 * 출력:
 *   docs/sharpness-report-{YYYY-MM-DD}.json (동일 날짜 재실행 시 -HHmm 추가)
 *
 * 근거: .claude/knowledge/lessons/personality-eval.md L-1, L-2
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { USAGE_CATEGORIES } from '../src/lib/usageProfile.ts'

// --- 타입 -----------------------------------------------------------------
export type CategoryId = string
export type Side = 'left' | 'right' | 'skip'
export type Verdict = 'barnum' | 'moderate' | 'sharp' | 'very_sharp' | 'insufficient'

export interface StatementsFile {
  version: number
  language: string
  statements: Record<CategoryId, string[]>
  lenses?: Record<string, Record<CategoryId, string[]>>
}

export interface Pair {
  index: number
  leftCategory: CategoryId
  rightCategory: CategoryId
  leftStatement: string
  rightStatement: string
}

export interface Choice extends Pair {
  chosen: Side
  chosenCategory: CategoryId | null
}

export interface CategoryStats {
  title: string
  appearances: number
  picks: number
  skips: number
  pickRate: number | null
  sharpness: number | null
  verdict: Verdict
}

interface Report {
  version: number
  ts: string
  seed: number
  pairsRequested: number
  pairsAnswered: number
  pairsSkipped: number
  statementsVersion: number
  statementsLanguage: string
  lens: JobLens
  perCategory: Record<CategoryId, CategoryStats>
  rawChoices: Choice[]
}

// --- 시드 PRNG (mulberry32, 외부 의존성 0) ---------------------------------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- argv 파싱 ------------------------------------------------------------
// 직군 렌즈 키 (general = statements 측정). 앱(src/lib/personaQuiz.ts:JobLens)과 동일 집합.
export type JobLens = 'developer' | 'pm' | 'designer' | 'data' | 'general'
const VALID_LENSES = new Set<JobLens>(['developer', 'pm', 'designer', 'data', 'general'])

interface Args {
  pairs: number
  seed: number
  lens: JobLens
}

export function parseArgs(argv: ReadonlyArray<string>): Args {
  let pairs = 30
  let seed = Date.now() >>> 0
  let lens: JobLens = 'general'
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--pairs') {
      const next = argv[++i]
      const v = next === undefined ? NaN : parseInt(next, 10)
      if (!Number.isFinite(v) || v < 1 || v > 100) {
        throw new Error(`--pairs 는 1~100 정수여야 함 (받음: ${String(next)})`)
      }
      pairs = v
    } else if (arg === '--seed') {
      const next = argv[++i]
      const v = next === undefined ? NaN : parseInt(next, 10)
      if (!Number.isFinite(v)) {
        throw new Error(`--seed 는 정수여야 함 (받음: ${String(next)})`)
      }
      seed = v >>> 0
    } else if (arg === '--lens') {
      const next = argv[++i]
      if (next === undefined || !VALID_LENSES.has(next as JobLens)) {
        throw new Error(
          `--lens 는 developer|pm|designer|data|general 중 하나여야 함 (받음: ${String(next)})`,
        )
      }
      lens = next as JobLens
    } else if (arg === '--help' || arg === '-h') {
      console.log('사용: npx tsx scripts/eval-sharpness.mts [--pairs N] [--seed S] [--lens KEY]')
      console.log('  --pairs N   변별 쌍 개수 (1~100, 기본 30)')
      console.log('  --seed S    PRNG 시드 (기본: 현재 timestamp)')
      console.log('  --lens KEY  직군 렌즈 (developer|pm|designer|data|general, 기본 general)')
      console.log('              general 외 지정 시 해당 렌즈를 general 위에 per-category 폴백 resolve 후 측정')
      process.exit(0)
    } else {
      throw new Error(`알 수 없는 옵션: ${arg ?? ''}`)
    }
  }
  return { pairs, seed, lens }
}

// --- 진술 사전 로드/검증 ---------------------------------------------------
export function loadStatements(scriptDir: string, expectedIds: ReadonlyArray<CategoryId>): StatementsFile {
  const filePath = path.join(scriptDir, 'eval-sharpness-statements.json')
  if (!fs.existsSync(filePath)) {
    throw new Error(`진술 사전 파일이 없음: ${filePath}`)
  }
  const raw = fs.readFileSync(filePath, 'utf-8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new Error(`진술 사전 JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('진술 사전 루트가 객체가 아님')
  }
  const data = parsed as Partial<StatementsFile>
  if (data.version !== 1 && data.version !== 2) {
    throw new Error(`지원되지 않는 진술 사전 버전: ${String(data.version)}`)
  }
  if (typeof data.language !== 'string') {
    throw new Error('language 필드가 문자열이 아님')
  }
  if (!data.statements || typeof data.statements !== 'object') {
    throw new Error('statements 필드가 없거나 객체가 아님')
  }

  const expectedSorted = [...expectedIds].sort()
  const actualSorted = Object.keys(data.statements).sort()
  if (
    expectedSorted.length !== actualSorted.length ||
    expectedSorted.some((id, i) => id !== actualSorted[i])
  ) {
    throw new Error(
      `진술 사전 키가 USAGE_CATEGORIES 와 불일치:\n` +
      `  기대: ${expectedSorted.join(', ')}\n` +
      `  실제: ${actualSorted.join(', ')}`,
    )
  }

  for (const id of expectedIds) {
    const arr = data.statements[id]
    if (!Array.isArray(arr) || arr.length < 2) {
      throw new Error(`카테고리 '${id}' 진술이 2개 미만 (페어 셔플 불가)`)
    }
    if (arr.some((s) => typeof s !== 'string' || !s.trim())) {
      throw new Error(`카테고리 '${id}' 진술에 빈 문자열 또는 비-문자열 포함`)
    }
  }

  // lenses 는 선택. 존재 시 부분 허용(키 집합 강제 안 함)이되, 존재하는 배열은
  // statements 와 동일 규칙(≥2개·빈 문자열 금지)으로 검증한다.
  let lenses: Record<string, Record<CategoryId, string[]>> | undefined
  if (data.lenses !== undefined) {
    if (typeof data.lenses !== 'object' || data.lenses === null) {
      throw new Error('lenses 필드가 객체가 아님')
    }
    for (const [lensKey, lensCats] of Object.entries(data.lenses)) {
      if (typeof lensCats !== 'object' || lensCats === null) {
        throw new Error(`렌즈 '${lensKey}' 가 객체가 아님`)
      }
      for (const [catId, arr] of Object.entries(lensCats)) {
        if (!Array.isArray(arr) || arr.length < 2) {
          throw new Error(`렌즈 '${lensKey}' 카테고리 '${catId}' 진술이 2개 미만`)
        }
        if (arr.some((s) => typeof s !== 'string' || !s.trim())) {
          throw new Error(`렌즈 '${lensKey}' 카테고리 '${catId}' 진술에 빈 문자열 또는 비-문자열 포함`)
        }
      }
    }
    lenses = data.lenses
  }

  return {
    version: data.version,
    language: data.language,
    statements: data.statements,
    ...(lenses ? { lenses } : {}),
  }
}

/**
 * 직군 렌즈를 general(statements) 위에 per-category 폴백 resolve 한다.
 * 앱(src/data/personaStatements.ts:resolveStatements)과 동일 의미.
 * src/data 는 node script 에서 import 지양하므로 CLI 내부에 동일 구현.
 */
export function resolveStatements(
  file: Pick<StatementsFile, 'statements' | 'lenses'>,
  job: JobLens,
): Record<CategoryId, string[]> {
  if (job === 'general' || !file.lenses?.[job]) return file.statements
  const lens = file.lenses[job]!
  const out: Record<CategoryId, string[]> = {}
  for (const id of Object.keys(file.statements)) {
    out[id] = lens[id] ?? file.statements[id]!
  }
  return out
}

// --- 페어 생성 ------------------------------------------------------------
export function generatePairs(
  categoryIds: ReadonlyArray<CategoryId>,
  statements: Readonly<Record<CategoryId, string[]>>,
  n: number,
  rand: () => number,
): Pair[] {
  const pairs: Pair[] = []
  for (let i = 0; i < n; i++) {
    const leftIdx = Math.floor(rand() * categoryIds.length)
    let rightIdx = Math.floor(rand() * (categoryIds.length - 1))
    if (rightIdx >= leftIdx) rightIdx++
    const leftCat = categoryIds[leftIdx]!
    const rightCat = categoryIds[rightIdx]!
    const leftPool = statements[leftCat]!
    const rightPool = statements[rightCat]!
    const leftStmt = leftPool[Math.floor(rand() * leftPool.length)]!
    const rightStmt = rightPool[Math.floor(rand() * rightPool.length)]!
    const swap = rand() < 0.5
    pairs.push({
      index: i + 1,
      leftCategory: swap ? rightCat : leftCat,
      rightCategory: swap ? leftCat : rightCat,
      leftStatement: swap ? rightStmt : leftStmt,
      rightStatement: swap ? leftStmt : rightStmt,
    })
  }
  return pairs
}

// --- 진행률 바 (export — 테스트용) ---------------------------------------
export function progressBar(current: number, total: number, width = 20): string {
  if (total <= 0 || width <= 0) return ''
  const ratio = Math.min(1, Math.max(0, current / total))
  const filled = Math.round(ratio * width)
  const pct = Math.round(ratio * 100)
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}  ${current}/${total}  (${pct}%)`
}

// --- CLI 인터랙티브 -------------------------------------------------------
// rl 은 외부에서 주입 (welcome 화면과 공유). 측정 중에는 카테고리 정보 노출 금지.
async function runInteractive(
  pairs: ReadonlyArray<Pair>,
  rl: readline.Interface,
): Promise<Choice[]> {
  const choices: Choice[] = []
  for (const pair of pairs) {
    console.log('')
    console.log(` ${progressBar(pair.index, pairs.length)}`)
    console.log('')
    console.log(`  (1) ${pair.leftStatement}`)
    console.log(`  (2) ${pair.rightStatement}`)
    let chosen: Side | null = null
    while (chosen === null) {
      const ans = (await rl.question('  ▶ 1, 2, s: ')).trim().toLowerCase()
      if (ans === '1') chosen = 'left'
      else if (ans === '2') chosen = 'right'
      else if (ans === 's' || ans === 'skip') chosen = 'skip'
      else console.log('  → 1, 2, s 중 하나만 입력')
    }
    choices.push({
      ...pair,
      chosen,
      chosenCategory:
        chosen === 'left' ? pair.leftCategory
        : chosen === 'right' ? pair.rightCategory
        : null,
    })
  }
  return choices
}

// --- sharpness 계산 -------------------------------------------------------
export function computeStats(
  choices: ReadonlyArray<Choice>,
  categoryIds: ReadonlyArray<CategoryId>,
  titleMap: ReadonlyMap<CategoryId, string>,
): Record<CategoryId, CategoryStats> {
  const out: Record<CategoryId, CategoryStats> = {}
  for (const id of categoryIds) {
    let appearances = 0
    let picks = 0
    let skips = 0
    for (const c of choices) {
      if (c.leftCategory === id || c.rightCategory === id) {
        appearances++
        if (c.chosen === 'skip') skips++
        else if (c.chosenCategory === id) picks++
      }
    }
    const valid = appearances - skips
    let pickRate: number | null = null
    let sharpness: number | null = null
    let verdict: Verdict = 'insufficient'
    if (valid >= 2) {
      pickRate = picks / valid
      // 부동소수점 오차로 임계값 경계가 잘못 분류되지 않도록 3소수점 반올림 후 비교.
      // 예: 6/10 → |0.6-0.5|*2 = 0.19999... → < 0.2 (barnum)으로 오분류되는 것 방지.
      sharpness = Math.round(Math.abs(pickRate - 0.5) * 2 * 1000) / 1000
      if (sharpness < 0.2) verdict = 'barnum'
      else if (sharpness < 0.5) verdict = 'moderate'
      else if (sharpness < 0.8) verdict = 'sharp'
      else verdict = 'very_sharp'
    }
    out[id] = {
      title: titleMap.get(id) ?? id,
      appearances,
      picks,
      skips,
      pickRate,
      sharpness,
      verdict,
    }
  }
  return out
}

// --- Verdict → 별 표시 (export — 테스트용) -------------------------------
export function starsFor(verdict: Verdict): string {
  switch (verdict) {
    case 'very_sharp': return '✪✪✪✪✪'
    case 'sharp':      return '✪✪✪✪☆'
    case 'moderate':   return '✪✪✪☆☆'
    case 'barnum':     return '✪☆☆☆☆'
    case 'insufficient': return '☆☆☆☆☆'
  }
}

// --- Welcome 카드 (테스트 시작 전) ---------------------------------------
function printWelcome(pairs: number): void {
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('  🎯  너는 어떤 코딩 페르소나?')
  console.log('')
  console.log('  9개 페르소나 중 너에게 가장 가까운')
  console.log(`  타입을 ${pairs}번 직관 선택으로 찾는다.`)
  console.log('  중단하려면 Ctrl+C, 모르겠으면 s.')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
}

// --- Reveal 모먼트 (테스트 끝난 후) --------------------------------------
type CategoryMeta = Readonly<{
  id: CategoryId
  title: string
  subtitle: string
  emoji: string
}>

function printReveal(
  stats: Readonly<Record<CategoryId, CategoryStats>>,
  categories: ReadonlyArray<CategoryMeta>,
): void {
  const ranked = categories
    .map((meta) => ({ meta, stat: stats[meta.id]! }))
    .sort((a, b) => {
      const sa = a.stat.sharpness
      const sb = b.stat.sharpness
      if (sa === null && sb === null) return 0
      if (sa === null) return 1
      if (sb === null) return -1
      return sb - sa
    })

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('         너의 코딩 페르소나 진단')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  const medals = ['🥇', '🥈', '🥉']
  const topN = Math.min(3, ranked.length)
  for (let i = 0; i < topN; i++) {
    const { meta, stat } = ranked[i]!
    const matchPct =
      stat.pickRate !== null ? `일치도 ${Math.round(stat.pickRate * 100)}%` : '표본 부족'
    console.log(`${medals[i]}  ${meta.emoji}  ${meta.title}  (${meta.id})`)
    console.log(`     "${meta.subtitle}"`)
    console.log(`     ${matchPct} · ${starsFor(stat.verdict)} ${stat.verdict}`)
    console.log('')
  }

  const barnum = ranked.filter((r) => r.stat.verdict === 'barnum')
  if (barnum.length > 0) {
    console.log('─────────────────────────────────────────')
    console.log('⚠  변별 잘 안 된 차원 (진술이 너무 일반적):')
    for (const { meta, stat } of barnum) {
      const sh = stat.sharpness !== null ? stat.sharpness.toFixed(3) : '-'
      console.log(`     ${meta.emoji}  ${meta.title}  (${meta.id}) · sharpness ${sh}`)
    }
    console.log('')
  }

  const insufficient = ranked.filter((r) => r.stat.verdict === 'insufficient')
  if (insufficient.length > 0) {
    console.log(
      `⚠  표본 부족 (등장 < 2): ${insufficient.map((r) => r.meta.id).join(', ')}`,
    )
    console.log('')
  }
}

// --- 파일 저장 ------------------------------------------------------------
function saveReport(report: Readonly<Report>, projectRoot: string): string {
  const docsDir = path.join(projectRoot, 'docs')
  if (!fs.existsSync(docsDir)) {
    throw new Error(`docs 디렉터리 없음: ${docsDir}`)
  }
  const date = new Date()
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const baseName = `sharpness-report-${yyyy}-${mm}-${dd}`
  let fileName = `${baseName}.json`
  let filePath = path.join(docsDir, fileName)
  if (fs.existsSync(filePath)) {
    const hh = String(date.getHours()).padStart(2, '0')
    const mn = String(date.getMinutes()).padStart(2, '0')
    fileName = `${baseName}-${hh}${mn}.json`
    filePath = path.join(docsDir, fileName)
  }
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  return filePath
}

// --- 메인 ------------------------------------------------------------------
async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  // L-4: import.meta.url 은 반드시 fileURLToPath 로 변환 (Windows 경로 깨짐 방지)
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const projectRoot = path.resolve(scriptDir, '..')

  // L-6: USAGE_CATEGORIES 는 read-only. 정렬·복사 시 항상 복사본 사용.
  const categoryIds = USAGE_CATEGORIES.map((c) => c.id)
  const titleMap = new Map<CategoryId, string>(USAGE_CATEGORIES.map((c) => [c.id, c.title]))

  const stmtData = loadStatements(scriptDir, categoryIds)
  const resolved = resolveStatements(stmtData, args.lens)
  const rand = mulberry32(args.seed)
  const pairs = generatePairs(categoryIds, resolved, args.pairs, rand)

  printWelcome(args.pairs)

  const rl = readline.createInterface({ input, output })
  let choices: Choice[]
  try {
    await rl.question('  ▶ Enter 누르면 시작...')
    choices = await runInteractive(pairs, rl)
  } finally {
    rl.close()
  }

  const answered = choices.filter((c) => c.chosen !== 'skip').length
  const skipped = choices.length - answered

  const stats = computeStats(choices, categoryIds, titleMap)

  const report: Report = {
    version: 1,
    ts: new Date().toISOString(),
    seed: args.seed,
    pairsRequested: args.pairs,
    pairsAnswered: answered,
    pairsSkipped: skipped,
    statementsVersion: stmtData.version,
    statementsLanguage: stmtData.language,
    lens: args.lens,
    perCategory: stats,
    rawChoices: choices,
  }

  printReveal(stats, USAGE_CATEGORIES)
  const savedPath = saveReport(report, projectRoot)
  console.log(`📄  상세 데이터: ${savedPath}`)
  console.log(`     seed=${args.seed}, ${answered}/${args.pairs} answered (${skipped} skipped)`)
  console.log('')
}

// Entry-point 가드: 이 파일을 직접 실행할 때만 main() 호출 (test import 시 제외)
function isMainEntry(): boolean {
  if (!process.argv[1]) return false
  const argvPath = path.resolve(process.argv[1])
  const modulePath = path.resolve(fileURLToPath(import.meta.url))
  return argvPath === modulePath
}

if (isMainEntry()) {
  main().catch((err: unknown) => {
    console.error('ERROR:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
}
