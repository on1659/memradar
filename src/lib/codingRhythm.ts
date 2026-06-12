import type { Session } from '../types'
import { toLocalDayKey } from '../parser'

/**
 * 코딩 리듬 — user 메시지 타임스탬프 분포에서 본인 기준선 대비 편차(lift)로 리듬 라벨 도출.
 *
 * React 없는 순수 함수 (promptCoaching.ts 패턴). LLM/네트워크 호출 없음.
 * 문자열 카피는 리턴하지 않는다 — 라벨 id + evidence 수치만 리턴하고,
 * ko/en 카피는 UI(Dashboard.tsx)에서 분기한다.
 *
 * 일(day) 경계는 로컬 날짜(toLocalDayKey) — 기존 dayKey(UTC)는 KST 00~09시 활동이
 * 전날로 귀속돼 심야형일수록 요일/밀도/streak 가 모두 왜곡된다 (설계 문서 공통 데이터 정책 1항).
 *
 * 바넘 방지(lessons/personality-eval.md L-1): 최대 lift 신호도 MIN_LABEL_LIFT 미만이면
 * 라벨을 붙이지 않는다 — 약한 근거로 "~형" 판정 금지.
 */

// ── 시간대 밴드 (로컬 시 기준 — 기존 24h 바의 getHours() 축과 동일) ──────────
/** 심야 밴드 22~02시 — 균등 기대치 5/24 */
export const NIGHT_BAND_HOURS = new Set([22, 23, 0, 1, 2])
/** 아침 밴드 05~09시 — 균등 기대치 5/24 */
export const EARLY_BAND_HOURS = new Set([5, 6, 7, 8, 9])
/** 업무 시간 밴드 09~18시 — 균등 기대치 10/24 */
export const OFFICE_BAND_HOURS = new Set([9, 10, 11, 12, 13, 14, 15, 16, 17, 18])

// ── 임계값 (모두 잠정값 — 실측 보정 전, docs/AI-ROLE-SCORING-REDESIGN.md §2 원칙) ──
export const MIN_ACTIVE_DAYS_FOR_RHYTHM = 7        // 잠정값 — 실측 보정 전 (활동일 미달 시 라벨 미표시)
export const MIN_LABEL_LIFT = 1.5                  // 잠정값 — 실측 보정 전 (최대 lift 도 미달이면 label=null)
export const WEEKDAY_STEADY_WEEKEND_LIFT_MAX = 0.8 // 잠정값 — 실측 보정 전 (평일 정시형의 주말 lift 상한)
export const BURST_DENSITY_MAX = 0.5               // 잠정값 — 실측 보정 전 (몰아치기형 활동 밀도 상한, 0~1)
export const BURST_TOP_DAY_FRACTION = 0.2          // 잠정값 — 실측 보정 전 (상위 활동일 분위 = 상위 20%)
export const STEADY_DENSITY_EXPECTATION = 0.4      // 잠정값 — 실측 보정 전 (꾸준형 lift 분모 기준선, 0~1)
export const STEADY_CV_MAX = 0.8                   // 잠정값 — 실측 보정 전 (꾸준형 일별 메시지 수 변동계수 상한)
export const RHYTHM_LIFT_CAP = 99                  // 분모 0 가드 — 이 값 이상이면 "기준선 없음" 의미

export type RhythmLabelId =
  | 'night-surge'      // 심야형 — 22~02시 비율 lift
  | 'early-bird'       // 아침형 — 05~09시 비율 lift
  | 'weekend-builder'  // 주말형 — 주말 일평균 / 주중 일평균
  | 'weekday-steady'   // 평일 정시형 — 주중 09~18시 집중 + 주말 lift 낮음
  | 'burst-sprinter'   // 몰아치기형 — 밀도 낮음 + 상위 활동일 집중
  | 'daily-steady'     // 꾸준형 — 밀도 높음 + 일별 편차 낮음

