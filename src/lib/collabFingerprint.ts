import type { Session } from '../types'
import { matchPlanMarker, matchRetryMarker } from '../parser'
import { DAY_MS, dayKeyToUtcMs, NIGHT_BAND_HOURS, type CodingRhythm } from './codingRhythm'
import { sessionProjectKey, type DailyCollab } from './storyOfDay'

/**
 * AI 협업 지문 (Collaboration Fingerprint) — 상호작용 행동 신호 9종의 본인 기준선 대비 lift.
 *
 * 카드 경계 (설계 문서 카드 3):
 *   성격 카드 = "어떤 사람인가(작업 스타일)" — personality.ts (3축, 'rhythm' 축 포함)
 *   AI 역할 도넛 = "AI에게 무엇을 시키나(요청 주제)" — usageProfile.ts
 *   지문 카드 = "AI와 어떻게 협업하나(상호작용 행동)" — 이 모듈
 * 성격 카드의 'rhythm' 축과 이 모듈의 신호는 별개 개념이다 — 카피 어휘도 분리한다
 * (지문 카피에서 "리듬/유형" 계열 대신 "패턴/경향" 계열 사용).
 *
 * React 없는 순수 함수 (codingRhythm.ts / storyOfDay.ts 패턴). LLM/네트워크 호출 없음.
 * 문자열 카피는 리턴하지 않는다 — 신호 id + 수치만 리턴하고 ko/en 카피는 UI(Dashboard.tsx)에서 분기.
 * 분수는 0~1 raw — % 변환은 UI에서 (lessons/_common.md L-5).
 *
 * 주입형 설계 (Scout 권고): dailyCollab(그날 이야기 카드와 동일 인스턴스)·rhythm(코딩 리듬
 * 카드와 동일 인스턴스)을 그대로 받아 재계산하지 않는다 — 카드 간 수치 드리프트 방지.
 * TZ 민감 집계(로컬 일 키·시간대 밴드)는 전부 주입값 안에서 끝난 상태로 들어오므로
 * offsetMinutes 주입구가 필요 없다 (일 키 → 요일 변환은 dayKeyToUtcMs 로 TZ 비의존).
 *
 * 바넘 방지 (lessons/personality-eval.md L-1): 단일 라벨이 아니라 top lift 2~3개 분포형 +
 * 상시 "추정" 부제 + 모든 주장에 n= 영수증. viable 미달 신호도 숨기지 않고 영수증에 표기.
 */

