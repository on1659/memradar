/**
 * styleSignals 타입 선언 — 구현(단일 소스)은 인접한 styleSignals.mjs.
 *
 * mjs/TS 경계 계약: cli/index.mjs 가 TypeScript 를 import 할 수 없으므로
 * 이 선언이 곧 네 파서(Claude·Codex × web·CLI)의 공유 스키마다
 * (usageSignals.d.mts / hookExtract.d.mts 전례).
 *
 * 구조적 프라이버시: 방출값은 **정수뿐**이다. 정적 임베드가 Session 전체를 직렬화하므로
 * 타입이 곧 방어선이다. 프롬프트·답 본문이나 경로를 담는 필드를 추가하지 말 것.
 */

/** T/F 축이 보는 상황 — 사용자가 드러낸 감정·반응 */
export type StyleCue = 'frustration' | 'joy' | 'thanks' | 'correction' | 'worry'

/** 세션 1건의 AI 협업 스타일 신호 — 사람이 직접 연 세션에만 붙는다 */
export interface SessionStyleSignals {
  /** AI 가 답하거나 도구를 쓴 사용자 요청 수 */
  turns: number
  /** 그중 에이전트를 부른 요청 */
  agentTurns: number
  /** 글로 끝난 요청 수 (최종 답이 있는 요청) */
  answers: number
  /** 최종 답이 질문·선택지로 끝난 요청 */
  askEndings: number
  /** 최종 답에 추측 표현이 든 요청 */
  guessAnswers: number
  /** 최종 답에 확인 표현이 든 요청 */
  verifiedAnswers: number
  /** 사용자가 감정·반응을 드러낸 요청 (상황이 겹쳐도 한 번) */
  cuedTurns: number
  /** 그중 답 첫머리에서 받아 준 요청 */
  cuedReceived: number
  /** 상황별 [드러난 요청 수, 그중 받아 준 수] — 한 요청이 여러 상황에 들 수 있다 */
  cues: Record<StyleCue, [number, number]>
}

export declare const CUE_PROMPT_MAX_CHARS: number
export declare const RECEIVE_HEAD_CHARS: number
export declare const ASK_TAIL_CHARS: number

export interface StyleSignalCollector {
  /** 파서의 raw 라인 루프에서 매 라인 호출 (Claude 는 isMeta/isSidechain 가드 직후) */
  collect(raw: unknown): void
  /** 스크립트·에이전트가 연 세션이거나 AI 가 답한 요청이 없으면 undefined */
  finalize(): SessionStyleSignals | undefined
}

export declare function createStyleSignalCollector(source: 'claude' | 'codex'): StyleSignalCollector
