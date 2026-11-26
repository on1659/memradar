import type { Type16Letter, Type16Source } from '../lib/collabType16'

/**
 * "내 AI" 16유형의 화면 카피 — 대시보드 카드(CollabType16Card)와 코드 리포트 공유 카드(ShareSlide)가 같이 쓴다.
 * 판정은 src/lib/collabType16.ts 가 글자와 수치로만 내고, 사람에게 보이는 말은 여기서 붙인다.
 */

export const SOURCE_NAME: Record<Type16Source, string> = { claude: 'Claude', codex: 'Codex' }

/** 16유형 별명 [ko, en] — AI가 일하는 모습으로 붙인 이름표. 근거는 아래 축별 수치가 댄다. */
export const NICKNAMES: Record<string, [string, string]> = {
  ISTJ: ['꼼꼼한 검수관', 'The Meticulous Inspector'],
  ISFJ: ['다정한 관리인', 'The Caring Keeper'],
  INFJ: ['조용한 설계가', 'The Quiet Visionary'],
  INTJ: ['큰 그림 전략가', 'The Big-Picture Strategist'],
  ISTP: ['손 빠른 해결사', 'The Quick Fixer'],
  ISFP: ['감각 좋은 장인', 'The Hands-On Artisan'],
  INFP: ['이야기하는 몽상가', 'The Storytelling Dreamer'],
  INTP: ['파고드는 탐구자', 'The Deep Explorer'],
  ESTP: ['일단 해 보는 돌격대', 'The Try-It-First Sprinter'],
  ESFP: ['신나는 실험가', 'The Playful Experimenter'],
  ENFP: ['아이디어 불꽃', 'The Idea Spark'],
  ENTP: ['판을 흔드는 발명가', 'The Restless Inventor'],
  ESTJ: ['프로젝트 지휘관', 'The Project Commander'],
  ESFJ: ['든든한 살림꾼', 'The Team Steward'],
  ENFJ: ['방향을 잡는 리더', 'The Direction Setter'],
  ENTJ: ['여러 판의 총괄', 'The Multi-Front Director'],
}

/** 네 글자가 모두 판정됐을 때만 별명을 붙인다 — 보류한 축이 있으면 "아직 알아가는 중" */
export function type16Nickname(code: string, isKorean: boolean): string {
  const nickname = NICKNAMES[code]
  if (nickname) return nickname[isKorean ? 0 : 1]
  return isKorean ? '아직 알아가는 중' : 'Still taking shape'
}

/** 축 양 끝 라벨 [ko, en] — 관측한 행동으로만 말한다 */
export const POLE_LABEL: Record<Type16Letter, [string, string]> = {
  I: ['혼자 끝까지', 'Works alone'],
  E: ['에이전트에게 나눠서', 'Hands off to agents'],
  S: ['확인한 것으로', 'From what it checked'],
  N: ['짐작과 가능성으로', 'From hunches'],
  T: ['해결부터', 'Fix first'],
  F: ['마음부터', 'Feelings first'],
  P: ['질문·선택지로 열어 둠', 'Leaves it open'],
  J: ['결론 내리고 끝냄', 'Closes with a decision'],
}
