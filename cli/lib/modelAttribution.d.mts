/**
 * modelAttribution 타입 선언 — 구현(단일 소스)은 인접한 modelAttribution.mjs.
 *
 * mjs/TS 경계 계약: cli/index.mjs 가 TypeScript 를 import 할 수 없으므로
 * 이 선언이 곧 두 파서(src/parser.ts, cli/index.mjs)의 공유 스키마다
 * (hookExtract.d.mts 전례, docs/ARCHITECTURE.md:171).
 *
 * 구조적 프라이버시: 이 모듈이 방출하는 값에는 식별자가 존재하지 않는다 —
 * responseId 는 중복 제거 키로만 소비되고 결과는 **모델명 → 정수** 뿐이다.
 * 정적 임베드가 Session 전체를 직렬화하므로 타입이 곧 방어선이다.
 * requestId/uuid/경로를 담는 필드를 절대 추가하지 말 것.
 */

/** 세션이 모델별로 몇 개의 **응답**을 냈는지 — 응답 수 내림차순, 동수면 모델명 오름차순 */
export type ModelResponseCounts = Record<string, number>

/** 집계에서 배제하는 모델 값 — 중단·한도초과 시 Claude Code 가 남기는 시스템 응답 */
export declare const SYNTHETIC_MODEL: '<synthetic>'

/**
 * 모델 축(집계·배지·차트·facet)에 올릴 수 있는 값인가 — 단일 술어.
 * `<synthetic>` 은 파싱·트랜스크립트 렌더에서는 유지하고 여기서만 배제한다.
 */
export declare function isAggregatableModel(model: unknown): model is string

export interface ModelResponseCounter {
  /**
   * 파서의 **병합 이전** raw 라인 루프에서 호출.
   * @param model 원본 라인의 모델명 (없거나 `<synthetic>` 이면 무시)
   * @param responseId Claude 는 `requestId`, Codex 는 null — 같은 응답의 추가 라인을 접는다
   */
  add(model: string | undefined | null, responseId?: string | null): void
  /** 비어 있으면 undefined — 소비처는 absent 를 no-data 로 관용 처리 */
  finalize(): ModelResponseCounts | undefined
}

export declare function createModelResponseCounter(): ModelResponseCounter

/**
 * 최다 응답 모델 — 동수면 모델명 오름차순으로 결정적.
 * `Session.model` 을 대체하지 않는다 (그쪽은 의미 동결 — 가격 폴백·export·검색 필터가 읽는다).
 */
export declare function dominantModel(modelResponses?: ModelResponseCounts): string | undefined

/** 응답 수 내림차순 모델 목록 — 배지의 모델명 나열용 (실측 세션당 최대 3종) */
export declare function modelsByUsage(modelResponses?: ModelResponseCounts): string[]

/** 실제로 2종 이상 모델을 쓴 세션인가 */
export declare function isMixedModel(modelResponses?: ModelResponseCounts): boolean

/** approximateModelResponses 가 읽는 최소 구조 — ParsedMessage 의 부분집합 */
export interface ModelBearingMessage {
  role: 'user' | 'assistant'
  model?: string
  models?: string[]
  text?: string
}

/** 모델 전환 사유 분류 id — 카피는 UI 가 만든다 */
export declare const SWITCH_REASON_USAGE_LIMIT: 'usage-limit'
export declare const SWITCH_REASON_CONTEXT_OVERFLOW: 'context-overflow'
export type SwitchReasonId = 'usage-limit' | 'context-overflow'

/**
 * 모델 전환 사유를 분류별로 집계. 원문(타임존·리셋 시각 포함)은 방출하지 않는다.
 * 병합 후에도 동작하도록 model 이 아니라 본문으로 판정한다.
 */
export declare function switchReasonCounts(
  messages: readonly ModelBearingMessage[] | undefined
): Partial<Record<SwitchReasonId, number>>

/**
 * 병합 블록 근사 폴백 — `modelResponses` 부재 시에만.
 * 블록 단위라 응답 단위보다 부정확하다(모델별 최대 3.76배 편향) — 배지 표시 전용,
 * 통계 산출에 쓰지 말 것.
 */
export declare function approximateModelResponses(
  messages: readonly ModelBearingMessage[] | undefined
): ModelResponseCounts | undefined

/** displayModel/displayModels/displayModelCounts 가 읽는 최소 구조 — Session 의 부분집합 */
export interface ModelBearingSession {
  model?: string
  modelResponses?: ModelResponseCounts
  messages?: readonly ModelBearingMessage[]
}

/** 표시용 모델별 응답 수 — modelResponses 우선, 없으면 블록 근사 폴백 */
export declare function displayModelCounts(
  session: ModelBearingSession | undefined
): ModelResponseCounts | undefined

/**
 * 화면에 표시할 대표 모델 — 배지·라벨의 단일 규칙.
 * `<synthetic>` 은 어느 경로로도 반환되지 않는다. 소비처는 문자열 비교를 직접 하지 말 것.
 */
export declare function displayModel(session: ModelBearingSession | undefined): string | undefined

/** 표시용 모델 목록 (응답 수 내림차순) — 세션 모델 구성 배지용 */
export declare function displayModels(session: ModelBearingSession | undefined): string[]

/**
 * 여러 세션의 모델별 응답 수 합산 — 코퍼스 단위 랭킹(Stats.modelResponses·대시보드 도넛)의 단일 정의.
 * 세션당 1표가 아니라 응답 수를 더한다.
 */
export declare function sumModelResponses(
  sessions: readonly ModelBearingSession[] | undefined
): ModelResponseCounts
