import type { Session, SessionSource, TokenUsage } from '../types'
import { getAccentTone, isThemeId } from '../theme/themePolicy'

interface ModelPrice {
  input: number
  cacheWrite: number   // cache_creation_input_tokens (1.25× input)
  cacheRead: number    // cache_read_input_tokens (0.1× input)
  output: number
}

// Last updated: 2026-04 (USD per million tokens)
const DEFAULT_CLAUDE_PRICE: ModelPrice = {
  input: 3,
  cacheWrite: 3.75,
  cacheRead: 0.3,
  output: 15,
}

const CLAUDE_MODEL_PRICING: Array<[pattern: RegExp, price: ModelPrice]> = [
  [/opus/i,   { input: 15,   cacheWrite: 18.75, cacheRead: 1.5,  output: 75   }],
  [/sonnet/i, { input: 3,    cacheWrite: 3.75,  cacheRead: 0.3,  output: 15   }],
  // haiku-3.5+ and haiku-4+ (claude-haiku-3-5-*, claude-haiku-4-*)
  [/haiku-[4-9]|haiku-3-5/i, { input: 0.8,  cacheWrite: 1.0,   cacheRead: 0.08, output: 4 }],
  // haiku-3 (legacy)
  [/haiku/i,  { input: 0.25, cacheWrite: 0.3,   cacheRead: 0.03, output: 1.25 }],
]

const DEFAULT_CODEX_PRICE: ModelPrice = {
  input: 1.25,
  cacheWrite: 0.125,
  cacheRead: 0.125,
  output: 10,
}

const CODEX_MODEL_PRICING: Array<[pattern: RegExp, price: ModelPrice]> = [
  [/^gpt-5\.1-codex-mini$/i, { input: 0.25,  cacheWrite: 0.025, cacheRead: 0.025, output: 2  }],
  [/^gpt-5\.2-codex$/i,      { input: 1.75,  cacheWrite: 0.175, cacheRead: 0.175, output: 14 }],
  [/^gpt-5\.3-codex$/i,      { input: 1.25,  cacheWrite: 0.125, cacheRead: 0.125, output: 10 }],
  [/^gpt-5-codex$/i,         { input: 1.25,  cacheWrite: 0.125, cacheRead: 0.125, output: 10 }],
  [/^gpt-5\.2$/i,            { input: 1.75,  cacheWrite: 0.175, cacheRead: 0.175, output: 14 }],
  [/^gpt-5\.4$/i,            { input: 2.5,   cacheWrite: 0.25,  cacheRead: 0.25,  output: 15 }],
  [/^gpt-5$/i,               { input: 1.25,  cacheWrite: 0.125, cacheRead: 0.125, output: 10 }],
]

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function getSourceColor(source: SessionSource, theme?: string) {
  const themeId = theme && isThemeId(theme) ? theme : 'dark'
  const accentId = source === 'claude' ? 'amber' : 'indigo'
  const tone = getAccentTone(themeId, accentId)
  return {
    text: tone.color,
    soft: hexToRgba(tone.color, 0.16),
    border: hexToRgba(tone.color, 0.28),
  }
}

function getCodexPrice(modelName?: string): ModelPrice {
  if (!modelName) return DEFAULT_CODEX_PRICE

  const matched = CODEX_MODEL_PRICING.find(([pattern]) => pattern.test(modelName))
  return matched?.[1] || DEFAULT_CODEX_PRICE
}

export function getTokenTotals(sessions: Session[]): TokenUsage {
  return sessions.reduce<TokenUsage>(
    (acc, session) => ({
      input: acc.input + session.totalTokens.input,
      output: acc.output + session.totalTokens.output,
      cachedInput: (acc.cachedInput || 0) + (session.totalTokens.cachedInput || 0),
      cacheWriteInput: (acc.cacheWriteInput || 0) + (session.totalTokens.cacheWriteInput || 0),
    }),
    { input: 0, output: 0, cachedInput: 0, cacheWriteInput: 0 }
  )
}

function getClaudePrice(modelName?: string): ModelPrice {
  if (!modelName) return DEFAULT_CLAUDE_PRICE
  const matched = CLAUDE_MODEL_PRICING.find(([pattern]) => pattern.test(modelName))
  return matched?.[1] || DEFAULT_CLAUDE_PRICE
}

function getPrice(source: SessionSource, modelName?: string): ModelPrice {
  return source === 'claude' ? getClaudePrice(modelName) : getCodexPrice(modelName)
}

function tokenCost(tokens: TokenUsage, pricing: ModelPrice): number {
  return (
    (tokens.input / 1_000_000) * pricing.input +
    ((tokens.cacheWriteInput || 0) / 1_000_000) * pricing.cacheWrite +
    ((tokens.cachedInput || 0) / 1_000_000) * pricing.cacheRead +
    (tokens.output / 1_000_000) * pricing.output
  )
}

export function calculateSessionCost(session: Session): number {
  // 메시지별 모델이 있으면 개별 가격 적용, 없으면 세션 모델로 폴백
  const hasPerMessageTokens = session.messages.some((m) => m.tokens && m.model)

  if (hasPerMessageTokens) {
    return session.messages.reduce((sum, msg) => {
      if (!msg.tokens) return sum
      const pricing = getPrice(session.source, msg.model || session.model)
      return sum + tokenCost(msg.tokens, pricing)
    }, 0)
  }

  // 메시지별 토큰 정보가 없으면 가장 많이 쓴 모델 기준으로 계산
  const modelCounts: Record<string, number> = {}
  for (const msg of session.messages) {
    if (msg.model) modelCounts[msg.model] = (modelCounts[msg.model] || 0) + 1
  }
  const dominantModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || session.model
  return tokenCost(session.totalTokens, getPrice(session.source, dominantModel))
}

export function calculateSourceCost(sessions: Session[]): number {
  return sessions.reduce((sum, session) => sum + calculateSessionCost(session), 0)
}
