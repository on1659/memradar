#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 프롬프트 코칭 룰 어설션 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/prompt-coaching.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위: buildPromptCoaching — 각 룰 발화/비발화 경계, 우선순위, 최대 3개 제한, 빈 배열
 */
import assert from 'node:assert/strict'
import {
  buildPromptCoaching,
  HIGH_RETRY_MIN_FOLLOWUPS,
  HIGH_RETRY_MIN_RATE,
  LONG_PROMPT_MIN_AVG_WORDS,
  LOW_STRUCTURED_MAX_RATE,
  SHORT_PROMPT_MAX_AVG_WORDS,
  IMPROVING_MIN_SCORE_DELTA,
  MAX_INSIGHTS,
} from '../src/lib/promptCoaching.ts'
import type { GrowthStats } from '../src/types.ts'

// --- 미니 테스트 러너 -----------------------------------------------------
let passed = 0
let failed = 0
const failures: { name: string; err: unknown }[] = []

function test(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    failures.push({ name, err: e })
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  ✗ ${name}\n    ${msg}`)
  }
}

// --- 픽스처 헬퍼 -----------------------------------------------------------
type CurveEntry = GrowthStats['skillCurve'][number]

function curve(month: string, over: Partial<CurveEntry> = {}): CurveEntry {
  return {
    month,
    score: 0.5,
    structured: 0.5,
    avgWords: 30,
    uniqueSkills: 3,
    hasClaudeSession: true,
    count: 10,
    ...over,
  }
}

function makeGrowth(over: Partial<GrowthStats> = {}): GrowthStats {
  return {
    monthlyComplexity: [],
    skillCurve: [],
    retryStats: { totalFollowups: 0, retryCount: 0, retryRate: 0, topMarkers: [] },
    ...over,
  }
}

function ids(growth: GrowthStats): string[] {
  return buildPromptCoaching(growth).map((i) => i.id)
}

// === 빈 배열 ================================================================
console.log('\n[빈 배열]')

test('데이터 없음 → 빈 배열', () => {
  assert.deepStrictEqual(buildPromptCoaching(makeGrowth()), [])
})

test('발화 조건 0개 → 빈 배열 (평범한 한 달)', () => {
  const growth = makeGrowth({
    skillCurve: [curve('2026-01')],
    retryStats: { totalFollowups: 10, retryCount: 1, retryRate: 0.1, topMarkers: [['다시', 1]] },
  })
  assert.deepStrictEqual(buildPromptCoaching(growth), [])
})

// === 룰 1: high-retry =======================================================
console.log('\n[high-retry]')

test('발화 — 경계값 정확히 (followups=20, rate=0.15)', () => {
  const growth = makeGrowth({
    retryStats: {
      totalFollowups: HIGH_RETRY_MIN_FOLLOWUPS,
      retryCount: 3,
      retryRate: HIGH_RETRY_MIN_RATE,
      topMarkers: [['다시', 2], ['아니', 1]],
    },
  })
  const insights = buildPromptCoaching(growth)
  assert.strictEqual(insights.length, 1)
  assert.strictEqual(insights[0].id, 'high-retry')
  assert.strictEqual(insights[0].kind, 'tip')
  assert.strictEqual(insights[0].evidence.retryRate, HIGH_RETRY_MIN_RATE) // 0~1 분수 유지
  assert.strictEqual(insights[0].evidence.topMarker, '다시')
  assert.strictEqual(insights[0].evidence.topMarkerCount, 2)
})

test('비발화 — followups 미달 (19)', () => {
  const growth = makeGrowth({
    retryStats: { totalFollowups: HIGH_RETRY_MIN_FOLLOWUPS - 1, retryCount: 10, retryRate: 0.5, topMarkers: [['다시', 10]] },
  })
  assert.deepStrictEqual(ids(growth), [])
})

test('비발화 — rate 미달 (0.149…)', () => {
  const growth = makeGrowth({
    retryStats: { totalFollowups: 100, retryCount: 14, retryRate: 0.14, topMarkers: [['다시', 14]] },
  })
  assert.deepStrictEqual(ids(growth), [])
})

// === 룰 2: long-unstructured ================================================
console.log('\n[long-unstructured]')

test('발화 — avgWords=50, structured=0.09', () => {
  const growth = makeGrowth({
    skillCurve: [curve('2026-01', { avgWords: LONG_PROMPT_MIN_AVG_WORDS, structured: 0.09 })],
  })
  const insights = buildPromptCoaching(growth)
  assert.deepStrictEqual(insights.map((i) => i.id), ['long-unstructured'])
  assert.strictEqual(insights[0].evidence.avgWords, 50)
  assert.strictEqual(insights[0].evidence.structuredRate, 0.09)
})

test('비발화 — structured=0.1 (경계 미만 조건)', () => {
  const growth = makeGrowth({
    skillCurve: [curve('2026-01', { avgWords: 60, structured: LOW_STRUCTURED_MAX_RATE })],
  })
  assert.deepStrictEqual(ids(growth), [])
})

test('비발화 — avgWords=49.9', () => {
  const growth = makeGrowth({
    skillCurve: [curve('2026-01', { avgWords: 49.9, structured: 0 })],
  })
  assert.deepStrictEqual(ids(growth), [])
})

test('최근 유효 월 기준 — 과거 월이 길어도 최근 월이 짧으면 비발화', () => {
  const growth = makeGrowth({
    skillCurve: [
      curve('2026-01', { avgWords: 80, structured: 0 }),
      curve('2026-02', { avgWords: 30, structured: 0, uniqueSkills: 3 }),
    ],
  })
  assert.ok(!ids(growth).includes('long-unstructured'))
})

// === 룰 3: short-prompts ====================================================
console.log('\n[short-prompts]')

test('발화 — avgWords=9.9', () => {
  const growth = makeGrowth({
    skillCurve: [curve('2026-01', { avgWords: 9.9 })],
  })
  const insights = buildPromptCoaching(growth)
  assert.deepStrictEqual(insights.map((i) => i.id), ['short-prompts'])
  assert.strictEqual(insights[0].evidence.avgWords, 10) // Math.round(9.9)
})

test('비발화 — avgWords=10 (경계)', () => {
  const growth = makeGrowth({
    skillCurve: [curve('2026-01', { avgWords: SHORT_PROMPT_MAX_AVG_WORDS })],
  })
  assert.deepStrictEqual(ids(growth), [])
})

// === 룰 4: low-skill-variety ================================================
console.log('\n[low-skill-variety]')

test('발화 — 유효 월 2개, 최근 Claude 월 uniqueSkills=1', () => {
  const growth = makeGrowth({
    skillCurve: [
      curve('2026-01'),
      curve('2026-02', { uniqueSkills: 1 }),
    ],
  })
  const insights = buildPromptCoaching(growth)
  assert.deepStrictEqual(insights.map((i) => i.id), ['low-skill-variety'])
  assert.strictEqual(insights[0].evidence.uniqueSkills, 1)
  assert.strictEqual(insights[0].evidence.month, '2026-02')
})

test('비발화 — 유효 월 1개뿐이면 조건 충족해도 안 나옴', () => {
  const growth = makeGrowth({
    skillCurve: [curve('2026-01', { uniqueSkills: 0 })],
  })
  assert.deepStrictEqual(ids(growth), [])
})

test('비발화 — 최근 Claude 월 uniqueSkills=2', () => {
  const growth = makeGrowth({
    skillCurve: [curve('2026-01'), curve('2026-02', { uniqueSkills: 2 })],
  })
  assert.deepStrictEqual(ids(growth), [])
})

test('Codex-only 최근 월 건너뛰고 마지막 Claude 월 평가', () => {
  const growth = makeGrowth({
    skillCurve: [
      curve('2026-01', { uniqueSkills: 1 }),
      curve('2026-02', { hasClaudeSession: false, uniqueSkills: 0 }),
    ],
  })
  const insights = buildPromptCoaching(growth)
  assert.deepStrictEqual(insights.map((i) => i.id), ['low-skill-variety'])
  assert.strictEqual(insights[0].evidence.month, '2026-01')
})

// === 룰 5: improving (praise) ===============================================
console.log('\n[improving]')

test('발화 — 유효 월 3개, 델타 +0.11', () => {
  const growth = makeGrowth({
    skillCurve: [
      curve('2026-01', { score: 0.2 }),
      curve('2026-02', { score: 0.25 }),
      curve('2026-03', { score: 0.31 }),
    ],
  })
  const insights = buildPromptCoaching(growth)
  assert.deepStrictEqual(insights.map((i) => i.id), ['improving'])
  assert.strictEqual(insights[0].kind, 'praise')
  assert.strictEqual(insights[0].evidence.scoreDeltaPp, 11)
  assert.strictEqual(insights[0].evidence.firstMonth, '2026-01')
  assert.strictEqual(insights[0].evidence.lastMonth, '2026-03')
})

test('발화 — 델타 정확히 +0.1 (경계 포함)', () => {
  const growth = makeGrowth({
    skillCurve: [
      curve('2026-01', { score: 0.2 }),
      curve('2026-02', { score: 0.25 }),
      curve('2026-03', { score: 0.2 + IMPROVING_MIN_SCORE_DELTA }),
    ],
  })
  assert.deepStrictEqual(ids(growth), ['improving'])
})

test('비발화 — 델타 +0.09', () => {
  const growth = makeGrowth({
    skillCurve: [
      curve('2026-01', { score: 0.2 }),
      curve('2026-02', { score: 0.25 }),
      curve('2026-03', { score: 0.29 }),
    ],
  })
  assert.deepStrictEqual(ids(growth), [])
})

test('비발화 — 유효 월 2개뿐', () => {
  const growth = makeGrowth({
    skillCurve: [
      curve('2026-01', { score: 0.2 }),
      curve('2026-02', { score: 0.5 }),
    ],
  })
  assert.deepStrictEqual(ids(growth), [])
})

// === 우선순위 + 최대 3개 =====================================================
console.log('\n[우선순위·최대 개수]')

test('4개 발화 시 우선순위순 상위 3개만', () => {
  const growth = makeGrowth({
    retryStats: { totalFollowups: 50, retryCount: 20, retryRate: 0.4, topMarkers: [['다시', 12]] },
    skillCurve: [
      curve('2026-01', { score: 0.1, avgWords: 70, structured: 0 }),
      curve('2026-02', { score: 0.2, avgWords: 70, structured: 0 }),
      // high-retry + long-unstructured + low-skill-variety + improving 모두 발화
      curve('2026-03', { score: 0.4, avgWords: 70, structured: 0, uniqueSkills: 1 }),
    ],
  })
  const insights = buildPromptCoaching(growth)
  assert.strictEqual(insights.length, MAX_INSIGHTS)
  assert.deepStrictEqual(
    insights.map((i) => i.id),
    ['high-retry', 'long-unstructured', 'low-skill-variety']
  )
})

test('long-unstructured 와 short-prompts 는 상호 배타', () => {
  const longGrowth = makeGrowth({ skillCurve: [curve('2026-01', { avgWords: 60, structured: 0 })] })
  const shortGrowth = makeGrowth({ skillCurve: [curve('2026-01', { avgWords: 5 })] })
  assert.deepStrictEqual(ids(longGrowth), ['long-unstructured'])
  assert.deepStrictEqual(ids(shortGrowth), ['short-prompts'])
})

// === 결과 보고 =============================================================
console.log(`\n=== ${passed} passed, ${failed} failed ===`)
if (failed > 0) {
  console.log('\n실패 상세:')
  for (const f of failures) {
    console.log(`  ✗ ${f.name}`)
    console.log(`    ${f.err instanceof Error ? f.err.stack ?? f.err.message : String(f.err)}`)
  }
  process.exit(1)
}
