import type { Session, SessionSource, TokenUsage } from '../types'

interface ModelPrice {
  input: number
  cachedInput: number
  output: number
}

const CLAUDE_ESTIMATED_PRICE: ModelPrice = {
  input: 10,
  cachedInput: 10,
  output: 30,
}

const DEFAULT_CODEX_PRICE: ModelPrice = {
  input: 1.25,
  cachedInput: 0.125,
  output: 10,
}

const CODEX_MODEL_PRICING: Array<[pattern: RegExp, price: ModelPrice]> = [
  [/^gpt-5\.1-codex-mini$/i, { input: 0.25, cachedInput: 0.025, output: 2 }],
  [/^gpt-5\.2-codex$/i, { input: 1.75, cachedInput: 0.175, output: 14 }],
  [/^gpt-5\.3-codex$/i, { input: 1.25, cachedInput: 0.125, output: 10 }],
  [/^gpt-5-codex$/i, { input: 1.25, cachedInput: 0.125, output: 10 }],
  [/^gpt-5\.2$/i, { input: 1.75, cachedInput: 0.175, output: 14 }],
  [/^gpt-5\.4$/i, { input: 2.5, cachedInput: 0.25, output: 15 }],
  [/^gpt-5$/i, { input: 1.25, cachedInput: 0.125, output: 10 }],
]

export function getSourceColor(source: SessionSource) {
  return source === 'claude'
    ? { text: '#f59e0b', soft: 'rgba(245, 158, 11, 0.16)', border: 'rgba(245, 158, 11, 0.28)' }
    : { text: '#6366f1', soft: 'rgba(99, 102, 241, 0.16)', border: 'rgba(99, 102, 241, 0.28)' }
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
    }),
    { input: 0, output: 0, cachedInput: 0 }
  )
}

export function calculateSessionCost(session: Session): number {
  const pricing = session.source === 'claude'
    ? CLAUDE_ESTIMATED_PRICE
    : getCodexPrice(session.model)

  return (
    (session.totalTokens.input / 1_000_000) * pricing.input +
    ((session.totalTokens.cachedInput || 0) / 1_000_000) * pricing.cachedInput +
    (session.totalTokens.output / 1_000_000) * pricing.output
  )
}

export function calculateSourceCost(sessions: Session[]): number {
  return sessions.reduce((sum, session) => sum + calculateSessionCost(session), 0)
}
