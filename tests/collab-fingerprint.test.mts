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
 * docs/goal/collab-fingerprint-cards.md W3) + 신호 ⑥~⑨·양방향 선별·기존 5신호 골든 회귀
 * (docs/goal/precision-quiz-fingerprint-signals.md W2)
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
  MIN_SHARE_SHIFT_DELTA,
  MIN_STRUCTURED_SHIFT_DELTA,
  MULTI_PROJECT_EXPECTATION_FLOOR,
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

function makeSession(
  source: SessionSource,
  messages: ParsedMessage[],
  overrides?: { cwd?: string; model?: string; filePath?: string }
): Session {
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
    ...overrides,
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

/**
 * 페르소나 4 — AI 작성 비중 변화형. 이전(03-02) / 최근(06-10, 앵커) 각 1일:
 * user 30건×5단어 + assistant 30건×(일별 인자)단어 — aiShare = ai/(user+ai) 수기 검산 가능.
 */
function aiSharePersona(priorAiWordsPerMsg: number, recentAiWordsPerMsg: number): Session[] {
  const mkDay = (day: string, aiWordsPerMsg: number): Session => {
    const msgs: ParsedMessage[] = []
    for (let i = 0; i < 30; i++) {
      msgs.push(kstMsg('user', wordText(5), day, 10, i))
      msgs.push(kstMsg('assistant', wordText(aiWordsPerMsg), day, 11, i))
    }
    return makeSession('claude', msgs)
  }
  return [mkDay('2026-03-02', priorAiWordsPerMsg), mkDay('2026-06-10', recentAiWordsPerMsg)]
}

/** 페르소나 5 — 지시 길이 변화형. 이전/최근 각 1일 × user 30건×(일별 단어 수), assistant 없음 */
function delegationPersona(priorWordsPerMsg: number, recentWordsPerMsg: number): Session[] {
  const mkDay = (day: string, wordsPerMsg: number): Session =>
    makeSession('claude', Array.from({ length: 30 }, (_, i) => kstMsg('user', wordText(wordsPerMsg), day, 10, i)))
  return [mkDay('2026-03-02', priorWordsPerMsg), mkDay('2026-06-10', recentWordsPerMsg)]
}

/** 페르소나 6 — 프로젝트 병행형. 06-01부터 dayCount 일 연속, 매일 세션 2개 (cwd 2벌로 프로젝트 구성) */
function multiProjectPersona(dayCount: number, cwds: [string, string]): Session[] {
  const sessions: Session[] = []
  for (let d = 0; d < dayCount; d++) {
    const day = dayPlus('2026-06-01', d)
    sessions.push(makeSession('claude', [kstMsg('user', PLAIN_TEXT, day, 10)], { cwd: cwds[0] }))
    sessions.push(makeSession('claude', [kstMsg('user', PLAIN_TEXT, day, 11)], { cwd: cwds[1] }))
  }
  return sessions
}

/**
 * 페르소나 7 — 모델 믹스 변화형. 이전 30일(03-02~03-31)·최근 30일(06-01~06-30, 앵커 06-30) 각 1세션/일.
 * multi 일은 assistant 메시지 레벨 'opus' + 세션 폴백 'sonnet' 2종, 나머지는 세션 폴백 'sonnet' 단일.
 * skipRecentDay 로 최근 활동일을 29일로 줄여 viable 경계 테스트 (앵커 06-30 은 유지 — 29 금지).
 *
 * 모델은 assistant 라인만 갖는다 — 원본 JSONL 의 user 라인에는 message.model 이 없다(실측 0건).
 * 모든 날의 메시지 수·텍스트를 동일하게 고정하고 **모델만** 다르게 해서, ⑥ aiShareShift 등
 * 다른 신호의 delta 가 0 으로 유지되도록 한다 (⑨ 가 topSignals 밖으로 밀리는 것을 방지).
 */
function modelMixPersona(priorMultiDays: number, recentMultiDays: number, opts?: { skipRecentDay?: number }): Session[] {
  const mkDay = (day: string, multi: boolean): Session => {
    const msgs: ParsedMessage[] = [
      kstMsg('user', PLAIN_TEXT, day, 10),
      multi
        ? { ...kstMsg('assistant', PLAIN_TEXT, day, 10, 20), model: 'opus' } // 메시지 레벨
        : kstMsg('assistant', PLAIN_TEXT, day, 10, 20),                      // 세션 폴백
      kstMsg('assistant', PLAIN_TEXT, day, 10, 30),                          // 세션 폴백 (항상)
    ]
    return makeSession('claude', msgs, { model: 'sonnet' })
  }
  const sessions: Session[] = []
  for (let d = 0; d < 30; d++) sessions.push(mkDay(dayPlus('2026-03-02', d), d < priorMultiDays))
  for (let d = 0; d < 30; d++) {
    if (opts?.skipRecentDay === d) continue
    sessions.push(mkDay(dayPlus('2026-06-01', d), d < recentMultiDays))
  }
  return sessions
}

function mkSignal(id: FingerprintSignalId, lift: number, viable = true): FingerprintSignal {
  return { id, lift, delta: null, numerator: 0, denominator: 0, n: 30, n2: null, viable, bidirectional: false, rankScore: lift }
}

/** n개 단어 텍스트 — countWords(stripMarkup) 축으로 정확히 n (⑥⑦ 단어 수 픽스처) */
function wordText(n: number): string {
  return Array.from({ length: n }, () => '단어').join(' ')
}

/** 'YYYY-MM-DD' + offset 일 (달력 연산 — ⑨의 연속 활동일 픽스처) */
function dayPlus(day: string, offset: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
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

// === ⑥ ai-share-shift =======================================================
console.log('\n[⑥ ai-share-shift]')

test('증가 방향 — 비중 0.5→0.8, delta +30%p, n=단어 수 영수증, top 진입', () => {
  const fp = fpOf(aiSharePersona(5, 20))
  const signal = sig(fp, 'ai-share-shift')
  assert.ok(Math.abs(signal.numerator - 0.8) < 1e-12)   // 600/750
  assert.ok(Math.abs(signal.denominator - 0.5) < 1e-12) // 150/300
  assert.ok(Math.abs((signal.delta ?? 0) - 0.3) < 1e-12)
  assert.ok(Math.abs(signal.lift - 1.6) < 1e-9)
  assert.ok(Math.abs(signal.rankScore - 1.6) < 1e-9)    // 정방향이 우세 — max(1.6, 0.625)
  assert.strictEqual(signal.n, 750)                      // 최근 창 user+ai 단어
  assert.strictEqual(signal.n2, 300)                     // 이전 창 단어
  assert.strictEqual(signal.viable, true)
  assert.strictEqual(signal.bidirectional, true)
  assert.ok(fp.topSignals.some((s) => s.id === 'ai-share-shift'))
})

test('감소 방향 — lift < 1 이어도 rankScore 는 역방향 배수로 top 진입 (양방향)', () => {
  const fp = fpOf(aiSharePersona(20, 5))
  const signal = sig(fp, 'ai-share-shift')
  assert.ok(Math.abs((signal.delta ?? 0) - -0.3) < 1e-12)
  assert.ok(Math.abs(signal.lift - 0.625) < 1e-9)        // 0.5/0.8 — 감소 방향
  assert.ok(Math.abs(signal.rankScore - 1.6) < 1e-9)     // max(0.625, 1.6)
  assert.ok(fp.topSignals.some((s) => s.id === 'ai-share-shift'))
})

test(`viable 경계 — 최근 창 user 메시지 ${MIN_FINGERPRINT_SIGNAL_N - 1}건 미달 / ${MIN_FINGERPRINT_SIGNAL_N}건 성립 (게이트 단위는 단어가 아니라 메시지)`, () => {
  const mk = (recentCount: number) => [
    makeSession('claude', Array.from({ length: 30 }, (_, i) => kstMsg('user', wordText(5), '2026-03-02', 10, i))),
    makeSession('claude', Array.from({ length: recentCount }, (_, i) => kstMsg('user', wordText(5), '2026-06-10', 10, i))),
  ]
  assert.strictEqual(sig(fpOf(mk(29)), 'ai-share-shift').viable, false)
  assert.strictEqual(sig(fpOf(mk(30)), 'ai-share-shift').viable, true)
})

test('분모 0 캡 — 양쪽 창 단어 0 이어도 NaN 없이 lift/rankScore 0', () => {
  // 텍스트가 전부 기호면 단어 0 — countWords 는 [a-z가-힣]+ 만 센다
  const mk = (day: string) =>
    makeSession('claude', Array.from({ length: 30 }, (_, i) => kstMsg('user', '!!! ???', day, 10, i)))
  const signal = sig(fpOf([mk('2026-03-02'), mk('2026-06-10')]), 'ai-share-shift')
  assert.strictEqual(signal.lift, 0)
  assert.strictEqual(signal.rankScore, 0)
  assert.ok(Number.isFinite(signal.numerator) && Number.isFinite(signal.denominator))
})

// === ⑦ delegation-size-shift ================================================
console.log('\n[⑦ delegation-size-shift]')

test('길어진 방향 — 평균 4→8단어, lift 2, n=창별 user 메시지 수, top 진입', () => {
  const fp = fpOf(delegationPersona(4, 8))
  const signal = sig(fp, 'delegation-size-shift')
  assert.ok(Math.abs(signal.numerator - 8) < 1e-12)
  assert.ok(Math.abs(signal.denominator - 4) < 1e-12)
  assert.strictEqual(signal.delta, null)                 // 배수 축 신호 — %p 없음
  assert.ok(Math.abs(signal.lift - 2) < 1e-9)
  assert.ok(Math.abs(signal.rankScore - 2) < 1e-9)
  assert.strictEqual(signal.n, 30)
  assert.strictEqual(signal.n2, 30)
  assert.strictEqual(signal.viable, true)
  assert.strictEqual(signal.bidirectional, true)
  assert.ok(fp.topSignals.some((s) => s.id === 'delegation-size-shift'))
})

test('짧아진 방향 — 평균 8→2단어, lift 0.25 이지만 rankScore 4 로 top 진입 (양방향)', () => {
  const fp = fpOf(delegationPersona(8, 2))
  const signal = sig(fp, 'delegation-size-shift')
  assert.ok(Math.abs(signal.lift - 0.25) < 1e-9)
  assert.ok(Math.abs(signal.rankScore - 4) < 1e-9)       // max(0.25, 8/2)
  assert.ok(fp.topSignals.some((s) => s.id === 'delegation-size-shift'))
})

test(`viable 경계 — 최근 창 user 메시지 ${MIN_FINGERPRINT_SIGNAL_N - 1}건 미달 / ${MIN_FINGERPRINT_SIGNAL_N}건 성립`, () => {
  const mk = (recentCount: number) => [
    makeSession('claude', Array.from({ length: 30 }, (_, i) => kstMsg('user', wordText(4), '2026-03-02', 10, i))),
    makeSession('claude', Array.from({ length: recentCount }, (_, i) => kstMsg('user', wordText(8), '2026-06-10', 10, i))),
  ]
  assert.strictEqual(sig(fpOf(mk(29)), 'delegation-size-shift').viable, false)
  assert.strictEqual(sig(fpOf(mk(30)), 'delegation-size-shift').viable, true)
})

// === ⑧ multi-project-days ===================================================
console.log('\n[⑧ multi-project-days]')

test('수기 검산 — 매일 2프로젝트 30일: 실측 1.0, 독립 기대 0.5 (p=½ 2벌, k=2), lift 2, top 진입', () => {
  const fp = fpOf(multiProjectPersona(30, ['/home/u/alpha', '/home/u/beta']))
  const signal = sig(fp, 'multi-project-days')
  assert.strictEqual(signal.numerator, 1)
  assert.ok(Math.abs(signal.denominator - 0.5) < 1e-12)  // 1 − (0.5² + 0.5²)
  assert.ok(Math.abs(signal.lift - 2) < 1e-9)
  assert.strictEqual(signal.n, 30)
  assert.strictEqual(signal.n2, null)
  assert.strictEqual(signal.viable, true)
  assert.strictEqual(signal.bidirectional, false)        // 증가 방향만 (v1 rank 정책)
  assert.ok(fp.topSignals.some((s) => s.id === 'multi-project-days'))
})

test('기대치 = 대상일별 세션 수 가중 — k=2/k=3 혼합 + 세션 1개 날은 비대상', () => {
  const day1 = '2026-06-01'
  const day2 = '2026-06-02'
  const day3 = '2026-06-03'
  const cwdA = '/home/u/alpha'
  const cwdB = '/home/u/beta'
  const sessions = [
    makeSession('claude', [kstMsg('user', PLAIN_TEXT, day1, 10)], { cwd: cwdA }),
    makeSession('claude', [kstMsg('user', PLAIN_TEXT, day1, 11)], { cwd: cwdB }),
    makeSession('claude', [kstMsg('user', PLAIN_TEXT, day2, 10)], { cwd: cwdA }),
    makeSession('claude', [kstMsg('user', PLAIN_TEXT, day2, 11)], { cwd: cwdA }),
    makeSession('claude', [kstMsg('user', PLAIN_TEXT, day2, 12)], { cwd: cwdB }),
    makeSession('claude', [kstMsg('user', PLAIN_TEXT, day3, 10)], { cwd: cwdA }), // 세션 1개 — 비대상
  ]
  const signal = sig(fpOf(sessions), 'multi-project-days')
  // 분포: alpha 4/6, beta 2/6. E = mean(1 − ((4/6)² + (2/6)²), 1 − ((4/6)³ + (2/6)³)) = mean(4/9, 2/3) = 5/9
  assert.strictEqual(signal.n, 2)
  assert.strictEqual(signal.numerator, 1)
  assert.ok(Math.abs(signal.denominator - 5 / 9) < 1e-12)
  assert.ok(Math.abs(signal.lift - 9 / 5) < 1e-9)
})

test('기대치 floor — 전 세션 단일 프로젝트면 기대 0 → floor 로 하한, 실측 0 이라 lift 0', () => {
  const signal = sig(fpOf(multiProjectPersona(30, ['/home/u/alpha', '/home/u/alpha'])), 'multi-project-days')
  assert.strictEqual(signal.numerator, 0)                // 프로젝트 1종 — 병행일 0
  assert.strictEqual(signal.denominator, MULTI_PROJECT_EXPECTATION_FLOOR)
  assert.strictEqual(signal.lift, 0)
  assert.strictEqual(signal.viable, true)                // n 충족 + 기대치 근거 있음 (floor)
})

test('분모 0 캡 — 프로젝트 기록 0건이면 n 충족해도 viable 미달, NaN 없음', () => {
  const sessions: Session[] = []
  for (let d = 0; d < 30; d++) {
    const day = dayPlus('2026-06-01', d)
    sessions.push(makeSession('claude', [kstMsg('user', PLAIN_TEXT, day, 10)]))  // cwd·filePath 없음
    sessions.push(makeSession('claude', [kstMsg('user', PLAIN_TEXT, day, 11)]))
  }
  const signal = sig(fpOf(sessions), 'multi-project-days')
  assert.strictEqual(signal.n, 30)
  assert.strictEqual(signal.denominator, 0)
  assert.strictEqual(signal.viable, false)
  assert.strictEqual(signal.lift, 0)                     // 분자도 0 — CAP 아님
  assert.ok(Number.isFinite(signal.lift) && Number.isFinite(signal.rankScore))
})

test(`viable 경계 — 세션 2+ 일 ${MIN_FINGERPRINT_SIGNAL_N - 1}일 미달 / ${MIN_FINGERPRINT_SIGNAL_N}일 성립`, () => {
  const cwds: [string, string] = ['/home/u/alpha', '/home/u/beta']
  const under = sig(fpOf(multiProjectPersona(29, cwds)), 'multi-project-days')
  assert.strictEqual(under.n, 29)
  assert.strictEqual(under.viable, false)
  const exact = sig(fpOf(multiProjectPersona(30, cwds)), 'multi-project-days')
  assert.strictEqual(exact.n, 30)
  assert.strictEqual(exact.viable, true)
})

// === ⑨ model-mix-shift ======================================================
console.log('\n[⑨ model-mix-shift]')

test('증가 방향 — 모델 2+일 비율 0.2→0.5, delta +30%p, n=창별 활동일, top 진입', () => {
  const fp = fpOf(modelMixPersona(6, 15))
  const signal = sig(fp, 'model-mix-shift')
  assert.ok(Math.abs(signal.numerator - 0.5) < 1e-12)    // 최근 15/30
  assert.ok(Math.abs(signal.denominator - 0.2) < 1e-12)  // 이전 6/30
  assert.ok(Math.abs((signal.delta ?? 0) - 0.3) < 1e-12)
  assert.ok(Math.abs(signal.lift - 2.5) < 1e-9)
  assert.ok(Math.abs(signal.rankScore - 2.5) < 1e-9)
  assert.strictEqual(signal.n, 30)
  assert.strictEqual(signal.n2, 30)
  assert.strictEqual(signal.viable, true)
  assert.strictEqual(signal.bidirectional, true)
  assert.ok(fp.topSignals.some((s) => s.id === 'model-mix-shift'))
})

test('감소 방향 — 0.5→0.2, lift 0.4 이지만 rankScore 2.5 로 top 진입 (양방향)', () => {
  const fp = fpOf(modelMixPersona(15, 6))
  const signal = sig(fp, 'model-mix-shift')
  assert.ok(Math.abs((signal.delta ?? 0) - -0.3) < 1e-12)
  assert.ok(Math.abs(signal.lift - 0.4) < 1e-9)
  assert.ok(Math.abs(signal.rankScore - 2.5) < 1e-9)
  assert.ok(fp.topSignals.some((s) => s.id === 'model-mix-shift'))
})

test('모델 폴백 — assistant 메시지 레벨 model 과 세션 폴백이 한 날에 섞이면 2종으로 집계 (multi 일 성립 경로)', () => {
  // modelMixPersona 의 multi 일 구성 그대로 1일만 — ⑨ 분자 재료의 폴백 경로 검증
  const day = '2026-06-01'
  const s = makeSession('claude', [
    kstMsg('user', PLAIN_TEXT, day, 10),
    { ...kstMsg('assistant', PLAIN_TEXT, day, 10, 20), model: 'opus' },
    kstMsg('assistant', PLAIN_TEXT, day, 10, 30),
  ], { model: 'sonnet' })
  const signal = sig(fpOf([s]), 'model-mix-shift')
  assert.strictEqual(signal.numerator, 1)                // 활동 1일 중 1일이 모델 2+
  assert.strictEqual(signal.viable, false)               // 활동일 1 < 30 — 정직하게 미달
})

test(`viable 경계 — 최근 활동일 ${MIN_FINGERPRINT_SIGNAL_N - 1}일 미달 / ${MIN_FINGERPRINT_SIGNAL_N}일 성립 (이전 30일 고정)`, () => {
  const under = sig(fpOf(modelMixPersona(6, 15, { skipRecentDay: 3 })), 'model-mix-shift')
  assert.strictEqual(under.n, 29)
  assert.strictEqual(under.viable, false)
  const exact = sig(fpOf(modelMixPersona(6, 15)), 'model-mix-shift')
  assert.strictEqual(exact.n, 30)
  assert.strictEqual(exact.viable, true)
})

test('결정성 — 같은 입력이면 같은 출력 (신규 신호 포함 전체 deepStrictEqual)', () => {
  assert.deepStrictEqual(fpOf(modelMixPersona(6, 15)), fpOf(modelMixPersona(6, 15)))
  assert.deepStrictEqual(
    fpOf(multiProjectPersona(30, ['/home/u/alpha', '/home/u/beta'])),
    fpOf(multiProjectPersona(30, ['/home/u/alpha', '/home/u/beta']))
  )
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

test('② 증가 방향만 유지 — 단방향 delta 신호의 음수 delta 는 게이트 교체 후에도 top 제외 (회귀 0)', () => {
  const decreasing = { ...mkSignal('structured-shift', 2.0), delta: -0.2, rankScore: 2.0 }
  assert.deepStrictEqual(selectTopSignals([decreasing]).map((s) => s.id), [])
})

test(`rankScore 게이트 — 양방향은 lift < ${MIN_FINGERPRINT_LIFT} 이어도 역방향 배수(rankScore)로 통과, 단방향은 불통과`, () => {
  const bidiDecrease = { ...mkSignal('delegation-size-shift', 0.7), bidirectional: true, rankScore: 1 / 0.7 }
  const uniDecrease = { ...mkSignal('weekend-focus', 0.7), rankScore: 0.7 }
  assert.deepStrictEqual(selectTopSignals([bidiDecrease]).map((s) => s.id), ['delegation-size-shift'])
  assert.deepStrictEqual(selectTopSignals([uniDecrease]).map((s) => s.id), [])
})

test(`양방향 delta 가드 — |delta| ≥ ${MIN_SHARE_SHIFT_DELTA} 면 양쪽 방향 통과, 미만이면 양쪽 다 탈락 (⑨ 이중 가드)`, () => {
  const mkMix = (delta: number) =>
    ({ ...mkSignal('model-mix-shift', 2.0), bidirectional: true, delta, rankScore: 2.0 })
  assert.deepStrictEqual(selectTopSignals([mkMix(MIN_SHARE_SHIFT_DELTA)]).map((s) => s.id), ['model-mix-shift'])
  assert.deepStrictEqual(selectTopSignals([mkMix(-MIN_SHARE_SHIFT_DELTA)]).map((s) => s.id), ['model-mix-shift'])
  assert.deepStrictEqual(selectTopSignals([mkMix(MIN_SHARE_SHIFT_DELTA - 0.01)]).map((s) => s.id), [])
  assert.deepStrictEqual(selectTopSignals([mkMix(-(MIN_SHARE_SHIFT_DELTA - 0.01))]).map((s) => s.id), [])
})

// === buildCollabFingerprint — 구조·빈상태 ===================================
console.log('\n[buildCollabFingerprint 구조/빈상태]')

test('signals 는 고정 순서 ①→⑨ 9종 전부 — viable 미달 포함 (영수증 정직 표기), ①~⑤ 접두 불변', () => {
  const fp = fpOf(weekendNightPersona())
  assert.deepStrictEqual(fp.signals.map((s) => s.id), FINGERPRINT_SIGNAL_ORDER)
  assert.strictEqual(fp.signals.length, 9)
  assert.deepStrictEqual(FINGERPRINT_SIGNAL_ORDER.slice(0, 5), [
    'weekend-focus', 'structured-shift', 'plan-after-correction', 'late-night-share', 'long-session-preference',
  ])
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

test('Codex-only 픽스처 — 신호는 스킬 비의존, Claude 페르소나와 동일 수치 (비붕괴)', () => {
  const claude = fpOf(weekendNightPersona('claude'))
  const codex = fpOf(weekendNightPersona('codex'))
  assert.deepStrictEqual(codex.signals, claude.signals)
  assert.deepStrictEqual(codex.topSignals.map((s) => s.id), claude.topSignals.map((s) => s.id))
  assert.ok(codex.viableCount >= MIN_FINGERPRINT_TOP_SIGNALS)
})

// === 기존 5신호 골든 회귀 (W2 확장 전 수치 캡처 — 2026-07-03) ================
// 신호 ⑥~⑨ 추가·selectTopSignals 게이트 교체(lift → rankScore) 전의 실행 결과를 그대로 고정.
// 기존 5신호는 동일 입력 → 동일 수치·동일 topSignals 이어야 한다 (goal Must-Preserve).
console.log('\n[기존 5신호 골든 회귀]')

type LegacySignalGolden = {
  id: FingerprintSignalId
  lift: number
  delta: number | null
  numerator: number
  denominator: number
  n: number
  n2: number | null
  viable: boolean
  rankScore: number
}

function legacyProjection(fp: CollabFingerprint) {
  return {
    signals: fp.signals.slice(0, 5).map(
      ({ id, lift, delta, numerator, denominator, n, n2, viable, rankScore }): LegacySignalGolden =>
        ({ id, lift, delta, numerator, denominator, n, n2, viable, rankScore })
    ),
    topSignals: fp.topSignals.map((s) => s.id),
    totalUserMessages: fp.totalUserMessages,
  }
}

test('주말 심야형 — ①~⑤ 수치·topSignals 골든 일치', () => {
  assert.deepStrictEqual(legacyProjection(fpOf(weekendNightPersona())), {
    signals: [
      { id: 'weekend-focus', lift: 11, delta: null, numerator: 1, denominator: 0.09090909090909091, n: 30, n2: null, viable: true, rankScore: 11 },
      { id: 'structured-shift', lift: 0, delta: 0, numerator: 0, denominator: 0, n: 66, n2: 0, viable: false, rankScore: 0 },
      { id: 'plan-after-correction', lift: 0, delta: null, numerator: 0, denominator: 0, n: 0, n2: null, viable: false, rankScore: 0 },
      { id: 'late-night-share', lift: 4.8, delta: null, numerator: 1, denominator: 0.20833333333333334, n: 66, n2: null, viable: true, rankScore: 4.8 },
      { id: 'long-session-preference', lift: 0, delta: null, numerator: 0, denominator: 0.1621049443313762, n: 10, n2: null, viable: false, rankScore: 0 },
    ],
    topSignals: ['weekend-focus', 'late-night-share'],
    totalUserMessages: 66,
  })
})

test('구조화 상승형 — ①~⑤ 수치·topSignals 골든 일치', () => {
  assert.deepStrictEqual(legacyProjection(fpOf(structuredPlanPersona())), {
    signals: [
      { id: 'weekend-focus', lift: 0, delta: null, numerator: 0, denominator: 0.26666666666666666, n: 103, n2: null, viable: true, rankScore: 0 },
      { id: 'structured-shift', lift: 1.6, delta: 0.15000000000000002, numerator: 0.4, denominator: 0.25, n: 100, n2: 40, viable: true, rankScore: 1.6 },
      { id: 'plan-after-correction', lift: 2.6133333333333333, delta: null, numerator: 1, denominator: 0.38265306122448983, n: 30, n2: null, viable: true, rankScore: 2.6133333333333333 },
      { id: 'late-night-share', lift: 0, delta: null, numerator: 0, denominator: 0.20833333333333334, n: 140, n2: null, viable: true, rankScore: 0 },
      { id: 'long-session-preference', lift: 0, delta: null, numerator: 0, denominator: 0.125, n: 20, n2: null, viable: false, rankScore: 0 },
    ],
    topSignals: ['plan-after-correction', 'structured-shift'],
    totalUserMessages: 140,
  })
})

test('긴 세션 선호형 — ①~⑤ 수치·topSignals 골든 일치', () => {
  assert.deepStrictEqual(legacyProjection(fpOf(longSessionPersona(16, 14))), {
    signals: [
      { id: 'weekend-focus', lift: 0, delta: null, numerator: 0, denominator: 30, n: 1, n2: null, viable: false, rankScore: 0 },
      { id: 'structured-shift', lift: 0, delta: 0, numerator: 0, denominator: 0, n: 406, n2: 0, viable: false, rankScore: 0 },
      { id: 'plan-after-correction', lift: 0, delta: null, numerator: 0, denominator: 0, n: 0, n2: null, viable: false, rankScore: 0 },
      { id: 'late-night-share', lift: 0, delta: null, numerator: 0, denominator: 0.20833333333333334, n: 406, n2: null, viable: true, rankScore: 0 },
      { id: 'long-session-preference', lift: 3.7333333333333334, delta: null, numerator: 0.4666666666666667, denominator: 0.125, n: 30, n2: null, viable: true, rankScore: 3.7333333333333334 },
    ],
    topSignals: ['long-session-preference'],
    totalUserMessages: 406,
  })
})

test('기존 5신호는 전부 단방향(bidirectional=false) — v1 rank 정책 유지', () => {
  for (const fixture of [weekendNightPersona(), structuredPlanPersona(), longSessionPersona(16, 14)]) {
    for (const signal of fpOf(fixture).signals.slice(0, 5)) {
      assert.strictEqual(signal.bidirectional, false, `${signal.id} 가 양방향으로 바뀜`)
    }
  }
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
