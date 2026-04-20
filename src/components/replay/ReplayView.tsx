import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ChevronDown, ChevronUp, Pause, Play, SkipBack, SkipForward, Wrench } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Session, ParsedMessage } from '../../types'
import { cleanClaudeText } from '../../lib/cleanClaudeText'
import { useI18n } from '../../i18n'
import { mdComponents } from '../markdown'
import {
  buildTimeline,
  computeDensityBuckets,
  findEventAt,
  formatReplayTime,
  messageIndexAt,
  offsetForMessageIndex,
  type GapMagnitude,
  type ReplaySpeed,
  type ReplayTimeline,
} from '../../lib/replay'

interface ReplayViewProps {
  session: Session
  onBack: () => void
}

const SPEED_OPTIONS: ReplaySpeed[] = [1, 2, 5]
const DENSITY_BUCKETS = 40

function useGapLabel() {
  const { t } = useI18n()
  return useCallback(
    (magnitude: GapMagnitude): string => {
      if (magnitude.unit === 'minutes') return t('replay.gap.minutes', { minutes: magnitude.value })
      if (magnitude.unit === 'hours') return t('replay.gap.hours', { hours: magnitude.value })
      return ''
    },
    [t]
  )
}

function MessageBody({
  text,
  isTyping,
  charsVisible,
}: {
  text: string
  isTyping: boolean
  charsVisible: number
}) {
  const shown = isTyping ? text.slice(0, Math.max(0, charsVisible)) : text
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {shown}
    </ReactMarkdown>
  )
}

function ToolUsePanel({ message }: { message: ParsedMessage }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  if (!message.toolUses || message.toolUses.length === 0) return null
  const preview = message.toolUses.slice(0, 3).join(', ')
  const extra = message.toolUses.length > 3 ? ` +${message.toolUses.length - 3}` : ''

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border/40 bg-bg px-2 py-0.5 text-[10px] text-text/60 transition-colors hover:border-border hover:text-text"
        aria-expanded={expanded}
      >
        <Wrench className="h-3 w-3" />
        <span>{preview}{extra}</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {expanded && (
        <ul className="mt-2 space-y-1 rounded-lg border border-border/40 bg-bg/60 px-3 py-2 text-[11px] text-text/70">
          {message.toolUses.map((tool, i) => (
            <li key={`${tool}-${i}`} className="flex items-center gap-1.5 font-mono">
              <span className="text-text/40">{String(i + 1).padStart(2, '0')}</span>
              <span>{tool}</span>
            </li>
          ))}
          <li className="pt-1 text-[10px] text-text/40 normal-case">
            {t('replay.tools')} · {message.toolUses.length}
          </li>
        </ul>
      )}
    </div>
  )
}

function Scrubber({
  timeline,
  progress,
  onSeek,
}: {
  timeline: ReplayTimeline
  progress: number
  onSeek: (ratio: number) => void
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const density = useMemo(() => computeDensityBuckets(timeline, DENSITY_BUCKETS), [timeline])

  const pointerToRatio = useCallback((clientX: number) => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: PointerEvent) => onSeek(pointerToRatio(e.clientX))
    const handleUp = () => setDragging(false)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [dragging, onSeek, pointerToRatio])

  return (
    <div className="mb-3">
      <div
        ref={trackRef}
        className="group relative h-6 cursor-pointer select-none touch-none"
        onPointerDown={(e) => {
          e.preventDefault()
          setDragging(true)
          onSeek(pointerToRatio(e.clientX))
        }}
      >
        <div className="absolute inset-x-0 top-[22px] flex h-3 items-end gap-[1px]">
          {density.map((d, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-text/20"
              style={{ height: `${Math.max(2, d * 100)}%`, opacity: 0.3 + d * 0.6 }}
            />
          ))}
        </div>
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-border/60">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent/80"
            style={{ width: `${progress * 100}%` }}
          />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-accent shadow transition-transform group-hover:scale-110"
            style={{ left: `calc(${progress * 100}% - 6px)` }}
          />
        </div>
      </div>
    </div>
  )
}

