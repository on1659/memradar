import type { Stats } from '../types'

/**
 * 프롬프트 코칭 — 성장 데이터(Stats.growth)에서 증거 기반 인사이트 도출.
 *
 * React 없는 순수 함수 (usageProfile.ts 패턴). LLM/네트워크 호출 없음.
 * 문자열 카피는 리턴하지 않는다 — 구조화된 evidence 만 리턴하고,
 * ko/en 카피는 UI(GrowthCoaching.tsx)에서 분기한다.
 *
 * 바넘 방지(lessons/personality-eval.md L-1): 발화 조건이 충족될 때만 생성,
 * 모든 인사이트는 실제 수치 evidence 를 동반한다.
 */

// ── 임계값 (모두 잠정값 — 실측 보정 전, docs/AI-ROLE-SCORING-REDESIGN.md §2 원칙) ──
export const HIGH_RETRY_MIN_FOLLOWUPS = 20   // 잠정값 — 실측 보정 전
// 잠정값 — 2026-07 라벨 실측 보정: 매처 재설계로 지표 스케일이 절반 이하로 내려가
// (실제 정정률 3.4~4.4% 실측) 0.15 는 도달 불가 죽은 룰이 됨. 실측치의 ~2배 지점으로 재보정.
export const HIGH_RETRY_MIN_RATE = 0.08      // (0~1 분수)
// 칭찬 룰 low-retry — high-retry 의 역상. high-retry 와 같은 신호 게이트
// (totalFollowups ≥ HIGH_RETRY_MIN_FOLLOWUPS)를 공유하고 정정률 상한만 낮춘다.
// 0.05 < HIGH_RETRY_MIN_RATE(0.08) → 한 데이터가 두 룰을 동시 발화 불가 (상호배타 by construction).
export const LOW_RETRY_MAX_RATE = 0.05       // 잠정값 — 실측 보정 전 (0~1 분수)
export const LONG_PROMPT_MIN_AVG_WORDS = 50  // 잠정값 — 실측 보정 전
export const LOW_STRUCTURED_MAX_RATE = 0.1   // 잠정값 — 실측 보정 전 (0~1 분수)
export const SHORT_PROMPT_MAX_AVG_WORDS = 10 // 잠정값 — 실측 보정 전
export const LOW_SKILL_VARIETY_MAX = 1       // 잠정값 — 실측 보정 전
// 칭찬 룰 high-skill-variety — low-skill-variety 의 역상. 같은 eligibility 경로
// (LOW_SKILL_MIN_VALID_MONTHS 가드 + 최근 eligible Claude 월)을 공유하고 다양성 하한만 둔다.
// 5 > LOW_SKILL_VARIETY_MAX(1) → 한 데이터가 두 룰을 동시 발화 불가 (상호배타 by construction).
export const HIGH_SKILL_VARIETY_MIN = 5      // 잠정값 — 실측 보정 전
export const LOW_SKILL_MIN_VALID_MONTHS = 2  // 잠정값 — 실측 보정 전
export const IMPROVING_MIN_VALID_MONTHS = 3  // 잠정값 — 실측 보정 전
export const IMPROVING_MIN_SCORE_DELTA = 0.1 // 잠정값 — 실측 보정 전 (0~1 스코어 차)
export const MIN_ELIGIBLE_ACTIVE_DAYS = 7    // 잠정값 — 실측 보정 전 (현재 월이 latest 기준이 되기 위한 최소 활동 일수)
export const MAX_INSIGHTS = 4

type SkillCurveEntry = Stats['growth']['skillCurve'][number]

/**
 * "latest 기준 월" eligibility — 완료된 달력 월(monthKey < now 의 UTC 월 키)이거나,
 * 현재 월이면서 activeDays ≥ MIN_ELIGIBLE_ACTIVE_DAYS 인 월.
 *
 * 며칠짜리 부분 달(구조적으로 짧은 축적 창)이 long-unstructured/short-prompts/
 * low-skill-variety/improving 종점의 근거가 되는 오발화를 막는다.
 * 첫 달 정책(스펙 impl-note #5) 보존 — 유효 월이 현재 월 하나뿐이어도 활동 ≥ 7일이면 발화.
 * analyze-coaching.mts 룰 보드가 같은 판정을 공유한다 (드리프트 가드 3 전제).
 */
