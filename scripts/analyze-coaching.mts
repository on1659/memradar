#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 프롬프트 코칭 실측 감사 — buildPromptCoaching 이 실제 로컬 세션 데이터에서
 * 알맞은 조언을 발화하는지 검증하는 읽기 전용 콘솔 리포트.
 *
 * 명세: docs/goal/verify-prompt-coaching.md
 * 패턴: scripts/analyze-my-data.mts (walkJsonl → parse → 분석 → 콘솔 출력)
 *
 * 제약:
 *  - 읽기 전용 — 세션 파일·저장소 어디에도 쓰지 않는다. 콘솔 출력만.
 *  - 네트워크 I/O 0 — 세션 데이터 외부 전송 금지 (CLAUDE.md 제약).
 *  - 프롬프트 원문 출력 순서 고정: stripMarkup → maskSecrets → ~80자 절단
 *    (절단 후 마스킹 금지 — lessons/secret-masking.md L-001).
 *
 * 실행: npx tsx scripts/analyze-coaching.mts
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {
  parseJsonl,
  buildGrowth,
  matchRetryMarker,
  RETRY_MARKERS,
  stripMarkup,
  toMonthKey,
} from '../src/parser.ts'
import { codexProvider } from '../src/providers/codex.ts'
import { maskSecrets } from '../cli/lib/secretMask.mjs'
import {
  buildPromptCoaching,
  isEligibleMonth,
  type CoachingInsightId,
  HIGH_RETRY_MIN_FOLLOWUPS,
  HIGH_RETRY_MIN_RATE,
  LOW_RETRY_MAX_RATE,
  LONG_PROMPT_MIN_AVG_WORDS,
  LOW_STRUCTURED_MAX_RATE,
  SHORT_PROMPT_MAX_AVG_WORDS,
  LOW_SKILL_VARIETY_MAX,
  HIGH_SKILL_VARIETY_MIN,
  LOW_SKILL_MIN_VALID_MONTHS,
  IMPROVING_MIN_VALID_MONTHS,
  IMPROVING_MIN_SCORE_DELTA,
  MIN_ELIGIBLE_ACTIVE_DAYS,
  MAX_INSIGHTS,
} from '../src/lib/promptCoaching.ts'
import type { Session } from '../src/types.ts'

/** parser.ts MIN_MONTH_SAMPLES(미export) 미러 — 값 드리프트는 §6 월 커버리지 assert 가 잡는다 */
const MIN_MONTH_SAMPLES = 5
const SAMPLE_HEAD_CHARS = 80
const SAMPLES_PER_MARKER = 5

// ── 로딩 (analyze-my-data.mts 패턴) ─────────────────────────────────────────

function walkJsonl(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkJsonl(full, out)
    else if (entry.isFile() && (entry.name.endsWith('.jsonl') || entry.name.endsWith('.json'))) {
      out.push(full)
    }
  }
  return out
}

interface LoadStats {
  files: number
  ok: number
  fail: number
}

function loadClaude(sessions: Session[]): LoadStats {
  const dir = path.join(os.homedir(), '.claude', 'projects')
  const files = walkJsonl(dir)
  let ok = 0, fail = 0
  for (const f of files) {
    try {
      const text = fs.readFileSync(f, 'utf8')
      const session = parseJsonl(text, path.basename(f))
      if (session) { sessions.push(session); ok++ } else { fail++ }
    } catch { fail++ }
  }
  return { files: files.length, ok, fail }
}

function loadCodex(sessions: Session[]): LoadStats {
  const dir = path.join(os.homedir(), '.codex', 'sessions')
  const files = walkJsonl(dir)
  let ok = 0, fail = 0
  for (const f of files) {
    try {
      const text = fs.readFileSync(f, 'utf8')
      const session = codexProvider.parse(text, path.basename(f))
      if (session) { sessions.push(session); ok++ } else { fail++ }
    } catch { fail++ }
  }
  return { files: files.length, ok, fail }
}

