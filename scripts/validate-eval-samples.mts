#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * AI Role Eval — 샘플 검증기 (v3 §5)
 *
 * tests/fixtures/role-eval-samples/ 의 모든 .json 샘플을 검증한다.
 * (하위 디렉터리 _seed/ · _archive/ 는 제외 — 평가 대상이 아님)
 *
 * 검사 3종:
 *  - §5-1 구조 검증 (에러): 스키마/교대/툴 화이트리스트/acceptableRoles 길이
 *  - §5-2 자연성 휴리스틱 (경고): stuffing / review-어조 쏠림 / 메시지 길이 / toolUses 빈도
 *  - §5-3 신호 주입 검사 (경고): 블라인드 생성 위반 사후 탐지 (phraseStrong 과다 매칭)
 *
 * 종료 코드: 에러 1건 이상 → exit 1. 경고만 또는 0건 → exit 0.
 * --quarantine 플래그: 에러 샘플 파일을 .invalid 접미사로 리네임 (v3 §5-4).
 *
 * 근거 문서: docs/AI-ROLE-EVAL-SAMPLES-SPEC.md §5, §6
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATEGORY_SIGNALS } from '../src/lib/usageProfile.ts'

// --- v3 §6 툴 이름 화이트리스트 (대소문자 구분) -------------------------
const CLAUDE_TOOLS = [
  'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'Bash', 'Task',
  'WebFetch', 'WebSearch', 'TodoWrite', 'NotebookEdit',
]
const CODEX_TOOLS = ['apply_patch', 'exec_command', 'shell', 'update_plan', 'view_image']
const TOOL_WHITELIST = new Set([...CLAUDE_TOOLS, ...CODEX_TOOLS])

// --- v3 §3-3 카테고리별 acceptableRoles 길이 규칙 -----------------------
type Category = 'pure' | 'mixed' | 'ambiguous' | 'edge'

function acceptableRolesLengthValid(category: string, length: number): boolean {
  switch (category) {
    case 'pure':
      return length === 1
    case 'mixed':
      return length === 2
    case 'ambiguous':
      return length >= 2 && length <= 3
    case 'edge':
      return length >= 0 && length <= 3
    default:
      return false
  }
}

// --- 타입 -------------------------------------------------------------
interface SampleMessage {
  role: string
  text: string
  toolUses?: string[]
}

interface Sample {
  id?: string
  intendedRole?: string
  acceptableRoles?: string[]
  category?: string
  difficulty?: string
  scenario?: string
  createdAt?: string
  length?: { total?: number; userMessages?: number; assistantMessages?: number }
  messages?: SampleMessage[]
}

interface FileReport {
  file: string
  errors: string[]
  warnings: string[]
}

// --- §5-2 자연성 휴리스틱에 쓰는 review-어조 phrase --------------------
const REVIEW_TONE_PHRASES = ['맞나', '확인해줄래', '맞게 한', '봐줄래']

// --- 텍스트 매칭 헬퍼 (countMatches 와 동일 의미, 검증기 자체 구현) ----
function isAsciiOnly(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) return false
  }
  return true
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ⚠️ 동기화 주의: 아래 countMatches 는 src/lib/usageProfile.ts 의 동명 엔진 함수와
// 매칭 의미(영문 단어 경계 / 한글 substring, §8-2)가 같아야 한다 — §5-3 주입 검사가
// 엔진과 동일 기준으로 판정해야 하기 때문. 엔진 매칭 로직이 바뀌면 이 함수도 함께
// 고칠 것. 엔진 쪽 countMatches 가 비공개(non-export)라 현재는 복제 — 매칭 유틸
// 공유 모듈화는 후속 과제.
function countMatches(text: string, keyword: string): number {
  if (!keyword) return 0
  if (isAsciiOnly(keyword)) {
    const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'g')
    const hits = text.match(pattern)
    return hits ? hits.length : 0
  }
  let count = 0
  let idx = 0
  while (idx <= text.length) {
    const hit = text.indexOf(keyword, idx)
    if (hit === -1) break
    count++
    idx = hit + keyword.length
  }
  return count
}

