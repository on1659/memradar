import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Bot, Check, ChevronDown, ChevronUp, Clock, Copy, Download, Play, User } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Session, ParsedMessage } from '../types'
import { shortModelName } from '../lib/modelNames'
import { cleanClaudeText } from '../lib/cleanClaudeText'
import { getSourceColor, calculateSessionCost } from '../lib/tokenPricing'
import {
  buildMarkdown,
  buildMessageMarkdown,
  buildHtmlChat,
  buildHtmlMarkdown,
  downloadText,
  sanitizeFileName,
} from '../lib/sessionExport'
import { mdComponents } from './markdown'
import { useI18n } from '../i18n'
import { parseJsonl } from '../parser'
import { ToolCallView, type ExpandSignal } from './tools/ToolCallView'

interface SessionViewProps {
  session: Session
  onBack: () => void
  onReplay?: () => void
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
  return (
    session.totalTokens.input +
    session.totalTokens.output +
    (session.totalTokens.cachedInput || 0) +
    (session.totalTokens.cacheWriteInput || 0)
  )
}

function fmtTokenShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function getSessionDisplayName(session: Session): string {
  const rawName = session.fileName.split(/[\\/]/).pop() || session.fileName || session.id
  return rawName.replace(/\.(jsonl?|txt)$/i, '')
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

async function copyToClipboardWithFallback(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}

function CopyButton({ text, className, title }: { text: string; className?: string; title?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await copyToClipboardWithFallback(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [text])

  const baseClass =
    className ??
    'ml-auto flex-shrink-0 rounded-md p-1 text-text/30 transition-colors hover:bg-bg-hover hover:text-text-bright'

  return (
    <button onClick={handleCopy} className={baseClass} title={title ?? '복사'}>
      {copied ? <Check className="h-3.5 w-3.5 text-green" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

type ExportFormat = 'html-chat' | 'html-doc' | 'markdown'

function ExportMenu({
  onExport,
}: {
  onExport: (format: ExportFormat) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border/70 bg-bg-card px-3 py-1.5 text-xs font-medium text-text/80 transition-colors hover:bg-bg-hover hover:text-text-bright"
        title="내보내기"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download className="h-3.5 w-3.5" />
        내보내기
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1.5 w-60 overflow-hidden rounded-lg border border-border bg-bg-card shadow-xl"
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onExport('html-chat')
            }}
            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs text-text/85 transition-colors hover:bg-bg-hover hover:text-text-bright"
          >
            <span className="font-medium">채팅 화면 그대로 (HTML)</span>
            <span className="text-[10px] text-text/45">현재 다크 톤 그대로 저장</span>
          </button>
          <div className="h-px bg-border/60" />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onExport('html-doc')
            }}
            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs text-text/85 transition-colors hover:bg-bg-hover hover:text-text-bright"
          >
            <span className="font-medium">단순 마크다운 HTML</span>
            <span className="text-[10px] text-text/45">인쇄·공유용 라이트 톤</span>
          </button>
          <div className="h-px bg-border/60" />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onExport('markdown')
            }}
            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs text-text/85 transition-colors hover:bg-bg-hover hover:text-text-bright"
          >
            <span className="font-medium">원본 마크다운 (.md)</span>
            <span className="text-[10px] text-text/45">텍스트 그대로 저장</span>
          </button>
        </div>
      )}
    </div>
  )
}

