import type { RawMessage, ParsedMessage, Session, Stats, ContentBlock, TokenUsage } from './types'

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
  const rawMessages: ParsedMessage[] = []
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
      const toolUses = extractToolUses(raw.message.content)
      if (!text.trim() && toolUses.length === 0) continue

      if (!sessionId && raw.sessionId) sessionId = raw.sessionId
      if (!cwd && raw.cwd) cwd = raw.cwd
      if (!version && raw.version) version = raw.version
      if (!model && raw.message.model) model = raw.message.model

      const usage = raw.message.usage
      rawMessages.push({
        role: raw.message.role,
        text,
        timestamp: raw.timestamp || '',
        model: raw.message.model,
        tokens: usage
          ? {
              input: usage.input_tokens || 0,
              output: usage.output_tokens || 0,
              cachedInput: usage.cache_read_input_tokens || 0,
              cacheWriteInput: usage.cache_creation_input_tokens || 0,
            }
          : undefined,
        toolUses,
      })
    } catch {
      // skip malformed lines
    }
  }

  if (rawMessages.length === 0) return null

  const messages: ParsedMessage[] = []
  for (const msg of rawMessages) {
    const prev = messages[messages.length - 1]
    if (prev && prev.role === msg.role) {
      prev.text += '\n\n' + msg.text
      prev.timestamp = prev.timestamp || msg.timestamp
      if (msg.tokens) {
        if (prev.tokens) {
          prev.tokens.input += msg.tokens.input
          prev.tokens.output += msg.tokens.output
          prev.tokens.cachedInput = (prev.tokens.cachedInput || 0) + (msg.tokens.cachedInput || 0)
          prev.tokens.cacheWriteInput = (prev.tokens.cacheWriteInput || 0) + (msg.tokens.cacheWriteInput || 0)
        } else {
          prev.tokens = { ...msg.tokens }
        }
      }
      prev.toolUses = [...prev.toolUses, ...msg.toolUses]
      if (!prev.model && msg.model) prev.model = msg.model
    } else {
      messages.push({ ...msg, tokens: msg.tokens ? { ...msg.tokens } : undefined, toolUses: [...msg.toolUses] })
    }
  }

  const totalTokens = messages.reduce(
    (acc, m) => ({
      input: acc.input + (m.tokens?.input || 0),
      output: acc.output + (m.tokens?.output || 0),
      cachedInput: (acc.cachedInput || 0) + (m.tokens?.cachedInput || 0),
      cacheWriteInput: (acc.cacheWriteInput || 0) + (m.tokens?.cacheWriteInput || 0),
    }),
    { input: 0, output: 0, cachedInput: 0, cacheWriteInput: 0 } satisfies TokenUsage
  )

  return {
    id: sessionId || fileName,
    fileName,
    source: 'claude',
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
  // English
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
  'let', 'use', 'using', 'make', 'new', 'file', 'code', 'run', 'set',
  // Korean common particles/endings
  '이', '그', '저', '것', '수', '등', '때', '더', '안', '좀', '잘',
  '이런', '그런', '저런', '하는', '하고', '해서', '하면', '해도',
  '있는', '없는', '되는', '하는데', '인데', '건데', '거야', '거임',
  '으로', '에서', '까지', '부터', '처럼', '만큼', '대로', '마다',
  '하다', '있다', '없다', '되다', '보다', '같다', '나다', '주다',
  '말고', '말이', '거기', '여기', '어디', '이거', '그거', '저거',
  '근데', '그리고', '그래서', '하지만', '그런데', '그러면', '아니면',
])

const BUILTIN_COMMANDS = new Set([
  'exit', 'clear', 'help', 'model', 'fast', 'login', 'logout',
  'compact', 'resume', 'continue', 'config', 'status', 'cost',
  'doctor', 'init', 'memory', 'bug', 'release-notes', 'terminal-setup',
  'ide', 'mcp', 'vim', 'hooks', 'permissions', 'agents', 'add-dir',
  'upgrade', 'migrate-installer', 'todos', 'share', 'usage',
  'allowed-tools', 'pr-comments', 'review', 'think', 'output-style',
  'export', 'import', 'feedback',
])

