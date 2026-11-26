/**
 * usageSignals 타입 선언 — 구현(단일 소스)은 인접한 usageSignals.mjs.
 *
 * mjs/TS 경계 계약: cli/index.mjs 가 TypeScript 를 import 할 수 없으므로
 * 이 선언이 곧 두 파서(src/parser.ts, cli/index.mjs)의 공유 스키마다
 * (modelAttribution.d.mts / hookExtract.d.mts 전례).
 *
 * 구조적 프라이버시: 방출값에는 식별자·본문이 존재하지 않는다 — 결과는
 * **모델명 → 정수** 와 세션 단위 정수뿐이다. 정적 임베드가 Session 전체를
 * 직렬화하므로 타입이 곧 방어선이다. requestId/경로/프롬프트를 담는 필드를 추가하지 말 것.
 */

/** 모델별 턴·캐시 재작성 집계 */
export interface UsageModelSignals {
  /** 응답이 한 번이라도 있었던 사용자 턴 수 (턴의 첫 응답 모델에 귀속) */
  turns: number
  /** 그중 가벼운 턴 — 출력이 짧고 도구도 거의 안 쓴 턴 */
  lightTurns: number
  /** 쉬었다 이어간 뒤 캐시를 다시 쓴 요청 수 */
  idleRebuilds: number
  /** 그 요청들이 캐시에 다시 쓴 토큰 합 */
  idleRebuildTokens: number
}

/** 세션 1건의 사용 습관 신호 — Claude 세션 전용 (Codex 로그에는 요청 단위 캐시 정보가 없다) */
export interface SessionUsageSignals {
  /** usage 가 기록된 distinct 응답 수 */
  requests: number
  /** 요청당 컨텍스트(input + 캐시 쓰기 + 캐시 읽기) 합 — 평균은 requests 로 나눈다 */
  contextTokens: number
  /** 요청 한 번에 실린 최대 컨텍스트 */
  peakContextTokens: number
  /** 컨텍스트가 LARGE_CONTEXT_TOKENS 를 넘은 요청 수 */
  largeContextRequests: number
  /** 캐시 쓰기 토큰 합 (요청 단위 중복 제거) — 재작성 비중의 분모 */
  cacheWriteTokens: number
  /** 모델명 오름차순 */
  byModel: Record<string, UsageModelSignals>
}

export declare const LARGE_CONTEXT_TOKENS: number
export declare const IDLE_GAP_MS: number
export declare const REBUILD_MIN_PREV_CACHED: number
export declare const REBUILD_MAX_READ_RATIO: number
export declare const REBUILD_MIN_CONTEXT_RATIO: number
export declare const LIGHT_TURN_MAX_OUTPUT: number
export declare const LIGHT_TURN_MAX_TOOLS: number

export interface UsageSignalCollector {
  /** 파서의 raw 라인 루프에서 isMeta/isSidechain 가드 직후 매 라인 호출 */
  collect(raw: unknown): void
  /** usage 가 있는 응답이 없으면 undefined — 소비처는 absent 를 no-data 로 관용 처리 */
  finalize(): SessionUsageSignals | undefined
}

export declare function createUsageSignalCollector(): UsageSignalCollector