// ── 임계값 (모두 잠정값 — 실측 보정 전, docs/AI-ROLE-SCORING-REDESIGN.md §2 원칙) ──
export const MIN_FINGERPRINT_SIGNAL_N = 30      // 잠정값 — 실측 보정 전 (신호별 최소 분모 n, goal §W3)
export const MIN_FINGERPRINT_LIFT = 1.3         // 잠정값 — 실측 보정 전 (topSignals 진입 최소 lift)
// ② 전용 보조 가드: 저베이스(예: 구조화 2%대)에서는 비율비 lift 가 쉽게 1.3 을 넘지만
// 절대 변화(%p)가 미미해 "두드러진 패턴" 체감이 없다 — delta 최소폭을 병행 요구.
export const MIN_STRUCTURED_SHIFT_DELTA = 0.03  // 잠정값 — 실측 보정 전 (분수 차, 3%p)
// ⑥⑨ 전용 보조 가드: 양방향 shift 도 절대 변화(%p) 최소폭을 병행 요구 — |delta| 기준.
// MIN_STRUCTURED_SHIFT_DELTA 와 독립 선언 (신호별 보정 분리 — MIN_ACTIVE_DAYS_FOR_STORY 패턴).
export const MIN_SHARE_SHIFT_DELTA = 0.03       // 잠정값 — 실측 보정 전 (분수 차, 3%p)
export const FINGERPRINT_TOP_COUNT = 3          // 잠정값 — 실측 보정 전 (카드 상단 표시 신호 수)
export const MIN_FINGERPRINT_TOP_SIGNALS = 2    // 잠정값 — 실측 보정 전 (이 미만이면 카드 빈상태)
export const FINGERPRINT_LIFT_CAP = 99          // 분모 0 가드 — 이 값 이상이면 "기준선 없음" (RHYTHM_LIFT_CAP 패턴)
export const STRUCTURED_RECENT_WINDOW_DAYS = 30 // 잠정값 — 실측 보정 전 (②⑥⑦⑨ 공용 최근 구간 길이, 달력일 — 동일 앵커·창)
/** SESSION_BUCKETS '21-50턴' 하한과 정합 — 턴 = 세션 내 user 메시지 수 (parser.ts computeStats 와 동일 축) */
export const LONG_SESSION_MIN_TURNS = 21
export const LONG_SESSION_EXPECTATION_FLOOR = 1e-6 // ⑤ 기대치 하한 가드 (0 나누기/폭주 방지)
export const MULTI_PROJECT_EXPECTATION_FLOOR = 1e-6 // ⑧ 기대치 하한 가드 (LONG_SESSION_EXPECTATION_FLOOR 패턴 — 신호별 독립 선언)
/** ⑧ 대상일 최소 세션 수 — 프로젝트 병행이 성립하려면 그날 세션이 2개는 있어야 한다 */
export const MULTI_PROJECT_MIN_DAY_SESSIONS = 2

export type FingerprintSignalId =
  | 'weekend-focus'            // ① 주말 집중 — 주말 일평균 세션 수 / 주중 일평균 세션 수
  | 'structured-shift'         // ② 구조화 변화 — 최근 30일 vs 이전 전체 기간 구조화 비율 (%p)
  | 'plan-after-correction'    // ③ 정정 후 계획 요청 — 정정 이벤트(자신+직후 2메시지 창) plan 비율 / 같은 창 우연 기대
  | 'late-night-share'         // ④ 심야 비중 — 22~02시 메시지 비율 / 균등 기대치 (rhythm 주입값 재사용)
  | 'long-session-preference'  // ⑤ 긴 세션 선호 — 21+턴 세션 비율 / 지수 꼬리 기대치
  | 'ai-share-shift'           // ⑥ AI 작성 비중 변화 — 최근 30일 vs 이전 기간 AI 단어 비중 (양방향, %p)
  | 'delegation-size-shift'    // ⑦ 지시 길이 변화 — 최근 30일 vs 이전 기간 user 평균 프롬프트 단어 수 (양방향)
  | 'multi-project-days'       // ⑧ 프로젝트 병행 — 세션 2+일 중 프로젝트 2+일 비율 / 독립 기대치 (증가 방향만)
  | 'model-mix-shift'          // ⑨ 모델 믹스 변화 — 활동일 중 모델 2+일 비율, 최근 30일 vs 이전 (양방향, %p)

/** 고정 신호 순서 ①→⑨ — topSignals 동률 시 결정적 tie-break 축 (①~⑤ 접두 불변) */
export const FINGERPRINT_SIGNAL_ORDER: FingerprintSignalId[] = [
  'weekend-focus',
  'structured-shift',
  'plan-after-correction',
  'late-night-share',
  'long-session-preference',
  'ai-share-shift',
  'delegation-size-shift',
  'multi-project-days',
  'model-mix-shift',
]

