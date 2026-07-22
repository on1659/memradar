/**
 * hookExtract 타입 선언 — 구현(단일 소스)은 인접한 hookExtract.mjs.
 *
 * mjs/TS 경계 계약 (docs/goal/hooks-analytics.md D1):
 * plain-JS collector 가 완전한 summary 형태를 방출하고, TS 쪽
 * `buildHookStats` 는 `Session.hookSummary` 만 소비한다 (raw 레코드
 * 재해석 금지) — cli/index.mjs 가 TypeScript 를 import 할 수 없으므로
 * 이 선언이 곧 두 파서의 공유 스키마다.
 *
 * 구조적 프라이버시: `HookSummaryRow` 에는 command/stdout/stderr/content
 * 필드가 존재하지 않는다 — 정적 임베드가 Session 전체를 직렬화하므로
 * 타입이 곧 방어선이다. 절대 추가 금지.
 */

/** 터미널 실행 결과 5종 — 동반 레코드(system_message/additional_context)는 실행이 아니다 */
export type HookOutcome = 'success' | 'denied' | 'blocking_error' | 'non_blocking_error' | 'cancelled'

export interface HookOutcomeCounts {
  success: number
  denied: number
  blockingError: number
  nonBlockingError: number
  /** 사용자 중단 등 타임아웃 아닌 취소 */
  cancelled: number
  /** hook_cancelled.timedOut===true — cancelled 와 구분 집계 (진단 분리) */
  timedOut: number
  /** stop_hook_summary hookInfos 중 attachment 미귀속분 — denied/failure 합계 제외 */
  summaryOnly: number
}

/** 페이로드 없는 세션 단위 훅 집계 행 — command/stdout/stderr/content 필드 금지 */
export interface HookSummaryRow {
  hookName: string
  hookEvent: string
  /** sha256-8 비가역 다이제스트, 귀속 불가 시 'unknown' */
  commandKey: string
  counts: HookOutcomeCounts
  durationMsSum: number
  durationMsCount: number
  lastSeen: string
  hasSystemMessage: boolean
  additionalContextCount: number
  /** ASCII 스켈레톤 귀속에서 원문≠스켈레톤 (cp949 mojibake 등) */
  encodingDamaged?: boolean
}

/** Session.hookSummary — tier-1, 전 모드 공통. 훅 레코드가 없으면 필드 자체가 없다 */
export interface SessionHookSummary {
  rows: HookSummaryRow[]
  firstSeen: string
  lastSeen: string
}

/**
 * tier-2 실행 상세 (서버 heavy parse 전용).
 * 절대 Session 에 할당 금지 — SessionView 로컬 상태로만 보관.
 */
export interface HookExecutionDetail {
  hookName: string
  hookEvent: string
  commandKey: string
  command: string
  outcome: HookOutcome
  exitCode?: number
  durationMs?: number
  timedOut?: boolean
  timestamp: string
  toolUseID: string
  stdout?: string
  stderr?: string
  additionalContext?: string[]
}

export interface HookCollectorResult {
  summary?: SessionHookSummary
  executions?: HookExecutionDetail[]
}

export interface HookCollector {
  /** 파서 라인 루프에서 role-drop 가드 직전 매 라인 호출 (레코드 단위 fail-soft) */
  collect(raw: unknown): void
  /** 루프 종료 후 1회 — summary 는 훅 레코드 존재 시에만, executions 는 includeDetail 시에만 */
  finalize(): HookCollectorResult
}

export interface CreateHookCollectorOptions {
  /** true(서버 tier-2)일 때만 executions 반환 + stdout/stderr/additionalContext 캡처 */
  includeDetail?: boolean
}

export declare function createHookCollector(opts?: CreateHookCollectorOptions): HookCollector

/** 커맨드 문자열의 sha256 앞 8 hex — 빈/비문자열은 'unknown' */
export declare function commandDigest(command: string): string

/** 비ASCII 런 제거 스켈레톤 (cp949 mojibake 관용 축) */
export declare function asciiSkeleton(command: string): string

/** denial tool_result 매칭 정규식 (D10 고정) — group1=hookName, group2=command */
export declare const HOOK_DENIAL_RE: RegExp