// ── 포맷 헬퍼 ───────────────────────────────────────────────────────────────

/**
 * 0~1 분수 → % 문자열 — §2 월 커버리지 테이블 표기 전용 (structured, score).
 * % 변환이 필요한 곳은 이 헬퍼로만 (lessons/_common.md L-5).
 * §4 보드·§5 감사의 retryRate/structured/scoreDelta 는 임계값 공간(0~1 분수)
 * 그대로 비교해야 하므로 의도적으로 fmtNum 표기 — % 변환하지 않는다.
 */
function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(3)
}

/**
 * 프롬프트 원문 → 출력용 head. 순서 고정: stripMarkup → maskSecrets → 절단
 * (절단 후 마스킹 금지 — lessons/secret-masking.md L-001. detailed 모드 사용 금지.)
 */
function sampleHead(text: string): string {
  const stripped = stripMarkup(text)
  const { masked } = maskSecrets(stripped)
  const oneLine = masked.replace(/\s+/g, ' ').trim()
  return oneLine.length > SAMPLE_HEAD_CHARS ? `${oneLine.slice(0, SAMPLE_HEAD_CHARS)}…` : oneLine
}

/** 균등 간격 인덱스 k개 — 랜덤 샘플링 금지(재현성) */
function evenlySpacedIndices(n: number, k: number): number[] {
  if (n <= k) return Array.from({ length: n }, (_, i) => i)
  return Array.from({ length: k }, (_, i) => Math.floor((i * n) / k))
}

// ── retry 재순회 감사 (buildGrowth 는 집계만 리턴 — 샘플은 재순회로 수집) ──

interface RetryAudit {
  totalFollowups: number
  retryCount: number
  markerCounts: Map<string, number>
  /** marker → 매치된 raw user 텍스트 (출력 시점에 strip→mask→절단) */
  matchesByMarker: Map<string, string[]>
}

function auditRetries(sessions: Session[]): RetryAudit {
  let totalFollowups = 0
  let retryCount = 0
  const markerCounts = new Map<string, number>()
  const matchesByMarker = new Map<string, string[]>()
  for (const marker of RETRY_MARKERS) {
    markerCounts.set(marker, 0)
    matchesByMarker.set(marker, [])
  }

  for (const session of sessions) {
    // 세션 경계 안전성 — buildGrowth 와 동일하게 세션마다 리셋
    let prevRole: string | null = null
    for (const msg of session.messages) {
      // timestamp 없는 메시지도 포함 (follow-up 판정은 월 유효성과 무관),
      // 빈 텍스트 user 메시지도 포함 (Codex 에 존재 — matchRetryMarker('') 는 null 이라 자연 처리)
      if (msg.role === 'user' && prevRole === 'assistant') {
        totalFollowups++
        const marker = matchRetryMarker(msg.text)
        if (marker) {
          retryCount++
          markerCounts.set(marker, (markerCounts.get(marker) ?? 0) + 1)
          matchesByMarker.get(marker)?.push(msg.text)
        }
      }
      prevRole = msg.role
    }
  }
  return { totalFollowups, retryCount, markerCounts, matchesByMarker }
}

// ── 월별 user 메시지 분포 (제외 월 파악용 경량 집계) ────────────────────────

function countUserMessagesByMonth(sessions: Session[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const session of sessions) {
    for (const msg of session.messages) {
      if (msg.role !== 'user') continue
      const month = toMonthKey(msg.timestamp)
      if (!month) continue
      counts.set(month, (counts.get(month) ?? 0) + 1)
    }
  }
  return counts
}

// ── 7룰 상태 보드 ───────────────────────────────────────────────────────────

interface Cond {
  label: string
  actual: number
  cmp: '≥' | '<' | '≤'
  threshold: number
  pass: boolean
}

function condLine(c: Cond): string {
  const margin = c.actual - c.threshold
  const sign = margin >= 0 ? '+' : ''
  return `${c.label} ${fmtNum(c.actual)} ${c.cmp} ${fmtNum(c.threshold)} ${c.pass ? '✓' : '✗'} (margin ${sign}${fmtNum(margin)})`
}