export interface RhythmLabelEvidence {
  /** lift 배수 raw — 표시 반올림은 UI에서. RHYTHM_LIFT_CAP 이상이면 분모 0 (기준선 없음) */
  lift: number
  /** 해당 신호의 분자 비율 0~1 raw — % 변환은 UI에서 (lessons/_common.md L-5) */
  share: number
  /** 분모 표본 수 — 메시지 수(시간대 신호) 또는 일수(일 단위 신호) */
  n: number
}

export interface RhythmWeekdayEntry {
  count: number
  /** 0~1 raw — % 변환은 UI에서 */
  share: number
}

export interface CodingRhythm {
  /** 로컬 날짜 키(YYYY-MM-DD) → user 메시지 수 — 캘린더/밀도/streak 의 단일 소스 */
  localDailyCounts: Record<string, number>
  /** 길이 7, 일(0)~토(6) — 로컬 요일 기준 */
  weekdayDistribution: RhythmWeekdayEntry[]
  /** 로컬 키 기준 최장 연속 활동일 */
  longestStreak: number
  activeDayCount: number
  observedDayCount: number
  /** activeDayCount / observedDayCount, 0~1 raw */
  densityRatio: number
  /** 시간대 밴드별 메시지 비율 0~1 raw (로컬 시 기준) */
  hourBandShares: { night: number; early: number; office: number }
  totalMessages: number
  /** 활동일 < MIN_ACTIVE_DAYS_FOR_RHYTHM 또는 최대 lift < MIN_LABEL_LIFT 이면 null */
  label: RhythmLabelId | null
  labelEvidence: RhythmLabelEvidence | null
}

/** Dashboard 호출용 — 세션에서 유효한 user 메시지 타임스탬프만 추출 */
export function collectUserTimestamps(sessions: Session[]): Date[] {
  const out: Date[] = []
  for (const session of sessions) {
    for (const msg of session.messages) {
      if (msg.role !== 'user' || !msg.timestamp) continue
      const d = new Date(msg.timestamp)
      if (!Number.isNaN(d.getTime())) out.push(d)
    }
  }
  return out
}

/** 로컬(또는 주입 오프셋) 기준 요일/시 — toLocalDayKey 와 같은 축 */
function toLocalParts(date: Date, offsetMinutes?: number): { weekday: number; hour: number } {
  if (offsetMinutes !== undefined) {
    const shifted = new Date(date.getTime() + offsetMinutes * 60_000)
    return { weekday: shifted.getUTCDay(), hour: shifted.getUTCHours() }
  }
  return { weekday: date.getDay(), hour: date.getHours() }
}

/**
 * "YYYY-MM-DD" 로컬 키 → 그 달력 날짜의 UTC 자정 ms — TZ 비의존 날짜 연산용.
 * collabFingerprint.ts 와 공유 (헬퍼 복제 방지 — export 승격, W3).
 */
export function dayKeyToUtcMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** 달력 하루(ms) — dayKeyToUtcMs 와 함께 날짜 연산에 사용 (collabFingerprint.ts 와 공유) */
export const DAY_MS = 86_400_000

interface RhythmSignal {
  id: RhythmLabelId
  /** 본인 기준선 대비 배수 — 클수록 두드러진 패턴 */
  lift: number
  evidence: RhythmLabelEvidence
  /** lift 외 부가 조건 (예: 몰아치기형의 밀도 상한) 충족 여부 */
  eligible: boolean
}

