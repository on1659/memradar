#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 프롬프트 코칭 룰 어설션 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/prompt-coaching.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위: buildPromptCoaching — 각 룰(tip 5 + praise 2) 발화/비발화 경계, 상호배타,
 *       우선순위(tip 먼저→praise), 최대 4개(MAX_INSIGHTS) 제한, 빈 배열
 */
import assert from 'node:assert/strict'
import {
  buildPromptCoaching,
  HIGH_RETRY_MIN_FOLLOWUPS,
  HIGH_RETRY_MIN_RATE,
  LOW_RETRY_MAX_RATE,
  LONG_PROMPT_MIN_AVG_WORDS,
  LOW_STRUCTURED_MAX_RATE,
  SHORT_PROMPT_MAX_AVG_WORDS,
  HIGH_SKILL_VARIETY_MIN,
  IMPROVING_MIN_SCORE_DELTA,
  MIN_ELIGIBLE_ACTIVE_DAYS,
  MAX_INSIGHTS,
} from '../src/lib/promptCoaching.ts'
import type { GrowthStats } from '../src/types.ts'

// 결정적 now — 픽스처 월(2026-01~05)이 전부 완료된 달력 월이 되는 기준 시각 (UTC)
const NOW = new Date('2026-12-01T00:00:00.000Z')

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
    activeDays: 15,   // 기본은 eligible 충분 (경계 테스트는 개별 override)
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

function ids(growth: GrowthStats, now: Date = NOW): string[] {
  return buildPromptCoaching(growth, now).map((i) => i.id)
}

// === 빈 배열 ================================================================
console.log('\n[빈 배열]')

test('데이터 없음 → 빈 배열', () => {
  assert.deepStrictEqual(buildPromptCoaching(makeGrowth(), NOW), [])
})

test('발화 조건 0개 → 빈 배열 (평범한 한 달)', () => {
  const growth = makeGrowth({
    skillCurve: [curve('2026-01')],
    retryStats: { totalFollowups: 10, retryCount: 1, retryRate: 0.1, topMarkers: [['다시', 1]] },
  })
  assert.deepStrictEqual(buildPromptCoaching(growth, NOW), [])
})

// === 룰 1: high-retry =======================================================
console.log('\n[high-retry]')

