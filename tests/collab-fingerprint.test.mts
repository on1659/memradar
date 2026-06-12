#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * AI 협업 지문(Collaboration Fingerprint) 순수 함수 어설션 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/collab-fingerprint.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위: matchPlanMarker(parser), DailyCollab.structuredCount(가산 필드), buildCollabFingerprint,
 * selectTopSignals (docs/design/kim-feat-eval-sharpness-design-20260612-013324.md 카드 3,
 * docs/goal/collab-fingerprint-cards.md W3)
 *
 * TZ 비의존: 모든 어설션은 offsetMinutes 주입 경로(KST=540)로 작성 —
 * 머신 타임존이 무엇이든 같은 결과가 나온다 (story-of-day.test.mts 패턴).
 */
import assert from 'node:assert/strict'
import { matchPlanMarker, PLAN_MARKER_SCAN_CHARS } from '../src/parser.ts'
import { buildCodingRhythm, collectUserTimestamps, NIGHT_BAND_HOURS } from '../src/lib/codingRhythm.ts'
import { buildDailyCollab } from '../src/lib/storyOfDay.ts'
import {
  buildCollabFingerprint,
  FINGERPRINT_SIGNAL_ORDER,
  LONG_SESSION_MIN_TURNS,
  MIN_FINGERPRINT_LIFT,
  MIN_FINGERPRINT_SIGNAL_N,
  MIN_FINGERPRINT_TOP_SIGNALS,
  MIN_STRUCTURED_SHIFT_DELTA,
  selectTopSignals,
  type CollabFingerprint,
  type FingerprintSignal,
  type FingerprintSignalId,
} from '../src/lib/collabFingerprint.ts'
import type { ParsedMessage, Session, SessionSource } from '../src/types.ts'

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
const OPTS = { offsetMinutes: KST }

/** KST 벽시계 시각의 ISO — '2026-06-10', 10, 30 → 2026-06-10T10:30+09:00 */
function kstIso(day: string, hour: number, minute = 0): string {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return `${day}T${hh}:${mm}:00+09:00`
}

function kstMsg(role: 'user' | 'assistant', text: string, day: string, hour: number, minute = 0): ParsedMessage {
  return { role, text, timestamp: kstIso(day, hour, minute), toolUses: [] }
}