interface RuleStatus {
  id: CoachingInsightId
  kind: 'tip' | 'praise'
  conds: Cond[]
  /** 조건 판정 불가 사유 (유효 월 부족 등) — conds 대신 표기 */
  blocked?: string
  eligible: boolean
}

/** now: buildPromptCoaching 과 반드시 같은 값 전달 — 드리프트 가드 3(eligible id 대조)의 성립 조건 */
function buildRuleBoard(growth: ReturnType<typeof buildGrowth>, now: Date): RuleStatus[] {
  const { retryStats, skillCurve } = growth
  const nowMonthKey = now.toISOString().slice(0, 7)  // buildPromptCoaching 과 동일 UTC 축
  const eligibleCurve = skillCurve.filter((entry) => isEligibleMonth(entry, nowMonthKey))
  const latest = eligibleCurve.length > 0 ? eligibleCurve[eligibleCurve.length - 1] : null
  // hasClaudeSession 인 최근 eligible 월 — low-skill-variety(4)·high-skill-variety(7) 공유
  // (buildPromptCoaching 과 동일 계산 — 드리프트 가드 3 성립 조건)
  const latestClaude = [...eligibleCurve].reverse().find((m) => m.hasClaudeSession)
  const noEligibleMsg = skillCurve.length === 0
    ? '유효 월 0개 — 판정 불가'
    : `eligible 월 0개 (부분 달 activeDays<${MIN_ELIGIBLE_ACTIVE_DAYS}) — 판정 불가`
  const rules: RuleStatus[] = []

  // 1. high-retry
  {
    const conds: Cond[] = [
      {
        label: 'totalFollowups', actual: retryStats.totalFollowups, cmp: '≥',
        threshold: HIGH_RETRY_MIN_FOLLOWUPS,
        pass: retryStats.totalFollowups >= HIGH_RETRY_MIN_FOLLOWUPS,
      },
      {
        label: 'retryRate', actual: retryStats.retryRate, cmp: '≥',
        threshold: HIGH_RETRY_MIN_RATE,
        pass: retryStats.retryRate >= HIGH_RETRY_MIN_RATE,
      },
    ]
    rules.push({ id: 'high-retry', kind: 'tip', conds, eligible: conds.every((c) => c.pass) })
  }

  // 2. long-unstructured (최근 eligible 월 기준)
  if (latest) {
    const conds: Cond[] = [
      {
        label: `avgWords(${latest.month})`, actual: latest.avgWords, cmp: '≥',
        threshold: LONG_PROMPT_MIN_AVG_WORDS,
        pass: latest.avgWords >= LONG_PROMPT_MIN_AVG_WORDS,
      },
      {
        label: `structured(${latest.month})`, actual: latest.structured, cmp: '<',
        threshold: LOW_STRUCTURED_MAX_RATE,
        pass: latest.structured < LOW_STRUCTURED_MAX_RATE,
      },
    ]
    rules.push({ id: 'long-unstructured', kind: 'tip', conds, eligible: conds.every((c) => c.pass) })
  } else {
    rules.push({ id: 'long-unstructured', kind: 'tip', conds: [], blocked: noEligibleMsg, eligible: false })
  }

  // 3. short-prompts (최근 eligible 월 기준)
  if (latest) {
    const conds: Cond[] = [
      {
        label: `avgWords(${latest.month})`, actual: latest.avgWords, cmp: '<',
        threshold: SHORT_PROMPT_MAX_AVG_WORDS,
        pass: latest.avgWords < SHORT_PROMPT_MAX_AVG_WORDS,
      },
    ]
    rules.push({ id: 'short-prompts', kind: 'tip', conds, eligible: conds.every((c) => c.pass) })
  } else {
    rules.push({ id: 'short-prompts', kind: 'tip', conds: [], blocked: noEligibleMsg, eligible: false })
  }

  // 4. low-skill-variety (hasClaudeSession 인 최근 eligible 월 기준)
  {
    const monthsCond: Cond = {
      label: 'validMonths', actual: skillCurve.length, cmp: '≥',
      threshold: LOW_SKILL_MIN_VALID_MONTHS,
      pass: skillCurve.length >= LOW_SKILL_MIN_VALID_MONTHS,
    }
    if (latestClaude) {
      const conds: Cond[] = [
        monthsCond,
        {
          label: `uniqueSkills(${latestClaude.month})`, actual: latestClaude.uniqueSkills, cmp: '≤',
          threshold: LOW_SKILL_VARIETY_MAX,
          pass: latestClaude.uniqueSkills <= LOW_SKILL_VARIETY_MAX,
        },
      ]
      rules.push({ id: 'low-skill-variety', kind: 'tip', conds, eligible: conds.every((c) => c.pass) })
    } else {
      rules.push({
        id: 'low-skill-variety', kind: 'tip', conds: [monthsCond],
        blocked: 'hasClaudeSession eligible 월 없음 — 판정 불가', eligible: false,
      })
    }
  }

  // 5. improving (첫 유효 월 → 마지막 eligible 월의 숙련도 곡선 상승)
  {
    const monthsCond: Cond = {
      label: 'validMonths', actual: skillCurve.length, cmp: '≥',
      threshold: IMPROVING_MIN_VALID_MONTHS,
      pass: skillCurve.length >= IMPROVING_MIN_VALID_MONTHS,
    }
    if (latest) {
      const first = skillCurve[0]
      const last = latest
      const delta = last.score - first.score
      const conds: Cond[] = [
        monthsCond,
        {
          label: `scoreDelta(${first.month}→${last.month})`, actual: delta, cmp: '≥',
          threshold: IMPROVING_MIN_SCORE_DELTA,
          pass: delta >= IMPROVING_MIN_SCORE_DELTA,
        },
      ]
      rules.push({ id: 'improving', kind: 'praise', conds, eligible: conds.every((c) => c.pass) })
    } else {
      rules.push({
        id: 'improving', kind: 'praise', conds: [monthsCond],
        blocked: noEligibleMsg, eligible: false,
      })
    }
  }

  // 6. low-retry (praise) — high-retry 와 동일 신호 게이트, 정정률 상한만 낮음 (상호배타 by construction)
  {
    const conds: Cond[] = [
      {
        label: 'totalFollowups', actual: retryStats.totalFollowups, cmp: '≥',
        threshold: HIGH_RETRY_MIN_FOLLOWUPS,
        pass: retryStats.totalFollowups >= HIGH_RETRY_MIN_FOLLOWUPS,
      },
      {
        label: 'retryRate', actual: retryStats.retryRate, cmp: '≤',
        threshold: LOW_RETRY_MAX_RATE,
        pass: retryStats.retryRate <= LOW_RETRY_MAX_RATE,
      },
    ]
    rules.push({ id: 'low-retry', kind: 'praise', conds, eligible: conds.every((c) => c.pass) })
  }

  // 7. high-skill-variety (praise) — low-skill-variety 와 동일 eligibility 경로, 다양성 하한만 둠 (상호배타 by construction)
  {
    const monthsCond: Cond = {
      label: 'validMonths', actual: skillCurve.length, cmp: '≥',
      threshold: LOW_SKILL_MIN_VALID_MONTHS,
      pass: skillCurve.length >= LOW_SKILL_MIN_VALID_MONTHS,
    }
    if (latestClaude) {
      const conds: Cond[] = [
        monthsCond,
        {
          label: `uniqueSkills(${latestClaude.month})`, actual: latestClaude.uniqueSkills, cmp: '≥',
          threshold: HIGH_SKILL_VARIETY_MIN,
          pass: latestClaude.uniqueSkills >= HIGH_SKILL_VARIETY_MIN,
        },
      ]
      rules.push({ id: 'high-skill-variety', kind: 'praise', conds, eligible: conds.every((c) => c.pass) })
    } else {
      rules.push({
        id: 'high-skill-variety', kind: 'praise', conds: [monthsCond],
        blocked: 'hasClaudeSession eligible 월 없음 — 판정 불가', eligible: false,
      })
    }
  }

  return rules
}

