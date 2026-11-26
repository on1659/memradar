/**
 * usageSignals (web 측 진입점)
 *
 * 단일 소스는 cli/lib/usageSignals.mjs — 재작성·가벼운 턴 판정은 두 파서가
 * 같은 숫자를 내야 하므로(정적·서버·업로드 세 경로) web/CLI 이중 유지를 금한다.
 * src 쪽 소비자는 전부 이 모듈을 거쳐 import 한다 (modelAttribution.ts / hookExtract.ts 전례).
 */
export {
  createUsageSignalCollector,
  LARGE_CONTEXT_TOKENS,
  IDLE_GAP_MS,
  REBUILD_MIN_PREV_CACHED,
  REBUILD_MAX_READ_RATIO,
  REBUILD_MIN_CONTEXT_RATIO,
  LIGHT_TURN_MAX_OUTPUT,
  LIGHT_TURN_MAX_TOOLS,
} from '../../cli/lib/usageSignals.mjs'
export type {
  UsageModelSignals,
  SessionUsageSignals,
  UsageSignalCollector,
} from '../../cli/lib/usageSignals.mjs'
