import type { SessionHookSummary, HookOutcomeCounts } from '../cli/lib/hookExtract.mjs'
import type { ModelResponseCounts } from '../cli/lib/modelAttribution.mjs'

export type SessionSource = 'claude' | 'codex'

// 훅 텔레메트리 스키마의 단일 소스는 cli/lib/hookExtract.d.mts (mjs/TS 경계 계약).
// src 소비자는 types.ts 를 통해 동일 타입을 쓴다 — 이중 정의 금지.
export type {
  HookOutcome,
  HookOutcomeCounts,
  HookSummaryRow,
  SessionHookSummary,
  HookExecutionDetail,
} from '../cli/lib/hookExtract.mjs'

// 모델 귀속 스키마의 단일 소스는 cli/lib/modelAttribution.d.mts (같은 경계 계약).
export type { ModelResponseCounts } from '../cli/lib/modelAttribution.mjs'

export interface TokenUsage {
  input: number
  output: number
  cachedInput?: number      // cache_read_input_tokens
  cacheWriteInput?: number  // cache_creation_input_tokens (billed at 1.25× input rate)
}

export interface RawMessage {
  type?: string
  parentUuid?: string | null
  uuid?: string
  timestamp?: string
  sessionId?: string
  /**
   * 한 응답(thinking/text/tool_use 여러 라인)이 공유하는 식별자 — 모델 집계의 응답 단위 키.
   * 집계 중복 제거에만 쓰고 Session 에는 직렬화하지 않는다 (정적 임베드는 공유 가능한 단일 파일).
   */
  requestId?: string
  isSidechain?: boolean
  isMeta?: boolean
  message?: {
    role: 'user' | 'assistant'
    model?: string
    content: string | ContentBlock[]
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
  cwd?: string
  version?: string
  gitBranch?: string
}

export interface ContentBlock {
  type: string
  text?: string
  name?: string
  id?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string | Array<{ type: string; text?: string }>
  is_error?: boolean
}

export interface ToolResult {
  content: string
  isError: boolean
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  result?: ToolResult
}

export interface ParsedMessage {
  role: 'user' | 'assistant'
  text: string
  timestamp: string
  model?: string
  /**
   * 병합 블록 안에 2종 이상 모델이 갇힌 경우의 등장 순 distinct 목록 (2종 이상일 때만 방출).
   * 연속 assistant 병합은 비가역이라 model 하나로는 블록 내부 전환을 표현할 수 없다.
   * 실측 869블록 중 5블록에만 존재 — 나머지는 필드 자체가 없다.
   */
  models?: string[]
  tokens?: TokenUsage
  toolUses: string[]
  toolCalls?: ToolCall[]
}

export interface Session {
  id: string
  fileName: string
  filePath?: string
  source: SessionSource
  messages: ParsedMessage[]
  startTime: string
  endTime: string
  cwd?: string
  version?: string
  /**
   * 레거시 표시·폴백용 대표 모델 — Claude 는 처음 만난 모델, Codex 는 마지막 turn_context.
   * **의미 동결**: 가격 폴백(tokenPricing.ts), export 산출물 3종, 검색 필터가 단일 계약값으로
   * 읽는다. 실제 모델 구성은 modelResponses 를, 최다 모델은 dominantModel() 을 쓸 것.
   */
  model?: string
  /**
   * 모델별 **응답** 수 (Claude=distinct requestId, Codex=assistant response_item).
   * 병합 이전 raw 라인 루프에서 집계되며 `<synthetic>` 은 제외된다.
   * 비어 있으면 필드 자체가 없다 — 소비처는 absent 를 no-data 로 관용 처리하고
   * approximateModelResponses(messages) 로 폴백한다 (서버 모드 파서 갱신 시차·_truncated 세션).
   */
  modelResponses?: ModelResponseCounts
  totalTokens: TokenUsage
  messageCount: { user: number; assistant: number }
  /**
   * 훅 실행 페이로드-프리 집계 (tier-1, 전 모드).
   * 훅 레코드가 없는 세션·Codex 세션·구버전 산출물에는 필드 자체가 없다 —
   * 소비자는 absent 를 no-data 로 관용 처리해야 한다 (버전 톨러런스).
   */
  hookSummary?: SessionHookSummary
}

export interface GrowthStats {
  monthlyComplexity: { month: string; avgWords: number; count: number }[]
  skillCurve: {
    month: string
    score: number              // 0~1 (source-aware 평균)
    structured: number         // proxy A — 구조화 비율 (0~1)
    avgWords: number           // proxy B raw — 평균 단어 수
    uniqueSkills: number       // proxy C raw — slash command 종 수 (Claude 전용)
    hasClaudeSession: boolean
    count: number
    activeDays: number         // 해당 월 user 메시지의 distinct UTC 일수 — 부분 달 eligibility 판정용 (promptCoaching)
  }[]
  retryStats: {
    totalFollowups: number
    retryCount: number
    retryRate: number          // 0~1
    topMarkers: [string, number][]
  }
}

export interface Stats {
  totalSessions: number
  totalMessages: number
  totalTokens: TokenUsage
  avgMessagesPerSession: number
  /**
   * 모델별 **응답** 수 합계 (세션당 1표가 아니다 — 이름에 단위를 새겨 오해를 막는다).
   * Session.modelResponses 를 합산할 뿐 재계산하지 않는다. `<synthetic>` 은 이미 제외돼 있다.
   * Stats 는 런타임 계산값이라 직렬화되지 않으므로 개명에 하위호환 비용이 없다.
   */
  modelResponses: Record<string, number>
  toolsUsed: Record<string, number>
  hourlyActivity: number[]
  dailyActivity: Record<string, number>
  topWords: [string, number][]
  topWordsUser: [string, number][]
  topWordsAssistant: [string, number][]
  sessionLengthDist: [string, number][]
  longestSession: Session | null
  busiestDay: string
  dailyTokens: Record<string, number>
  busiestTokenDay: string
  growth: GrowthStats
  hooks: HookStats
}

// ── 훅 활동 집계 (docs/goal/hooks-analytics.md D2) ───────────────────────────

/** buildHookStats 의 코퍼스 단위 집계 행 — (hookName, hookEvent, commandKey) 키 */
export interface HookAggregateRow {
  hookName: string
  hookEvent: string
  commandKey: string
  counts: HookOutcomeCounts
  /** durationMsCount=0 이면 null — "기록 있는 실행 기준" 스코프 명시용 */
  avgDurationMs: number | null
  lastSeen: string
  hasSystemMessage: boolean
  additionalContextCount: number
  encodingDamaged: boolean
}

/**
 * Stats.hooks — Session.hookSummary 만 소비해 계산한다 (raw 레코드 금지).
 * errorRate 류의 비율 지표는 금지 — sessionsWithHooks/eligibleSessions 만 허용.
 */
export interface HookStats {
  hasHookData: boolean
  /** 기록이 남은 실행 총합 (성공+거부+차단+실패+취소+시간초과+요약만) */
  totalObserved: number
  deniedTotal: number
  /** blockingError + nonBlockingError (denied 별도, cancelled/timedOut/summaryOnly 제외) */
  failureTotal: number
  sessionsWithHooks: number
  /** Claude 세션 수만 — Codex 는 훅 텔레메트리 자체가 없다 */
  eligibleSessions: number
  /** 서로 다른 hookName 수 */
  uniqueHooks: number
  byHook: HookAggregateRow[]
}

// ── 훅 설정 인벤토리 와이어 포맷 (D4) ────────────────────────────────────────

/**
 * 정적 임베드 `window.__MEMRADAR_HOOKS__` 엔트리 — command 원문·filePath·
 * timeout 절대 금지 (공유 가능한 단일 HTML 에 실린다).
 */
export interface HookConfigPublicEntry {
  event: string
  matcher: string | null
  sourceLabel: string
  observed: boolean
  confidence: 'command' | 'event' | null
  commandKey: string
}

/** 서버 `/api/hooks` 엔트리 — command 는 maskSecrets 적용된 마스킹본 (loopback 전용) */
export interface HookConfigServerEntry {
  event: string
  matcher: string | null
  /** maskSecrets 적용본 */
  command: string
  source: string
  filePath: string
  observed: boolean
  confidence: 'command' | 'event' | null
  /** 후보 다이제스트들 — byHook 행의 commandKey 와 매핑해 서브행 라벨에 사용 */
  commandKeys: string[]
}