export function SessionView({ session, onBack, onReplay, highlightMessageIndex, sessionIndex, onMount }: SessionViewProps) {
  const { t } = useI18n()
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const totalSessionTokens = getSessionTotalTokens(session)
  const assistantLabel = session.source === 'codex' ? 'Codex' : 'Claude'
  const sessionDisplayName = getSessionDisplayName(session)
  const [enrichedMessages, setEnrichedMessages] = useState<ParsedMessage[] | null>(null)
  const [enrichLoading, setEnrichLoading] = useState(false)
  const messages = enrichedMessages ?? session.messages
  const totalToolCalls = messages.reduce((acc, m) => acc + (m.toolCalls?.length ?? 0), 0)
  const [allToolsExpanded, setAllToolsExpanded] = useState(false)
  const [expandSignalKey, setExpandSignalKey] = useState(0)
  const expandSignal: ExpandSignal = { expanded: allToolsExpanded, key: expandSignalKey }
  const toggleAllTools = () => {
    setAllToolsExpanded((v) => !v)
    setExpandSignalKey((k) => k + 1)
  }

  const [allCopied, setAllCopied] = useState(false)
  const handleCopyAll = useCallback(async () => {
    const md = buildMarkdown(session, messages)
    await copyToClipboardWithFallback(md)
    setAllCopied(true)
    setTimeout(() => setAllCopied(false), 1500)
  }, [session, messages])

  const handleExport = useCallback(
    (format: ExportFormat) => {
      const baseName = sanitizeFileName(getSessionDisplayName(session))
      if (format === 'markdown') {
        const md = buildMarkdown(session, messages)
        downloadText(md, `${baseName}.md`, 'text/markdown')
        return
      }
      const html =
        format === 'html-chat'
          ? buildHtmlChat(session, messages)
          : buildHtmlMarkdown(session, messages)
      const suffix = format === 'html-chat' ? '.chat.html' : '.html'
      downloadText(html, `${baseName}${suffix}`, 'text/html')
    },
    [session, messages]
  )

  useEffect(() => {
    setEnrichedMessages(null)
    const isServerMode = !window.__MEMRADAR_SESSIONS__
    if (!isServerMode || !session.filePath || session.source !== 'claude') return
    let cancelled = false
    setEnrichLoading(true)
    ;(async () => {
      try {
        const r = await fetch(`/api/session-content?path=${encodeURIComponent(session.filePath!)}`)
        if (!r.ok) return
        const text = await r.text()
        const parsed = parseJsonl(text, session.fileName, { includeToolDetails: true })
        if (parsed && !cancelled) setEnrichedMessages(parsed.messages)
      } catch {
        // ignore — fallback to light data
      } finally {
        if (!cancelled) setEnrichLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [session.filePath, session.fileName, session.source])
  const cdCommand = session.cwd ? (() => {
    const driveMatch = session.cwd.match(/^([A-Za-z]):/)
    return driveMatch
      ? `${driveMatch[1]}:\r\ncd "${session.cwd}"`
      : `cd "${session.cwd}"`
  })() : null
  const baseResumeCommand = session.source === 'claude' ? `claude --resume ${session.id}` : `codex resume ${session.id}`
  const resumeCommand = cdCommand ? `${cdCommand}\r\n${baseResumeCommand}` : baseResumeCommand

  useEffect(() => {
    onMount?.()
  }, [onMount])

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
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-text transition-colors hover:text-text-bright"
          >
            <ArrowLeft className="h-4 w-4" />
            대시보드로 돌아가기
          </button>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={handleCopyAll}
                className="flex items-center gap-1.5 rounded-full border border-border/70 bg-bg-card px-3 py-1.5 text-xs font-medium text-text/80 transition-colors hover:bg-bg-hover hover:text-text-bright"
                title="전체 대화를 마크다운으로 복사"
              >
                {allCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green" />
                    <span>복사됨</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>전체 복사</span>
                  </>
                )}
              </button>
            )}
            {messages.length > 0 && <ExportMenu onExport={handleExport} />}
            {onReplay && session.messages.length > 0 && (
              <button
                onClick={onReplay}
                className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                title={t('replay.open')}
                data-replay-open
              >
                <Play className="h-3.5 w-3.5" />
                {t('replay.open')}
              </button>
            )}
          </div>
        </div>

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
              {(() => {
                const sessionCost = calculateSessionCost(session)
                const t = session.totalTokens
                const lines = [
                  `입력 ${t.input.toLocaleString()} 토큰`,
                  `출력 ${t.output.toLocaleString()} 토큰`,
                  ...(( t.cachedInput || 0) > 0 ? [`캐시 읽기 ${(t.cachedInput || 0).toLocaleString()} 토큰`] : []),
                  ...((t.cacheWriteInput || 0) > 0 ? [`캐시 쓰기 ${(t.cacheWriteInput || 0).toLocaleString()} 토큰`] : []),
                  `합계 ${totalSessionTokens.toLocaleString()} 토큰`,
                  `≈ $${sessionCost.toFixed(4)}`,
                ]
                return (
                  <span className="group relative cursor-default rounded-full border border-text/12 bg-bg-hover px-2 py-0.5 text-[10px] font-medium text-text-bright">
                    {fmtTokenShort(totalSessionTokens)} 토큰
                    <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-bg-card px-3 py-2 text-left text-[10px] leading-5 text-text/80 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                      {lines.map((line, idx) => (
                        <span key={idx} className={`block ${idx === lines.length - 1 ? 'mt-1 border-t border-border pt-1 text-text-bright' : idx === lines.length - 2 ? 'mt-1 border-t border-border pt-1' : ''}`}>{line}</span>
                      ))}
                    </span>
                  </span>
                )
              })()}
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
            {session.cwd && cdCommand && (
              <div className="flex items-center gap-1.5 text-[11px] text-text/40">
                <span className="text-text/30">프로젝트</span>
                <span className="truncate font-mono">{session.cwd}</span>
                <CopyButton text={cdCommand} />
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

          {baseResumeCommand && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/6 px-3 py-3 text-xs leading-relaxed text-text/70">
              <span className="min-w-0 flex-1">
                {assistantLabel}에서는 <span className="font-mono text-text-bright">{baseResumeCommand}</span> 로 대화를 이어갈 수 있습니다.
              </span>
              <CopyButton text={resumeCommand} />
            </div>
          )}
        </div>
      </div>

      {enrichLoading && (
        <div className="mb-2 text-[11px] text-text/40">도구 호출 상세 로딩 중…</div>
      )}
      {totalToolCalls > 0 && (
        <div className="mb-2 flex items-center justify-between text-[11px] text-text/55">
          <span className="flex items-center gap-1.5">
            <span className="text-text/40">🔧</span>
            도구 호출 {totalToolCalls}개
          </span>
          <button
            onClick={toggleAllTools}
            className="rounded-md border border-border/60 bg-bg-hover/40 px-2 py-1 text-[10px] text-text/70 hover:bg-bg-hover hover:text-text-bright transition-colors"
          >
            {allToolsExpanded ? '모두 접기' : '모두 펼치기'}
          </button>
        </div>
      )}
      <div className="space-y-3">
        {messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          const isHighlighted = highlightMessageIndex === i
          // 메시지 단위 복사: 본문 + 도구 호출 블록 전체를 buildMessageMarkdown 으로 일관 직렬화.
          // 본문이 비고 도구 호출도 없으면 빈 문자열 → 복사 버튼 숨김.
          const copyText = buildMessageMarkdown(msg, session.source)
          const hasCopyTarget = copyText.length > 0
          return (
            <div
              key={i}
              ref={(el) => {
                if (el) messageRefs.current.set(i, el)
                else messageRefs.current.delete(i)
              }}
              className={`group animate-in ${isUser ? 'ml-10' : ''}`}
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
                  {hasCopyTarget && (
                    <CopyButton
                      text={copyText}
                      title="이 메시지 복사"
                      className="rounded-md p-1 text-text/30 opacity-0 transition-all hover:bg-bg-hover hover:text-text-bright group-hover:opacity-100 focus:opacity-100"
                    />
                  )}
                  {msg.tokens && (() => {
                    const inp = msg.tokens.input || 0
                    const out = msg.tokens.output || 0
                    const cacheRead = msg.tokens.cachedInput || 0
                    const cacheWrite = msg.tokens.cacheWriteInput || 0
                    const total = isUser ? inp : inp + out + cacheRead + cacheWrite
                    if (!total) return null

                    const msgTokens = { input: inp, output: out, cachedInput: cacheRead, cacheWriteInput: cacheWrite }
                    const msgCost = !isUser ? calculateSessionCost({ ...session, totalTokens: msgTokens, messages: [] }) : 0
                    const tooltipLines = isUser
                      ? [`입력 ${inp.toLocaleString()} 토큰`]
                      : [
                          `입력 ${inp.toLocaleString()} 토큰`,
                          `출력 ${out.toLocaleString()} 토큰`,
                          ...(cacheRead > 0 ? [`캐시 읽기 ${cacheRead.toLocaleString()} 토큰`] : []),
                          ...(cacheWrite > 0 ? [`캐시 쓰기 ${cacheWrite.toLocaleString()} 토큰`] : []),
                          ...(msgCost > 0 ? [`≈ $${msgCost.toFixed(4)}`] : []),
                        ]

                    return (
                      <span className={`group relative ml-auto cursor-default rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        isUser
                          ? 'border-green/20 bg-green/8 text-green/80'
                          : 'border-text/12 bg-bg-hover text-text-bright'
                      }`}>
                        {fmtTokenShort(total)} 토큰
                        <span className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 w-max rounded-lg border border-border bg-bg-card px-2.5 py-1.5 text-left text-[10px] leading-5 text-text/80 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                          {tooltipLines.map((line, idx) => {
                            const isCost = line.startsWith('≈')
                            return (
                              <span key={idx} className={`block ${isCost ? 'mt-1 border-t border-border pt-1 text-text-bright' : ''}`}>{line}</span>
                            )
                          })}
                        </span>
                      </span>
                    )
                  })()}
                </div>
                <MessageContent text={msg.text} isUser={isUser} />
                {msg.toolCalls && msg.toolCalls.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {msg.toolCalls.map((call, j) => (
                      <ToolCallView key={call.id || j} call={call} expandSignal={expandSignal} />
                    ))}
                  </div>
                ) : msg.toolUses.length > 0 ? (
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
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