function makeSession(source: SessionSource, messages: ParsedMessage[]): Session {
  return {
    id: `s-${Math.random().toString(36).slice(2)}`,
    fileName: 'fixture.jsonl',
    source,
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

/** 세션 배열 → 지문 (Dashboard 와 동일하게 dailyCollab·rhythm 을 주입 — 카드 간 드리프트 방지 경로 그대로) */
function fpOf(sessions: Session[]): CollabFingerprint {
  return buildCollabFingerprint(
    sessions,
    buildDailyCollab(sessions, OPTS),
    buildCodingRhythm(collectUserTimestamps(sessions), OPTS)
  )
}

function sig(fp: CollabFingerprint, id: FingerprintSignalId): FingerprintSignal {
  const found = fp.signals.find((signal) => signal.id === id)
  assert.ok(found, `signal ${id} 없음`)
  return found
}

// 2026-06 달력: 06-01(월) ~ 06-30(화). 주말 = 06/07/13/14/20/21/27/28 (coding-rhythm.test.mts 와 동일 달력)
const JUNE_WEEKENDS = [
  '2026-06-06', '2026-06-07', '2026-06-13', '2026-06-14',
  '2026-06-20', '2026-06-21', '2026-06-27', '2026-06-28',
]
// 2026-03 달력: 03-01(일) — 03-02..06, 03-09..13 은 평일
const MARCH_WEEKDAYS = [
  '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06',
  '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13',
]
const JUNE_WEEKDAYS = [
  '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05',
  '2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12',
]

const PLAIN_TEXT = '이어서 진행해 주세요'              // retry/plan/structured 마커 전부 없음
const STRUCTURED_TEXT = '# 목표\n- 입력 정리\n- 출력 검증' // 헤딩 + 불릿 = 2종 → isStructured
const RETRY_TEXT = '다시 해줘'                          // retry 마커만
const PLAN_TEXT = '계획부터 잡고 가자'                   // plan 마커만 (retry 마커 비포함)

/**
 * 페르소나 1 — 주말 심야형. 6월 주말 8일 × 1세션 × user 8건(22시) + 앵커 2일(06-01/lastDay, 22시 1건).
 * 관측 30일(기본), 주말 세션 일평균 1.0 vs 주중 2/22 → ① lift 11. 심야 비중 100% → ④ lift 4.8.
 */
function weekendNightPersona(source: SessionSource = 'claude', lastDay = '2026-06-30'): Session[] {
  const sessions = JUNE_WEEKENDS.map((day) => {
    const msgs: ParsedMessage[] = []
    for (let i = 0; i < 8; i++) msgs.push(kstMsg('user', PLAIN_TEXT, day, 22, i * 5))
    return makeSession(source, msgs)
  })
  sessions.push(makeSession(source, [kstMsg('user', '오늘 작업 메모', '2026-06-01', 22)]))
  sessions.push(makeSession(source, [kstMsg('user', '오늘 작업 메모', lastDay, 22)]))
  return sessions
}

/**
 * 페르소나 2 — 구조화 상승 + 정정 후 계획형 (평일 낮 14시만 활동).
 * 이전(3월): 10일 × user 4건(구조화 1) → 구조화 25% (n=40).
 * 최근(6월, 앵커 06-12): 10일 × user 10건(구조화 4 + (정정→계획)×3) → 구조화 40% (n=100), 정정 30건 전부 직후 계획.
 */
function structuredPlanPersona(): Session[] {
  const sessions: Session[] = []
  for (const day of MARCH_WEEKDAYS) {
    const texts = [STRUCTURED_TEXT, PLAIN_TEXT, PLAIN_TEXT, PLAIN_TEXT]
    sessions.push(makeSession('claude', texts.map((t, i) => kstMsg('user', t, day, 14, i * 5))))
  }
  for (const day of JUNE_WEEKDAYS) {
    const texts = [
      STRUCTURED_TEXT, STRUCTURED_TEXT, STRUCTURED_TEXT, STRUCTURED_TEXT,
      RETRY_TEXT, PLAN_TEXT, RETRY_TEXT, PLAN_TEXT, RETRY_TEXT, PLAN_TEXT,
    ]
    sessions.push(makeSession('claude', texts.map((t, i) => kstMsg('user', t, day, 14, i * 5))))
  }
  return sessions
}

/** 페르소나 3 — 긴 세션 선호. 7턴 세션 shortCount + 21턴 세션 longCount (중앙값 7 → 기대 2^(−21/7) = 0.125) */
function longSessionPersona(shortCount: number, longCount: number): Session[] {
  const sessions: Session[] = []
  for (let s = 0; s < shortCount; s++) {
    const msgs: ParsedMessage[] = []
    for (let i = 0; i < 7; i++) msgs.push(kstMsg('user', `질문 ${i}`, '2026-06-10', 9, i))
    sessions.push(makeSession('claude', msgs))
  }
  for (let s = 0; s < longCount; s++) {
    const msgs: ParsedMessage[] = []
    for (let i = 0; i < 21; i++) msgs.push(kstMsg('user', `질문 ${i}`, '2026-06-10', 10, i))
    sessions.push(makeSession('claude', msgs))
  }
  return sessions
}

function mkSignal(id: FingerprintSignalId, lift: number, viable = true): FingerprintSignal {
  return { id, lift, delta: null, numerator: 0, denominator: 0, n: 30, n2: null, viable, rankScore: lift }
}

// === matchPlanMarker ========================================================
console.log('\n[matchPlanMarker]')

test('한국어 구 매칭 — 조사·어미 결합 허용', () => {
  assert.strictEqual(matchPlanMarker('계획부터 잡아줘'), '계획부터')
  assert.strictEqual(matchPlanMarker('방향 잡고 가자'), '방향 잡')
  assert.strictEqual(matchPlanMarker('이 작업 진행하기 전에 정리부터 하자'), '진행하기 전에')
})

test('영어 구 매칭 — 문장 중간/문장 부호 포함', () => {
  assert.strictEqual(matchPlanMarker("let's plan the migration"), "let's plan")
  assert.strictEqual(matchPlanMarker('Make a plan before coding'), 'make a plan')
  assert.strictEqual(matchPlanMarker('ok, plan first.'), 'plan first')
})

test('단일 일반어 미수록 — 설명/보고 문장 오탐 없음', () => {
  assert.strictEqual(matchPlanMarker('이 계획이 맞는지 봐줘'), null)
  assert.strictEqual(matchPlanMarker('explain the plan to me'), null)
  assert.strictEqual(matchPlanMarker('explain how this works first'), null)
  assert.strictEqual(matchPlanMarker('이 함수 설명해줘'), null)
})

test('영어 단어 경계 — "floorplan first" 류 합성어 오탐 없음', () => {
  assert.strictEqual(matchPlanMarker('update the floorplan first thing'), null)
})

test(`head ${PLAN_MARKER_SCAN_CHARS} 윈도우 — 안이면 매칭, 밖이면 미매칭`, () => {
  const inside = 'a'.repeat(150) + ' 계획부터 잡아줘'
  const outside = 'a'.repeat(PLAN_MARKER_SCAN_CHARS) + ' 계획부터 잡아줘'
  assert.strictEqual(matchPlanMarker(inside), '계획부터')
  assert.strictEqual(matchPlanMarker(outside), null)
})

test('마커 없으면 null, 빈 문자열 안전', () => {
  assert.strictEqual(matchPlanMarker(PLAIN_TEXT), null)
  assert.strictEqual(matchPlanMarker(''), null)
})

// === DailyCollab.structuredCount (가산 필드) ================================
console.log('\n[DailyCollab.structuredCount]')

test('user 메시지 중 isStructured 매칭 건수만 가산 — 기존 필드 무변경', () => {
  const s = makeSession('claude', [
    kstMsg('user', STRUCTURED_TEXT, '2026-06-01', 10, 0),
    kstMsg('user', STRUCTURED_TEXT, '2026-06-01', 10, 5),
    kstMsg('user', PLAIN_TEXT, '2026-06-01', 10, 10),
    kstMsg('assistant', STRUCTURED_TEXT, '2026-06-01', 10, 15), // assistant 는 비산입
  ])
  const day = buildDailyCollab([s], OPTS).get('2026-06-01')!
  assert.strictEqual(day.structuredCount, 2)
  assert.strictEqual(day.userMessageCount, 3)
})

// === ① weekend-focus ========================================================
console.log('\n[① weekend-focus]')

test('주말 심야형 — 주말/주중 세션 일평균과 lift 수기 계산 일치', () => {
  const signal = sig(fpOf(weekendNightPersona()), 'weekend-focus')
  // 주말: 세션 8 / 주말 달력 8일 = 1.0. 주중: 세션 2 / 주중 달력 22일
  assert.strictEqual(signal.numerator, 1)
  assert.ok(Math.abs(signal.denominator - 2 / 22) < 1e-12)
  assert.ok(Math.abs(signal.lift - 11) < 1e-9, `lift=${signal.lift}`)
  assert.strictEqual(signal.n, 30) // 관측 달력 일수 06-01~06-30
  assert.strictEqual(signal.viable, true)
})

test(`viable 경계 — 관측 ${MIN_FINGERPRINT_SIGNAL_N - 1}일이면 미달, ${MIN_FINGERPRINT_SIGNAL_N}일이면 성립`, () => {
  const under = sig(fpOf(weekendNightPersona('claude', '2026-06-29')), 'weekend-focus')
  assert.strictEqual(under.n, 29)
  assert.strictEqual(under.viable, false)
  const exact = sig(fpOf(weekendNightPersona('claude', '2026-06-30')), 'weekend-focus')
  assert.strictEqual(exact.n, 30)
  assert.strictEqual(exact.viable, true)
})

// === ② structured-shift =====================================================
console.log('\n[② structured-shift]')

test('구조화 상승형 — 최근 40% vs 이전 25%, delta +15%p, 양쪽 n 영수증', () => {
  const signal = sig(fpOf(structuredPlanPersona()), 'structured-shift')
  assert.ok(Math.abs(signal.numerator - 0.4) < 1e-12)
  assert.ok(Math.abs(signal.denominator - 0.25) < 1e-12)
  assert.ok(Math.abs((signal.delta ?? 0) - 0.15) < 1e-12) // 0~1 분수 차 raw — %p 변환은 UI
  assert.ok(Math.abs(signal.lift - 1.6) < 1e-9)           // 정렬용 비율비
  assert.strictEqual(signal.n, 100)
  assert.strictEqual(signal.n2, 40)
  assert.strictEqual(signal.viable, true)
})

test('앵커 = 데이터 내 최대 일 키 — 30일 경계: 앵커−29일은 최근, 앵커−30일은 이전', () => {
  const sessions = [
    // 앵커 2026-06-30 → 최근 구간 시작 = 06-01. 05-31 은 이전.
    makeSession('claude', Array.from({ length: 5 }, (_, i) => kstMsg('user', PLAIN_TEXT, '2026-05-31', 10, i))),
    makeSession('claude', Array.from({ length: 7 }, (_, i) => kstMsg('user', PLAIN_TEXT, '2026-06-01', 10, i))),
    makeSession('claude', Array.from({ length: 11 }, (_, i) => kstMsg('user', PLAIN_TEXT, '2026-06-30', 10, i))),
  ]
  const signal = sig(fpOf(sessions), 'structured-shift')
  assert.strictEqual(signal.n, 18)  // 06-01(7) + 06-30(11)
  assert.strictEqual(signal.n2, 5)  // 05-31(5)
})

test('결정성 — 같은 입력이면 같은 출력 (Date.now 비의존)', () => {
  assert.deepStrictEqual(fpOf(structuredPlanPersona()), fpOf(structuredPlanPersona()))
})

test(`viable 경계 — 최근 n=${MIN_FINGERPRINT_SIGNAL_N - 1} 미달 / n=${MIN_FINGERPRINT_SIGNAL_N} 성립 (이전 n 충족 고정)`, () => {
  const mk = (recentCount: number) => [
    makeSession('claude', Array.from({ length: 30 }, (_, i) => kstMsg('user', PLAIN_TEXT, '2026-03-02', 10, i))),
    makeSession('claude', Array.from({ length: recentCount }, (_, i) => kstMsg('user', PLAIN_TEXT, '2026-06-10', 10, i))),
  ]
  assert.strictEqual(sig(fpOf(mk(29)), 'structured-shift').viable, false)
  assert.strictEqual(sig(fpOf(mk(30)), 'structured-shift').viable, true)
})

// === ③ plan-after-correction ================================================
console.log('\n[③ plan-after-correction]')

test('구조화 상승형 — 정정 30건 전부 직후 계획 → afterRate 1.0, 분모 = 2메시지 창 우연 기대 1−(1−30/140)²', () => {
  const fp = fpOf(structuredPlanPersona())
  const signal = sig(fp, 'plan-after-correction')
  const expectedWindow = 1 - Math.pow(1 - 30 / 140, 2)
  assert.strictEqual(signal.n, 30)
  assert.strictEqual(signal.numerator, 1)
  assert.ok(Math.abs(signal.denominator - expectedWindow) < 1e-12)
  assert.ok(Math.abs(signal.lift - 1 / expectedWindow) < 1e-9)
  assert.strictEqual(signal.viable, true)
  assert.strictEqual(fp.totalUserMessages, 140)
})

test('③ 분모 정합 — 분자 창(자신+직후 2메시지)과 같은 창의 우연 기대 (per-message p 그대로 쓰면 null lift≈2 편향)', () => {
  // user 2건 중 plan 1건 → p=0.5, 창 기대 = 1−(1−0.5)² = 0.75 (p 그대로면 0.5 — lift 가 2배 부풀려짐)
  const s = makeSession('claude', [
    kstMsg('user', RETRY_TEXT, '2026-06-01', 10, 0),
    kstMsg('user', PLAN_TEXT, '2026-06-01', 10, 5),
  ])
  const signal = sig(fpOf([s]), 'plan-after-correction')
  assert.strictEqual(signal.denominator, 0.75)
  assert.ok(Math.abs(signal.lift - 1 / 0.75) < 1e-12)
})

test('③ 이벤트별 창 가중 — 세션 마지막 정정(직후 없음)은 1메시지 창 기대 p, 혼합 시 가중 평균', () => {
  // p 형성용: plan 1 / user 5 (아래 정정 메시지 포함) → p = 1/5
  const sBase = makeSession('claude', [
    kstMsg('user', PLAN_TEXT, '2026-06-01', 9, 0),
    kstMsg('user', PLAIN_TEXT, '2026-06-01', 9, 5),
  ])
  // 2메시지 창 이벤트 (직후 있음)
  const sTwoWindow = makeSession('claude', [
    kstMsg('user', RETRY_TEXT, '2026-06-01', 10, 0),
    kstMsg('user', PLAIN_TEXT, '2026-06-01', 10, 5),
  ])
  // 1메시지 창 이벤트 (정정이 세션 마지막 user — 직후 없음)
  const sTerminal = makeSession('claude', [kstMsg('user', RETRY_TEXT, '2026-06-01', 11, 0)])
  const signal = sig(fpOf([sBase, sTwoWindow, sTerminal]), 'plan-after-correction')
  const p = 1 / 5
  const expected = ((1 - (1 - p) ** 2) + p) / 2 // 2창 1건 + 1창 1건 가중 평균
  assert.strictEqual(signal.n, 2)
  assert.ok(Math.abs(signal.denominator - expected) < 1e-12)
  // 항상 1−(1−p)² 를 쓰면 1창 이벤트의 기대가 부풀어 lift 가 과소 — 그 값과 달라야 한다
  assert.ok(Math.abs(signal.denominator - (1 - (1 - p) ** 2)) > 1e-6)
})

test('정정 메시지 자신에 plan 마커 — 이벤트 1 + 분자 1', () => {
  const s = makeSession('claude', [kstMsg('user', '아니 계획부터 다시 잡자', '2026-06-01', 10)])
  const signal = sig(fpOf([s]), 'plan-after-correction')
  assert.strictEqual(signal.n, 1)
  assert.strictEqual(signal.numerator, 1)
})

test('직후 user 메시지의 plan 마커 — 사이에 assistant 가 있어도 카운트', () => {
  const s = makeSession('claude', [
    kstMsg('user', RETRY_TEXT, '2026-06-01', 10, 0),
    kstMsg('assistant', '응답', '2026-06-01', 10, 5),
    kstMsg('user', PLAN_TEXT, '2026-06-01', 10, 10),
  ])
  const signal = sig(fpOf([s]), 'plan-after-correction')
  assert.strictEqual(signal.n, 1)
  assert.strictEqual(signal.numerator, 1)
})

test('무관 메시지 — 직후 user 에 plan 마커 없으면 분자 0', () => {
  const s = makeSession('claude', [
    kstMsg('user', RETRY_TEXT, '2026-06-01', 10, 0),
    kstMsg('user', PLAIN_TEXT, '2026-06-01', 10, 5),
  ])
  const signal = sig(fpOf([s]), 'plan-after-correction')
  assert.strictEqual(signal.n, 1)
  assert.strictEqual(signal.numerator, 0)
})

test('세션 경계 리셋 — 다음 세션 첫 user 의 plan 은 "직후"가 아니다', () => {
  const s1 = makeSession('claude', [kstMsg('user', RETRY_TEXT, '2026-06-01', 10)])
  const s2 = makeSession('claude', [kstMsg('user', PLAN_TEXT, '2026-06-01', 11)])
  const signal = sig(fpOf([s1, s2]), 'plan-after-correction')
  assert.strictEqual(signal.n, 1)
  assert.strictEqual(signal.numerator, 0)
})

test('이벤트당 최대 1 카운트 — 자신 + 직후 둘 다 plan 이어도 1', () => {
  const s = makeSession('claude', [
    kstMsg('user', '아니 계획부터 다시 잡자', '2026-06-01', 10, 0), // retry + plan
    kstMsg('user', '계획 세워 줘', '2026-06-01', 10, 5),            // plan (retry 아님)
  ])
  const signal = sig(fpOf([s]), 'plan-after-correction')
  assert.strictEqual(signal.n, 1)
  assert.strictEqual(signal.numerator, 1) // 2가 아니라 1
})

test(`viable 경계 — 정정 ${MIN_FINGERPRINT_SIGNAL_N - 1}건 미달 / ${MIN_FINGERPRINT_SIGNAL_N}건 성립`, () => {
  const mk = (retryCount: number) => {
    const msgs: ParsedMessage[] = []
    for (let i = 0; i < retryCount; i++) msgs.push(kstMsg('user', RETRY_TEXT, '2026-06-01', 10, i))
    msgs.push(kstMsg('user', PLAN_TEXT, '2026-06-01', 11, 0)) // 기준선 > 0 확보
    return [makeSession('claude', msgs)]
  }
  assert.strictEqual(sig(fpOf(mk(29)), 'plan-after-correction').viable, false)
  assert.strictEqual(sig(fpOf(mk(30)), 'plan-after-correction').viable, true)
})

test('기준선 0 가드 — plan 마커 0건이면 n 충족해도 viable 미달', () => {
  const msgs: ParsedMessage[] = []
  for (let i = 0; i < 30; i++) msgs.push(kstMsg('user', RETRY_TEXT, '2026-06-01', 10, i))
  const signal = sig(fpOf([makeSession('claude', msgs)]), 'plan-after-correction')
  assert.strictEqual(signal.n, 30)
  assert.strictEqual(signal.viable, false)
  assert.strictEqual(signal.lift, 0) // 분자도 0 — CAP 아님
})

// === ④ late-night-share =====================================================
console.log('\n[④ late-night-share]')

test('일치 가드 — buildCodingRhythm 의 night share/lift 와 정확히 동일 (독립 재계산 금지)', () => {
  const sessions = weekendNightPersona()
  const rhythm = buildCodingRhythm(collectUserTimestamps(sessions), OPTS)
  const signal = sig(
    buildCollabFingerprint(sessions, buildDailyCollab(sessions, OPTS), rhythm),
    'late-night-share'
  )
  assert.strictEqual(signal.numerator, rhythm.hourBandShares.night)
  assert.strictEqual(signal.lift, rhythm.hourBandShares.night / (NIGHT_BAND_HOURS.size / 24))
  assert.strictEqual(signal.n, rhythm.totalMessages)
  // 픽스처 수기 검산: 전 메시지 22시 → share 1.0, lift 24/5
  assert.strictEqual(signal.numerator, 1)
  assert.ok(Math.abs(signal.lift - 24 / 5) < 1e-12)
})

test(`viable 경계 — 메시지 ${MIN_FINGERPRINT_SIGNAL_N - 1}건 미달 / ${MIN_FINGERPRINT_SIGNAL_N}건 성립`, () => {
  const mk = (count: number) => [
    makeSession('claude', Array.from({ length: count }, (_, i) => kstMsg('user', PLAIN_TEXT, '2026-06-01', 22, i))),
  ]
  assert.strictEqual(sig(fpOf(mk(29)), 'late-night-share').viable, false)
  assert.strictEqual(sig(fpOf(mk(30)), 'late-night-share').viable, true)
})

// === ⑤ long-session-preference ==============================================
console.log('\n[⑤ long-session-preference]')

test('지수 꼬리 수기 검산 — 중앙값 7 → 기대 2^(−21/7) = 0.125, 실측 14/30', () => {
  const signal = sig(fpOf(longSessionPersona(16, 14)), 'long-session-preference')
  assert.strictEqual(signal.denominator, Math.pow(2, -LONG_SESSION_MIN_TURNS / 7)) // = 0.125
  assert.ok(Math.abs(signal.numerator - 14 / 30) < 1e-12)
  assert.ok(Math.abs(signal.lift - (14 / 30) / 0.125) < 1e-9)
  assert.strictEqual(signal.n, 30)
  assert.strictEqual(signal.viable, true)
})

test(`viable 경계 — 세션 ${MIN_FINGERPRINT_SIGNAL_N - 1}개 미달 / ${MIN_FINGERPRINT_SIGNAL_N}개 성립`, () => {
  assert.strictEqual(sig(fpOf(longSessionPersona(15, 14)), 'long-session-preference').viable, false)
  assert.strictEqual(sig(fpOf(longSessionPersona(16, 14)), 'long-session-preference').viable, true)
})

// === selectTopSignals — 정렬·동률·임계 ======================================
console.log('\n[selectTopSignals]')

test('rankScore 내림차순 + 상위 3개 컷', () => {
  const top = selectTopSignals([
    mkSignal('weekend-focus', 2.0),
    mkSignal('structured-shift', 5.0),
    mkSignal('plan-after-correction', 3.0),
    mkSignal('late-night-share', 1.5),
    mkSignal('long-session-preference', 1.4),
  ])
  assert.deepStrictEqual(top.map((s) => s.id), ['structured-shift', 'plan-after-correction', 'weekend-focus'])
})

test('동률 — 고정 신호 순서(①→⑤)로 결정적', () => {
  const top = selectTopSignals([
    mkSignal('late-night-share', 2.0),
    mkSignal('weekend-focus', 2.0),
  ])
  assert.deepStrictEqual(top.map((s) => s.id), ['weekend-focus', 'late-night-share'])
})

test(`MIN_FINGERPRINT_LIFT(${MIN_FINGERPRINT_LIFT}) 미달 제외 + viable 미달 제외`, () => {
  const top = selectTopSignals([
    mkSignal('weekend-focus', MIN_FINGERPRINT_LIFT - 0.1),     // lift 미달
    mkSignal('structured-shift', 5.0, false),                  // viable 미달
    mkSignal('late-night-share', MIN_FINGERPRINT_LIFT),        // 경계 — 포함
  ])
  assert.deepStrictEqual(top.map((s) => s.id), ['late-night-share'])
})

test(`② delta 최소폭 가드 — 비율비 lift 충족이어도 |delta| < ${MIN_STRUCTURED_SHIFT_DELTA} 면 top 제외 (저베이스 차단)`, () => {
  const weak = { ...mkSignal('structured-shift', 2.0), delta: MIN_STRUCTURED_SHIFT_DELTA - 0.01 }
  const strong = { ...mkSignal('structured-shift', 2.0), delta: MIN_STRUCTURED_SHIFT_DELTA }
  assert.deepStrictEqual(selectTopSignals([weak]).map((s) => s.id), [])
  assert.deepStrictEqual(selectTopSignals([strong]).map((s) => s.id), ['structured-shift'])
  // delta null 신호(②외)는 가드 비대상
  assert.deepStrictEqual(selectTopSignals([mkSignal('weekend-focus', 2.0)]).map((s) => s.id), ['weekend-focus'])
})

// === buildCollabFingerprint — 구조·빈상태 ===================================
console.log('\n[buildCollabFingerprint 구조/빈상태]')

test('signals 는 고정 순서 ①→⑤ 5종 전부 — viable 미달 포함 (영수증 정직 표기)', () => {
  const fp = fpOf(weekendNightPersona())
  assert.deepStrictEqual(fp.signals.map((s) => s.id), FINGERPRINT_SIGNAL_ORDER)
  assert.strictEqual(fp.signals.length, 5)
})

test(`빈상태 — viable < ${MIN_FINGERPRINT_TOP_SIGNALS} 이면 topSignals 도 ${MIN_FINGERPRINT_TOP_SIGNALS} 미만 (지문 수집 중)`, () => {
  const fp = fpOf([makeSession('claude', [
    kstMsg('user', PLAIN_TEXT, '2026-06-01', 10, 0),
    kstMsg('user', PLAIN_TEXT, '2026-06-01', 10, 5),
    kstMsg('user', PLAIN_TEXT, '2026-06-01', 10, 10),
  ])])
  assert.ok(fp.viableCount < MIN_FINGERPRINT_TOP_SIGNALS, `viableCount=${fp.viableCount}`)
  assert.ok(fp.topSignals.length < MIN_FINGERPRINT_TOP_SIGNALS)
})

test('빈 입력 — 크래시 없이 전 신호 비성립, NaN 없음', () => {
  const fp = buildCollabFingerprint([], new Map(), buildCodingRhythm([], OPTS))
  assert.strictEqual(fp.viableCount, 0)
  assert.strictEqual(fp.topSignals.length, 0)
  assert.strictEqual(fp.totalUserMessages, 0)
  for (const signal of fp.signals) {
    assert.ok(Number.isFinite(signal.lift), `${signal.id} lift NaN/Inf`)
    assert.ok(Number.isFinite(signal.numerator) && Number.isFinite(signal.denominator))
  }
})

// === divergence + Codex-only (goal AC) ======================================
console.log('\n[divergence / Codex-only]')

test('페르소나 2벌(주말 심야형 vs 구조화 상승형) — topSignals 상이 (동질화 회귀)', () => {
  const a = fpOf(weekendNightPersona())
  const b = fpOf(structuredPlanPersona())
  const aIds = a.topSignals.map((s) => s.id)
  const bIds = b.topSignals.map((s) => s.id)
  assert.ok(aIds.length >= MIN_FINGERPRINT_TOP_SIGNALS, `주말 심야형 top=${aIds.join(',')}`)
  assert.ok(bIds.length >= MIN_FINGERPRINT_TOP_SIGNALS, `구조화 상승형 top=${bIds.join(',')}`)
  assert.deepStrictEqual(aIds, ['weekend-focus', 'late-night-share'])
  assert.deepStrictEqual(bIds, ['plan-after-correction', 'structured-shift'])
  assert.notDeepStrictEqual(aIds, bIds)
})

test('Codex-only 픽스처 — 신호 5종은 스킬 비의존, Claude 페르소나와 동일 수치 (비붕괴)', () => {
  const claude = fpOf(weekendNightPersona('claude'))
  const codex = fpOf(weekendNightPersona('codex'))
  assert.deepStrictEqual(codex.signals, claude.signals)
  assert.deepStrictEqual(codex.topSignals.map((s) => s.id), claude.topSignals.map((s) => s.id))
  assert.ok(codex.viableCount >= MIN_FINGERPRINT_TOP_SIGNALS)
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
