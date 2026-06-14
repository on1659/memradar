#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 코딩 리듬 순수 함수 어설션 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/coding-rhythm.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위: toLocalDayKey, collectUserTimestamps, buildCodingRhythm(집계)
 * 라벨/2순위 판정은 2026-06-14 대시보드 재편으로 제거됨 (코딩 리듬 인사이트 카드 폐지).
 *
 * TZ 비의존: 모든 어설션은 offsetMinutes 주입 경로(KST=540 등)로 작성 —
 * 머신 타임존이 무엇이든 같은 결과가 나온다. 오프셋 미지정 동작은
 * 머신 로컬 getter 와의 일치만 스모크로 확인한다.
 */
import assert from 'node:assert/strict'
import { toLocalDayKey } from '../src/parser.ts'
import {
  buildCodingRhythm,
  collectUserTimestamps,
} from '../src/lib/codingRhythm.ts'
import type { ParsedMessage, Session } from '../src/types.ts'

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
const KST = 540 // +09:00 — 오프셋 주입으로 머신 TZ 비의존

/** KST 벽시계 시각의 Date — '2026-06-01', 23, 30 → 2026-06-01T23:30+09:00 */
function kst(day: string, hour: number, minute = 0): Date {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return new Date(`${day}T${hh}:${mm}:00+09:00`)
}

/** 지정한 KST 날짜들에 지정한 KST 시각들로 타임스탬프 생성 */
function persona(days: string[], hours: number[]): Date[] {
  const out: Date[] = []
  for (const day of days) {
    for (const hour of hours) {
      out.push(kst(day, hour, 30))
    }
  }
  return out
}

// 2026-06 달력: 06-01(월) ~ 06-28(일). 06-06/13/20/27 토, 06-07/14/21/28 일.
const JUNE_WEEKDAYS_10 = [
  '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05',
  '2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12',
]
const JUNE_WEEKENDS_8 = [
  '2026-06-06', '2026-06-07', '2026-06-13', '2026-06-14',
  '2026-06-20', '2026-06-21', '2026-06-27', '2026-06-28',
]

// === toLocalDayKey ==========================================================
console.log('\n[toLocalDayKey]')

test('KST 02:30 새벽 활동은 로컬 12일 — UTC 키였다면 11일', () => {
  // 2026-06-11T17:30Z = KST 2026-06-12 02:30
  assert.strictEqual(toLocalDayKey(new Date('2026-06-11T17:30:00Z'), KST), '2026-06-12')
})

test('KST 자정 직전(23:59)은 같은 날', () => {
  // 2026-06-11T14:59Z = KST 2026-06-11 23:59
  assert.strictEqual(toLocalDayKey(new Date('2026-06-11T14:59:00Z'), KST), '2026-06-11')
})

test('KST 자정 정각(00:00)부터 다음 날', () => {
  // 2026-06-11T15:00Z = KST 2026-06-12 00:00
  assert.strictEqual(toLocalDayKey(new Date('2026-06-11T15:00:00Z'), KST), '2026-06-12')
})

test('오프셋 0 은 UTC 날짜와 동일', () => {
  assert.strictEqual(toLocalDayKey(new Date('2026-06-11T17:30:00Z'), 0), '2026-06-11')
})

test('음수 오프셋(서반구) — UTC 새벽이 전날로', () => {
  // 2026-06-12T03:00Z = UTC-5 2026-06-11 22:00
  assert.strictEqual(toLocalDayKey(new Date('2026-06-12T03:00:00Z'), -300), '2026-06-11')
})

test('월/일 제로 패딩', () => {
  assert.strictEqual(toLocalDayKey(new Date('2026-01-05T12:00:00Z'), 0), '2026-01-05')
})

test('오프셋 미지정 스모크 — 머신 로컬 getter 와 일치', () => {
  const d = new Date('2026-06-11T17:30:00Z')
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  assert.strictEqual(toLocalDayKey(d), expected)
})

// === collectUserTimestamps ==================================================
console.log('\n[collectUserTimestamps]')

function msg(role: 'user' | 'assistant', timestamp: string): ParsedMessage {
  return { role, text: 'fixture', timestamp, toolUses: [] }
}

function makeSession(messages: ParsedMessage[]): Session {
  return {
    id: `s-${Math.random().toString(36).slice(2)}`,
    fileName: 'fixture.jsonl',
    source: 'claude',
    messages,
    startTime: messages[0]?.timestamp || '',
    endTime: messages[messages.length - 1]?.timestamp || '',
    totalTokens: { input: 0, output: 0 },
    messageCount: {
      user: messages.filter((m) => m.role === 'user').length,
      assistant: messages.filter((m) => m.role === 'assistant').length,
    },
  }
}

test('user 메시지의 유효 타임스탬프만 수집 — assistant·빈·파싱불가 제외', () => {
  const s = makeSession([
    msg('user', '2026-06-01T10:00:00Z'),
    msg('assistant', '2026-06-01T10:01:00Z'),
    msg('user', ''),
    msg('user', 'not-a-date'),
    msg('user', '2026-06-02T10:00:00Z'),
  ])
  const out = collectUserTimestamps([s])
  assert.strictEqual(out.length, 2)
  assert.strictEqual(out[0].toISOString(), '2026-06-01T10:00:00.000Z')
})

