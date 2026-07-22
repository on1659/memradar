/**
 * hookExtract (web 측 진입점)
 *
 * 단일 소스는 cli/lib/hookExtract.mjs — 카운팅 시맨틱(실행 identity,
 * Stop 정합, denial 추출)은 실측 코퍼스로 검증된 로직이라 web/CLI 이중
 * 유지 시 드리프트가 곧 집계 버그가 된다. src 쪽 소비자는 전부 이 모듈을
 * 거쳐 import 한다 (secretMask.ts 전례).
 */
export { createHookCollector, commandDigest, asciiSkeleton, HOOK_DENIAL_RE } from '../../cli/lib/hookExtract.mjs'
export type {
  HookOutcome,
  HookOutcomeCounts,
  HookSummaryRow,
  SessionHookSummary,
  HookExecutionDetail,
  HookCollector,
  HookCollectorResult,
} from '../../cli/lib/hookExtract.mjs'
