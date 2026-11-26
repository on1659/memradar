import type { Session, SessionUsageSignals } from '../types'
import { getClaudePrice } from './tokenPricing'

/**
 * 사용 습관 코칭 — Session.usageSignals(요청 단위 집계)에서 "어떻게 쓰면 덜 새는가" 를 도출.
 *
 * React 없는 순수 함수 (promptCoaching.ts 패턴). LLM/네트워크 호출 없음.
 * 문자열 카피는 리턴하지 않는다 — 구조화된 evidence 만 리턴하고 ko/en 카피는
 * UI(UsageCoaching.tsx)에서 분기한다.
 *
 * 바넘 방지: 발화 조건이 충족될 때만 생성하고, 모든 인사이트는 실측 수치를 동반한다.
 * Claude 세션만 본다 — Codex 로그에는 요청 단위 캐시 정보가 없다.
 */

// ── 임계값 (모두 잠정값 — 실측 보정 전) ──────────────────────────────────────
export const IDLE_REBUILD_MIN_COUNT = 5          // 잠정값 — 우연한 한두 번은 습관이 아니다
export const IDLE_REBUILD_MIN_SHARE = 0.15       // 잠정값 — 캐시 쓰기 중 재작성 비중 (0~1 분수)
// 칭찬 룰 cache-continuity — idle-cache-rebuild 의 역상. 0.05 < IDLE_REBUILD_MIN_SHARE(0.15)
// 라 한 데이터가 두 룰을 동시 발화할 수 없다 (상호배타 by construction).
export const CACHE_CONTINUITY_MAX_SHARE = 0.05   // 잠정값 (0~1 분수)
export const MIN_REQUESTS = 200                  // 잠정값 — 비율 룰이 의미를 갖는 최소 요청 수
export const LARGE_CONTEXT_MIN_SHARE = 0.3       // 잠정값 — 큰 컨텍스트 요청 비중 (0~1 분수)
export const LIGHT_MIN_TOP_TIER_TURNS = 30       // 잠정값 — 최상위 모델 턴 최소 표본
export const LIGHT_TIP_MIN_SHARE = 0.25          // 잠정값 — 최상위 모델 턴 중 가벼운 턴 비중 (0~1 분수)
// 칭찬 룰 right-sized-model — top-tier-light-turns 의 역상. 0.1 < 0.25 라 동시 발화 불가.
export const LIGHT_PRAISE_MAX_SHARE = 0.1        // 잠정값 (0~1 분수)

/** 가장 비싼 축에 드는 모델 — 가벼운 일에 쓰면 아까운 쪽 */
export function isTopTierModel(model: string): boolean {
  return /fable|mythos|opus/i.test(model)
}

export type UsageCoachingInsightId =
  | 'idle-cache-rebuild'
  | 'large-context'
  | 'top-tier-light-turns'
  | 'cache-continuity'
  | 'right-sized-model'

export interface UsageCoachingInsight {
  id: UsageCoachingInsightId
  kind: 'tip' | 'praise'
  /** 카피에 삽입할 실측 수치만 — 프롬프트 원문·경로 인용 금지 */
  evidence: Record<string, number>
}

export interface UsageSignalTotals {
  /** usageSignals 가 있는 Claude 세션 수 */
  sessions: number
  requests: number
  contextTokens: number
  peakContextTokens: number
  largeContextRequests: number
  cacheWriteTokens: number
  idleRebuilds: number
  idleRebuildTokens: number
  /** 재작성 대신 캐시를 읽었다면 아꼈을 금액 (USD, API 단가 기준 하한 — 5분 TTL 쓰기 단가) */
  idleRebuildExtraUsd: number
  topTierTurns: number
  topTierLightTurns: number
}

type SignalBearingSession = Pick<Session, 'source'> & { usageSignals?: SessionUsageSignals }

