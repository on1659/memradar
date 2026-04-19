import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Bot, Check, ChevronDown, ChevronUp, Clock, Copy, User, Zap } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Session } from '../types'
import { shortModelName } from '../lib/modelNames'
import { cleanClaudeText } from '../lib/cleanClaudeText'
import { getSourceColor } from '../lib/tokenPricing'

interface SessionViewProps {
  session: Session
  onBack: () => void
  highlightMessageIndex?: number
  sessionIndex?: number
  onMount?: () => void
}

function formatTime(ts: string): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getSessionTotalTokens(session: Session): number {
  return session.totalTokens.input + session.totalTokens.output + (session.totalTokens.cachedInput || 0)
}

function getSessionDisplayName(session: Session): string {
  const rawName = session.fileName.split(/[\\/]/).pop() || session.fileName || session.id
  return rawName.replace(/\.(jsonl?|txt)$/i, '')
}


const mdComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-6 text-base font-bold text-text-bright first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-5 text-[0.95rem] font-semibold text-text-bright first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-4 text-sm font-medium text-text-bright first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-3 leading-7 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-7">{children}</li>,
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-')
    if (isBlock) return <code className="block">{children}</code>
    return (
      <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-[0.82em] text-accent/90">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-lg border border-border/60 bg-bg px-4 py-3.5 font-mono text-[0.78em] leading-relaxed last:mb-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-accent/40 pl-4 italic text-text/70 last:mb-0">
      {children}
    </blockquote>
  ),
  a: ({ children }) => (
    <span className="cursor-default text-accent/80">{children}</span>
  ),
  strong: ({ children }) => <strong className="font-semibold text-text-bright">{children}</strong>,
  em: ({ children }) => <em className="italic text-text/80">{children}</em>,
  hr: () => <hr className="my-5 border-border/40" />,
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-medium text-text-bright">{children}</th>,
  td: ({ children }) => <td className="border-b border-border/30 px-3 py-2">{children}</td>,
}

function toPlainText(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')       // ### heading
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1') // **bold**, *italic*
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, '').trim()) // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url)
    .replace(/^\s*[-*+]\s+/gm, '')     // list markers
    .replace(/^\s*\d+\.\s+/gm, '')     // ordered list
    .replace(/\n+/g, ' ')              // newlines → space
    .trim()
}

function SessionTitle({ text, index }: { text: string; index?: number }) {
  const [expanded, setExpanded] = useState(false)
  const title = toPlainText(text) || '빈 대화'
  const isLong = title.length > 80

  return (
    <div className="mb-2">
      <h2
        className={`text-lg font-semibold text-text-bright ${!expanded && isLong ? 'line-clamp-1' : ''}`}
      >
        {index != null && (
          <span className="mr-2 font-mono text-sm font-medium text-text">#{index + 1}</span>
        )}
        {title}
      </h2>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-1 flex items-center gap-1 text-[11px] text-text/40 hover:text-text/70 transition-colors"
        >
          {expanded
            ? <><ChevronUp className="h-3 w-3" /> 접기</>
            : <><ChevronDown className="h-3 w-3" /> 더 보기</>}
        </button>
      )}
    </div>
  )
}

function MessageContent({ text, isUser }: { text: string; isUser: boolean }) {
  const { text: cleaned, interrupted } = cleanClaudeText(text)

  return (
    <div className={`text-sm leading-7 ${isUser ? 'text-text-bright' : 'text-text'}`}>
      {interrupted && (
        <span className="mb-2 inline-block rounded bg-amber/10 px-2 py-0.5 text-[10px] text-amber/70">
          중단됨
        </span>
      )}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {cleaned}
      </ReactMarkdown>
    </div>
  )

}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="ml-auto flex-shrink-0 rounded-md p-1 text-text/30 transition-colors hover:bg-bg-hover hover:text-text-bright"
      title="복사"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