export function computeStats(sessions: Session[]): Stats {
  const hourlyActivity = new Array(24).fill(0)
  const dailyActivity: Record<string, number> = {}
  const dailyTokens: Record<string, number> = {}
  const modelsUsed: Record<string, number> = {}
  const toolsUsed: Record<string, number> = {}
  const userWordCount: Record<string, number> = {}
  const assistantWordCount: Record<string, number> = {}
  const skillCount: Record<string, number> = {}
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
        if (msg.tokens) {
          const msgTokenTotal = msg.tokens.input + msg.tokens.output + (msg.tokens.cachedInput || 0)
          dailyTokens[dayKey] = (dailyTokens[dayKey] || 0) + msgTokenTotal
        }
      }

      for (const tool of msg.toolUses) {
        toolsUsed[tool] = (toolsUsed[tool] || 0) + 1
      }

      const wc = msg.role === 'user' ? userWordCount : assistantWordCount
      const words = msg.text.toLowerCase().match(/[a-z가-힣]+/g) || []
      for (const w of words) {
        if (w.length < 2 || STOP_WORDS.has(w)) continue
        wc[w] = (wc[w] || 0) + 1
      }

      if (msg.role === 'user') {
        const skillMatches = msg.text.matchAll(/<command-name>\/([^<\s]+)<\/command-name>/g)
        for (const match of skillMatches) {
          const name = match[1]
          if (BUILTIN_COMMANDS.has(name)) continue
          skillCount[name] = (skillCount[name] || 0) + 1
        }
      }
    }
  }

  const toTop30 = (wc: Record<string, number>) =>
    Object.entries(wc).sort((a, b) => b[1] - a[1]).slice(0, 30)

  const allWordCount: Record<string, number> = {}
  for (const [w, c] of Object.entries(userWordCount)) allWordCount[w] = (allWordCount[w] || 0) + c
  for (const [w, c] of Object.entries(assistantWordCount)) allWordCount[w] = (allWordCount[w] || 0) + c

  const topWords = toTop30(allWordCount)
  const topWordsUser = toTop30(userWordCount)
  const topWordsAssistant = toTop30(assistantWordCount)

  const topSkills = Object.entries(skillCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  const SESSION_BUCKETS: [string, number, number][] = [
    ['1-5턴', 1, 5],
    ['6-20턴', 6, 20],
    ['21-50턴', 21, 50],
    ['51턴+', 51, Infinity],
  ]
  const sessionLengthCount: Record<string, number> = {}
  for (const session of sessions) {
    const n = session.messages.filter((m) => m.role === 'user').length
    const bucket = SESSION_BUCKETS.find(([, lo, hi]) => n >= lo && n <= hi)
    if (bucket) sessionLengthCount[bucket[0]] = (sessionLengthCount[bucket[0]] || 0) + 1
  }
  const sessionLengthDist = SESSION_BUCKETS
    .map(([label]) => [label, sessionLengthCount[label] || 0] as [string, number])
    .filter(([, v]) => v > 0)

  const totalTokens = sessions.reduce(
    (acc, s) => ({
      input: acc.input + s.totalTokens.input,
      output: acc.output + s.totalTokens.output,
      cachedInput: (acc.cachedInput || 0) + (s.totalTokens.cachedInput || 0),
      cacheWriteInput: (acc.cacheWriteInput || 0) + (s.totalTokens.cacheWriteInput || 0),
    }),
    { input: 0, output: 0, cachedInput: 0, cacheWriteInput: 0 } satisfies TokenUsage
  )

  const busiestDay = Object.entries(dailyActivity).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  const busiestTokenDay = Object.entries(dailyTokens).sort((a, b) => b[1] - a[1])[0]?.[0] || ''

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
    topWordsUser,
    topWordsAssistant,
    topSkills,
    sessionLengthDist,
    longestSession,
    busiestDay,
    dailyTokens,
    busiestTokenDay,
  }
}