export interface FingerprintSignal {
  id: FingerprintSignalId
  /**
   * 본인 기준선 대비 배수 raw (FINGERPRINT_LIFT_CAP 상한, 분모 0이면 CAP 또는 0).
   * shift 계열(②⑥)은 (최근 비율 / 이전 비율) — 정렬 축 통일용이고 표시는 delta(%p) 권장.
   */
  lift: number
  /** shift 계열(② 구조화·⑥ AI 비중·⑨ 모델 믹스) 전용: 최근 − 이전 비율 차 (0~1 분수 차 raw — %p 변환은 UI). 그 외 null */
  delta: number | null
  /** 분자측 원시 수치 — 의미는 신호별 주석 참고 (①: 주말 일평균 세션, ②④⑤⑥⑧⑨: 비율 0~1, ③: 정정 후 plan 비율, ⑦: 최근 평균 단어 수) */
  numerator: number
  /** 분모측(기준선) 원시 수치 — (①: 주중 일평균 세션, ②⑥⑨: 이전 비율, ③: 2메시지 창 우연 기대 1−(1−p)², ④⑤⑧: 기대 비율, ⑦: 이전 평균 단어 수) */
  denominator: number
  /** 주 표본 수 — 영수증 n= (①: 관측 달력 일수, ②: 최근 user 메시지, ③: 정정 이벤트, ④: 메시지, ⑤: 세션, ⑥: 최근 창 단어, ⑦: 최근 창 user 메시지, ⑧: 세션 2+일, ⑨: 최근 활동일) */
  n: number
  /** 보조 표본 수 — 최근/이전 창 신호(②⑥⑦⑨)의 이전 구간 표본 (둘 다 영수증 표기). 그 외 null */
  n2: number | null
  /** n ≥ MIN_FINGERPRINT_SIGNAL_N + 신호별 분모 가드 충족 여부 */
  viable: boolean
  /**
   * 양방향 신호 여부 — true(⑥⑦⑨)면 감소 방향도 "두드러짐"으로 취급한다
   * (rankScore = max(정방향 lift, 역방향 lift), delta 가드는 |delta| 기준).
   * 기존 ①~⑤ 는 전부 false — v1 정책(증가/집중 방향만) 유지 (② 양방향 전환은 별도 결정, goal Out-of-scope).
   */
  bidirectional: boolean
  /**
   * 정렬 축 — 전 신호를 "배수 lift" 로 환산해 통일.
   * 단방향(①~⑤⑧)은 lift 와 동일 값 — lift ≥ 1(증가/집중) 방향만 "두드러짐".
   * 양방향(⑥⑦⑨)은 max(lift, 역방향 lift) — 감소 방향의 두드러짐도 같은 배수 축으로 환산 (CAP 가드 유지).
   */
  rankScore: number
}

export interface CollabFingerprint {
  /** FINGERPRINT_SIGNAL_ORDER 고정 순서 9종 전부 — viable 미달 신호도 영수증에 정직하게 표기 (반증가능 원칙) */
  signals: FingerprintSignal[]
  /** viable && rankScore ≥ MIN_FINGERPRINT_LIFT 를 rankScore 내림차순 정렬한 상위 FINGERPRINT_TOP_COUNT */
  topSignals: FingerprintSignal[]
  viableCount: number
  /** ③ 기준선 분모 — 세션 전체 user 메시지 수 (마커 매칭은 timestamp 불요 → 유무 무관 전수) */
  totalUserMessages: number
}

/** 분모 0 가드 + lift cap — weekend-builder(codingRhythm)의 RHYTHM_LIFT_CAP 패턴 */
function capLift(numerator: number, denominator: number): number {
  if (denominator <= 0) return numerator > 0 ? FINGERPRINT_LIFT_CAP : 0
  return Math.min(numerator / denominator, FINGERPRINT_LIFT_CAP)
}

/**
 * topSignals 선별 — viable && rankScore ≥ MIN_FINGERPRINT_LIFT 를 rankScore 내림차순,
 * 동률은 FINGERPRINT_SIGNAL_ORDER(①→⑨) 순 (결정적 출력). 단위 테스트 가능하게 분리.
 */
