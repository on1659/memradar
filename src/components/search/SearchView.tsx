import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import type { Session } from '../../types'
import {
  buildSearchRecords,
  search,
  extractFacets,
  hasActiveFilters,
  type SearchFilters,
  type SearchSort,
  type SearchResult,
} from '../../lib/search'
import { SearchBar } from './SearchBar'
import { SearchResults } from './SearchResults'

interface SearchViewProps {
  sessions: Session[]
  onSelectResult: (session: Session, messageIndex: number) => void
  onClose: () => void
}

export function SearchView({ sessions, onSelectResult, onClose }: SearchViewProps) {
  const [filters, setFilters] = useState<SearchFilters>({ query: '' })
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [sort, setSort] = useState<SearchSort>('relevance')
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const handleFiltersChange = useCallback((next: SearchFilters) => {
    setFilters(next)
    if (next.query !== filters.query) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => setDebouncedQuery(next.query), 200)
    }
  }, [filters.query])

  useEffect(() => () => clearTimeout(debounceTimer.current), [])

  const records = useMemo(() => buildSearchRecords(sessions), [sessions])
  const sessionMap = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions])
  const facets = useMemo(() => extractFacets(sessions), [sessions])

  const searchFilters = useMemo(
    () => ({ ...filters, query: debouncedQuery }),
    [filters, debouncedQuery]
  )

  const active = hasActiveFilters(searchFilters)

  const results = useMemo(() => {
    if (!active) return []
    return search(records, sessionMap, searchFilters, sort)
  }, [records, sessionMap, searchFilters, sort, active])

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onSelectResult(result.session, result.record.messageIndex)
    },
    [onSelectResult]
  )

  return (
    <div className="min-h-screen max-w-4xl mx-auto p-6">
      <div className="mb-2 animate-in">
        <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2 mb-4">
          <span className="text-accent">✦</span> 검색
        </h1>
      </div>

      <div className="mb-4 animate-in">
        <SearchBar
          filters={filters}
          sort={sort}
          facets={facets}
          resultCount={results.length}
          onFiltersChange={handleFiltersChange}
          onSortChange={setSort}
          onClose={onClose}
        />
      </div>

      <div className="bg-bg-card rounded-xl border border-border animate-in">
        {active ? (
          <SearchResults results={results} onSelect={handleSelect} />
        ) : (
          <div className="text-center py-16 text-text/30 text-sm">
            검색어를 입력하거나 필터를 선택하세요
            <div className="mt-2 text-text/20 text-xs">
              Ctrl+K로 열기 / Esc로 닫기
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
