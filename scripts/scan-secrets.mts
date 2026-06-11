#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * memradar secret scan — 로컬 세션 로그 시크릿 전수 스캔 (운영 보안 도구)
 *
 * `~/.claude/projects`(메인 + subagents/ + tool-results/) 와 `~/.codex/sessions`
 * 전체를 줄 단위로 훑어, 평문으로 남은 실제 자격증명 유출만 추려 트리아지 리포트를 낸다.
 * secret-leak-remediation-goaldoc.md §G2 산출물.
 *
 * 안전 원칙 (절대):
 *   - 읽기 전용. 로그 파일을 절대 수정하지 않는다.
 *   - 네트워크 I/O 0, 신규 의존성 0 (node: 빌트인 + cli/lib/secretMask.mjs 재사용).
 *   - 리포트·콘솔에 시크릿 원문을 한 글자도 기록하지 않는다.
 *     식별은 kind + 길이 + 비가역 지문(sha256[:8]) 으로만.
 *   - 패턴 재구현 금지 — maskSecrets(line, { detailed: true }) 의 매치값으로 분류만 한다.
 *
 * 사용:
 *   npx tsx scripts/scan-secrets.mts [--codex-only] [--claude-only] [--no-report]
 *   (env override: MEMRADAR_PROJECTS_DIR, MEMRADAR_CODEX_DIR — cli/index.mjs 와 동일)
 *
 * 출력:
 *   콘솔 요약(원문 0) + docs/secret-scan-report-{YYYY-MM-DD}.json (동일날짜 재실행 시 -HHmm)
 *   리포트는 .gitignore 로 제외된다 (운영 산출물·심층 방어).
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { maskSecrets } from '../cli/lib/secretMask.mjs'

// --- 타입 -----------------------------------------------------------------
export type Classification = 'real' | 'dummy'
export type Confidence = 'high' | 'low'

export interface ScanEntry {
  project: string
  sessionFile: string // 홈 기준 상대 표기 (~/.claude/... | ~/.codex/...)
  lineNo: number
  kind: string
  length: number
  fingerprint: string // sha256(value)[:8] — 비가역, 세션 간 동일 토큰 매칭용
  classification: Classification
  reason: string
}

export interface Finding {
  kind: string
  fingerprint: string
  length: number
  classification: Classification
  confidence: Confidence
  reason: string
  occurrenceCount: number
  occurrences: Array<{ project: string; sessionFile: string; lineNo: number }>
}

// 신뢰도: 포맷 접두가 고유한 kind 는 우연 일치가 드물어 high.
// credential(key=value 휴리스틱)·bearer 는 논의/예시에 흔히 섞여 low (수동 검토 대상).
const LOW_CONFIDENCE_KINDS = new Set(['credential', 'bearer-token'])
function confidenceOf(kind: string): Confidence {
  return LOW_CONFIDENCE_KINDS.has(kind) ? 'low' : 'high'
}

/** ScanEntry[] → (kind, fingerprint) 단위로 dedup 한 Finding[]. 노이즈 축소 핵심. */
export function dedupe(entries: ScanEntry[]): Finding[] {
  const byKey = new Map<string, Finding>()
  for (const e of entries) {
    const key = `${e.kind}:${e.fingerprint}`
    let f = byKey.get(key)
    if (!f) {
      f = {
        kind: e.kind,
        fingerprint: e.fingerprint,
        length: e.length,
        classification: e.classification,
        confidence: confidenceOf(e.kind),
        reason: e.reason,
        occurrenceCount: 0,
        occurrences: [],
      }
      byKey.set(key, f)
    }
    f.occurrenceCount++
    // 위치는 (sessionFile, lineNo) 단위로만 유일하게 보관.
    if (!f.occurrences.some((o) => o.sessionFile === e.sessionFile && o.lineNo === e.lineNo)) {
      f.occurrences.push({ project: e.project, sessionFile: e.sessionFile, lineNo: e.lineNo })
    }
  }
  return [...byKey.values()]
}

// --- 로그 루트 (cli/index.mjs getLogRoots 와 정합) --------------------------
function getLogRoots(): Array<{ source: string; dir: string }> {
  const claudeDir = process.env.MEMRADAR_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects')
  const codexDir = process.env.MEMRADAR_CODEX_DIR || (
    process.env.MEMRADAR_PROJECTS_DIR ? '' : path.join(os.homedir(), '.codex', 'sessions')
  )
  return [
    { source: 'claude', dir: claudeDir },
    ...(codexDir ? [{ source: 'codex', dir: codexDir }] : []),
  ].filter((e) => e.dir && fs.existsSync(e.dir))
}

// 스캔 대상: .jsonl(메인 + subagents/agent-*) + .txt(tool-results/).
// 제외: memory/ 디렉터리, *.meta.json, sessions-index.json (시크릿 가능성 낮음·범위 최소).
// 주의: cli/index.mjs 의 findJsonlFiles 는 subagents 를 의도적으로 스킵하지만,
//       전수 스캔은 정반대로 subagents/tool-results 를 포함해야 한다 → 전용 워커.
const SKIP_DIRS = new Set(['memory', 'node_modules', '.git'])