export function SessionView({ session, onBack, highlightMessageIndex, sessionIndex, onMount }: SessionViewProps) {
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const totalSessionTokens = getSessionTotalTokens(session)
  const assistantLabel = session.source === 'codex' ? 'Codex' : 'Claude'
  const sessionDisplayName = getSessionDisplayName(session)
  const resumeCommand = session.source === 'claude' ? `claude -resume ${session.id}` : null

  useEffect(() => {
    onMount?.()
  }, [])

  useEffect(() => {
    if (highlightMessageIndex != null) {
      const el = messageRefs.current.get(highlightMessageIndex)
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
      }
    }
  }, [highlightMessageIndex])

  return (
    <div className="mx-auto min-h-screen max-w-3xl p-6">
      <div className="mb-6 animate-in">
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-2 text-sm text-text transition-colors hover:text-text-bright"
        >
          <ArrowLeft className="h-4 w-4" />
          대시보드로 돌아가기
        </button>

        <div className="rounded-xl border border-border bg-bg-card p-5">
          <SessionTitle text={cleanClaudeText(session.messages[0]?.text ?? '').text} index={sessionIndex} />
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text/60">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(session.startTime).toLocaleString('ko-KR')}
              </span>
              <span
                className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                style={(() => { const c = getSourceColor(session.source); return { color: c.text, borderColor: c.border, background: c.soft } })()}
              >
                {assistantLabel}
              </span>
              {session.model && (
                <span className="rounded-full border border-green/25 bg-green/8 px-2 py-0.5 text-[10px] font-medium text-green">
                  {shortModelName(session.model)}
                </span>
              )}
              <span className="rounded-full border border-text/12 bg-bg-hover px-2 py-0.5 text-[10px] font-medium text-text-bright">
                {totalSessionTokens >= 1_000_000
                  ? `${(totalSessionTokens / 1_000_000).toFixed(1)}M`
                  : totalSessionTokens >= 1_000
                    ? `${(totalSessionTokens / 1_000).toFixed(0)}K`
                    : totalSessionTokens.toLocaleString()} 토큰
              </span>
              {(() => {
                const total = session.messageCount.user + session.messageCount.assistant
                const label = total >= 1000 ? '1000+' : total >= 100 ? '100+' : total >= 10 ? '10+' : `${total}`
                return (
                  <span className="group relative cursor-default rounded-full border border-text/12 bg-bg-hover px-2 py-0.5 text-[10px] font-medium text-text-bright">
                    {label}
                    <span className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-border bg-bg-card px-2 py-1 text-[10px] text-text opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                      {total}개
                    </span>
                  </span>
                )
              })()}
            </div>
            {session.cwd && (
              <div className="flex items-center gap-1.5 text-[11px] text-text/40">
                <span className="text-text/30">프로젝트</span>
                <span className="truncate font-mono">{session.cwd}</span>
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-bg px-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-text/45">세션 이름</div>
                <div className="mt-1 truncate text-sm text-text-bright">{sessionDisplayName}</div>
              </div>
              <CopyButton text={sessionDisplayName} />
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-bg px-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-text/45">세션 ID</div>
                <div className="mt-1 truncate font-mono text-xs text-text-bright">{session.id}</div>
              </div>
              <CopyButton text={session.id} />
            </div>
          </div>

          {resumeCommand && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/6 px-3 py-3 text-xs leading-relaxed text-text/70">
              <span className="min-w-0 flex-1">
                Claude에서는 <span className="font-mono text-text-bright">{resumeCommand}</span> 로 대화를 이어갈 수 있습니다.
              </span>
              <CopyButton text={resumeCommand} />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {session.messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          const isHighlighted = highlightMessageIndex === i
          return (
            <div
              key={i}
              ref={(el) => {
                if (el) messageRefs.current.set(i, el)
                else messageRefs.current.delete(i)
              }}
              className={`animate-in ${isUser ? 'ml-10' : ''}`}
              style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
            >
              <div
                className={`rounded-xl border px-5 py-4 transition-colors ${
                  isHighlighted ? 'ring-2 ring-amber/40' : ''
                } ${isUser ? 'border-green/15 bg-green/5' : 'border-border bg-bg-card'}`}
              >
                <div className="mb-3 flex items-center gap-2">
                  <div
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded ${
                      isUser ? 'bg-green/15 text-green' : 'bg-accent/15 text-accent'
                    }`}
                  >
                    {isUser ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                  </div>
                  <span className="text-xs font-semibold text-text-bright">
                    {isUser ? 'You' : assistantLabel}
                  </span>
                  <span className="text-[10px] text-text/40">{formatTime(msg.timestamp)}</span>
                  {msg.tokens && (() => {
                    const count = isUser ? msg.tokens.input : msg.tokens.output
                    if (!count) return null
                    const fmt = count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count
                    return isUser ? (
                      <span className="ml-auto rounded-full border border-green/20 bg-green/8 px-2 py-0.5 text-[10px] font-medium text-green/80">
                        {fmt} 토큰
                      </span>
                    ) : (
                      <span className="ml-auto rounded-full border border-text/12 bg-bg-hover px-2 py-0.5 text-[10px] font-medium text-text-bright">
                        {fmt} 토큰
                      </span>
                    )
                  })()}
                </div>
                <MessageContent text={msg.text} isUser={isUser} />
                {msg.toolUses.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {[...new Set(msg.toolUses)].map((tool, j) => (
                      <span
                        key={j}
                        className="rounded-full border border-text/15 bg-text/8 px-2 py-0.5 text-[10px] text-text/55"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
