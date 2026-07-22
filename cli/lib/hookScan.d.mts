/**
 * hookScan 타입 선언 — 구현(단일 소스)은 인접한 hookScan.mjs.
 * vite.config.ts(dev `/api/hooks` 미러)와 테스트가 TS 에서 import 할 때 사용.
 */

export interface HookScanError {
  filePath: string
  errorCode: string
}

/** 스캔된 설정 엔트리 (내부 형태 — command 원문 포함, 표면 직렬화 전용 아님) */
export interface HookScanEntry {
  event: string
  matcher: string | null
  command: string
  source: 'managed' | 'user' | 'project' | 'project-local' | 'plugin'
  sourceLabel: string
  filePath: string
  scope: 'global' | 'project'
  /** 원문/플러그인루트 확장/스켈레톤 다이제스트 후보들 */
  commandKeys: string[]
}

export interface HookMatchedEntry extends HookScanEntry {
  observed: boolean
  confidence: 'command' | 'event' | null
}

export interface HookTelemetryRow {
  event: string
  segment: string
  commandKey: string
  cwd: string
}

export interface ScanHooksOptions {
  homeDir?: string
  projectRoot?: string
  managedPaths?: string[]
}

export interface ScanHooksResult {
  entries: HookScanEntry[]
  errors: HookScanError[]
}

export declare function scanHooks(options?: ScanHooksOptions): ScanHooksResult

/** 절대 throw 하지 않는 매처 컴파일 — null/''/'*'=전체, 잘못된 정규식=리터럴 동등 폴백 */
export declare function compileHookMatcher(matcher: string | null | undefined): (segment: string) => boolean

export declare function buildHookTelemetryRows(
  sessions: Array<{ source?: string; cwd?: string; hookSummary?: { rows?: Array<{ hookName?: string; hookEvent?: string; commandKey?: string }> } }> | null | undefined,
): HookTelemetryRow[]

export declare function matchHookEntries(
  entries: HookScanEntry[] | null | undefined,
  telemetryRows: HookTelemetryRow[] | null | undefined,
  projectRoot?: string,
): HookMatchedEntry[]

export declare function toPublicHookEntries(matchedEntries: HookMatchedEntry[] | null | undefined): Array<{
  event: string
  matcher: string | null
  sourceLabel: string
  observed: boolean
  confidence: 'command' | 'event' | null
  commandKey: string
}>

export declare function toServerHookEntries(matchedEntries: HookMatchedEntry[] | null | undefined): Array<{
  event: string
  matcher: string | null
  command: string
  source: string
  filePath: string
  observed: boolean
  confidence: 'command' | 'event' | null
  commandKeys: string[]
}>
