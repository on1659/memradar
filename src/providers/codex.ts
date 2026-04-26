import type { ParsedMessage, Session, TokenUsage } from '../types'
import type { Provider } from './types'

interface CodexRecord {
  timestamp?: string
  type?: string
  payload?: Record<string, unknown>
}

interface CodexMessagePayload {
  type?: string
  role?: 'user' | 'assistant' | 'developer'
  content?: Array<Record<string, unknown>>
}

const CODEX_SETUP_PREFIXES = [
  '# AGENTS.md instructions',
  '<environment_context>',
  '<collaboration_mode>',
  '<permissions instructions>',
]

function extractCodexText(content: Array<Record<string, unknown>> | undefined): string {
  if (!Array.isArray(content)) return ''

  return content
    .map((block) => {
      const type = typeof block.type === 'string' ? block.type : ''
      if (!['input_text', 'output_text', 'summary_text', 'text'].includes(type)) return ''
      return typeof block.text === 'string' ? block.text : ''
    })
    .filter(Boolean)
    .join('\n')
}

function normalizeCodexUserText(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''

  if (CODEX_SETUP_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return ''
  }

  const marker = '## My request for Codex:'
  if (trimmed.includes(marker)) {
    const extracted = trimmed.split(marker).pop()?.trim() || ''
    return extracted
  }

  return trimmed
}

function parseTotalTokenUsage(payload: Record<string, unknown> | undefined): TokenUsage | null {
  const info = payload?.info as Record<string, unknown> | undefined
  const total = info?.total_token_usage as Record<string, unknown> | undefined
  if (!total) return null

  return {
    input: Number(total.input_tokens || 0),
    output: Number(total.output_tokens || 0),
    cachedInput: Number(total.cached_input_tokens || 0),
    cacheWriteInput: Number(total.cached_write_tokens || 0),
  }
}

function mergeConsecutiveMessages(messages: ParsedMessage[]): ParsedMessage[] {
  const merged: ParsedMessage[] = []

  for (const message of messages) {
    const previous = merged[merged.length - 1]
    if (previous && previous.role === message.role) {
      previous.text = previous.text && message.text ? `${previous.text}\n\n${message.text}` : previous.text || message.text
      previous.timestamp = previous.timestamp || message.timestamp
      previous.toolUses = [...previous.toolUses, ...message.toolUses]
      if (!previous.model && message.model) previous.model = message.model
      continue
    }

    merged.push({
      ...message,
      toolUses: [...message.toolUses],
      tokens: message.tokens ? { ...message.tokens } : undefined,
    })
  }

  return merged
}

function parseCodexJsonl(text: string, fileName: string): Session | null {
  const lines = text.trim().split('\n')
  const rawMessages: ParsedMessage[] = []
  let sessionId = ''
  let cwd = ''
  let version = ''
  let model = ''
  let totalTokens: TokenUsage = { input: 0, output: 0, cachedInput: 0, cacheWriteInput: 0 }
  let prevTotalTokens: TokenUsage = { input: 0, output: 0, cachedInput: 0, cacheWriteInput: 0 }
  let pendingToolUses: string[] = []

  for (const line of lines) {
    try {
      const record = JSON.parse(line) as CodexRecord

      if (record.type === 'session_meta') {
        const payload = record.payload || {}
        sessionId = typeof payload.id === 'string' ? payload.id : sessionId
        cwd = typeof payload.cwd === 'string' ? payload.cwd : cwd
        version = typeof payload.cli_version === 'string' ? payload.cli_version : version
        continue
      }

      if (record.type === 'turn_context') {
        const payload = record.payload || {}
        cwd = typeof payload.cwd === 'string' ? payload.cwd : cwd
        model = typeof payload.model === 'string' ? payload.model : model
        continue
      }

      if (record.type === 'event_msg') {
        const tokenUsage = parseTotalTokenUsage(record.payload)
        if (tokenUsage) {
          const delta: TokenUsage = {
            input: Math.max(0, tokenUsage.input - prevTotalTokens.input),
            output: Math.max(0, tokenUsage.output - prevTotalTokens.output),
            cachedInput: Math.max(0, (tokenUsage.cachedInput || 0) - (prevTotalTokens.cachedInput || 0)),
            cacheWriteInput: Math.max(0, (tokenUsage.cacheWriteInput || 0) - (prevTotalTokens.cacheWriteInput || 0)),
          }
          if (delta.input > 0 || delta.output > 0) {
            const lastAssistant = [...rawMessages].reverse().find(m => m.role === 'assistant' && !m.tokens)
            if (lastAssistant) lastAssistant.tokens = delta
          }
          totalTokens = tokenUsage
          prevTotalTokens = tokenUsage
        }
        continue
      }

      if (record.type !== 'response_item' || !record.payload) continue

      const payload = record.payload as CodexMessagePayload & {
        name?: string
      }

      if (payload.type === 'function_call' && payload.name) {
        const toolName = payload.name
        const previous = rawMessages[rawMessages.length - 1]
        if (previous?.role === 'assistant') {
          previous.toolUses.push(toolName)
        } else {
          pendingToolUses.push(toolName)
        }
        continue
      }

      if (payload.type !== 'message') continue
      if (payload.role !== 'user' && payload.role !== 'assistant') continue

      const textContent = extractCodexText(payload.content)
      const normalizedText = payload.role === 'user' ? normalizeCodexUserText(textContent) : textContent.trim()
      if (!normalizedText && pendingToolUses.length === 0) continue

      rawMessages.push({
        role: payload.role,
        text: normalizedText,
        timestamp: record.timestamp || '',
        model: payload.role === 'assistant' ? model : undefined,
        toolUses: pendingToolUses,
      })
      pendingToolUses = []
    } catch {
      // Skip malformed lines.
    }
  }

  const messages = mergeConsecutiveMessages(rawMessages).filter((message) => message.text.trim() || message.toolUses.length > 0)
  if (messages.length === 0) return null

  return {
    id: sessionId || fileName,
    fileName,
    source: 'codex',
    messages,
    startTime: messages[0]?.timestamp || '',
    endTime: messages[messages.length - 1]?.timestamp || '',
    cwd,
    version,
    model,
    totalTokens,
    messageCount: {
      user: messages.filter((message) => message.role === 'user').length,
      assistant: messages.filter((message) => message.role === 'assistant').length,
    },
  }
}

export const codexProvider: Provider = {
  id: 'codex',
  name: 'Codex',
  detect: (content: string) => {
    const first = content.slice(0, 1200)
    return first.includes('"type":"session_meta"') || first.includes('"originator":"codex_') || first.includes('"type":"turn_context"')
  },
  parse: parseCodexJsonl,
}