/** 코퍼스 합산 — 세션별 신호를 더할 뿐 재계산하지 않는다 (집계는 파서가 병합 이전에 끝냈다) */
export function sumUsageSignals(sessions: readonly SignalBearingSession[]): UsageSignalTotals {
  const totals: UsageSignalTotals = {
    sessions: 0,
    requests: 0,
    contextTokens: 0,
    peakContextTokens: 0,
    largeContextRequests: 0,
    cacheWriteTokens: 0,
    idleRebuilds: 0,
    idleRebuildTokens: 0,
    idleRebuildExtraUsd: 0,
    topTierTurns: 0,
    topTierLightTurns: 0,
  }

  for (const session of sessions) {
    const signals = session.usageSignals
    if (session.source !== 'claude' || !signals) continue
    totals.sessions++
    totals.requests += signals.requests
    totals.contextTokens += signals.contextTokens
    totals.peakContextTokens = Math.max(totals.peakContextTokens, signals.peakContextTokens)
    totals.largeContextRequests += signals.largeContextRequests
    totals.cacheWriteTokens += signals.cacheWriteTokens

    for (const [model, entry] of Object.entries(signals.byModel)) {
      totals.idleRebuilds += entry.idleRebuilds
      totals.idleRebuildTokens += entry.idleRebuildTokens
      const price = getClaudePrice(model)
      totals.idleRebuildExtraUsd += (entry.idleRebuildTokens / 1_000_000) * (price.cacheWrite - price.cacheRead)
      if (isTopTierModel(model)) {
        totals.topTierTurns += entry.turns
        totals.topTierLightTurns += entry.lightTurns
      }
    }
  }

  return totals
}

/**
 * 우선순위순(push 순서 = 우선순위): tip 먼저(actionable), praise 나중.
 * idle-cache-rebuild → large-context → top-tier-light-turns → cache-continuity → right-sized-model.
 * 발화 조건 0개 또는 데이터 부족이면 빈 배열.
 */
export function buildUsageCoaching(sessions: readonly SignalBearingSession[]): UsageCoachingInsight[] {
  const insights: UsageCoachingInsight[] = []
  const t = sumUsageSignals(sessions)
  if (t.requests === 0) return insights

  const rebuildShare = t.cacheWriteTokens > 0 ? t.idleRebuildTokens / t.cacheWriteTokens : 0
  const largeShare = t.largeContextRequests / t.requests
  const lightShare = t.topTierTurns > 0 ? t.topTierLightTurns / t.topTierTurns : 0

  // 1. idle-cache-rebuild — 쉬었다 이어가며 캐시를 다시 쓴 양이 많음
  if (t.idleRebuilds >= IDLE_REBUILD_MIN_COUNT && rebuildShare >= IDLE_REBUILD_MIN_SHARE) {
    insights.push({
      id: 'idle-cache-rebuild',
      kind: 'tip',
      evidence: {
        count: t.idleRebuilds,
        tokens: t.idleRebuildTokens,
        share: rebuildShare,            // 0~1 분수 — % 변환은 UI에서
        extraUsd: t.idleRebuildExtraUsd,
      },
    })
  }

  // 2. large-context — 요청 대부분이 큰 대화를 통째로 싣고 감
  if (t.requests >= MIN_REQUESTS && largeShare >= LARGE_CONTEXT_MIN_SHARE) {
    insights.push({
      id: 'large-context',
      kind: 'tip',
      evidence: {
        largeShare,                     // 0~1 분수
        largeRequests: t.largeContextRequests,
        requests: t.requests,
        avgContextTokens: Math.round(t.contextTokens / t.requests),
        peakContextTokens: t.peakContextTokens,
      },
    })
  }

  // 3. top-tier-light-turns — 가벼운 턴을 최상위 모델로 자주 처리
  if (t.topTierTurns >= LIGHT_MIN_TOP_TIER_TURNS && lightShare >= LIGHT_TIP_MIN_SHARE) {
    insights.push({
      id: 'top-tier-light-turns',
      kind: 'tip',
      evidence: { lightTurns: t.topTierLightTurns, turns: t.topTierTurns, lightShare },
    })
  }

  // 4. cache-continuity (praise) — 충분히 썼는데 재작성 비중이 낮음.
  // 조건식이 idle-cache-rebuild 와 배타적이라(0.05 < 0.15) 별도 else 불필요.
  if (t.requests >= MIN_REQUESTS && t.cacheWriteTokens > 0 && rebuildShare <= CACHE_CONTINUITY_MAX_SHARE) {
    insights.push({
      id: 'cache-continuity',
      kind: 'praise',
      evidence: { count: t.idleRebuilds, share: rebuildShare, requests: t.requests },
    })
  }

  // 5. right-sized-model (praise) — 최상위 모델을 무거운 일에만 씀.
  // 조건식이 top-tier-light-turns 와 배타적이라(0.1 < 0.25) 별도 else 불필요.
  if (t.topTierTurns >= LIGHT_MIN_TOP_TIER_TURNS && lightShare <= LIGHT_PRAISE_MAX_SHARE) {
    insights.push({
      id: 'right-sized-model',
      kind: 'praise',
      evidence: { lightTurns: t.topTierLightTurns, turns: t.topTierTurns, lightShare },
    })
  }

  return insights
}
