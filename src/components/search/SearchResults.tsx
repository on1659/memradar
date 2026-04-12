import { User, Bot, Clock } from 'lucide-react'
import { shortenCwd, type SearchResult } from '../../lib/search'

interface SearchResultsProps {
  results: SearchResult[]
  onSelect: (result: SearchResult) => void
}

function HighlightedSnippet({ parts }: { parts: SearchResult['highlights'] }) {
  return (
    <span>
      {parts.map((part, i) =>
        part.isMatch ? (
          <mark key={i} className="bg-amber/20 text-amber rounded px-0.5">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  )
}

const dtf = new Intl.DateTimeFormat('ko-KR', {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
})

function formatTimestamp(ts: string): string {
  if (!ts) return ''
  return dtf.format(new Date(ts))
}

export function SearchResults({ results, onSelect }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="text-center py-12 text-text/40 text-sm">
        검색 결과가 없습니다
      </div>
    )
  }

  return (
    <div className="divide-y divide-border max-h-[calc(100vh-280px)] overflow-y-auto">
      {results.map((result, i) => {
        const isUser = result.record.role === 'user'
        return (
          <button
            key={`${result.record.sessionId}-${result.record.messageIndex}-${i}`}
            onClick={() => onSelect(result)}
            className="w-full text-left p-4 hover:bg-bg-hover transition-colors group"
          >
            <div className="flex items-start gap-3">
              {/* Role icon */}
              <div
                className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  isUser ? 'bg-green/10 text-green' : 'bg-accent/10 text-accent'
                }`}
              >
                {isUser ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
              </div>

              <div className="flex-1 min-w-0">
                {/* Snippet */}
                <div className="text-sm text-text leading-relaxed line-clamp-3 whitespace-pre-wrap break-words">
                  <HighlightedSnippet parts={result.highlights} />
                </div>

                {/* Meta */}
                <div className="flex items-center gap-3 mt-2 text-[11px] text-text/40">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTimestamp(result.record.timestamp)}
                  </span>
                  {result.record.model && (
                    <span className="text-accent/40">{result.record.model}</span>
                  )}
                  {result.record.cwd && (
                    <span className="truncate max-w-[150px]">
                      {shortenCwd(result.record.cwd)}
                    </span>
                  )}
                  {result.record.tools.length > 0 && (
                    <span className="text-amber/40">
                      {result.record.tools.slice(0, 3).join(', ')}
                      {result.record.tools.length > 3 && ` +${result.record.tools.length - 3}`}
                    </span>
                  )}
                </div>

                {/* Session first message preview */}
                <div className="mt-1.5 text-[11px] text-text/30 truncate">
                  세션: {result.session.messages[0]?.text.slice(0, 60) || '(빈 세션)'}
                </div>
              </div>

              {/* Arrow */}
              <span className="text-text/20 group-hover:text-text/50 transition-colors self-center">→</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
