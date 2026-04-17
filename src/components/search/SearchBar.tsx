import { useState } from 'react'
import { Search, SlidersHorizontal, X, User, Bot } from 'lucide-react'
import { hasActiveFilters, shortenCwd, type SearchFilters, type SearchSort, type SearchFacets } from '../../lib/search'

const SORT_LABELS: Record<SearchSort, string> = {
  relevance: '관련도',
  newest: '최신순',
  oldest: '오래된순',
}

interface SearchBarProps {
  filters: SearchFilters
  sort: SearchSort
  facets: SearchFacets
  resultCount: number
  onFiltersChange: (filters: SearchFilters) => void
  onSortChange: (sort: SearchSort) => void
  onClose: () => void
}

export function SearchBar({
  filters,
  sort,
  facets,
  resultCount,
  onFiltersChange,
  onSortChange,
  onClose,
}: SearchBarProps) {
  const [showFilters, setShowFilters] = useState(false)

  const setFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value || undefined })
  }

  const filtersActive = hasActiveFilters({ ...filters, query: '' })

  return (
    <div className="space-y-3">
      {/* Main search input */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text/40" />
          <input
            type="text"
            value={filters.query}
            onChange={(e) => setFilter('query', e.target.value)}
            placeholder="메시지 검색..."
            autoFocus
            className="w-full pl-10 pr-4 py-2.5 bg-bg-card border border-border rounded-lg text-sm text-text-bright placeholder:text-text/30 focus:outline-none focus:border-accent/50 transition-colors"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (showFilters) setShowFilters(false)
                else onClose()
              }
            }}
          />
          {filters.query && (
            <button
              onClick={() => setFilter('query', '')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text/40 hover:text-text-bright"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-2.5 rounded-lg border transition-colors ${
            showFilters || filtersActive
              ? 'bg-accent/10 border-accent/30 text-accent'
              : 'bg-bg-card border-border text-text hover:border-accent/30'
          }`}
          title="필터"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          className="p-2.5 rounded-lg bg-bg-card border border-border text-text hover:text-text-bright hover:border-accent/30 transition-colors"
          title="닫기"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Result count + sort */}
      {(filters.query || filtersActive) && (
        <div className="flex items-center justify-between text-xs text-text/60">
          <span>{resultCount.toLocaleString()}개 결과</span>
          <div className="flex items-center gap-1">
            <span>정렬:</span>
            {(['relevance', 'newest', 'oldest'] as SearchSort[]).map((s) => (
              <button
                key={s}
                onClick={() => onSortChange(s)}
                className={`px-2 py-0.5 rounded ${
                  sort === s ? 'bg-accent/10 text-accent' : 'hover:text-text-bright'
                }`}
              >
                {SORT_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-bg-card border border-border rounded-lg p-4 space-y-3 animate-in">
          {/* Role */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text/60 w-14">발신자</span>
            <div className="flex gap-1">
              {([undefined, 'user', 'assistant'] as const).map((role) => (
                <button
                  key={role ?? 'all'}
                  onClick={() => setFilter('role', role)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
                    filters.role === role ? 'bg-accent/10 text-accent' : 'text-text hover:text-text-bright'
                  }`}
                >
                  {role === 'user' && <User className="w-3 h-3" />}
                  {role === 'assistant' && <Bot className="w-3 h-3" />}
                  {role === undefined ? '전체' : role === 'user' ? 'User' : 'Claude'}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          {facets.models.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text/60 w-14">모델</span>
              <select
                value={filters.model || ''}
                onChange={(e) => setFilter('model', e.target.value || undefined)}
                className="bg-bg border border-border rounded px-2 py-1 text-xs text-text-bright focus:outline-none focus:border-accent/50"
              >
                <option value="">전체</option>
                {facets.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          {/* Tool */}
          {facets.tools.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text/60 w-14">도구</span>
              <select
                value={filters.tool || ''}
                onChange={(e) => setFilter('tool', e.target.value || undefined)}
                className="bg-bg border border-border rounded px-2 py-1 text-xs text-text-bright focus:outline-none focus:border-accent/50"
              >
                <option value="">전체</option>
                {facets.tools.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {/* CWD / Project */}
          {facets.cwds.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text/60 w-14">프로젝트</span>
              <select
                value={filters.cwd || ''}
                onChange={(e) => setFilter('cwd', e.target.value || undefined)}
                className="bg-bg border border-border rounded px-2 py-1 text-xs text-text-bright focus:outline-none focus:border-accent/50 max-w-[300px]"
              >
                <option value="">전체</option>
                {facets.cwds.map((c) => (
                  <option key={c} value={c}>{shortenCwd(c)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Date range */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text/60 w-14">기간</span>
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => setFilter('dateFrom', e.target.value || undefined)}
              className="bg-bg border border-border rounded px-2 py-1 text-xs text-text-bright focus:outline-none focus:border-accent/50"
            />
            <span className="text-xs text-text/40">~</span>
            <input
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) => setFilter('dateTo', e.target.value || undefined)}
              className="bg-bg border border-border rounded px-2 py-1 text-xs text-text-bright focus:outline-none focus:border-accent/50"
            />
          </div>

          {/* Clear filters */}
          {filtersActive && (
            <button
              onClick={() => onFiltersChange({ query: filters.query })}
              className="text-xs text-accent hover:text-accent/80"
            >
              필터 초기화
            </button>
          )}
        </div>
      )}
    </div>
  )
}
