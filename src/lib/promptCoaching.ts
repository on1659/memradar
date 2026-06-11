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
export const HIGH_RETRY_MIN_RATE = 0.15      // 잠정값 — 실측 보정 전 (0~1 분수)
export const LONG_PROMPT_MIN_AVG_WORDS = 50  // 잠정값 — 실측 보정 전
export const LOW_STRUCTURED_MAX_RATE = 0.1   // 잠정값 — 실측 보정 전 (0~1 분수)
export const SHORT_PROMPT_MAX_AVG_WORDS = 10 // 잠정값 — 실측 보정 전
export const LOW_SKILL_VARIETY_MAX = 1       // 잠정값 — 실측 보정 전
export const LOW_SKILL_MIN_VALID_MONTHS = 2  // 잠정값 — 실측 보정 전
export const IMPROVING_MIN_VALID_MONTHS = 3  // 잠정값 — 실측 보정 전
export const IMPROVING_MIN_SCORE_DELTA = 0.1 // 잠정값 — 실측 보정 전 (0~1 스코어 차)
export const MAX_INSIGHTS = 3

export type CoachingInsightId =
  | 'high-retry'
  | 'long-unstructured'
  | 'short-prompts'
  | 'low-skill-variety'
  | 'improving'

export interface CoachingInsight {
  id: CoachingInsightId
  kind: 'tip' | 'praise'
  /** 카피에 삽입할 실측 수치만 — 사용자 프롬프트 원문 인용 금지 (시크릿 마스킹 표면 방지) */
  evidence: Record<string, number | string>
}

/**
 * 우선순위순(high-retry → long-unstructured → short-prompts → low-skill-variety → improving)
 * 최대 MAX_INSIGHTS 개. 발화 조건 0개 또는 데이터 부족이면 빈 배열.
 */
export function buildPromptCoaching(growth: Stats['growth']): CoachingInsight[] {
  const insights: CoachingInsight[] = []
  const { retryStats, skillCurve } = growth

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

  const latest = skillCurve.length > 0 ? skillCurve[skillCurve.length - 1] : null

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

  // 4. low-skill-variety — hasClaudeSession 인 최근 월의 slash command 다양성 낮음 (유효 월 ≥ 2 필요)
  if (skillCurve.length >= LOW_SKILL_MIN_VALID_MONTHS) {
    const latestClaude = [...skillCurve].reverse().find((m) => m.hasClaudeSession)
    if (latestClaude && latestClaude.uniqueSkills <= LOW_SKILL_VARIETY_MAX) {
      insights.push({
        id: 'low-skill-variety',
        kind: 'tip',
        evidence: {
          month: latestClaude.month,
          uniqueSkills: latestClaude.uniqueSkills,
        },
      })
    }
  }

  // 5. improving (praise) — 첫 유효 월 대비 숙련도 곡선 상승
  if (skillCurve.length >= IMPROVING_MIN_VALID_MONTHS) {
    const first = skillCurve[0]
    const last = skillCurve[skillCurve.length - 1]
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

  return insights.slice(0, MAX_INSIGHTS)
}
