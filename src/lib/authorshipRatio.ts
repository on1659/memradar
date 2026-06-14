import type { Session } from '../types'
import { stripMarkup, countWords } from '../parser'

/**
 * 나 vs AI 글 비중 — 내가 쓴 글과 AI가 쓴 글의 분량 비율.
 *
 * React 없는 순수 함수 (codingRhythm.ts / languageProfile.ts 패턴). LLM/네트워크 호출 없음.
 * 분수는 0~1 raw — % 변환은 UI(Dashboard.tsx)에서 (lessons/_common.md L-5).
 * 단정 아님 — 메시지 텍스트의 단어 수 비율이라는 사실 수치만 리턴한다.
 *
 * "글 비중"은 **역할별 단어 수**로 잰다 — 토큰(input/output)은 캐시 read·사용자 메시지의
 * 컨텍스트 추정치(전체 히스토리 재투입)가 섞여 "내가 쓴 글"과 무관해진다(입력 토큰이 캐시로
 * 부풀려져 99:1 같은 가짜 비율이 나옴). 단어 수는 user/assistant 메시지 본문에서 직접 세므로
 * "누가 더 많이 썼나"를 정직하게 반영한다. stripMarkup 으로 마크다운/코드펜스 기호는 제거.
 *
 * 합 0이면 share 0(0분모 가드) — 호출부가 합으로 빈상태를 판정한다.
 */

export interface AuthorshipRatio {
  /** 내가 쓴(user 메시지) 단어 수 */
  userWords: number
  /** AI가 쓴(assistant 메시지) 단어 수 */
  aiWords: number
  /** userWords / (userWords+aiWords), 0~1 raw — 합 0이면 0 */
  userShare: number
  /** aiWords / (userWords+aiWords), 0~1 raw — 합 0이면 0 */
  aiShare: number
}

/**
 * 세션들의 user/assistant 메시지 단어 수를 합산해 나 vs AI 글 비중을 산출.
 * 합 0이면 share 0 (호출부 빈상태) — 0 나누기 방지.
 */
export function buildAuthorshipRatio(sessions: Session[]): AuthorshipRatio {
  let userWords = 0
  let aiWords = 0
  for (const session of sessions) {
    for (const msg of session.messages) {
      if (msg.role !== 'user' && msg.role !== 'assistant') continue
      const words = countWords(stripMarkup(msg.text))
      if (msg.role === 'user') userWords += words
      else aiWords += words
    }
  }
  const sum = userWords + aiWords
  return {
    userWords,
    aiWords,
    userShare: sum > 0 ? userWords / sum : 0,
    aiShare: sum > 0 ? aiWords / sum : 0,
  }
}
