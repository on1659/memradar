import { ArrowLeft, User, Bot, Clock, Zap } from 'lucide-react'
import type { Session } from '../types'

interface SessionViewProps {
  session: Session
  onBack: () => void
}

function formatTime(ts: string): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SessionView({ session, onBack }: SessionViewProps) {
  return (
    <div className="min-h-screen max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6 animate-in">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-text hover:text-text-bright transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          대시보드로 돌아가기
        </button>

        <div className="bg-bg-card rounded-xl p-5 border border-border">
          <h2 className="text-lg font-semibold text-text-bright mb-2 truncate">
            {session.messages[0]?.text.slice(0, 120) || '세션'}
          </h2>
          <div className="flex flex-wrap gap-4 text-xs text-text/60">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(session.startTime).toLocaleString('ko-KR')}
            </span>
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {(session.totalTokens.input + session.totalTokens.output).toLocaleString()} 토큰
            </span>
            <span>{session.messageCount.user + session.messageCount.assistant}개 메시지</span>
            {session.model && <span className="text-accent/60">{session.model}</span>}
            {session.cwd && <span className="truncate max-w-[200px]">{session.cwd}</span>}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="space-y-4">
        {session.messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          return (
            <div
              key={i}
              className="animate-in flex gap-3"
              style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isUser ? 'bg-green/10 text-green' : 'bg-accent/10 text-accent'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-text-bright">
                    {isUser ? 'You' : 'Claude'}
                  </span>
                  <span className="text-[10px] text-text/40">{formatTime(msg.timestamp)}</span>
                  {msg.tokens && (
                    <span className="text-[10px] text-text/30">
                      {msg.tokens.output.toLocaleString()} tok
                    </span>
                  )}
                </div>
                <div
                  className={`rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    isUser
                      ? 'bg-green/5 border border-green/10 text-text-bright'
                      : 'bg-bg-card border border-border text-text'
                  }`}
                >
                  {msg.text.length > 2000 ? msg.text.slice(0, 2000) + '\n\n... (잘림)' : msg.text}
                </div>
                {msg.toolUses.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {msg.toolUses.map((tool, j) => (
                      <span
                        key={j}
                        className="text-[10px] px-2 py-0.5 bg-amber/10 text-amber/70 rounded-full"
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
