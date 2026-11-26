import type { Session } from '../types'
import { cleanClaudeText } from './cleanClaudeText'

/**
 * 사용자가 직접 쓴 프롬프트만 추리기 — "사람이 어떻게 말하고 일하는가" 를 재는 축의 공용 입력.
 *
 * React 없는 순수 함수. 성격 카드(personality.ts)와 16유형(collabType16.ts)이 같은 선별을 공유한다
 * — 두 카드가 서로 다른 프롬프트 집합을 보면 판정이 어긋난다.
 *
 * 걸러내는 것 두 가지:
 *  1. Claude Code 가 끼워 넣은 문구 (명령 출력·알림·중단 표식) — 사용자의 말이 아니다.
 *  2. 스크립트가 보낸 자동 프롬프트 — 같은 긴 문장으로 시작하는 프롬프트가 여러 번 반복되면
 *     사람이 매번 친 게 아니라 템플릿이다. 실측 코퍼스에서 긴 프롬프트 1,359개 중 943개가
 *     이런 반복이었고, 그대로 두면 길이·어휘·세션당 턴 수가 전부 자동화 쪽으로 끌려간다.
 *     짧은 반복("계속", "커밋해줘")은 사람의 습관이라 건드리지 않는다.
 */

// ── 자동 프롬프트 판정 (모두 잠정값 — 실측 보정 전) ──────────────────────────
export const TEMPLATE_MIN_CHARS = 200   // 이보다 짧은 프롬프트는 반복돼도 사람의 말로 본다
export const TEMPLATE_HEAD_CHARS = 60   // 앞 이만큼이 같으면 같은 템플릿
export const TEMPLATE_MIN_REPEATS = 3   // 이만큼 반복되면 자동 프롬프트

export interface UserPromptCorpus {
  /** 세션별 사용자가 직접 쓴 프롬프트 — 입력 sessions 와 같은 인덱스 */
  bySession: string[][]
  /** 전체를 한 줄로 편 것 */
  prompts: string[]
}

export function collectUserPrompts(sessions: readonly Session[]): UserPromptCorpus {
  const candidates: string[][] = sessions.map((session) => {
    const texts: string[] = []
    for (const message of session.messages) {
      if (message.role !== 'user') continue
      const text = cleanClaudeText(message.text).text.trim()
      if (!text || text.startsWith('<') || text.startsWith('[Request interrupted')) continue
      texts.push(text)
    }
    return texts
  })

  const headCounts = new Map<string, number>()
  for (const texts of candidates) {
    for (const text of texts) {
      if (text.length < TEMPLATE_MIN_CHARS) continue
      const head = text.slice(0, TEMPLATE_HEAD_CHARS)
      headCounts.set(head, (headCounts.get(head) || 0) + 1)
    }
  }

  const isTemplated = (text: string): boolean =>
    text.length >= TEMPLATE_MIN_CHARS &&
    (headCounts.get(text.slice(0, TEMPLATE_HEAD_CHARS)) || 0) >= TEMPLATE_MIN_REPEATS

  const bySession = candidates.map((texts) => texts.filter((text) => !isTemplated(text)))
  return { bySession, prompts: bySession.flat() }
}
