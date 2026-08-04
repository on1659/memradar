/**
 * modelAttribution (web 측 진입점)
 *
 * 단일 소스는 cli/lib/modelAttribution.mjs — 귀속 시맨틱(응답 단위 정의,
 * `<synthetic>` 배제, dominant 파생)은 실측 코퍼스로 검증된 로직이라
 * web/CLI 이중 유지 시 드리프트가 곧 집계 버그가 된다. 파서가 두 벌이고
 * npx 기본 경로(정적)와 서버 light 캐시는 CLI 파서를 쓰기 때문에, 이 모듈을
 * 거치지 않으면 정적·서버·업로드 세 경로가 서로 다른 숫자를 낸다.
 * src 쪽 소비자는 전부 이 모듈을 거쳐 import 한다 (hookExtract.ts / secretMask.ts 전례).
 */
export {
  SYNTHETIC_MODEL,
  isAggregatableModel,
  createModelResponseCounter,
  dominantModel,
  modelsByUsage,
  isMixedModel,
  approximateModelResponses,
  displayModel,
  displayModels,
  displayModelCounts,
  sumModelResponses,
  switchReasonCounts,
  SWITCH_REASON_USAGE_LIMIT,
  SWITCH_REASON_CONTEXT_OVERFLOW,
} from '../../cli/lib/modelAttribution.mjs'
export type {
  ModelResponseCounts,
  ModelResponseCounter,
  ModelBearingMessage,
  ModelBearingSession,
  SwitchReasonId,
} from '../../cli/lib/modelAttribution.mjs'