export function buildCodingRhythm(
  timestamps: Date[],
  opts?: { offsetMinutes?: number }
): CodingRhythm {
  const offsetMinutes = opts?.offsetMinutes

  const localDailyCounts: Record<string, number> = {}
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0]
  let nightCount = 0
  let earlyCount = 0
  let officeCount = 0
  let weekdayOfficeCount = 0

  for (const t of timestamps) {
    const key = toLocalDayKey(t, offsetMinutes)
    localDailyCounts[key] = (localDailyCounts[key] || 0) + 1
    const { weekday, hour } = toLocalParts(t, offsetMinutes)
    weekdayCounts[weekday]++
    if (NIGHT_BAND_HOURS.has(hour)) nightCount++
    if (EARLY_BAND_HOURS.has(hour)) earlyCount++
    if (OFFICE_BAND_HOURS.has(hour)) officeCount++
    if (weekday >= 1 && weekday <= 5 && OFFICE_BAND_HOURS.has(hour)) weekdayOfficeCount++
  }

  const totalMessages = timestamps.length
  const sortedKeys = Object.keys(localDailyCounts).sort()
  const activeDayCount = sortedKeys.length

  // 최장 연속 활동일 — 로컬 키의 달력 날짜 차이로 계산 (TZ 비의존)
  let longestStreak = 0
  let streak = 0
  let prevMs: number | null = null
  for (const key of sortedKeys) {
    const ms = dayKeyToUtcMs(key)
    streak = prevMs !== null && ms - prevMs === DAY_MS ? streak + 1 : 1
    if (streak > longestStreak) longestStreak = streak
    prevMs = ms
  }

  // 관측 구간 + 구간 내 주말/주중 달력 일수 (주말 일평균의 분모)
  let observedDayCount = 0
  let weekendDayCount = 0
  let weekdayDayCount = 0
  if (activeDayCount > 0) {
    const firstMs = dayKeyToUtcMs(sortedKeys[0])
    const lastMs = dayKeyToUtcMs(sortedKeys[sortedKeys.length - 1])
    observedDayCount = Math.floor((lastMs - firstMs) / DAY_MS) + 1
    for (let ms = firstMs; ms <= lastMs; ms += DAY_MS) {
      const wd = new Date(ms).getUTCDay()
      if (wd === 0 || wd === 6) weekendDayCount++
      else weekdayDayCount++
    }
  }
  const densityRatio = observedDayCount > 0 ? activeDayCount / observedDayCount : 0

  const weekdayDistribution: RhythmWeekdayEntry[] = weekdayCounts.map((count) => ({
    count,
    share: totalMessages > 0 ? count / totalMessages : 0,
  }))

  const hourBandShares = {
    night: totalMessages > 0 ? nightCount / totalMessages : 0,
    early: totalMessages > 0 ? earlyCount / totalMessages : 0,
    office: totalMessages > 0 ? officeCount / totalMessages : 0,
  }

  // ── 신호별 lift 산출 ──────────────────────────────────────────────────────
  const signals: RhythmSignal[] = []

  if (totalMessages > 0 && activeDayCount > 0) {
    // night-surge / early-bird — 밴드 비율 / 균등 기대치(밴드 시간 수 / 24)
    const nightExpectation = NIGHT_BAND_HOURS.size / 24
    const earlyExpectation = EARLY_BAND_HOURS.size / 24
    signals.push({
      id: 'night-surge',
      lift: hourBandShares.night / nightExpectation,
      evidence: { lift: hourBandShares.night / nightExpectation, share: hourBandShares.night, n: totalMessages },
      eligible: true,
    })
    signals.push({
      id: 'early-bird',
      lift: hourBandShares.early / earlyExpectation,
      evidence: { lift: hourBandShares.early / earlyExpectation, share: hourBandShares.early, n: totalMessages },
      eligible: true,
    })

    // weekend-builder — 주말 일평균 / 주중 일평균 (관측 구간 달력 일수 분모)
    const weekendMsgs = weekdayCounts[0] + weekdayCounts[6]
    const weekdayMsgs = totalMessages - weekendMsgs
    const weekendMean = weekendDayCount > 0 ? weekendMsgs / weekendDayCount : 0
    const weekdayMean = weekdayDayCount > 0 ? weekdayMsgs / weekdayDayCount : 0
    const weekendLift = weekdayMean > 0
      ? weekendMean / weekdayMean
      : weekendMean > 0 ? RHYTHM_LIFT_CAP : 0
    signals.push({
      id: 'weekend-builder',
      lift: weekendLift,
      evidence: { lift: weekendLift, share: totalMessages > 0 ? weekendMsgs / totalMessages : 0, n: observedDayCount },
      eligible: true,
    })

    // weekday-steady — 주중 09~18시 비율 / 균등 기대치((5/7)·(10/24)) + 주말 lift 낮음
    const weekdayOfficeExpectation = (5 / 7) * (OFFICE_BAND_HOURS.size / 24)
    const weekdayOfficeShare = weekdayOfficeCount / totalMessages
    signals.push({
      id: 'weekday-steady',
      lift: weekdayOfficeShare / weekdayOfficeExpectation,
      evidence: { lift: weekdayOfficeShare / weekdayOfficeExpectation, share: weekdayOfficeShare, n: totalMessages },
      eligible: weekendLift <= WEEKDAY_STEADY_WEEKEND_LIFT_MAX,
    })

    // burst-sprinter — 상위 20% 활동일의 메시지 점유율 / 균등 기대치(0.2) + 밀도 낮음
    const dailyDesc = Object.values(localDailyCounts).sort((a, b) => b - a)
    const topDayCount = Math.max(1, Math.ceil(activeDayCount * BURST_TOP_DAY_FRACTION))
    const topShare = dailyDesc.slice(0, topDayCount).reduce((sum, v) => sum + v, 0) / totalMessages
    signals.push({
      id: 'burst-sprinter',
      lift: topShare / BURST_TOP_DAY_FRACTION,
      evidence: { lift: topShare / BURST_TOP_DAY_FRACTION, share: topShare, n: activeDayCount },
      eligible: densityRatio < BURST_DENSITY_MAX,
    })

    // daily-steady — 밀도 / 기준선(0.4) + 일별 메시지 수 변동계수 낮음
    const dailyMean = totalMessages / activeDayCount
    const variance = dailyDesc.reduce((sum, v) => sum + (v - dailyMean) ** 2, 0) / activeDayCount
    const cv = dailyMean > 0 ? Math.sqrt(variance) / dailyMean : 0
    signals.push({
      id: 'daily-steady',
      lift: densityRatio / STEADY_DENSITY_EXPECTATION,
      evidence: { lift: densityRatio / STEADY_DENSITY_EXPECTATION, share: densityRatio, n: observedDayCount },
      eligible: cv <= STEADY_CV_MAX,
    })
  }

  // ── 라벨 판정 ─────────────────────────────────────────────────────────────
  // eligible 신호 중 최대 lift 하나를 선택한다.
  // 동률이면 signals 배열 순서(심야 → 아침 → 주말 → 평일 정시 → 몰아치기 → 꾸준)가 빠른 쪽이 이긴다.
  // 최대 lift 가 MIN_LABEL_LIFT 미만이면 중립 라벨로 대체하지 않고 label=null —
  // 약한 근거로 라벨을 붙이지 않는다 (바넘 회피, lessons/personality-eval.md L-1).
  let label: RhythmLabelId | null = null
  let labelEvidence: RhythmLabelEvidence | null = null
  if (activeDayCount >= MIN_ACTIVE_DAYS_FOR_RHYTHM) {
    let best: RhythmSignal | null = null
    for (const signal of signals) {
      if (!signal.eligible) continue
      if (best === null || signal.lift > best.lift) best = signal
    }
    if (best !== null && best.lift >= MIN_LABEL_LIFT) {
      label = best.id
      labelEvidence = best.evidence
    }
  }

  return {
    localDailyCounts,
    weekdayDistribution,
    longestStreak,
    activeDayCount,
    observedDayCount,
    densityRatio,
    hourBandShares,
    totalMessages,
    label,
    labelEvidence,
  }
}
