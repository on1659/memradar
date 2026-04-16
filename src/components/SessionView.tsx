import { useEffect, useRef } from 'react'
import { ArrowLeft, Bot, Clock, User, Zap } from 'lucide-react'
import type { Session } from '../types'
import { shortModelName } from '../lib/modelNames'

interface SessionViewProps {
  session: Session
  onBack: () => void
  highlightMessageIndex?: number
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

export function SessionView({ session, onBack, highlightMessageIndex }: SessionViewProps) {
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const totalSessionTokens = getSessionTotalTokens(session)
  const assistantLabel = session.source === 'codex' ? 'Codex' : 'Claude'
  const sessionDisplayName = getSessionDisplayName(session)
  const resumeCommand = session.source === 'claude' ? `claude -resume ${session.id}` : null

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
    <div className="mx-auto min-h-screen max-w-4xl p-6">
      <div className="mb-6 animate-in">
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-2 text-sm text-text transition-colors hover:text-text-bright"
        >
          <ArrowLeft className="h-4 w-4" />
          대시보드로 돌아가기
        </button>

        <div className="rounded-xl border border-border bg-bg-card p-5">
          <h2 className="mb-2 truncate text-lg font-semibold text-text-bright">
            {session.messages[0]?.text.slice(0, 120) || '빈 대화'}
          </h2>
          <div className="flex flex-wrap gap-4 text-xs text-text/60">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(session.startTime).toLocaleString('ko-KR')}
            </span>
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {totalSessionTokens.toLocaleString()} 토큰
            </span>
            <span>{session.messageCount.user + session.messageCount.assistant}개 메시지</span>
            <span className="text-text/40">{assistantLabel}</span>
            {session.model && <span className="text-accent/60">{shortModelName(session.model)}</span>}
            {session.cwd && <span className="max-w-[200px] truncate">{session.cwd}</span>}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-bg px-3 py-3">
              <div className="text-[11px] text-text/45">세션 이름</div>
              <div className="mt-1 truncate text-sm text-text-bright">{sessionDisplayName}</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-bg px-3 py-3">
              <div className="text-[11px] text-text/45">세션 ID</div>
              <div className="mt-1 truncate font-mono text-xs text-text-bright">{session.id}</div>
            </div>
          </div>

          {resumeCommand && (
            <div className="mt-3 rounded-xl border border-accent/20 bg-accent/6 px-3 py-3 text-xs leading-relaxed text-text/70">
              Claude에서는 <span className="font-mono text-text-bright">{resumeCommand}</span> 로 대화를 이어갈 수 있습니다.
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
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
              className={`animate-in flex gap-3 rounded-xl transition-colors ${
                isHighlighted ? 'bg-amber/5 ring-2 ring-amber/40' : ''
              }`}
              style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
            >
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                  isUser ? 'bg-green/10 text-green' : 'bg-accent/10 text-accent'
                }`}
              >
                {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-medium text-text-bright">
                    {isUser ? 'You' : assistantLabel}
                  </span>
                  <span className="text-[10px] text-text/40">{formatTime(msg.timestamp)}</span>
                  {msg.tokens && (
                    <span className="text-[10px] text-text/30">
                      {msg.tokens.output.toLocaleString()} tok
                    </span>
                  )}
                </div>
                <div
                  className={`whitespace-pre-wrap break-words rounded-xl border p-4 text-sm leading-relaxed ${
                    isUser
                      ? 'border-green/10 bg-green/5 text-text-bright'
                      : 'border-border bg-bg-card text-text'
                  }`}
                >
                  {msg.text.length > 2000 ? `${msg.text.slice(0, 2000)}\n\n... (생략)` : msg.text}
                </div>
                {msg.toolUses.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {msg.toolUses.map((tool, j) => (
                      <span
                        key={j}
                        className="rounded-full bg-amber/10 px-2 py-0.5 text-[10px] text-amber/70"
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