// === buildCodingRhythm — 집계 정확성 ========================================
console.log('\n[buildCodingRhythm 집계]')

test('KST 경계 통합 — 새벽 메시지가 로컬 날짜 키로 귀속', () => {
  const rhythm = buildCodingRhythm([new Date('2026-06-11T17:30:00Z')], { offsetMinutes: KST })
  assert.deepStrictEqual(Object.keys(rhythm.localDailyCounts), ['2026-06-12'])
  assert.strictEqual(rhythm.localDailyCounts['2026-06-12'], 1)
})

test('최장 streak — 1~3일 + 5~8일이면 4', () => {
  const days = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-05', '2026-06-06', '2026-06-07', '2026-06-08']
  const rhythm = buildCodingRhythm(persona(days, [12]), { offsetMinutes: KST })
  assert.strictEqual(rhythm.longestStreak, 4)
  assert.strictEqual(rhythm.activeDayCount, 7)
  assert.strictEqual(rhythm.observedDayCount, 8)
})

test('활동 밀도/관측일 — 주말 8일 / 관측 23일, 분수 0~1 raw', () => {
  const rhythm = buildCodingRhythm(persona(JUNE_WEEKENDS_8, [13, 14, 15]), { offsetMinutes: KST })
  assert.strictEqual(rhythm.activeDayCount, 8)
  assert.strictEqual(rhythm.observedDayCount, 23) // 06-06 ~ 06-28
  assert.ok(Math.abs(rhythm.densityRatio - 8 / 23) < 1e-9, `densityRatio=${rhythm.densityRatio}`)
  assert.ok(rhythm.densityRatio > 0 && rhythm.densityRatio < 1, '밀도는 0~1 분수 — % 변환은 UI에서')
})

test('요일 분포 — 주말 페르소나는 토/일에만, share 합 1', () => {
  const rhythm = buildCodingRhythm(persona(JUNE_WEEKENDS_8, [13, 14, 15]), { offsetMinutes: KST })
  assert.strictEqual(rhythm.weekdayDistribution.length, 7)
  assert.strictEqual(rhythm.weekdayDistribution[0].count, 12) // 일요일 4일 × 3
  assert.strictEqual(rhythm.weekdayDistribution[6].count, 12) // 토요일 4일 × 3
  for (let i = 1; i <= 5; i++) assert.strictEqual(rhythm.weekdayDistribution[i].count, 0)
  const shareSum = rhythm.weekdayDistribution.reduce((sum, e) => sum + e.share, 0)
  assert.ok(Math.abs(shareSum - 1) < 1e-9)
})

test('시간대 밴드 share — 심야 페르소나는 night=1, early=0', () => {
  const rhythm = buildCodingRhythm(persona(JUNE_WEEKDAYS_10, [23]), { offsetMinutes: KST })
  assert.strictEqual(rhythm.hourBandShares.night, 1)
  assert.strictEqual(rhythm.hourBandShares.early, 0)
})

test('시간대 밴드 share — 아침 페르소나는 early>0, office 일부 포함(09시)', () => {
  // 05~09시 매일 → early share 1, office(09~18) 는 09시만 → 1/4
  const rhythm = buildCodingRhythm(persona(JUNE_WEEKDAYS_10, [6, 7, 8, 9]), { offsetMinutes: KST })
  assert.strictEqual(rhythm.hourBandShares.early, 1)
  assert.ok(Math.abs(rhythm.hourBandShares.office - 1 / 4) < 1e-9, `office=${rhythm.hourBandShares.office}`)
})

test('타임스탬프 0건 — 크래시 없이 빈 결과', () => {
  const rhythm = buildCodingRhythm([], { offsetMinutes: KST })
  assert.strictEqual(rhythm.totalMessages, 0)
  assert.strictEqual(rhythm.activeDayCount, 0)
  assert.strictEqual(rhythm.observedDayCount, 0)
  assert.strictEqual(rhythm.densityRatio, 0)
  assert.strictEqual(rhythm.longestStreak, 0)
  assert.strictEqual(rhythm.hourBandShares.night, 0)
  assert.deepStrictEqual(rhythm.localDailyCounts, {})
  assert.strictEqual(rhythm.weekdayDistribution.length, 7)
  for (const entry of rhythm.weekdayDistribution) {
    assert.strictEqual(entry.count, 0)
    assert.strictEqual(entry.share, 0)
  }
})

test('totalMessages = 입력 타임스탬프 수, localDailyCounts 합과 일치', () => {
  const rhythm = buildCodingRhythm(persona(JUNE_WEEKDAYS_10, [10, 14]), { offsetMinutes: KST })
  assert.strictEqual(rhythm.totalMessages, 20)
  const dailySum = Object.values(rhythm.localDailyCounts).reduce((s, v) => s + v, 0)
  assert.strictEqual(dailySum, rhythm.totalMessages)
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