export function isEligibleMonth(entry: SkillCurveEntry, nowMonthKey: string): boolean {
  return entry.month < nowMonthKey ||
    (entry.month === nowMonthKey && entry.activeDays >= MIN_ELIGIBLE_ACTIVE_DAYS)
}

export type CoachingInsightId =
  | 'high-retry'
  | 'long-unstructured'
  | 'short-prompts'
  | 'low-skill-variety'
  | 'improving'
  | 'low-retry'
  | 'high-skill-variety'

export interface CoachingInsight {
  id: CoachingInsightId
  kind: 'tip' | 'praise'
  /** 카피에 삽입할 실측 수치만 — 사용자 프롬프트 원문 인용 금지 (시크릿 마스킹 표면 방지) */
  evidence: Record<string, number | string>
}

/**
 * 우선순위순(push 순서 = 우선순위): tip 먼저(actionable), praise 나중.
 * high-retry → long-unstructured → short-prompts → low-skill-variety
 *   → improving → low-retry → high-skill-variety.
 * 최대 MAX_INSIGHTS 개. 발화 조건 0개 또는 데이터 부족이면 빈 배열.
 *
 * now: eligibility 판정 기준 시각 (UTC 월 키로 변환) — 테스트 주입용. 기본 new Date().
 * latest-월 룰 5종(long-unstructured/short-prompts/low-skill-variety/improving 종점/
 * high-skill-variety)은 eligible 월만 기준으로 삼는다. eligible 월 0개면 해당 룰 미발화
 * (high-retry/low-retry 는 무관 — retryStats 전체 집계 기반).
 *
 * 상호배타 by construction: low-retry 는 high-retry 와 동일 신호 게이트를 공유하되
 * 정정률 상한(0.05)이 high-retry 하한(0.08)보다 낮아 동시 발화 불가. high-skill-variety 는
 * low-skill-variety 와 동일 eligibility 경로를 공유하되 다양성 하한(5)이 상한(1)보다 높아
 * 동시 발화 불가. 조건식을 그대로 재사용하므로 별도 else 없이 구조적으로 성립한다.
 */