function collectFiles(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out // 권한/경합 오류는 스킵하고 계속
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collectFiles(full, out)
    } else if (entry.isFile()) {
      if (entry.name === 'sessions-index.json' || entry.name.endsWith('.meta.json')) continue
      if (entry.name.endsWith('.jsonl') || entry.name.endsWith('.txt')) out.push(full)
    }
  }
  return out
}

// --- 분류: secretMask 가 hit 으로 통과시킨 값에 대한 2차 더미 필터 ----------
// secretMask 패턴/isGuardedValue 를 재구현하지 않는다 (단일 소스). value 특성만 본다.
const PLACEHOLDER_TOKENS = ['your', 'example', 'placeholder', 'xxxxx', 'dummy', 'sample', 'redacted']

/** Shannon 엔트로피 (bits/char). 반복문자·저다양성 값은 낮게 나온다. */
export function shannonEntropy(s: string): number {
  if (!s) return 0
  const freq = new Map<string, number>()
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1)
  let h = 0
  for (const n of freq.values()) {
    const p = n / s.length
    h -= p * Math.log2(p)
  }
  return h
}

/**
 * 매치된 시크릿 값을 real/dummy 로 분류. (원문은 반환하지 않음)
 * dummy: 픽스처 경로 / EXAMPLE 접미 / 플레이스홀더 단어 / 저엔트로피(반복문자).
 */
export function classify(value: string, filePath: string): { classification: Classification; reason: string } {
  const normPath = filePath.replace(/\\/g, '/')
  if (normPath.includes('/tests/fixtures/') || normPath.includes('/fixtures/logs/')) {
    return { classification: 'dummy', reason: 'fixtures-path' }
  }
  if (value.endsWith('EXAMPLE')) {
    return { classification: 'dummy', reason: 'example-suffix' }
  }
  const lower = value.toLowerCase()
  if (PLACEHOLDER_TOKENS.some((t) => lower.includes(t))) {
    return { classification: 'dummy', reason: 'placeholder-word' }
  }
  // 반복문자/저다양성 (sk-aaaa…, ghp_xxxx…, npm_0000…). 실 토큰은 base62 ~5-6 bits/char.
  // 보수적: Shannon 엔트로피 상한은 log2(길이)라 짧은 값은 자연히 낮다.
  // 길이 20 미만 값엔 엔트로피 더미 룰을 적용하지 않는다 — 짧은 실토큰을
  // dummy 로 놓치는 false-negative(보안상 더 위험한 방향)를 막는다.
  if (value.length >= 20 && shannonEntropy(value) < 3.0) {
    return { classification: 'dummy', reason: 'low-entropy' }
  }
  return { classification: 'real', reason: 'high-entropy' }
}

function fingerprint(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 8)
}

// 홈 기준 상대 표기 (홈 절대경로·원문 노출 회피).
function toRelative(filePath: string): string {
  const home = os.homedir()
  return filePath.startsWith(home) ? '~' + filePath.slice(home.length).replace(/\\/g, '/') : filePath
}

// 프로젝트 슬러그: ~/.claude/projects/<slug>/... → slug, codex → 'codex'.
function projectOf(filePath: string, source: string): string {
  if (source === 'codex') return 'codex'
  const norm = filePath.replace(/\\/g, '/')
  const m = norm.match(/\/\.claude\/projects\/([^/]+)\//)
  return m ? m[1] : source
}

// --- 파일 스캔 (줄 단위 스트리밍, 줄을 자르지 않음 — 잘림 경계 시크릿 미탐 방지) ---
async function scanFile(filePath: string, source: string): Promise<ScanEntry[]> {
  const entries: ScanEntry[] = []
  const project = projectOf(filePath, source)
  const sessionFile = toRelative(filePath)
  let stream: fs.ReadStream
  try {
    stream = fs.createReadStream(filePath, { encoding: 'utf8' })
  } catch {
    return entries
  }
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  let lineNo = 0
  try {
    for await (const line of rl) {
      lineNo++
      if (line.length < 20) continue // 빠른 스킵 (최단 시크릿 패턴도 16자+ — 그보다 짧은 줄엔 불가)
      const { hits } = maskSecrets(line, { detailed: true })
      for (const hit of hits) {
        const value = hit.value ?? ''
        if (!value) continue
        const { classification, reason } = classify(value, filePath)
        entries.push({
          project,
          sessionFile,
          lineNo,
          kind: hit.kind,
          length: value.length,
          fingerprint: fingerprint(value),
          classification,
          reason,
        })
      }
    }
  } catch {
    // 깨진/이진 파일은 거기까지 수집하고 계속
  } finally {
    rl.close()
    stream.close()
  }
  return entries
}

// --- 리포트 저장 (eval-sharpness 패턴) -------------------------------------
function reportPath(projectRoot: string): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const base = path.join(projectRoot, 'docs', `secret-scan-report-${y}-${m}-${d}.json`)
  if (!fs.existsSync(base)) return base
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return path.join(projectRoot, 'docs', `secret-scan-report-${y}-${m}-${d}-${hh}${mm}.json`)
}