test('발화 — 경계값 정확히 (followups=HIGH_RETRY_MIN_FOLLOWUPS, rate=HIGH_RETRY_MIN_RATE 등호 경계)', () => {
  const growth = makeGrowth({
    retryStats: {
      totalFollowups: HIGH_RETRY_MIN_FOLLOWUPS,
      retryCount: 3,
      retryRate: HIGH_RETRY_MIN_RATE,
      topMarkers: [['다시', 2], ['아니', 1]],
    },
  })
  const insights = buildPromptCoaching(growth, NOW)
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

test('비발화 — rate 미달 (임계 0.08 바로 아래)', () => {
  const growth = makeGrowth({
    retryStats: { totalFollowups: 100, retryCount: 7, retryRate: 0.07, topMarkers: [['다시', 7]] },
  })
  assert.deepStrictEqual(ids(growth), [])
})

// === 룰 2: long-unstructured ================================================
console.log('\n[long-unstructured]')

test('발화 — avgWords=50, structured=0.09', () => {
  const growth = makeGrowth({
    skillCurve: [curve('2026-01', { avgWords: LONG_PROMPT_MIN_AVG_WORDS, structured: 0.09 })],
  })
  const insights = buildPromptCoaching(growth, NOW)
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
  const insights = buildPromptCoaching(growth, NOW)
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
  const insights = buildPromptCoaching(growth, NOW)
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
  const insights = buildPromptCoaching(growth, NOW)
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
  const insights = buildPromptCoaching(growth, NOW)
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

// === 룰 6: low-retry (praise) ===============================================
console.log('\n[low-retry]')

test('발화 — followups=HIGH_RETRY_MIN_FOLLOWUPS, rate=LOW_RETRY_MAX_RATE 경계', () => {
  const growth = makeGrowth({
    retryStats: {
      totalFollowups: HIGH_RETRY_MIN_FOLLOWUPS,
      retryCount: 1,
      retryRate: LOW_RETRY_MAX_RATE,
      topMarkers: [],
    },
  })
  const insights = buildPromptCoaching(growth, NOW)
  assert.deepStrictEqual(insights.map((i) => i.id), ['low-retry'])
  assert.strictEqual(insights[0].kind, 'praise')
  assert.strictEqual(insights[0].evidence.retryRate, LOW_RETRY_MAX_RATE) // 0~1 분수 유지
  assert.strictEqual(insights[0].evidence.retryCount, 1)
  assert.strictEqual(insights[0].evidence.totalFollowups, HIGH_RETRY_MIN_FOLLOWUPS)
})

test('비발화 — rate=0.051 (LOW_RETRY_MAX_RATE 바로 위, high-retry 임계 미만 → 둘 다 미발화)', () => {
  const growth = makeGrowth({
    retryStats: { totalFollowups: 100, retryCount: 6, retryRate: 0.051, topMarkers: [] },
  })
  assert.deepStrictEqual(ids(growth), [])
})

test('비발화 — followups 게이트 미달 (19) 이면 정정률 낮아도 미발화', () => {
  const growth = makeGrowth({
    retryStats: { totalFollowups: HIGH_RETRY_MIN_FOLLOWUPS - 1, retryCount: 0, retryRate: 0, topMarkers: [] },
  })
  assert.deepStrictEqual(ids(growth), [])
})

// === 룰 7: high-skill-variety (praise) ======================================
console.log('\n[high-skill-variety]')

test('발화 — 유효 월 2개, 최근 Claude 월 uniqueSkills=HIGH_SKILL_VARIETY_MIN 경계', () => {
  const growth = makeGrowth({
    skillCurve: [
      curve('2026-01'),
      curve('2026-02', { uniqueSkills: HIGH_SKILL_VARIETY_MIN }),
    ],
  })
  const insights = buildPromptCoaching(growth, NOW)
  assert.deepStrictEqual(insights.map((i) => i.id), ['high-skill-variety'])
  assert.strictEqual(insights[0].kind, 'praise')
  assert.strictEqual(insights[0].evidence.uniqueSkills, HIGH_SKILL_VARIETY_MIN)
  assert.strictEqual(insights[0].evidence.month, '2026-02')
})

test('비발화 — 최근 Claude 월 uniqueSkills=4 (경계 미만)', () => {
  const growth = makeGrowth({
    skillCurve: [curve('2026-01'), curve('2026-02', { uniqueSkills: HIGH_SKILL_VARIETY_MIN - 1 })],
  })
  assert.deepStrictEqual(ids(growth), [])
})

test('비발화 — 유효 월 1개뿐이면 uniqueSkills 높아도 안 나옴', () => {
  const growth = makeGrowth({
    skillCurve: [curve('2026-01', { uniqueSkills: 8 })],
  })
  assert.deepStrictEqual(ids(growth), [])
})

// === 상호배타 (신규 칭찬 룰 ↔ tip 대응 룰) ===================================
console.log('\n[상호배타]')

test('high-retry 와 low-retry 는 상호 배타 (동일 데이터가 둘 다 발화 못 함)', () => {
  const highGrowth = makeGrowth({
    retryStats: { totalFollowups: 50, retryCount: 20, retryRate: 0.4, topMarkers: [['다시', 12]] },
  })
  const lowGrowth = makeGrowth({
    retryStats: { totalFollowups: 50, retryCount: 1, retryRate: 0.02, topMarkers: [] },
  })
  const highIds = ids(highGrowth)
  const lowIds = ids(lowGrowth)
  assert.ok(highIds.includes('high-retry') && !highIds.includes('low-retry'))
  assert.ok(lowIds.includes('low-retry') && !lowIds.includes('high-retry'))
})

test('low-skill-variety 와 high-skill-variety 는 상호 배타', () => {
  const lowGrowth = makeGrowth({
    skillCurve: [curve('2026-01'), curve('2026-02', { uniqueSkills: 1 })],
  })
  const highGrowth = makeGrowth({
    skillCurve: [curve('2026-01'), curve('2026-02', { uniqueSkills: 6 })],
  })
  const lowIds = ids(lowGrowth)
  const highIds = ids(highGrowth)
  assert.ok(lowIds.includes('low-skill-variety') && !lowIds.includes('high-skill-variety'))
  assert.ok(highIds.includes('high-skill-variety') && !highIds.includes('low-skill-variety'))
})

// === 월 eligibility (부분 달 가드) ===========================================
console.log('\n[eligibility]')

test('현재 월 activeDays = 7 → eligible → latest-월 룰 발화 (첫 달 정책 보존)', () => {
  const now = new Date('2026-01-10T00:00:00.000Z')
  const growth = makeGrowth({
    skillCurve: [curve('2026-01', { avgWords: 5, activeDays: MIN_ELIGIBLE_ACTIVE_DAYS })],
  })
  assert.deepStrictEqual(ids(growth, now), ['short-prompts'])
})

test('현재 월 activeDays = 6 → eligible 아님 → latest-월 룰 미발화', () => {
  const now = new Date('2026-01-10T00:00:00.000Z')
  const growth = makeGrowth({
    skillCurve: [curve('2026-01', { avgWords: 5, activeDays: MIN_ELIGIBLE_ACTIVE_DAYS - 1 })],
  })
  assert.deepStrictEqual(ids(growth, now), [])
})

test('eligible 월 0개 → latest-월 룰 전부 미발화, high-retry 는 발화 가능', () => {
  const now = new Date('2026-01-10T00:00:00.000Z')
  const growth = makeGrowth({
    retryStats: { totalFollowups: 50, retryCount: 10, retryRate: 0.2, topMarkers: [['아니', 6]] },
    // 부분 달 하나뿐 — avgWords·uniqueSkills 는 tip 조건을 충족하지만 eligible 이 아님
    skillCurve: [curve('2026-01', { avgWords: 5, uniqueSkills: 1, activeDays: 3 })],
  })
  assert.deepStrictEqual(ids(growth, now), ['high-retry'])
})

test('improving 종점 — 부분 달을 건너뛰고 마지막 eligible 월 기준', () => {
  const now = new Date('2026-04-05T00:00:00.000Z')
  const growth = makeGrowth({
    skillCurve: [
      curve('2026-01', { score: 0.2 }),
      curve('2026-02', { score: 0.3 }),
      curve('2026-03', { score: 0.35 }),
      // 부분 달의 포화 점수 — 종점으로 쓰이면 +70pp 과장 (2026-07 실측 결함 재현)
      curve('2026-04', { score: 0.9, activeDays: 3 }),
    ],
  })
  const insights = buildPromptCoaching(growth, now)
  assert.deepStrictEqual(insights.map((i) => i.id), ['improving'])
  assert.strictEqual(insights[0].evidence.lastMonth, '2026-03')
  assert.strictEqual(insights[0].evidence.scoreDeltaPp, 15)
})

test('low-skill-variety — 부분 달을 건너뛰고 마지막 eligible Claude 월 평가', () => {
  const now = new Date('2026-03-03T00:00:00.000Z')
  const growth = makeGrowth({
    skillCurve: [
      curve('2026-01', { uniqueSkills: 1 }),
      curve('2026-02', { uniqueSkills: 1 }),
      // 부분 달은 uniqueSkills 많아도 판정 기준이 아님
      curve('2026-03', { uniqueSkills: 5, activeDays: 2 }),
    ],
  })
  const insights = buildPromptCoaching(growth, now)
  assert.deepStrictEqual(insights.map((i) => i.id), ['low-skill-variety'])
  assert.strictEqual(insights[0].evidence.month, '2026-02')
})

// === 우선순위 + 최대 MAX_INSIGHTS(4) ========================================
console.log('\n[우선순위·최대 개수]')

test('tip 3 + praise 1 발화 시 우선순위순 4개 (MAX_INSIGHTS)', () => {
  const growth = makeGrowth({
    retryStats: { totalFollowups: 50, retryCount: 20, retryRate: 0.4, topMarkers: [['다시', 12]] },
    skillCurve: [
      curve('2026-01', { score: 0.1, avgWords: 70, structured: 0 }),
      curve('2026-02', { score: 0.2, avgWords: 70, structured: 0 }),
      // high-retry + long-unstructured + low-skill-variety + improving 모두 발화
      curve('2026-03', { score: 0.4, avgWords: 70, structured: 0, uniqueSkills: 1 }),
    ],
  })
  const insights = buildPromptCoaching(growth, NOW)
  assert.strictEqual(insights.length, MAX_INSIGHTS)
  assert.deepStrictEqual(
    insights.map((i) => i.id),
    ['high-retry', 'long-unstructured', 'low-skill-variety', 'improving']
  )
})

test('실측 시나리오 — long-unstructured + improving + low-retry + high-skill-variety (tip 먼저→praise)', () => {
  // 사용자 실데이터 재현: high-retry/short-prompts/low-skill-variety 는 미발화(강점 쪽),
  // tip 1(long-unstructured) 뒤에 praise 3(improving, low-retry, high-skill-variety) 순서
  const growth = makeGrowth({
    retryStats: { totalFollowups: 40, retryCount: 1, retryRate: 0.025, topMarkers: [['다시', 1]] },
    skillCurve: [
      curve('2026-01', { score: 0.2, avgWords: 70, structured: 0, uniqueSkills: 6 }),
      curve('2026-02', { score: 0.3, avgWords: 70, structured: 0, uniqueSkills: 6 }),
      curve('2026-03', { score: 0.4, avgWords: 70, structured: 0, uniqueSkills: 6 }),
    ],
  })
  const insights = buildPromptCoaching(growth, NOW)
  assert.strictEqual(insights.length, MAX_INSIGHTS)
  assert.deepStrictEqual(
    insights.map((i) => i.id),
    ['long-unstructured', 'improving', 'low-retry', 'high-skill-variety']
  )
  // tip 이 praise 앞에 온다 (push 순서 = 우선순위)
  const firstPraise = insights.findIndex((i) => i.kind === 'praise')
  const lastTip = insights.map((i) => i.kind).lastIndexOf('tip')
  assert.ok(lastTip < firstPraise, 'tip 은 모두 praise 앞')
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