// --- §5-1 구조 검증 ----------------------------------------------------
function validateStructure(sample: Sample, errors: string[]): void {
  const messages = sample.messages
  if (!Array.isArray(messages)) {
    errors.push('messages 필드가 배열이 아님')
    return
  }
  if (messages.length === 0) {
    errors.push('messages 가 비어 있음')
    return
  }

  // length 정합성
  const len = sample.length
  if (!len || typeof len.total !== 'number') {
    errors.push('length.total 누락 또는 숫자 아님')
  } else if (len.total !== messages.length) {
    errors.push(`length.total(${len.total}) !== messages.length(${messages.length})`)
  }
  if (
    len &&
    typeof len.userMessages === 'number' &&
    typeof len.assistantMessages === 'number' &&
    typeof len.total === 'number'
  ) {
    if (len.userMessages + len.assistantMessages !== len.total) {
      errors.push(
        `length.userMessages(${len.userMessages}) + assistantMessages(${len.assistantMessages}) !== total(${len.total})`
      )
    }
  } else {
    errors.push('length.userMessages / length.assistantMessages 누락 또는 숫자 아님')
  }

  // messages[0].role === 'user'
  if (messages[0].role !== 'user') {
    errors.push(`messages[0].role 이 'user' 가 아님 (실제: '${messages[0].role}')`)
  }

  // user/assistant 엄격 교대 + 화이트리스트 외 툴
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role !== 'user' && m.role !== 'assistant') {
      errors.push(`messages[${i}].role 이 'user'/'assistant' 가 아님 (실제: '${m.role}')`)
      continue
    }
    const expected = i % 2 === 0 ? 'user' : 'assistant'
    if (m.role !== expected) {
      errors.push(`messages[${i}] 교대 위반 (기대: '${expected}', 실제: '${m.role}')`)
    }
    const tools = m.toolUses
    if (Array.isArray(tools)) {
      for (const t of tools) {
        if (!TOOL_WHITELIST.has(t)) {
          errors.push(`messages[${i}].toolUses 에 화이트리스트 외 툴: '${t}'`)
        }
      }
    }
  }

  // acceptableRoles 길이가 category 규칙과 일치
  const category = sample.category
  const acceptableRoles = sample.acceptableRoles
  if (!Array.isArray(acceptableRoles)) {
    errors.push('acceptableRoles 필드가 배열이 아님')
  } else if (typeof category !== 'string') {
    errors.push('category 필드 누락 또는 문자열 아님')
  } else if (!acceptableRolesLengthValid(category, acceptableRoles.length)) {
    errors.push(
      `acceptableRoles 길이(${acceptableRoles.length})가 category '${category}' 규칙과 불일치 ` +
        '(pure=1, mixed=2, ambiguous=2~3, edge=0~3)'
    )
  }
}

// --- §5-2 자연성 휴리스틱 ----------------------------------------------
function validateNaturalness(sample: Sample, errors: string[], warnings: string[]): void {
  const messages = sample.messages
  if (!Array.isArray(messages) || messages.length === 0) return

  // 한 메시지에 동일 단어 5회+ 반복 → 경고
  for (let i = 0; i < messages.length; i++) {
    const text = messages[i].text
    if (typeof text !== 'string' || text.length === 0) continue
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 1)
    const freq = new Map<string, number>()
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1)
    for (const [word, count] of freq) {
      if (count >= 5) {
        warnings.push(`messages[${i}] 에 동일 단어 '${word}' ${count}회 반복 (stuffing 의심)`)
        break
      }
    }
  }

  // 동일 문장 3회+ 복붙 → 에러
  const sentenceFreq = new Map<string, number>()
  for (const m of messages) {
    if (typeof m.text !== 'string') continue
    const norm = m.text.trim()
    if (norm.length === 0) continue
    sentenceFreq.set(norm, (sentenceFreq.get(norm) ?? 0) + 1)
  }
  for (const [sentence, count] of sentenceFreq) {
    if (count >= 3) {
      const preview = sentence.length > 40 ? `${sentence.slice(0, 40)}…` : sentence
      errors.push(`동일 문장 ${count}회 복붙: "${preview}"`)
    }
  }

  // user 메시지 중 review-어조 phrase 포함 비율 > 20% → 경고
  const userMessages = messages.filter((m) => m.role === 'user')
  if (userMessages.length > 0) {
    let toneHits = 0
    for (const m of userMessages) {
      if (typeof m.text !== 'string') continue
      if (REVIEW_TONE_PHRASES.some((p) => m.text.includes(p))) toneHits++
    }
    const ratio = toneHits / userMessages.length
    if (ratio > 0.2) {
      warnings.push(
        `user 메시지 중 review-어조 phrase 비율 ${(ratio * 100).toFixed(1)}% > 20% (v1 어조 쏠림 의심)`
      )
    }
  }

  // 메시지 평균 길이 < 5자 또는 > 500자 → 경고
  const lengths = messages
    .map((m) => (typeof m.text === 'string' ? m.text.length : 0))
  if (lengths.length > 0) {
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length
    if (avg < 5) {
      warnings.push(`메시지 평균 길이 ${avg.toFixed(1)}자 < 5자 (너무 짧음)`)
    } else if (avg > 500) {
      warnings.push(`메시지 평균 길이 ${avg.toFixed(1)}자 > 500자 (너무 김)`)
    }
  }

  // assistant 메시지 중 빈 toolUses 비율 > 30% → 경고
  const assistantMessages = messages.filter((m) => m.role === 'assistant')
  if (assistantMessages.length > 0) {
    let emptyTools = 0
    for (const m of assistantMessages) {
      if (!Array.isArray(m.toolUses) || m.toolUses.length === 0) emptyTools++
    }
    const ratio = emptyTools / assistantMessages.length
    if (ratio > 0.3) {
      warnings.push(
        `assistant 메시지 중 빈 toolUses 비율 ${(ratio * 100).toFixed(1)}% > 30% (설명만 너무 많음)`
      )
    }
  }
}