export function buildPromptCoaching(growth: Stats['growth'], now: Date = new Date()): CoachingInsight[] {
  const insights: CoachingInsight[] = []
  const { retryStats, skillCurve } = growth
  const nowMonthKey = now.toISOString().slice(0, 7)  // toMonthKey 와 동일 UTC 축
  const eligibleCurve = skillCurve.filter((entry) => isEligibleMonth(entry, nowMonthKey))

  // 1. high-retry — 후속 질문 중 정정 비율이 높음
  if (
    retryStats.totalFollowups >= HIGH_RETRY_MIN_FOLLOWUPS &&
    retryStats.retryRate >= HIGH_RETRY_MIN_RATE
  ) {
    const top = retryStats.topMarkers[0]
    insights.push({
      id: 'high-retry',
      kind: 'tip',
      evidence: {
        retryRate: retryStats.retryRate,          // 0~1 분수 — % 변환은 UI에서 (lessons/_common.md L-5)
        retryCount: retryStats.retryCount,
        totalFollowups: retryStats.totalFollowups,
        topMarker: top ? top[0] : '',
        topMarkerCount: top ? top[1] : 0,
      },
    })
  }

  const latest = eligibleCurve.length > 0 ? eligibleCurve[eligibleCurve.length - 1] : null
  // hasClaudeSession 인 최근 eligible 월 — low-skill-variety(4)·high-skill-variety(7) 공유.
  // 두 룰이 반드시 같은 판정 월을 쓰도록 한 곳에서만 계산한다 (상호배타·드리프트 방지).
  const latestClaude = [...eligibleCurve].reverse().find((m) => m.hasClaudeSession)

  // 2. long-unstructured — 길지만 구조화 마커가 드묾 (proxy A raw)
  if (
    latest &&
    latest.avgWords >= LONG_PROMPT_MIN_AVG_WORDS &&
    latest.structured < LOW_STRUCTURED_MAX_RATE
  ) {
    insights.push({
      id: 'long-unstructured',
      kind: 'tip',
      evidence: {
        month: latest.month,
        avgWords: Math.round(latest.avgWords),
        structuredRate: latest.structured,        // 0~1 분수 — % 변환은 UI에서
      },
    })
  }

  // 3. short-prompts — 최근 유효 월 평균이 짧음
  if (latest && latest.avgWords < SHORT_PROMPT_MAX_AVG_WORDS) {
    insights.push({
      id: 'short-prompts',
      kind: 'tip',
      evidence: {
        month: latest.month,
        avgWords: Math.round(latest.avgWords),
      },
    })
  }

  // 4. low-skill-variety — hasClaudeSession 인 최근 eligible 월의 slash command 다양성 낮음 (유효 월 ≥ 2 필요)
  if (
    skillCurve.length >= LOW_SKILL_MIN_VALID_MONTHS &&
    latestClaude &&
    latestClaude.uniqueSkills <= LOW_SKILL_VARIETY_MAX
  ) {
    insights.push({
      id: 'low-skill-variety',
      kind: 'tip',
      evidence: {
        month: latestClaude.month,
        uniqueSkills: latestClaude.uniqueSkills,
      },
    })
  }

  // 5. improving (praise) — 첫 유효 월 대비 숙련도 곡선 상승.
  // 종점(last)은 마지막 eligible 월 — 며칠짜리 부분 달의 왜곡된 점수가 칭찬 근거가 되지 않게.
  if (skillCurve.length >= IMPROVING_MIN_VALID_MONTHS && latest) {
    const first = skillCurve[0]
    const last = latest
    if (last.score - first.score >= IMPROVING_MIN_SCORE_DELTA) {
      insights.push({
        id: 'improving',
        kind: 'praise',
        evidence: {
          firstMonth: first.month,
          lastMonth: last.month,
          scoreDeltaPp: Math.round((last.score - first.score) * 100),  // %p 정수
        },
      })
    }
  }

  // 6. low-retry (praise) — high-retry 와 동일 신호 게이트(충분한 follow-up)를 통과했지만
  // 정정률이 낮음. 조건식이 high-retry 와 배타적이라(0.05 < 0.08) 별도 else 불필요.
  if (
    retryStats.totalFollowups >= HIGH_RETRY_MIN_FOLLOWUPS &&
    retryStats.retryRate <= LOW_RETRY_MAX_RATE
  ) {
    insights.push({
      id: 'low-retry',
      kind: 'praise',
      evidence: {
        retryRate: retryStats.retryRate,          // 0~1 분수 — % 변환은 UI에서 (lessons/_common.md L-5)
        retryCount: retryStats.retryCount,
        totalFollowups: retryStats.totalFollowups,
      },
    })
  }

  // 7. high-skill-variety (praise) — low-skill-variety 와 동일 eligibility 경로(유효 월 ≥ 2
  // + 최근 eligible Claude 월)를 공유하되 다양성이 높음. 조건식이 low-skill-variety 와
  // 배타적이라(5 > 1) 별도 else 불필요.
  if (
    skillCurve.length >= LOW_SKILL_MIN_VALID_MONTHS &&
    latestClaude &&
    latestClaude.uniqueSkills >= HIGH_SKILL_VARIETY_MIN
  ) {
    insights.push({
      id: 'high-skill-variety',
      kind: 'praise',
      evidence: {
        month: latestClaude.month,
        uniqueSkills: latestClaude.uniqueSkills,
      },
    })
  }

  return insights.slice(0, MAX_INSIGHTS)
}
