import type { Session, ParsedMessage } from '../types'
import { isAggregatableModel } from './modelAttribution'

export interface SearchRecord {
  sessionId: string
  messageIndex: number
  text: string
  role: 'user' | 'assistant'
  model?: string
  cwd?: string
  timestamp: string
  tools: string[]
}

export interface SearchFilters {
  query: string
  role?: 'user' | 'assistant'
  model?: string
  tool?: string
  cwd?: string
  dateFrom?: string
  dateTo?: string
}

export type SearchSort = 'relevance' | 'newest' | 'oldest'

export interface SearchResult {
  record: SearchRecord
  session: Session
  message: ParsedMessage
  matchCount: number
  highlights: SnippetPart[]
}

export interface SnippetPart {
  text: string
  isMatch: boolean
}

export function hasActiveFilters(filters: SearchFilters): boolean {
  return !!(filters.query || filters.role || filters.model || filters.tool || filters.cwd || filters.dateFrom || filters.dateTo)
}

export function shortenCwd(cwd: string): string {
  return cwd.split(/[\\/]/).slice(-2).join('/')
}

export function buildSearchRecords(sessions: Session[]): SearchRecord[] {
  const records: SearchRecord[] = []
  for (const session of sessions) {
    for (let i = 0; i < session.messages.length; i++) {
      const msg = session.messages[i]
      records.push({
        sessionId: session.id,
        messageIndex: i,
        text: msg.text,
        role: msg.role,
        // assistant 응답에만 모델을 붙인다. user 라인은 원본 JSONL 에 model 이 없어(실측 0건)
        // 이 폴백이 모든 user 레코드에 세션 모델을 박았고, 그 결과 모델 필터가
        // **그 모델이 답한 적 없는 내 프롬프트**를 반환했다.
        // isAggregatableModel 게이트: synthetic-first 병합 블록은 model='<synthetic>' 을
        // 대표값으로 갖는데, 이 raw 값이 SearchResults 메타 라인에 그대로 렌더되던
        // 유일한 잔존 노출 지점이었다 (실측 레코드 30건). 술어는 한 곳에서만 정의된다.
        model: msg.role === 'assistant'
          ? [msg.model, session.model].find(isAggregatableModel)
          : undefined,
        cwd: session.cwd,
        timestamp: msg.timestamp,
        tools: msg.toolUses,
      })
    }
  }
  return records
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractSnippet(text: string, pattern: string, contextChars: number = 80): { highlights: SnippetPart[]; matchCount: number } {
  const re = new RegExp(escapeRegex(pattern), 'gi')
  let matchCount = 0
  let firstIndex = -1
  let firstLength = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    if (firstIndex === -1) {
      firstIndex = m.index
      firstLength = m[0].length
    }
    matchCount++
  }

  if (matchCount === 0) return { highlights: [{ text: text.slice(0, contextChars * 2), isMatch: false }], matchCount: 0 }

  const snippetStart = Math.max(0, firstIndex - contextChars)
  const snippetEnd = Math.min(text.length, firstIndex + firstLength + contextChars)
  const snippet = text.slice(snippetStart, snippetEnd)

  const parts: SnippetPart[] = []
  const snippetRe = new RegExp(escapeRegex(pattern), 'gi')
  let lastIndex = 0

  while ((m = snippetRe.exec(snippet)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ text: snippet.slice(lastIndex, m.index), isMatch: false })
    }
    parts.push({ text: m[0], isMatch: true })
    lastIndex = snippetRe.lastIndex
  }
  if (lastIndex < snippet.length) {
    parts.push({ text: snippet.slice(lastIndex), isMatch: false })
  }

  if (snippetStart > 0 && parts.length > 0 && !parts[0].isMatch) {
    parts[0] = { text: '...' + parts[0].text, isMatch: false }
  } else if (snippetStart > 0) {
    parts.unshift({ text: '...', isMatch: false })
  }
  if (snippetEnd < text.length) {
    const last = parts[parts.length - 1]
    if (last && !last.isMatch) {
      parts[parts.length - 1] = { text: last.text + '...', isMatch: false }
    } else {
      parts.push({ text: '...', isMatch: false })
    }
  }

  return { highlights: parts, matchCount }
}

export function search(
  records: SearchRecord[],
  sessionMap: Map<string, Session>,
  filters: SearchFilters,
  sort: SearchSort = 'relevance',
  limit: number = 100,
): SearchResult[] {
  const query = filters.query.trim()
  const queryLower = query.toLowerCase()
  const results: SearchResult[] = []

  for (const rec of records) {
    // Cheap filters first
    if (filters.role && rec.role !== filters.role) continue
    if (filters.model && rec.model !== filters.model) continue
    if (filters.tool && !rec.tools.includes(filters.tool)) continue
    if (filters.cwd && rec.cwd !== filters.cwd) continue
    if (rec.timestamp) {
      const day = rec.timestamp.slice(0, 10)
      if (filters.dateFrom && day < filters.dateFrom) continue
      if (filters.dateTo && day > filters.dateTo) continue
    }

    // Expensive text filter last
    if (queryLower && !rec.text.toLowerCase().includes(queryLower)) continue

    const session = sessionMap.get(rec.sessionId)
    if (!session) continue
    const message = session.messages[rec.messageIndex]
    if (!message) continue

    const { highlights, matchCount } = query
      ? extractSnippet(rec.text, query)
      : { highlights: [{ text: rec.text.slice(0, 160) + (rec.text.length > 160 ? '...' : ''), isMatch: false }], matchCount: 1 }

    results.push({ record: rec, session, message, matchCount, highlights })
  }

  switch (sort) {
    case 'relevance':
      results.sort((a, b) => b.matchCount - a.matchCount)
      break
    case 'newest':
      results.sort((a, b) => (b.record.timestamp || '').localeCompare(a.record.timestamp || ''))
      break
    case 'oldest':
      results.sort((a, b) => (a.record.timestamp || '').localeCompare(b.record.timestamp || ''))
      break
  }

  return results.slice(0, limit)
}

export interface SearchFacets {
  models: string[]
  tools: string[]
  cwds: string[]
}

export function extractFacets(sessions: Session[]): SearchFacets {
  const models = new Set<string>()
  const tools = new Set<string>()
  const cwds = new Set<string>()

  for (const s of sessions) {
    if (s.cwd) cwds.add(s.cwd)
    // facet 은 per-message 모델에서만 만든다. session.model 을 넣으면 실제로 답한 적 없는
    // 모델이 선택지로 뜬다 — Codex 는 last-wins 라 마지막 turn_context 가 마지막 응답
    // 이후 도착할 수 있고, 실측 1세션이 그 상태다. 선택해도 결과가 0건인 유령 항목이 된다.
    for (const m of s.messages) {
      if (m.role !== 'assistant') continue
      if (isAggregatableModel(m.model)) models.add(m.model)
      // 병합 블록 안에 갇힌 전환도 선택지에 포함 (블록의 대표 모델만으로는 누락된다)
      if (m.models) for (const inner of m.models) models.add(inner)
    }
    for (const m of s.messages) for (const t of m.toolUses) tools.add(t)
  }

  return {
    models: [...models].sort(),
    tools: [...tools].sort(),
    cwds: [...cwds].sort(),
  }
}
