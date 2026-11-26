import type { Session, SessionSource, TokenUsage } from '../types'
import { getAccentTone, isThemeId } from '../theme/themePolicy'

interface ModelPrice {
  input: number
  cacheWrite: number   // cache_creation_input_tokens (1.25× input)
  cacheRead: number    // cache_read_input_tokens (0.1× input)
  output: number
}

// Last updated: 2026-11 (USD per million tokens)
// cacheWrite 는 5분 TTL 단가(input × 1.25) — 1시간 TTL 은 input × 2 라 실제 청구는 이보다 클 수 있다.
const DEFAULT_CLAUDE_PRICE: ModelPrice = {
  input: 3,
  cacheWrite: 3.75,
  cacheRead: 0.3,
  output: 15,
}

// 위에서부터 첫 매칭 — 구체적인 버전을 먼저 둔다.
// 캐시 읽기는 보통 input × 0.1 이지만 최신 모델은 더 싸다 (Fable 5.1·5.2 × 0.025, Opus 5.5·Sonnet 5.5 × 0.05).
const CLAUDE_MODEL_PRICING: Array<[pattern: RegExp, price: ModelPrice]> = [
  [/(fable|mythos)-5-2/i, { input: 8,    cacheWrite: 10,    cacheRead: 0.2,  output: 40   }],
  [/(fable|mythos)-5-1/i, { input: 10,   cacheWrite: 12.5,  cacheRead: 0.25, output: 50   }],
  [/fable|mythos/i,       { input: 10,   cacheWrite: 12.5,  cacheRead: 1,    output: 50   }],
  [/opus-5-5/i,           { input: 4,    cacheWrite: 5,     cacheRead: 0.2,  output: 20   }],
  // opus-5, opus-4-5 ~ opus-4-8
  [/opus-(5|4-[5-9])/i,   { input: 5,    cacheWrite: 6.25,  cacheRead: 0.5,  output: 25   }],
  // opus-4-1 이하 (claude-opus-4-*, claude-3-opus-*)
  [/opus/i,               { input: 15,   cacheWrite: 18.75, cacheRead: 1.5,  output: 75   }],
  [/sonnet-5-5/i,         { input: 2,    cacheWrite: 2.5,   cacheRead: 0.1,  output: 10   }],
  [/sonnet-5/i,           { input: 2,    cacheWrite: 2.5,   cacheRead: 0.2,  output: 10   }],
  [/sonnet/i,             { input: 3,    cacheWrite: 3.75,  cacheRead: 0.3,  output: 15   }],
  [/haiku-5-5/i,          { input: 0.1,  cacheWrite: 0.125, cacheRead: 0.01, output: 0.5  }],
  [/haiku-4-5/i,          { input: 1,    cacheWrite: 1.25,  cacheRead: 0.1,  output: 5    }],
  // haiku-3.5 (claude-3-5-haiku-*)
  [/3-5-haiku|haiku-3-5/i, { input: 0.8, cacheWrite: 1.0,   cacheRead: 0.08, output: 4    }],
  // haiku-3 (legacy)
  [/haiku/i,              { input: 0.25, cacheWrite: 0.3,   cacheRead: 0.03, output: 1.25 }],
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

/** Claude 모델 단가 — 사용 습관 코칭이 캐시 재작성 비용을 환산할 때도 이 표를 쓴다 (단가 이중 정의 금지) */
export function getClaudePrice(modelName?: string): ModelPrice {
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
      // user 메시지의 tokens 는 표시용 추정치 — 실제 청구는 assistant 응답의 usage 에 이미 들어 있다
      if (!msg.tokens || msg.role === 'user') return sum
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