export function selectTopSignals(signals: FingerprintSignal[]): FingerprintSignal[] {
  const order = new Map(FINGERPRINT_SIGNAL_ORDER.map((id, index) => [id, index]))
  return signals
    // 단방향 신호는 rankScore = lift 라 기존 lift 게이트와 수치 동치 — 양방향(⑥⑦⑨)은 감소 방향도 역방향 배수로 통과
    .filter((signal) => signal.viable && signal.rankScore >= MIN_FINGERPRINT_LIFT)
    // shift 계열은 delta(%p) 최소폭도 함께 요구 — 저베이스 비율비 단독 진입 차단 (delta null 인 신호는 비대상).
    // ② 는 v1 정책대로 증가 방향만(양수 delta), 양방향(⑥⑨)은 |delta| 로 양쪽 방향 모두 허용.
    .filter((signal) => signal.delta === null
      || (signal.bidirectional
        ? Math.abs(signal.delta) >= MIN_SHARE_SHIFT_DELTA
        : signal.delta >= MIN_STRUCTURED_SHIFT_DELTA))
    .sort((a, b) => b.rankScore - a.rankScore || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .slice(0, FINGERPRINT_TOP_COUNT)
}

export function buildCollabFingerprint(
  sessions: Session[],
  dailyCollab: Map<string, DailyCollab>,
  rhythm: CodingRhythm
): CollabFingerprint {
  const dayKeys = [...dailyCollab.keys()].sort()

  // ── ① 주말 집중 — 주말 일평균 세션 수 / 주중 일평균 세션 수 ──────────────
  // 분모는 관측 구간 달력 일수 (buildCodingRhythm 의 관측 구간 패턴 — 활동 없는 날도 분모에 포함).
  // 리듬 카드의 weekend-builder 는 "메시지" 일평균이고 지문 ① 은 "세션" 일평균 — 분자 단위가 다르다
  // (지문은 상호작용 행동 = 세션을 여는 행위 기준).
  let observedDayCount = 0
  let weekendDayCount = 0
  let weekdayDayCount = 0
  let weekendSessions = 0
  let weekdaySessions = 0
  if (dayKeys.length > 0) {
    const firstMs = dayKeyToUtcMs(dayKeys[0])
    const lastMs = dayKeyToUtcMs(dayKeys[dayKeys.length - 1])
    observedDayCount = Math.floor((lastMs - firstMs) / DAY_MS) + 1
    for (let ms = firstMs; ms <= lastMs; ms += DAY_MS) {
      const weekday = new Date(ms).getUTCDay()
      if (weekday === 0 || weekday === 6) weekendDayCount++
      else weekdayDayCount++
    }
    for (const [key, day] of dailyCollab) {
      const weekday = new Date(dayKeyToUtcMs(key)).getUTCDay()
      if (weekday === 0 || weekday === 6) weekendSessions += day.sessionCount
      else weekdaySessions += day.sessionCount
    }
  }
  const weekendMean = weekendDayCount > 0 ? weekendSessions / weekendDayCount : 0
  const weekdayMean = weekdayDayCount > 0 ? weekdaySessions / weekdayDayCount : 0
  const weekendLift = capLift(weekendMean, weekdayMean)
  const weekendFocus: FingerprintSignal = {
    id: 'weekend-focus',
    lift: weekendLift,
    delta: null,
    numerator: weekendMean,
    denominator: weekdayMean,
    n: observedDayCount,
    n2: null,
    viable: observedDayCount >= MIN_FINGERPRINT_SIGNAL_N && weekendDayCount > 0 && weekdayDayCount > 0,
    bidirectional: false,
    rankScore: weekendLift,
  }

  // ── ②⑥⑦⑨ 공용 최근/이전 창 집계 — 최근 STRUCTURED_RECENT_WINDOW_DAYS 일 vs 이전 전체 기간 ──
  // 앵커 = 데이터 내 최대 로컬 일 키 (Date.now() 금지 — 같은 입력이면 같은 출력, 결정적·테스트 친화).
  // 최근 구간 = 앵커를 포함한 직전 STRUCTURED_RECENT_WINDOW_DAYS 달력일.
  // 단일 루프에서 4신호의 창별 합을 함께 누적 — 앵커/경계 이중 계산으로 인한 창 드리프트 방지.
  let recentStructured = 0
  let recentUsers = 0
  let priorStructured = 0
  let priorUsers = 0
  let recentUserWords = 0   // ⑥⑦
  let priorUserWords = 0
  let recentAiWords = 0     // ⑥
  let priorAiWords = 0
  let recentActiveDays = 0  // ⑨
  let priorActiveDays = 0
  let recentMultiModelDays = 0
  let priorMultiModelDays = 0
  if (dayKeys.length > 0) {
    const anchorMs = dayKeyToUtcMs(dayKeys[dayKeys.length - 1])
    const windowStartMs = anchorMs - (STRUCTURED_RECENT_WINDOW_DAYS - 1) * DAY_MS
    for (const [key, day] of dailyCollab) {
      if (dayKeyToUtcMs(key) >= windowStartMs) {
        recentStructured += day.structuredCount
        recentUsers += day.userMessageCount
        recentUserWords += day.userWords
        recentAiWords += day.aiWords
        recentActiveDays++
        if (day.models.size >= 2) recentMultiModelDays++
      } else {
        priorStructured += day.structuredCount
        priorUsers += day.userMessageCount
        priorUserWords += day.userWords
        priorAiWords += day.aiWords
        priorActiveDays++
        if (day.models.size >= 2) priorMultiModelDays++
      }
    }
  }
  const recentRate = recentUsers > 0 ? recentStructured / recentUsers : 0
  const priorRate = priorUsers > 0 ? priorStructured / priorUsers : 0
  // 정렬 축 통일용 비율비 — 표시는 delta(%p). 이전 비율 0 은 capLift 가드.
  const structuredRatio = capLift(recentRate, priorRate)
  const structuredShift: FingerprintSignal = {
    id: 'structured-shift',
    lift: structuredRatio,
    delta: recentRate - priorRate,
    numerator: recentRate,
    denominator: priorRate,
    n: recentUsers,
    n2: priorUsers,
    viable: recentUsers >= MIN_FINGERPRINT_SIGNAL_N && priorUsers >= MIN_FINGERPRINT_SIGNAL_N,
    bidirectional: false,
    rankScore: structuredRatio,
  }

  // ── ③ 정정 후 계획 요청 — 분모 단위 = 정정 이벤트(retry 마커 매칭 user 메시지 1건) ──
  // 분자: 그 메시지 자신 **또는** 같은 세션 내 직후 user 메시지에 plan 마커 (이벤트당 최대 1 카운트).
  // DailyCollab.followUps 는 "직전 assistant" 조건의 다른 축이라 재사용 불가 — 세션별 user
  // 시퀀스를 직접 순회한다 (buildGrowth 의 세션 경계 리셋 패턴: 세션을 넘는 "직후"는 없다).
  let totalUserMessages = 0
  let planMessages = 0
  let correctionEvents = 0
  let correctionEventsWithNext = 0
  let planAfterCorrection = 0
  for (const session of sessions) {
    const userTexts: string[] = []
    for (const msg of session.messages) {
      if (msg.role === 'user') userTexts.push(msg.text)
    }
    totalUserMessages += userTexts.length
    const isPlan = userTexts.map((text) => matchPlanMarker(text) !== null)
    for (let i = 0; i < userTexts.length; i++) {
      if (isPlan[i]) planMessages++
      if (matchRetryMarker(userTexts[i]) !== null) {
        correctionEvents++
        const hasNext = i + 1 < isPlan.length
        if (hasNext) correctionEventsWithNext++
        if (isPlan[i] || (hasNext && isPlan[i + 1])) planAfterCorrection++
      }
    }
  }
  const planBaseRate = totalUserMessages > 0 ? planMessages / totalUserMessages : 0
  // 분모 = 분자와 같은 창의 우연 기대. per-message 비율 p 를 그대로 분모로 쓰면 독립 null 에서도
  // lift ≈ 2 가 되는 구조적 편향 (창 2 vs 창 1 — 전원이 "두드러짐"으로 승격되는 동질화 리스크).
  // 창 크기는 이벤트마다 다르다 — 정정이 세션 마지막 user 메시지면 "직후"가 없어 1메시지 창:
  // 기대치도 이벤트별 창 크기 가중 평균으로 (2창 이벤트 1−(1−p)², 1창 이벤트 p).
  const planWindowExpectation = correctionEvents > 0
    ? (correctionEventsWithNext * (1 - (1 - planBaseRate) ** 2)
      + (correctionEvents - correctionEventsWithNext) * planBaseRate) / correctionEvents
    : 0
  const planAfterRate = correctionEvents > 0 ? planAfterCorrection / correctionEvents : 0
  const planLift = capLift(planAfterRate, planWindowExpectation)
  const planAfterCorrectionSignal: FingerprintSignal = {
    id: 'plan-after-correction',
    lift: planLift,
    delta: null,
    numerator: planAfterRate,
    denominator: planWindowExpectation,
    n: correctionEvents,
    n2: null,
    viable: correctionEvents >= MIN_FINGERPRINT_SIGNAL_N && planBaseRate > 0,
    bidirectional: false,
    rankScore: planLift,
  }

  // ── ④ 심야 비중 — rhythm 주입값 재사용 (코딩 리듬 카드와 수치 일치 — 독립 재계산 금지) ──
  const nightExpectation = NIGHT_BAND_HOURS.size / 24
  const nightLift = capLift(rhythm.hourBandShares.night, nightExpectation)
  const lateNightShare: FingerprintSignal = {
    id: 'late-night-share',
    lift: nightLift,
    delta: null,
    numerator: rhythm.hourBandShares.night,
    denominator: nightExpectation,
    n: rhythm.totalMessages,
    n2: null,
    viable: rhythm.totalMessages >= MIN_FINGERPRINT_SIGNAL_N,
    bidirectional: false,
    rankScore: nightLift,
  }

  // ── ⑤ 긴 세션 선호 — 21+턴 세션 비율 / 지수 꼬리 기대치 ─────────────────
  // 턴 = 세션 내 user 메시지 수 (SESSION_BUCKETS '21-50턴' 경계와 동일 축 — user 0 세션은 분포 제외).
  // 잠정 모델 — 변별력 미달 시 신호 드롭: 본인 중앙값 m 에서 P(턴 ≥ x) = 2^(−x/m) 으로 근사
  // (중앙값에서 정확히 1/2 이 되는 지수 꼬리 — 세션 길이의 right-skew 를 본인 분포만으로 기대치화).
  const turnCounts = sessions
    .map((session) => session.messages.filter((m) => m.role === 'user').length)
    .filter((count) => count >= 1)
    .sort((a, b) => a - b)
  const sessionCount = turnCounts.length
  let medianTurns = 0
  if (sessionCount > 0) {
    const mid = Math.floor(sessionCount / 2)
    medianTurns = sessionCount % 2 === 1 ? turnCounts[mid] : (turnCounts[mid - 1] + turnCounts[mid]) / 2
  }
  const longShare = sessionCount > 0
    ? turnCounts.filter((count) => count >= LONG_SESSION_MIN_TURNS).length / sessionCount
    : 0
  const expectedLongShare = medianTurns > 0
    ? Math.max(Math.pow(2, -LONG_SESSION_MIN_TURNS / medianTurns), LONG_SESSION_EXPECTATION_FLOOR)
    : 0
  const longLift = capLift(longShare, expectedLongShare)
  const longSessionPreference: FingerprintSignal = {
    id: 'long-session-preference',
    lift: longLift,
    delta: null,
    numerator: longShare,
    denominator: expectedLongShare,
    n: sessionCount,
    n2: null,
    viable: sessionCount >= MIN_FINGERPRINT_SIGNAL_N && medianTurns > 0,
    bidirectional: false,
    rankScore: longLift,
  }

  // ── ⑥ AI 작성 비중 변화 — 최근 30일 vs 이전 기간 AI 단어 비중 (양방향) ──────
  // 비중 = aiWords / (userWords + aiWords) — authorshipRatio.ts 와 동일 산식 축 (단어 수 기반, 토큰 아님).
  // 위임이 늘어도(비중 ↑) 직접 쓰는 쪽으로 돌아서도(비중 ↓) 둘 다 협업 패턴 변화 — rankScore 는 역방향 배수까지 본다.
  const recentWordTotal = recentUserWords + recentAiWords
  const priorWordTotal = priorUserWords + priorAiWords
  const recentAiShare = recentWordTotal > 0 ? recentAiWords / recentWordTotal : 0
  const priorAiShare = priorWordTotal > 0 ? priorAiWords / priorWordTotal : 0
  const aiShareLift = capLift(recentAiShare, priorAiShare)
  const aiShareShift: FingerprintSignal = {
    id: 'ai-share-shift',
    lift: aiShareLift,
    delta: recentAiShare - priorAiShare,
    numerator: recentAiShare,
    denominator: priorAiShare,
    n: recentWordTotal,
    n2: priorWordTotal,
    viable: recentUsers >= MIN_FINGERPRINT_SIGNAL_N && priorUsers >= MIN_FINGERPRINT_SIGNAL_N,
    bidirectional: true,
    rankScore: Math.max(aiShareLift, capLift(priorAiShare, recentAiShare)),
  }

  // ── ⑦ 지시 길이 변화 — 최근 30일 vs 이전 기간 user 평균 프롬프트 단어 수 (양방향) ──
  // 짧아지면 위임형(간결 지시), 길어지면 명세형(상세 지시) — 방향 해석은 UI 카피에서.
  // 별도 delta 가드 없음 — goal §W2 ⑦ 이 공용 lift 게이트 표현을 허용("may express via the shared
  // lift gate if cleaner"): 게이트 1.3 이 증가 +30% / 감소 −23%(비율 1/1.3) 이상을 요구해
  // 15% 가드를 지배하므로 별도 상수가 불요하다.
  const recentAvgPromptWords = recentUsers > 0 ? recentUserWords / recentUsers : 0
  const priorAvgPromptWords = priorUsers > 0 ? priorUserWords / priorUsers : 0
  const delegationLift = capLift(recentAvgPromptWords, priorAvgPromptWords)
  const delegationSizeShift: FingerprintSignal = {
    id: 'delegation-size-shift',
    lift: delegationLift,
    delta: null,
    numerator: recentAvgPromptWords,
    denominator: priorAvgPromptWords,
    n: recentUsers,
    n2: priorUsers,
    viable: recentUsers >= MIN_FINGERPRINT_SIGNAL_N && priorUsers >= MIN_FINGERPRINT_SIGNAL_N,
    bidirectional: true,
    rankScore: Math.max(delegationLift, capLift(priorAvgPromptWords, recentAvgPromptWords)),
  }

  // ── ⑧ 프로젝트 병행 — 세션 2+일 중 프로젝트 2+일 비율 / 독립 기대치 (증가 방향만) ──
  // 기대치 = 본인 전체 세션의 프로젝트 분포 p_j 에서 그날 세션 수 k_d 가 독립 추출됐다고 가정할 때
  // "2개 이상 프로젝트에 걸칠" 확률의 대상일 평균: E = mean_d (1 − Σ_j p_j^{k_d}).
  // 프로젝트 키 규칙은 sessionProjectKey(storyOfDay.ts) 단일 소스 — dailyCollab.projects 와 동일 규칙.
  const projectSessionCounts = new Map<string, number>()
  let projectSessionTotal = 0
  for (const session of sessions) {
    const projectKey = sessionProjectKey(session)
    if (projectKey === null) continue // 프로젝트 미기록 세션은 분포에서 제외
    projectSessionCounts.set(projectKey, (projectSessionCounts.get(projectKey) ?? 0) + 1)
    projectSessionTotal++
  }
  let multiProjectQualifyingDays = 0
  let multiProjectObservedDays = 0
  let multiProjectExpectationSum = 0
  for (const day of dailyCollab.values()) {
    if (day.sessionCount < MULTI_PROJECT_MIN_DAY_SESSIONS) continue
    multiProjectQualifyingDays++
    if (day.projects.size >= 2) multiProjectObservedDays++
    if (projectSessionTotal > 0) {
      let sameProjectProb = 0
      for (const count of projectSessionCounts.values()) {
        sameProjectProb += Math.pow(count / projectSessionTotal, day.sessionCount)
      }
      multiProjectExpectationSum += 1 - sameProjectProb
    }
  }
  const multiProjectShare = multiProjectQualifyingDays > 0
    ? multiProjectObservedDays / multiProjectQualifyingDays
    : 0
  // 프로젝트 기록이 아예 없으면 기대치의 근거가 없다 — ⑤의 medianTurns > 0 가드 패턴 (floor 는 근거가 있을 때만)
  const multiProjectExpectation = projectSessionTotal > 0 && multiProjectQualifyingDays > 0
    ? Math.max(multiProjectExpectationSum / multiProjectQualifyingDays, MULTI_PROJECT_EXPECTATION_FLOOR)
    : 0
  const multiProjectLift = capLift(multiProjectShare, multiProjectExpectation)
  const multiProjectDays: FingerprintSignal = {
    id: 'multi-project-days',
    lift: multiProjectLift,
    delta: null,
    numerator: multiProjectShare,
    denominator: multiProjectExpectation,
    n: multiProjectQualifyingDays,
    n2: null,
    viable: multiProjectQualifyingDays >= MIN_FINGERPRINT_SIGNAL_N && multiProjectExpectation > 0,
    bidirectional: false,
    rankScore: multiProjectLift,
  }

  // ── ⑨ 모델 믹스 변화 — 활동일 중 모델 2+종 사용일 비율, 최근 30일 vs 이전 (양방향) ──
  // 이중 가드는 selectTopSignals 에서: rankScore 게이트 + |delta| ≥ MIN_SHARE_SHIFT_DELTA (② 패턴의 양방향판).
  const recentMultiModelShare = recentActiveDays > 0 ? recentMultiModelDays / recentActiveDays : 0
  const priorMultiModelShare = priorActiveDays > 0 ? priorMultiModelDays / priorActiveDays : 0
  const modelMixLift = capLift(recentMultiModelShare, priorMultiModelShare)
  const modelMixShift: FingerprintSignal = {
    id: 'model-mix-shift',
    lift: modelMixLift,
    delta: recentMultiModelShare - priorMultiModelShare,
    numerator: recentMultiModelShare,
    denominator: priorMultiModelShare,
    n: recentActiveDays,
    n2: priorActiveDays,
    viable: recentActiveDays >= MIN_FINGERPRINT_SIGNAL_N && priorActiveDays >= MIN_FINGERPRINT_SIGNAL_N,
    bidirectional: true,
    rankScore: Math.max(modelMixLift, capLift(priorMultiModelShare, recentMultiModelShare)),
  }

  const signals = [
    weekendFocus,
    structuredShift,
    planAfterCorrectionSignal,
    lateNightShare,
    longSessionPreference,
    aiShareShift,
    delegationSizeShift,
    multiProjectDays,
    modelMixShift,
  ]
  return {
    signals,
    topSignals: selectTopSignals(signals),
    viableCount: signals.filter((signal) => signal.viable).length,
    totalUserMessages,
  }
}