// --- §5-3 신호 주입 검사 ----------------------------------------------
function validateInjection(sample: Sample, warnings: string[]): void {
  const messages = sample.messages
  if (!Array.isArray(messages) || messages.length === 0) return

  const intendedRole = sample.intendedRole
  if (typeof intendedRole !== 'string') return
  const signals = CATEGORY_SIGNALS[intendedRole]
  if (!signals) return

  // user 메시지에서 intendedRole 의 phraseStrong 매칭 합산
  let phraseHits = 0
  for (const m of messages) {
    if (m.role !== 'user' || typeof m.text !== 'string') continue
    const text = m.text.toLowerCase()
    for (const phrase of signals.phraseStrong) {
      phraseHits += countMatches(text, phrase.toLowerCase())
    }
  }

  const category = sample.category
  const difficulty = sample.difficulty

  // pure/easy 샘플에서 5회 초과 시 경고
  if (category === 'pure' && difficulty === 'easy' && phraseHits > 5) {
    warnings.push(
      `pure/easy 샘플에 intendedRole '${intendedRole}' phraseStrong 매칭 ${phraseHits}회 > 5 (과다 주입 의심)`
    )
  }

  // hard 샘플에서 3회 이상 시 경고
  if (difficulty === 'hard' && phraseHits >= 3) {
    warnings.push(
      `hard 샘플에 intendedRole '${intendedRole}' phraseStrong 매칭 ${phraseHits}회 ≥ 3 (hard 가 아님 — 신호 너무 명확)`
    )
  }
}

// --- 파일별 검증 -------------------------------------------------------
function validateFile(dir: string, file: string): FileReport {
  const report: FileReport = { file, errors: [], warnings: [] }
  let sample: Sample
  try {
    const raw = fs.readFileSync(path.join(dir, file), 'utf8')
    sample = JSON.parse(raw)
  } catch (err) {
    report.errors.push(`JSON 파싱 실패: ${err instanceof Error ? err.message : String(err)}`)
    return report
  }

  validateStructure(sample, report.errors)
  validateNaturalness(sample, report.errors, report.warnings)
  validateInjection(sample, report.warnings)
  return report
}

// --- 메인 --------------------------------------------------------------
function main(): void {
  const quarantine = process.argv.includes('--quarantine')

  // fileURLToPath: Windows 에서 import.meta.url 의 '/D:/...' 형태를 'D:\...' 로 정규화
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const samplesDir = path.join(currentDir, '..', 'tests', 'fixtures', 'role-eval-samples')

  console.log(`${'='.repeat(56)}`)
  console.log('AI 역할 평가 — 샘플 검증 (v3 §5)')
  console.log(`${'='.repeat(56)}`)
  console.log(`샘플 디렉터리: ${samplesDir}`)

  if (!fs.existsSync(samplesDir)) {
    console.log('\n디렉터리가 존재하지 않습니다 — 0 samples.')
    console.log('검사 0개, 에러 0건, 경고 0건')
    process.exit(0)
  }

  // 최상위 .json 만 — 하위 디렉터리(_seed/ · _archive/)는 readdir 비재귀라 자동 제외
  const files = fs
    .readdirSync(samplesDir)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => fs.statSync(path.join(samplesDir, f)).isFile())
    .sort()

  if (files.length === 0) {
    console.log('\n샘플 파일이 없습니다 — 0 samples.')
    console.log('검사 0개, 에러 0건, 경고 0건')
    process.exit(0)
  }

  const reports: FileReport[] = files.map((f) => validateFile(samplesDir, f))

  let totalErrors = 0
  let totalWarnings = 0
  const errorFiles: string[] = []

  console.log()
  for (const r of reports) {
    if (r.errors.length === 0 && r.warnings.length === 0) continue
    console.log(`── ${r.file}`)
    for (const e of r.errors) console.log(`   [에러]  ${e}`)
    for (const w of r.warnings) console.log(`   [경고]  ${w}`)
    console.log()
    totalErrors += r.errors.length
    totalWarnings += r.warnings.length
    if (r.errors.length > 0) errorFiles.push(r.file)
  }

  console.log(`${'─'.repeat(56)}`)
  console.log(`검사 ${reports.length}개, 에러 ${totalErrors}건, 경고 ${totalWarnings}건`)
  console.log(`${'─'.repeat(56)}`)

  if (quarantine && errorFiles.length > 0) {
    console.log('\n--quarantine: 에러 샘플 격리 중...')
    for (const f of errorFiles) {
      const src = path.join(samplesDir, f)
      const dst = `${src}.invalid`
      try {
        fs.renameSync(src, dst)
        console.log(`   격리: ${f} → ${f}.invalid`)
      } catch (err) {
        console.log(`   격리 실패 (${f}): ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  } else if (errorFiles.length > 0) {
    console.log(`\n에러 샘플 ${errorFiles.length}개. --quarantine 플래그로 .invalid 격리 가능.`)
  }

  process.exit(totalErrors > 0 ? 1 : 0)
}

main()
