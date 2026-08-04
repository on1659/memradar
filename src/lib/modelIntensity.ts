import type { Session } from '../types'
import { displayModel } from './modelAttribution'

/**
 * 모델별 사용 강도 — 세션을 **주 사용 모델(dominant)** 로 그룹화한 뒤 세션당 user 턴 수·토큰 수의 평균.
 *
 * React 없는 순수 함수 (codingRhythm.ts / languageProfile.ts 패턴). LLM/네트워크 호출 없음.
 * 문자열 카피는 리턴하지 않는다 — 모델 raw 이름 + 수치만 리턴하고, shortModelName 단축·
 * ko/en 카피는 UI(Dashboard.tsx)에서 분기한다.
 *
 * "어떤 모델엔 길게 쓰나" — 모델별 평균 턴/토큰으로 사용 강도를 비교한다.
 * 세션 0 / 모델 미상(빈 문자열) 가드. 분수가 아니라 raw 평균(턴·토큰)이므로 % 변환 대상 아님.
 */

/** 세션 1건의 토큰 합 — Dashboard 의 getSessionTotalTokens 와 동일 공식 (input+output+cachedInput) */
function sessionTotalTokens(session: Session): number {
  return session.totalTokens.input + session.totalTokens.output + (session.totalTokens.cachedInput || 0)
}

/** 세션 1건의 user 턴 수 — messageCount.user 우선, 없으면 user 메시지 카운트로 폴백 */
function sessionUserTurns(session: Session): number {
  if (typeof session.messageCount?.user === 'number') return session.messageCount.user
  return session.messages.reduce((count, msg) => (msg.role === 'user' ? count + 1 : count), 0)
}

export interface ModelIntensity {
  /** 모델 raw 이름 — shortModelName 단축은 UI */
  model: string
  sessionCount: number
  /** 세션당 평균 user 턴 수 raw */
  avgUserTurns: number
  /** 세션당 평균 토큰 수 raw */
  avgTokens: number
}

/**
 * 세션을 dominant 모델별로 그룹화해 세션당 평균 user 턴·토큰을 산출. 세션 수 내림차순 정렬 후 상위 limit.
 * 모델 미상인 세션은 제외 (의미 있는 비교 대상 아님). 세션 0이면 빈 배열.
 * 혼합 세션은 주 사용 모델 한 곳에만 계상된다 — 그래야 카드가 인쇄하는 "세션 N개" 합이
 * 총 세션 수를 넘지 않는다 (중복 계상 시 라벨이 거짓이 됨).
 */
export function buildModelIntensity(sessions: Session[], limit = 5): ModelIntensity[] {
  const groups = new Map<string, { sessionCount: number; totalTurns: number; totalTokens: number }>()

  for (const session of sessions) {
    // 그룹 키만 dominant 로 교체한다 (카드 스코프는 세션 그대로).
    // 응답 단위로 재키잉하면 avgUserTurns 의 분모가 사라지고(user 턴은 어떤 모델에도
    // 귀속되지 않는다) 혼합 세션이 중복 계상돼 카드가 인쇄하는 "세션 N개" 합이
    // 총 세션 수를 넘어 라벨이 거짓이 된다. first/last-wins 오귀속만 제거한다.
    const model = displayModel(session)
    if (!model) continue
    const group = groups.get(model) ?? { sessionCount: 0, totalTurns: 0, totalTokens: 0 }
    group.sessionCount++
    group.totalTurns += sessionUserTurns(session)
    group.totalTokens += sessionTotalTokens(session)
    groups.set(model, group)
  }

  return [...groups.entries()]
    .map(([model, group]) => ({
      model,
      sessionCount: group.sessionCount,
      avgUserTurns: group.sessionCount > 0 ? group.totalTurns / group.sessionCount : 0,
      avgTokens: group.sessionCount > 0 ? group.totalTokens / group.sessionCount : 0,
    }))
    .sort((a, b) => b.sessionCount - a.sessionCount || b.avgTokens - a.avgTokens)
    .slice(0, limit)
}
