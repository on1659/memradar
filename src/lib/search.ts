import type { Session, ParsedMessage } from '../types'

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
        model: msg.model || session.model,
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
    if (s.model) models.add(s.model)
    if (s.cwd) cwds.add(s.cwd)
    for (const m of s.messages) {
      if (m.model) models.add(m.model)
      for (const t of m.toolUses) tools.add(t)
    }
  }

  return {
    models: [...models].sort(),
    tools: [...tools].sort(),
    cwds: [...cwds].sort(),
  }
}
