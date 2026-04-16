export type SessionSource = 'claude' | 'codex'

export interface TokenUsage {
  input: number
  output: number
  cachedInput?: number
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
  input?: Record<string, unknown>
}

export interface ParsedMessage {
  role: 'user' | 'assistant'
  text: string
  timestamp: string
  model?: string
  tokens?: TokenUsage
  toolUses: string[]
}

export interface Session {
  id: string
  fileName: string
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
  longestSession: Session | null
  busiestDay: string
}
