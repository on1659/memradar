export type SessionSource = 'claude' | 'codex'

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
  model?: string
  totalTokens: TokenUsage
  messageCount: { user: number; assistant: number }
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
  modelsUsed: Record<string, number>
  toolsUsed: Record<string, number>
  hourlyActivity: number[]
  dailyActivity: Record<string, number>
  topWords: [string, number][]
  topWordsUser: [string, number][]
  topWordsAssistant: [string, number][]
  topSkills: [string, number][]
  sessionLengthDist: [string, number][]
  longestSession: Session | null
  busiestDay: string
  dailyTokens: Record<string, number>
  busiestTokenDay: string
  growth: GrowthStats
}