export function ReplayView({ session, onBack }: ReplayViewProps) {
  const { t } = useI18n()
  const gapLabel = useGapLabel()
  const timeline = useMemo(() => buildTimeline(session.messages), [session.messages])
  const [elapsedMs, setElapsedMs] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [speed, setSpeed] = useState<ReplaySpeed>(1)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const currentEventIndex = useMemo(() => findEventAt(timeline, elapsedMs), [timeline, elapsedMs])
  const visibleEvents = useMemo(
    () => (currentEventIndex < 0 ? [] : timeline.events.slice(0, currentEventIndex + 1)),
    [timeline, currentEventIndex]
  )
  const currentMessageIndex = useMemo(
    () => messageIndexAt(timeline, elapsedMs),
    [timeline, elapsedMs]
  )

  const currentEvent = currentEventIndex >= 0 ? timeline.events[currentEventIndex] : null
  const withinCurrentWindow =
    currentEvent != null && elapsedMs < currentEvent.offsetMs + currentEvent.durationMs
  const reachedEnd = timeline.totalMs > 0 && elapsedMs >= timeline.totalMs
  const isCurrentTypingTarget =
    !reachedEnd &&
    withinCurrentWindow &&
    currentEvent?.kind === 'message' &&
    currentEvent.message.role === 'assistant'
  const currentMessageStartMs = currentEvent?.kind === 'message' ? currentEvent.offsetMs : 0
  const currentMessageDurationMs = currentEvent?.kind === 'message' ? currentEvent.durationMs : 1
  const currentMessageLength =
    currentEvent?.kind === 'message' ? currentEvent.message.text.length : 0
  const elapsedInCurrent = Math.max(0, elapsedMs - currentMessageStartMs)
  const charsVisible = Math.floor(
    (elapsedInCurrent / currentMessageDurationMs) * currentMessageLength
  )

  useEffect(() => {
    if (!isPlaying) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      setElapsedMs((prev) => {
        const next = prev + dt * speed
        if (next >= timeline.totalMs) {
          setIsPlaying(false)
          return timeline.totalMs
        }
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, speed, timeline.totalMs])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const STICK_THRESHOLD_PX = 120
    const EASE_FACTOR = 0.005      // 프레임당 남은 거리의 0.5% — 매우 완만한 chase
    const MIN_STEP_PX = 6          // 프레임당 최소 이동 — 타이핑 속도 따라잡기용
    const USER_PAUSE_MS = 600       // 사용자 상호작용 후 자동 스크롤 일시정지
    let stick = true
    let pauseUntil = 0
    let rafId = 0
    let active = true

    const onUserScroll = () => {
      stick = false
      pauseUntil = performance.now() + USER_PAUSE_MS
    }

    const onScroll = () => {
      const distance = container.scrollHeight - container.scrollTop - container.clientHeight
      if (distance <= STICK_THRESHOLD_PX) stick = true
    }

    const loop = () => {
      if (!active) return
      if (stick && performance.now() >= pauseUntil) {
        const target = container.scrollHeight - container.clientHeight
        const diff = target - container.scrollTop
        if (diff > 1) {
          const step = Math.max(MIN_STEP_PX, diff * EASE_FACTOR)
          container.scrollTop += Math.min(diff, step)
        } else if (diff > 0) {
          container.scrollTop = target
        }
      }
      rafId = requestAnimationFrame(loop)
    }

    container.addEventListener('wheel', onUserScroll, { passive: true })
    container.addEventListener('touchmove', onUserScroll, { passive: true })
    container.addEventListener('scroll', onScroll, { passive: true })
    rafId = requestAnimationFrame(loop)

    return () => {
      active = false
      cancelAnimationFrame(rafId)
      container.removeEventListener('wheel', onUserScroll)
      container.removeEventListener('touchmove', onUserScroll)
      container.removeEventListener('scroll', onScroll)
    }
  }, [])

  const togglePlay = useCallback(() => {
    setElapsedMs((prev) => (prev >= timeline.totalMs ? 0 : prev))
    setIsPlaying((v) => !v)
  }, [timeline.totalMs])

  const stepMessage = useCallback(
    (dir: 1 | -1) => {
      const cur = currentMessageIndex < 0 ? 0 : currentMessageIndex
      const next = Math.max(0, Math.min(timeline.messageCount - 1, cur + dir))
      setElapsedMs(offsetForMessageIndex(timeline, next))
    },
    [currentMessageIndex, timeline]
  )

  const seek = useCallback(
    (ratio: number) => {
      const clamped = Math.max(0, Math.min(1, ratio))
      setElapsedMs(clamped * timeline.totalMs)
    },
    [timeline.totalMs]
  )

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowRight') {
        stepMessage(1)
      } else if (e.key === 'ArrowLeft') {
        stepMessage(-1)
      } else if (e.key === 'Home') {
        setElapsedMs(0)
        setIsPlaying(false)
      } else if (e.key === 'End') {
        setElapsedMs(timeline.totalMs)
        setIsPlaying(false)
      } else if (e.key === 'Escape') {
        onBack()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [togglePlay, stepMessage, timeline.totalMs, onBack])

  const progress = timeline.totalMs > 0 ? elapsedMs / timeline.totalMs : 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg text-text" data-replay-root>
      <header className="flex items-center justify-between border-b border-border/60 bg-bg-card px-5 py-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-text transition-colors hover:text-text-bright"
          title="Esc"
          data-replay-back
        >
          <ArrowLeft className="h-4 w-4" />
          {t('replay.back')}
        </button>
        <div className="text-xs text-text/60" data-replay-counter>
          {session.source === 'claude' ? 'Claude' : 'Codex'} · {Math.max(0, currentMessageIndex) + 1}/{timeline.messageCount}
        </div>
        <div
          className="flex items-center gap-1 rounded-full border border-border/60 bg-bg p-0.5 text-xs"
          title={t('replay.speed')}
        >
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              data-replay-speed={s}
              className={`rounded-full px-2.5 py-1 transition-colors ${
                speed === s ? 'bg-accent/15 text-accent' : 'text-text/60 hover:text-text-bright'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-8">
        <div className="mx-auto max-w-2xl space-y-4 pb-24" data-replay-feed>
          <AnimatePresence initial={false}>
            {visibleEvents.map((event, i) => {
              if (event.kind === 'gap') {
                const label = gapLabel(event.magnitude)
                if (!label) return null
                return (
                  <motion.div
                    key={`gap-${i}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex justify-center"
                  >
                    <span className="rounded-full border border-border/50 bg-bg-card px-3 py-1 text-[11px] text-text/50">
                      ── {label} ──
                    </span>
                  </motion.div>
                )
              }
              const msg = event.message
              const isUser = msg.role === 'user'
              const cleaned = cleanClaudeText(msg.text).text
              const isTypingTarget =
                isCurrentTypingTarget && currentEventIndex === i && !isUser
              const showCaret = isTypingTarget && charsVisible < cleaned.length
              return (
                <motion.div
                  key={`msg-${event.messageIndex}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`rounded-xl border px-4 py-3 ${
                    isUser ? 'border-accent/25 bg-accent/5' : 'border-border/60 bg-bg-card'
                  }`}
                  data-replay-message={event.messageIndex}
                >
                  <div className="mb-1.5 flex items-center gap-2 text-[11px] uppercase tracking-wide text-text/50">
                    <span>{isUser ? t('replay.you') : session.source === 'codex' ? 'Codex' : 'Claude'}</span>
                  </div>
                  <div className={`text-sm leading-7 ${isUser ? 'text-text-bright' : 'text-text'}`}>
                    <MessageBody text={cleaned} isTyping={isTypingTarget} charsVisible={charsVisible} />
                    {showCaret && <span className="inline-block w-[2px] h-4 align-middle bg-accent animate-pulse ml-0.5" />}
                  </div>
                  <ToolUsePanel message={msg} />
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>

      <footer className="border-t border-border/60 bg-bg-card px-5 py-3">
        <div className="mx-auto max-w-3xl">
          <Scrubber timeline={timeline} progress={progress} onSeek={seek} />
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-text/60" data-replay-time>
              {formatReplayTime(elapsedMs)} / {formatReplayTime(timeline.totalMs)}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => stepMessage(-1)}
                className="rounded-full p-2 text-text/70 transition-colors hover:bg-bg-hover hover:text-text-bright"
                title={t('replay.prev')}
                data-replay-prev
              >
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                onClick={togglePlay}
                className="rounded-full bg-accent/15 p-3 text-accent transition-colors hover:bg-accent/25"
                title={t('replay.play')}
                data-replay-play
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button
                onClick={() => stepMessage(1)}
                className="rounded-full p-2 text-text/70 transition-colors hover:bg-bg-hover hover:text-text-bright"
                title={t('replay.next')}
                data-replay-next
              >
                <SkipForward className="h-4 w-4" />
              </button>
            </div>
            <span className="font-mono text-[11px] text-text/40">{t('replay.keyboardHint')}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
