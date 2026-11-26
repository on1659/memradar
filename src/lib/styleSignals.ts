/**
 * styleSignals (web 측 진입점)
 *
 * 단일 소스는 cli/lib/styleSignals.mjs — 정적·서버·업로드 세 경로가 같은 숫자를 내야 하므로
 * web/CLI 이중 유지를 금한다. src 쪽 소비자는 전부 이 모듈을 거쳐 import 한다
 * (usageSignals.ts / hookExtract.ts 전례).
 */
export {
  createStyleSignalCollector,
  CUE_PROMPT_MAX_CHARS,
  RECEIVE_HEAD_CHARS,
  ASK_TAIL_CHARS,
} from '../../cli/lib/styleSignals.mjs'
export type {
  StyleCue,
  SessionStyleSignals,
  StyleSignalCollector,
} from '../../cli/lib/styleSignals.mjs'
