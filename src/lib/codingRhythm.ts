import type { Session } from '../types'
import { toLocalDayKey } from '../parser'

/**
 * 코딩 리듬 — user 메시지 타임스탬프 분포의 per-day/요일/시간대 밴드 집계.
 *
 * React 없는 순수 함수 (promptCoaching.ts 패턴). LLM/네트워크 호출 없음.
 * 문자열 카피는 리턴하지 않는다 — 수치만 리턴하고 ko/en 카피는 UI(Dashboard.tsx)에서 분기.
 *
 * 일(day) 경계는 로컬 날짜(toLocalDayKey) — 기존 dayKey(UTC)는 KST 00~09시 활동이
 * 전날로 귀속돼 심야형일수록 요일/밀도/streak 가 모두 왜곡된다 (설계 문서 공통 데이터 정책 1항).
 *
 * 활동 캘린더·요일 분포·시간대 활동 카드와 AI 협업 지문(hourBandShares.night·totalMessages)의
 * 단일 소스. 리듬 "라벨" 판정은 2026-06-14 대시보드 재편으로 제거됐다 (코딩 리듬 인사이트 카드 폐지).
 */

// ── 시간대 밴드 (로컬 시 기준 — 기존 24h 바의 getHours() 축과 동일) ──────────
/** 심야 밴드 22~02시 — 균등 기대치 5/24 (지문 ④ late-night-share 의 기준) */
export const NIGHT_BAND_HOURS = new Set([22, 23, 0, 1, 2])
/** 아침 밴드 05~09시 — 균등 기대치 5/24 (hourBandShares.early 산출) */
export const EARLY_BAND_HOURS = new Set([5, 6, 7, 8, 9])
/** 업무 시간 밴드 09~18시 — 균등 기대치 10/24 (hourBandShares.office 산출) */
export const OFFICE_BAND_HOURS = new Set([9, 10, 11, 12, 13, 14, 15, 16, 17, 18])

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

  for (const t of timestamps) {
    const key = toLocalDayKey(t, offsetMinutes)
    localDailyCounts[key] = (localDailyCounts[key] || 0) + 1
    const { weekday, hour } = toLocalParts(t, offsetMinutes)
    weekdayCounts[weekday]++
    if (NIGHT_BAND_HOURS.has(hour)) nightCount++
    if (EARLY_BAND_HOURS.has(hour)) earlyCount++
    if (OFFICE_BAND_HOURS.has(hour)) officeCount++
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

  // 관측 구간 (밀도의 분모) — 활동 없는 날도 분모에 포함
  let observedDayCount = 0
  if (activeDayCount > 0) {
    const firstMs = dayKeyToUtcMs(sortedKeys[0])
    const lastMs = dayKeyToUtcMs(sortedKeys[sortedKeys.length - 1])
    observedDayCount = Math.floor((lastMs - firstMs) / DAY_MS) + 1
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

  return {
    localDailyCounts,
    weekdayDistribution,
    longestStreak,
    activeDayCount,
    observedDayCount,
    densityRatio,
    hourBandShares,
    totalMessages,
  }
}
