import type { RawMessage, ParsedMessage, Session, Stats, ContentBlock } from './types'

function extractText(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!)
    .join('\n')
}

function extractToolUses(content: string | ContentBlock[]): string[] {
  if (typeof content === 'string' || !Array.isArray(content)) return []
  return content
    .filter((b) => b.type === 'tool_use' && b.name)
    .map((b) => b.name!)
}

export function parseJsonl(text: string, fileName: string): Session | null {
  const lines = text.trim().split('\n')
  const messages: ParsedMessage[] = []
  let sessionId = ''
  let cwd = ''
  let version = ''
  let model = ''

  for (const line of lines) {
    try {
      const raw: RawMessage = JSON.parse(line)

      if (raw.type === 'file-history-snapshot') continue
      if (raw.isMeta) continue
      if (raw.isSidechain) continue
      if (!raw.message?.role) continue

      const text = extractText(raw.message.content)
      if (!text.trim()) continue

      if (!sessionId && raw.sessionId) sessionId = raw.sessionId
      if (!cwd && raw.cwd) cwd = raw.cwd
      if (!version && raw.version) version = raw.version
      if (!model && raw.message.model) model = raw.message.model

      const usage = raw.message.usage
      messages.push({
        role: raw.message.role,
        text,
        timestamp: raw.timestamp || '',
        model: raw.message.model,
        tokens: usage
          ? {
              input: (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0),
              output: usage.output_tokens || 0,
            }
          : undefined,
        toolUses: extractToolUses(raw.message.content),
      })
    } catch {
      // skip malformed lines
    }
  }

  if (messages.length === 0) return null

  const totalTokens = messages.reduce(
    (acc, m) => ({
      input: acc.input + (m.tokens?.input || 0),
      output: acc.output + (m.tokens?.output || 0),
    }),
    { input: 0, output: 0 }
  )

  return {
    id: sessionId || fileName,
    fileName,
    messages,
    startTime: messages[0]?.timestamp || '',
    endTime: messages[messages.length - 1]?.timestamp || '',
    cwd,
    version,
    model,
    totalTokens,
    messageCount: {
      user: messages.filter((m) => m.role === 'user').length,
      assistant: messages.filter((m) => m.role === 'assistant').length,
    },
  }
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'because', 'but', 'and', 'or', 'if', 'while', 'that', 'this',
  'these', 'those', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you',
  'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
  'what', 'which', 'who', 'whom', 'up', 'about', 'also', 'like',
])

export function computeStats(sessions: Session[]): Stats {
  const hourlyActivity = new Array(24).fill(0)
  const dailyActivity: Record<string, number> = {}
  const modelsUsed: Record<string, number> = {}
  const toolsUsed: Record<string, number> = {}
  const wordCount: Record<string, number> = {}
  let totalMessages = 0

  for (const session of sessions) {
    if (session.model) {
      modelsUsed[session.model] = (modelsUsed[session.model] || 0) + 1
    }

    for (const msg of session.messages) {
      totalMessages++

      if (msg.timestamp) {
        const date = new Date(msg.timestamp)
        hourlyActivity[date.getHours()]++
        const dayKey = date.toISOString().slice(0, 10)
        dailyActivity[dayKey] = (dailyActivity[dayKey] || 0) + 1
      }

      for (const tool of msg.toolUses) {
        toolsUsed[tool] = (toolsUsed[tool] || 0) + 1
      }

      if (msg.role === 'user') {
        const words = msg.text.toLowerCase().match(/[a-z가-힣]+/g) || []
        for (const w of words) {
          if (w.length < 2 || STOP_WORDS.has(w)) continue
          wordCount[w] = (wordCount[w] || 0) + 1
        }
      }
    }
  }

  const topWords = Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)

  const totalTokens = sessions.reduce(
    (acc, s) => ({
      input: acc.input + s.totalTokens.input,
      output: acc.output + s.totalTokens.output,
    }),
    { input: 0, output: 0 }
  )

  const busiestDay = Object.entries(dailyActivity).sort((a, b) => b[1] - a[1])[0]?.[0] || ''

  const longestSession = sessions.reduce<Session | null>((longest, s) => {
    if (!longest) return s
    return s.messages.length > longest.messages.length ? s : longest
  }, null)

  return {
    totalSessions: sessions.length,
    totalMessages,
    totalTokens,
    avgMessagesPerSession: sessions.length > 0 ? Math.round(totalMessages / sessions.length) : 0,
    modelsUsed,
    toolsUsed,
    hourlyActivity,
    dailyActivity,
    topWords,
    longestSession,
    busiestDay,
  }
}