// ── 메인 ────────────────────────────────────────────────────────────────────

function main() {
  const sessions: Session[] = []
  const claudeStats = loadClaude(sessions)
  const codexStats = loadCodex(sessions)

  const growth = buildGrowth(sessions)
  const retryAudit = auditRetries(sessions)
  const monthCounts = countUserMessagesByMonth(sessions)
  // eligibility 기준 시각 — buildPromptCoaching 과 buildRuleBoard 에 반드시 같은 now (드리프트 가드 3 성립 조건)
  const now = new Date()
  const insights = buildPromptCoaching(growth, now)
  const board = buildRuleBoard(growth, now)

  // ── 드리프트 가드 3 (§4) — 보드는 발화 조건 재구현이므로 실제 리턴 id 와 대조 ──
  assert.deepEqual(
    board.filter((r) => r.eligible).map((r) => r.id).slice(0, MAX_INSIGHTS),
    insights.map((i) => i.id),
    'drift: 보드 eligible 집합 != buildPromptCoaching 리턴 id 집합')

  const totalUserMessages = sessions.reduce(
    (n, s) => n + s.messages.filter((m) => m.role === 'user').length, 0)

  // ── §1 로딩 요약 ──
  console.log('=== 1. 로딩 요약 ===')
  console.log(`  [claude] files=${claudeStats.files} ok=${claudeStats.ok} skipped/fail=${claudeStats.fail} (${path.join(os.homedir(), '.claude', 'projects')})`)
  console.log(`  [codex]  files=${codexStats.files} ok=${codexStats.ok} skipped/fail=${codexStats.fail} (${path.join(os.homedir(), '.codex', 'sessions')})`)
  console.log(`  세션 수: ${sessions.length}`)
  console.log(`  user 메시지 수: ${totalUserMessages}`)
  console.log(`  follow-up 수: ${growth.retryStats.totalFollowups}`)

  // ── 드리프트 가드 1 (§4) — 재순회 == buildGrowth.retryStats ──
  assert.equal(retryAudit.totalFollowups, growth.retryStats.totalFollowups,
    'drift: 재순회 totalFollowups != buildGrowth.retryStats.totalFollowups')
  assert.equal(retryAudit.retryCount, growth.retryStats.retryCount,
    'drift: 재순회 retryCount != buildGrowth.retryStats.retryCount')

  // ── 드리프트 가드 2 (§5) — count≥MIN_MONTH_SAMPLES 월 집합 == monthlyComplexity 월 집합 ──
  const validByCount = [...monthCounts.entries()]
    .filter(([, count]) => count >= MIN_MONTH_SAMPLES)
    .map(([month]) => month)
    .sort()
  const validByGrowth = growth.monthlyComplexity.map((m) => m.month).sort()
  assert.deepEqual(validByCount, validByGrowth,
    'drift: count≥5 월 집합 != monthlyComplexity 월 집합')

  // ── §2 월 커버리지 테이블 ──
  console.log('\n=== 2. 월 커버리지 (유효 월 = user 메시지 ≥ 5) ===')
  const curveByMonth = new Map(growth.skillCurve.map((m) => [m.month, m]))
  const header = `  ${'월'.padEnd(8)} ${'msgs'.padStart(5)}  ${'상태'.padEnd(6)} ${'avgWords'.padStart(8)} ${'structured'.padStart(10)} ${'uniqueSkills'.padStart(12)} ${'hasClaude'.padStart(9)} ${'score'.padStart(6)}`
  console.log(header)
  const sortedMonths = [...monthCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [month, count] of sortedMonths) {
    const curve = curveByMonth.get(month)
    if (curve) {
      console.log(`  ${month.padEnd(8)} ${String(count).padStart(5)}  ${'유효'.padEnd(6)} ${curve.avgWords.toFixed(1).padStart(8)} ${fmtPct(curve.structured).padStart(10)} ${String(curve.uniqueSkills).padStart(12)} ${(curve.hasClaudeSession ? '✓' : '✗').padStart(9)} ${fmtPct(curve.score).padStart(6)}`)
    } else {
      console.log(`  ${month.padEnd(8)} ${String(count).padStart(5)}  제외(<${MIN_MONTH_SAMPLES})`)
    }
  }
  console.log(`  유효 월 ${growth.skillCurve.length}개 / 전체 ${monthCounts.size}개`)

  // ── §3 코칭 발화 결과 ──
  console.log(`\n=== 3. 코칭 발화 결과 (buildPromptCoaching → ${insights.length}건, MAX_INSIGHTS=${MAX_INSIGHTS}) ===`)
  if (insights.length === 0) {
    console.log('  (발화 인사이트 없음)')
  }
  for (const insight of insights) {
    console.log(`  ■ ${insight.id} (${insight.kind})`)
    for (const [key, value] of Object.entries(insight.evidence)) {
      console.log(`      ${key}: ${typeof value === 'number' ? fmtNum(value) : JSON.stringify(value)}`)
    }
  }

  // ── §4 7룰 상태 보드 ──
  console.log('\n=== 4. 7룰 상태 보드 (발화 여부 무관, 실제값 vs 임계값 vs 마진) ===')
  const firedIds = new Set(insights.map((i) => i.id))
  for (const rule of board) {
    const fired = firedIds.has(rule.id)
    let status: string
    if (fired) status = '발화'
    else if (rule.eligible) status = `조건 충족이나 MAX_INSIGHTS(${MAX_INSIGHTS}) 절단으로 미발화`
    else status = '미발화'
    console.log(`  ■ ${rule.id} (${rule.kind})`)
    for (const cond of rule.conds) console.log(`      ${condLine(cond)}`)
    if (rule.blocked) console.log(`      ${rule.blocked}`)
    console.log(`    → ${status}`)
  }

  // ── §5 retry 마커 감사 ──
  console.log('\n=== 5. retry 마커 감사 ===')
  console.log(`  follow-up ${retryAudit.totalFollowups}건 중 retry 매치 ${retryAudit.retryCount}건 (retryRate ${fmtNum(growth.retryStats.retryRate)})`)
  console.log('\n  (a) marker별 매치 카운트 (매치 0 포함, 사전 순서)')
  for (const marker of RETRY_MARKERS) {
    console.log(`      ${`'${marker}'`.padEnd(16)} ${String(retryAudit.markerCounts.get(marker) ?? 0).padStart(6)}`)
  }
  console.log(`\n  (b) marker별 샘플 (최대 ${SAMPLES_PER_MARKER}개, 균등 간격 추출 — stripMarkup→maskSecrets→${SAMPLE_HEAD_CHARS}자 절단)`)
  for (const marker of RETRY_MARKERS) {
    const matches = retryAudit.matchesByMarker.get(marker) ?? []
    if (matches.length === 0) continue
    console.log(`      — '${marker}' (${matches.length}건)`)
    for (const idx of evenlySpacedIndices(matches.length, SAMPLES_PER_MARKER)) {
      console.log(`        [${marker}] "${sampleHead(matches[idx])}"`)
    }
  }

  // ── §6 assert 통과 확인 ──
  console.log('\n=== 6. 드리프트 가드 assert 통과 확인 ===')
  console.log(`  [assert] retry 재순회 == buildGrowth.retryStats (totalFollowups=${retryAudit.totalFollowups}, retryCount=${retryAudit.retryCount}) ✓`)
  console.log(`  [assert] count≥${MIN_MONTH_SAMPLES} 월 집합 == monthlyComplexity 월 집합 (${validByGrowth.length}개 월) ✓`)
  console.log(`  [assert] 보드 eligible 상위 ${MAX_INSIGHTS} == buildPromptCoaching 리턴 id (${insights.length}건) ✓`)
}

main()