interface ScanArgs {
  claudeOnly: boolean
  codexOnly: boolean
  noReport: boolean
}

function parseArgs(argv: string[]): ScanArgs {
  const a: ScanArgs = { claudeOnly: false, codexOnly: false, noReport: false }
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: npx tsx scripts/scan-secrets.mts [--claude-only] [--codex-only] [--no-report]')
      process.exit(0)
    } else if (arg === '--claude-only') a.claudeOnly = true
    else if (arg === '--codex-only') a.codexOnly = true
    else if (arg === '--no-report') a.noReport = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return a
}

export async function main(argv: string[], projectRoot: string): Promise<void> {
  const args = parseArgs(argv)
  let roots = getLogRoots()
  if (args.claudeOnly) roots = roots.filter((r) => r.source === 'claude')
  if (args.codexOnly) roots = roots.filter((r) => r.source === 'codex')

  if (roots.length === 0) {
    console.log('  스캔할 로그 루트를 찾지 못했어요. (~/.claude/projects, ~/.codex/sessions)')
    return
  }

  const all: ScanEntry[] = []
  let fileCount = 0
  for (const root of roots) {
    const files = collectFiles(root.dir)
    fileCount += files.length
    for (const file of files) {
      const entries = await scanFile(file, root.source)
      all.push(...entries)
    }
  }

  // (kind, fingerprint) 단위 dedup → 고유 시크릿 목록. 중복 발생이 신호를 묻지 않게.
  const findings = dedupe(all)
  const realHigh = findings.filter((f) => f.classification === 'real' && f.confidence === 'high')
  const realLow = findings.filter((f) => f.classification === 'real' && f.confidence === 'low')
  const dummies = findings.filter((f) => f.classification === 'dummy')
  realHigh.sort((a, b) => b.occurrenceCount - a.occurrenceCount)

  // --- 콘솔 요약 (원문 0) ---
  console.log('')
  console.log('  Secret scan')
  console.log('  ------------------------------')
  console.log(`  Roots:     ${roots.map((r) => r.source).join(', ')}`)
  console.log(`  Files:     ${fileCount}`)
  console.log(`  Hits:      ${all.length} (고유 시크릿 ${findings.length}개)`)
  console.log(`  실유출:    high-confidence ${realHigh.length} / low-confidence(휴리스틱) ${realLow.length} / dummy ${dummies.length}`)
  console.log('  ------------------------------')

  if (realHigh.length > 0) {
    console.log('')
    console.log('  ⚠ 폐기 검토 대상 (포맷 고유 토큰 — 우연 일치 드묾):')
    for (const f of realHigh) {
      console.log(`    • ${f.kind}  [${f.fingerprint}, ${f.length}자]  ${f.occurrences.length}곳`)
      for (const occ of f.occurrences.slice(0, 6)) {
        console.log(`        ${occ.sessionFile}:${occ.lineNo}  (${occ.project})`)
      }
      if (f.occurrences.length > 6) console.log(`        … 외 ${f.occurrences.length - 6}곳`)
    }
    console.log('')
    console.log('  → 평문 로그에 남은 자격증명. 발급처(npmjs.com 등)에서 폐기(rotate) 후 재발급하세요.')
  } else {
    console.log('')
    console.log('  ✓ high-confidence 실유출은 없어요.')
  }
  if (realLow.length > 0) {
    console.log('')
    console.log(`  ℹ low-confidence(credential/bearer 휴리스틱) ${realLow.length}개 — 예시·논의에 흔히 섞임. 리포트에서 수동 검토.`)
  }
  console.log('')

  // --- 리포트 저장 (값 바이트 0) ---
  if (!args.noReport) {
    const out = reportPath(projectRoot)
    const report = {
      scannedAt: new Date().toISOString(),
      roots: roots.map((r) => ({ source: r.source, dir: toRelative(r.dir) })),
      fileCount,
      summary: {
        hits: all.length,
        distinct: findings.length,
        realHigh: realHigh.length,
        realLow: realLow.length,
        dummy: dummies.length,
      },
      // findings 는 원문 미포함 — kind/length/fingerprint/confidence/위치만.
      // 정렬: high-confidence real 먼저, 그 안에서 발생 많은 순.
      findings: [...realHigh, ...realLow, ...dummies],
    }
    fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8')
    console.log(`  리포트: ${out}`)
    console.log('  (원문 미포함 — kind/길이/지문/confidence/위치만. .gitignore 로 제외됨)')
    console.log('')
  }
}

// --- entry point ----------------------------------------------------------
function isMainEntry(): boolean {
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : ''
  const self = fileURLToPath(import.meta.url)
  return invoked === self
}

if (isMainEntry()) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const projectRoot = path.resolve(scriptDir, '..')
  main(process.argv.slice(2), projectRoot).catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
