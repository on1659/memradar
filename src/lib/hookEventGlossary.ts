/**
 * 훅 이벤트 용어 사전 — "Stop 훅이 뭔데?"에 답하는 정적 설명.
 *
 * Claude Code 의 훅 이벤트는 고정 어휘라 이벤트 **시점**의 의미는 항상 설명할 수 있다.
 * 반면 그 훅이 구체적으로 무엇을 하는지는 명령 내용에 달렸는데, light/정적 모드에는
 * 구조적 프라이버시로 명령 원문이 없고(commandKey = 비가역 다이제스트) 서버 tier-2
 * 펼침에서만 보인다 — 그래서 이 사전은 이벤트 의미까지만 책임지고, 명령 동작은
 * 넘겨짚지 않는다.
 *
 * React 없는 순수 데이터 (modelNames.ts 패턴). 카피는 ko/en 둘 다 여기서 제공하고
 * 선택은 UI 가 한다.
 */

export interface HookEventGloss {
  ko: string
  en: string
}

const GLOSSARY: Record<string, HookEventGloss> = {
  PreToolUse: {
    ko: 'Claude가 도구(Bash·Edit 등)를 실행하기 직전에 개입해요. 명령을 검사해서 허용하거나 차단할 수 있어요.',
    en: 'Runs just before Claude executes a tool (Bash, Edit, …). Can inspect the call and allow or deny it.',
  },
  PostToolUse: {
    ko: '도구 실행이 끝난 직후에 실행돼요. 결과를 검사하거나 후처리(포맷팅·알림 등)를 붙일 수 있어요.',
    en: 'Runs right after a tool finishes. Can inspect results or attach post-processing.',
  },
  UserPromptSubmit: {
    ko: '내가 메시지를 보내는 순간 실행돼요. 프롬프트를 검사하거나 컨텍스트를 덧붙일 수 있어요.',
    en: 'Runs when you submit a message. Can inspect the prompt or inject extra context.',
  },
  Stop: {
    ko: 'Claude가 응답을 끝내려는 시점에 실행돼요. 마무리 검사를 하거나, 조건이 안 맞으면 작업을 더 시킬 수 있어요.',
    en: 'Runs when Claude is about to finish responding. Can run final checks or demand more work.',
  },
  SubagentStop: {
    ko: '서브에이전트(배경 작업)가 끝날 때 실행돼요.',
    en: 'Runs when a subagent (background task) finishes.',
  },
  SessionStart: {
    ko: '세션이 시작될 때 한 번 실행돼요. 초기 컨텍스트 주입 등에 쓰여요.',
    en: 'Runs once when a session starts — often used to inject initial context.',
  },
  SessionEnd: {
    ko: '세션이 끝날 때 실행돼요. 정리 작업에 쓰여요.',
    en: 'Runs when a session ends — used for cleanup.',
  },
  Notification: {
    ko: 'Claude Code가 알림을 보낼 때(권한 요청·입력 대기 등) 실행돼요.',
    en: 'Runs when Claude Code sends a notification (permission request, waiting for input, …).',
  },
  PreCompact: {
    ko: '대화 컨텍스트를 압축(요약)하기 직전에 실행돼요.',
    en: 'Runs just before the conversation context is compacted (summarized).',
  },
  PermissionRequest: {
    ko: 'Claude가 권한 확인을 요청할 때 실행돼요. 허용/거부 결정에 개입할 수 있어요.',
    en: 'Runs when Claude asks for permission. Can intervene in the allow/deny decision.',
  },
}

/**
 * 이벤트 설명 — 사전에 없는 이벤트는 시점만 사실대로 말하는 일반 문구로 폴백.
 * (훅은 워낙 다양해서 모든 이벤트를 알 수 없다 — 모르는 것을 아는 척하지 않는다.)
 */
export function hookEventGloss(event: string, locale: 'ko' | 'en' = 'ko'): string {
  const known = GLOSSARY[event]
  if (known) return known[locale]
  return locale === 'ko'
    ? `"${event}" 시점에 실행되도록 설정된 훅이에요. 구체적 동작은 훅 명령에 따라 달라요.`
    : `A hook configured to run at "${event}". What it does depends on its command.`
}

/** 사전에 정의된 이벤트인가 — UI 가 "일반 설명" 뱃지 여부를 가릴 때 사용 */
export function isKnownHookEvent(event: string): boolean {
  return event in GLOSSARY
}
