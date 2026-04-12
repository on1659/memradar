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
  tokens?: { input: number; output: number }
  toolUses: string[]
}

export interface Session {
  id: string
  fileName: string
  messages: ParsedMessage[]
  startTime: string
  endTime: string
  cwd?: string
  version?: string
  model?: string
  totalTokens: { input: number; output: number }
  messageCount: { user: number; assistant: number }
}

export interface Stats {
  totalSessions: number
  totalMessages: number
  totalTokens: { input: number; output: number }
  avgMessagesPerSession: number
  modelsUsed: Record<string, number>
  toolsUsed: Record<string, number>
  hourlyActivity: number[]
  dailyActivity: Record<string, number>
  topWords: [string, number][]
  longestSession: Session | null
  busiestDay: string
}
