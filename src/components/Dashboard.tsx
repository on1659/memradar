import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  Bell,
  Brain,
  Calendar,
  MessageSquare,
  TrendingUp,
  Zap,
} from 'lucide-react'
import type { Session, Stats } from '../types'
import { computeStats } from '../parser'
import { useI18n } from '../i18n'
import { shortModelName } from '../lib/modelNames'
import { calculateSourceCost, getSourceColor, getTokenTotals } from '../lib/tokenPricing'
import { Heatmap } from './Heatmap'
import { HourChart } from './HourChart'
import { ThemeSwitcher } from './ThemeSwitcher'
import { WordCloud } from './WordCloud'
import { UpdatesPopover, latestProductUpdate } from './updates/ProductUpdates'

const BLOG_URL = 'https://radarlog.kr'
const GITHUB_URL = 'https://github.com/on1659/memradar'

interface DashboardProps {
  sessions: Session[]
  onSelectSession: (session: Session) => void
  onOpenWrapped?: () => void
  onOpenPersonality?: () => void
  themeProps: {
    theme: string
    accent: string
    setTheme: (theme: string) => void
    setAccent: (accent: string) => void
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const mins = Math.floor(ms / 60000)

  if (mins < 60) return `${mins}분`

  const hours = Math.floor(mins / 60)
  return `${hours}시간 ${mins % 60}분`
}

function getSessionTotalTokens(session: Session): number {
  return session.totalTokens.input + session.totalTokens.output + (session.totalTokens.cachedInput || 0)
}

function getSessionDisplayName(session: Session): string {
  const rawName = session.fileName.split(/[\\/]/).pop() || session.fileName || session.id
  return rawName.replace(/\.(jsonl?|txt)$/i, '')
}

function DonutChart({ data }: { data: [string, number][] }) {
  const total = data.reduce((sum, [, count]) => sum + count, 0)
  const colors = [
    'var(--color-accent)',
    'var(--color-green)',
    'var(--color-amber)',
    'var(--color-rose)',
    'var(--color-cyan)',
  ]
  const outerRadius = 70
  const innerRadius = 45
  const cx = 90
  const cy = 90

  const arcs = data.slice(0, 5).map(([model, count], index) => {
    const pct = count / total
    const startAngle = data
      .slice(0, index)
      .reduce((angle, [, previousCount]) => angle + (previousCount / total) * 360, 0)
    const endAngle = startAngle + pct * 360

    const startRadians = (startAngle - 90) * Math.PI / 180
    const endRadians = (endAngle - 90) * Math.PI / 180
    const largeArc = pct > 0.5 ? 1 : 0

    const x1 = cx + outerRadius * Math.cos(startRadians)
    const y1 = cy + outerRadius * Math.sin(startRadians)
    const x2 = cx + outerRadius * Math.cos(endRadians)
    const y2 = cy + outerRadius * Math.sin(endRadians)
    const x3 = cx + innerRadius * Math.cos(endRadians)
    const y3 = cy + innerRadius * Math.sin(endRadians)
    const x4 = cx + innerRadius * Math.cos(startRadians)
    const y4 = cy + innerRadius * Math.sin(startRadians)

    const d = `M${x1},${y1} A${outerRadius},${outerRadius} 0 ${largeArc},1 ${x2},${y2} L${x3},${y3} A${innerRadius},${innerRadius} 0 ${largeArc},0 ${x4},${y4} Z`

    return (
      <path key={model} d={d} fill={colors[index % colors.length]} opacity={0.8}>
        <title>{shortModelName(model)}: {Math.round(pct * 100)}%</title>
      </path>
    )
  })

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 180 180" className="h-36 w-36 shrink-0">
        {arcs}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--color-text-bright)" fontSize="18" fontWeight="700">
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--color-text)" fontSize="10">
          세션
        </text>
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5">
        {data.slice(0, 5).map(([model, count], index) => (
          <div key={model} className="flex items-center gap-2 text-sm">
            <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[index % colors.length] }} />
            <span className="truncate text-text">{shortModelName(model)}</span>
            <span className="ml-auto shrink-0 text-text/40">{Math.round((count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

void DonutChart

function InteractiveDonutChart({ data }: { data: [string, number][] }) {
  const total = data.reduce((sum, [, count]) => sum + count, 0)
  const [hoveredModel, setHoveredModel] = useState<{
    label: string
    raw: string
    percent: number
    color: string
  } | null>(null)
  const colors = [
    'var(--color-accent)',
    'var(--color-green)',
    'var(--color-amber)',
    'var(--color-rose)',
    'var(--color-cyan)',
  ]
  const outerRadius = 70
  const innerRadius = 45
  const cx = 90
  const cy = 90

  const arcs = data.slice(0, 5).map(([model, count], index) => {
    const pct = count / total
    const label = shortModelName(model)
    const color = colors[index % colors.length]
    const startAngle = data
      .slice(0, index)
      .reduce((angle, [, previousCount]) => angle + (previousCount / total) * 360, 0)
    const endAngle = startAngle + pct * 360

    const startRadians = (startAngle - 90) * Math.PI / 180
    const endRadians = (endAngle - 90) * Math.PI / 180
    const largeArc = pct > 0.5 ? 1 : 0

    const x1 = cx + outerRadius * Math.cos(startRadians)
    const y1 = cy + outerRadius * Math.sin(startRadians)
    const x2 = cx + outerRadius * Math.cos(endRadians)
    const y2 = cy + outerRadius * Math.sin(endRadians)
    const x3 = cx + innerRadius * Math.cos(endRadians)
    const y3 = cy + innerRadius * Math.sin(endRadians)
    const x4 = cx + innerRadius * Math.cos(startRadians)
    const y4 = cy + innerRadius * Math.sin(startRadians)

    const d = `M${x1},${y1} A${outerRadius},${outerRadius} 0 ${largeArc},1 ${x2},${y2} L${x3},${y3} A${innerRadius},${innerRadius} 0 ${largeArc},0 ${x4},${y4} Z`

    return (
      <path
        key={model}
        d={d}
        fill={color}
        className="dashboard-donut-slice"
        opacity={0.8}
        onMouseEnter={() => setHoveredModel({ label, raw: model, percent: Math.round(pct * 100), color })}
        onMouseLeave={() => setHoveredModel(null)}
      >
        <title>{label}: {Math.round(pct * 100)}%</title>
      </path>
    )
  })

  return (
    <div className="relative flex items-center gap-4">
      {hoveredModel && (
        <div className="pointer-events-none absolute -top-8 left-3 z-10 rounded-full border border-border bg-bg-hover px-3 py-1 text-xs text-text-bright shadow-lg">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: hoveredModel.color }} />
            <span>{hoveredModel.label}</span>
            <span className="text-text/45">{hoveredModel.percent}%</span>
          </span>
          {hoveredModel.raw === '<synthetic>' && (
            <span className="ml-2 text-text/45">임시 집계 모델</span>
          )}
        </div>
      )}

      <svg viewBox="0 0 180 180" className="h-36 w-36 shrink-0 overflow-visible">
        {arcs}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--color-text-bright)" fontSize="18" fontWeight="700">
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--color-text)" fontSize="10">
          세션
        </text>
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5">
        {data.slice(0, 5).map(([model, count], index) => (
          <div
            key={model}
            className="dashboard-hover-grow flex items-center gap-2 rounded-lg px-1 py-0.5 text-sm"
            onMouseEnter={() =>
              setHoveredModel({
                label: shortModelName(model),
                raw: model,
                percent: Math.round((count / total) * 100),
                color: colors[index % colors.length],
              })
            }
            onMouseLeave={() => setHoveredModel(null)}
          >
            <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[index % colors.length] }} />
            <span className="truncate text-text">{shortModelName(model)}</span>
            <span className="ml-auto shrink-0 text-text/40">{Math.round((count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const DAY_OF_WEEK_LABELS = ['일', '월', '화', '수', '목', '금', '토']

const BRAND_LETTERS = 'Memradar'.split('')

function DashboardBrand() {
  return (
    <h1 className="dashboard-brand-title flex items-center gap-2 text-3xl font-bold text-text-bright">
      <span className="dashboard-brand-mark text-accent">✦</span>
      <span aria-label="Memradar" className="inline-flex">
        {BRAND_LETTERS.map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            className="dashboard-brand-letter"
            style={{ animationDelay: `${index * 48}ms` }}
            aria-hidden="true"
          >
            {letter}
          </span>
        ))}
      </span>
    </h1>
  )
}

function DayOfWeekPatternPanel({
  values,
  mode,
  total,
  pinned,
  onTogglePinned,
}: {
  values: number[]
  mode: 'count' | 'ratio'
  total: number
  pinned: boolean
  onTogglePinned: () => void
}) {
  const max = Math.max(...values, 1)
  const bestDay = values.indexOf(Math.max(...values))

  return (
    <div className="dashboard-card-body-compact dashboard-pattern-panel space-y-1.5">
      <div className="dashboard-pattern-panel-header flex justify-end pr-0.5">
        <button
          type="button"
          aria-pressed={pinned}
          onClick={onTogglePinned}
          className={`rounded-full border px-2.5 py-1 text-[10px] transition-all ${
            pinned
              ? 'translate-y-px border-accent/50 bg-accent/12 text-accent shadow-[inset_0_1px_2px_rgba(0,0,0,0.28)]'
              : 'border-border/70 bg-bg text-text/55 hover:border-accent/25 hover:text-text-bright'
          }`}
        >
          고정
        </button>
      </div>
      {DAY_OF_WEEK_LABELS.map((label, index) => {
        const count = values[index]
        const ratio = total > 0 ? (count / total) * 100 : 0
        const width = Math.round((count / max) * 100)
        const valueLabel = mode === 'count'
          ? count.toLocaleString()
          : `${ratio.toFixed(1)}%`

        return (
          <div
            key={`${label}-${mode}`}
            className="dashboard-cycle-drop dashboard-pattern-row flex items-center gap-1.5 rounded-md px-1 py-0.5"
            style={{ animationDelay: `${index * 55}ms` }}
          >
            <span className={`w-3 text-right text-[10px] ${index === bestDay ? 'font-bold text-accent' : 'text-text/50'}`}>
              {label}
            </span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
              <div
                className={`dashboard-pattern-bar h-full rounded-full ${index === bestDay ? 'bg-accent/70' : 'bg-accent/30'}`}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className={`w-10 text-right text-[10px] ${index === bestDay ? 'font-bold text-accent' : 'text-text/40'}`}>
              {valueLabel}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function Dashboard({
  sessions,
  onSelectSession,
  onOpenWrapped,
  onOpenPersonality,
  themeProps,
}: DashboardProps) {
  const { locale, t } = useI18n()
  const stats: Stats = useMemo(() => computeStats(sessions), [sessions])
  const [sessionFilter, setSessionFilter] = useState('')
  const [showLeastBusy, setShowLeastBusy] = useState(false)
  const [busyDayPinned, setBusyDayPinned] = useState(false)
  const [updatesOpen, setUpdatesOpen] = useState(false)
  const [dayPatternMode, setDayPatternMode] = useState<'count' | 'ratio'>('count')
  const [dayPatternPinned, setDayPatternPinned] = useState(false)
  const [tokenSource, setTokenSource] = useState<'claude' | 'codex'>('claude')
  const [sessionSourceFilter, setSessionSourceFilter] = useState<'all' | 'claude' | 'codex'>('all')
  const [sessionSort, setSessionSort] = useState<'date' | 'tokens'>('date')

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        const dateDiff = new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        if (sessionSort === 'date') return dateDiff

        const tokenDiff = getSessionTotalTokens(b) - getSessionTotalTokens(a)
        return tokenDiff !== 0 ? tokenDiff : dateDiff
      }),
    [sessionSort, sessions]
  )

  const filteredSessions = useMemo(() => {
    const query = sessionFilter.toLowerCase()

    return sortedSessions.filter((session) => {
      const matchesSource = sessionSourceFilter === 'all' || session.source === sessionSourceFilter
      if (!matchesSource) return false
      if (!sessionFilter.trim()) return true

      return (
        session.messages[0]?.text.toLowerCase().includes(query) ||
        session.messages.some((message) => message.text.toLowerCase().includes(query))
      )
    })
  }, [sessionFilter, sessionSourceFilter, sortedSessions])

  const sourceSessions = useMemo(
    () => ({
      claude: sessions.filter((session) => session.source === 'claude'),
      codex: sessions.filter((session) => session.source === 'codex'),
    }),
    [sessions]
  )

  useEffect(() => {
    if (sourceSessions[tokenSource].length > 0) return
    if (sourceSessions.claude.length > 0) {
      setTokenSource('claude')
      return
    }
    if (sourceSessions.codex.length > 0) {
      setTokenSource('codex')
    }
  }, [sourceSessions, tokenSource])

  const activeTokenSessions = sourceSessions[tokenSource]
  const activeTokenTotals = useMemo(
    () => getTokenTotals(activeTokenSessions),
    [activeTokenSessions]
  )
  const claudeEstimatedCost = useMemo(
    () => calculateSourceCost(sourceSessions.claude),
    [sourceSessions.claude]
  )
  const codexEstimatedCost = useMemo(
    () => calculateSourceCost(sourceSessions.codex),
    [sourceSessions.codex]
  )
  const totalEstimatedCost = useMemo(
    () => calculateSourceCost(sessions),
    [sessions]
  )
  const sourceFilterCounts = {
    all: sessions.length,
    claude: sourceSessions.claude.length,
    codex: sourceSessions.codex.length,
  }
  const hasBothSources = sourceSessions.claude.length > 0 && sourceSessions.codex.length > 0
  const tokenSourceColor = getSourceColor(tokenSource)
  const tokenSourceLabel = tokenSource === 'claude' ? 'Claude' : 'Codex'
  const displayInputTokens = activeTokenTotals.input + (activeTokenTotals.cachedInput || 0)
  const isKorean = locale === 'ko'
  const tokenUsageLabel = isKorean ? '토큰 사용' : 'Token Usage'
  const tokenCostLabel = isKorean ? 'API 예상 비용' : 'Estimated API cost'
  const tokenCostTriggerLabel = isKorean ? '예상 비용' : 'Est. cost'
  const tokenEstimateLabel = isKorean
    ? hasBothSources ? 'Claude + Codex 합산 추정치' : `${tokenSourceLabel} 기준 추정치`
    : hasBothSources ? 'Combined estimate across Claude + Codex' : `Estimated from ${tokenSourceLabel} usage`
  const sessionListTitle = isKorean ? '대화 기록' : 'Conversation history'
  const sessionSearchPlaceholder = isKorean
    ? '대화 검색 (이름, 내용)'
    : 'Search conversations (name, content)'
  const emptySessionListLabel = isKorean
    ? '표시할 세션이 없어요. 검색어나 소스 필터를 바꿔보세요.'
    : 'No sessions match this view. Try changing the search or source filter.'
  const untitledSessionLabel = isKorean ? '(빈 세션)' : '(Untitled session)'
  const openSessionLabel = isKorean ? '열기' : 'Open'
  const allSourceLabel = isKorean ? '전체' : 'All'
  const sessionNameLabel = isKorean ? '세션 이름' : 'Session name'
  const sortLabel = isKorean ? '정렬' : 'Sort'
  const sortByDateLabel = isKorean ? '날짜순' : 'Newest'
  const sortByTokensLabel = isKorean ? '토큰 사용순' : 'Tokens'
  const formatSessionCount = (count: number) => (isKorean ? `${count}개` : `${count}`)
  const formatMessageCount = (count: number) => (isKorean ? `${count}개 메시지` : `${count} messages`)

  const leastBusyDay = useMemo(() => {
    const entries = Object.entries(stats.dailyActivity).filter(([, value]) => value > 0)
    if (entries.length === 0) return ''
    return entries.sort((a, b) => a[1] - b[1])[0][0]
  }, [stats])

  const dailyAvg = useMemo(() => {
    const entries = Object.entries(stats.dailyActivity)
    if (entries.length === 0) return 0
    const total = entries.reduce((sum, [, value]) => sum + value, 0)
    return Math.round(total / entries.length)
  }, [stats])

  const topModels = useMemo(
    () => Object.entries(stats.modelsUsed).sort((a, b) => b[1] - a[1]),
    [stats]
  )

  const longestStreak = useMemo(() => {
    let longest = 0
    let streak = 0

    const dates = Object.keys(stats.dailyActivity).sort()
    if (dates.length > 0) {
      streak = 0
      const start = new Date(dates[0])
      const end = new Date(dates[dates.length - 1])
      const walker = new Date(start)

      while (walker <= end) {
        const key = walker.toISOString().slice(0, 10)
        if ((stats.dailyActivity[key] || 0) > 0) {
          streak++
          if (streak > longest) longest = streak
        } else {
          streak = 0
        }
        walker.setDate(walker.getDate() + 1)
      }
    }

    return longest
  }, [stats])

  const dayOfWeekActivity = useMemo(() => {
    const days = [0, 0, 0, 0, 0, 0, 0]

    for (const [date, count] of Object.entries(stats.dailyActivity)) {
      const day = new Date(date).getDay()
      days[day] += count
    }

    return days
  }, [stats])

  const dayPatternTotal = useMemo(
    () => dayOfWeekActivity.reduce((sum, value) => sum + value, 0),
    [dayOfWeekActivity]
  )
  const activeDayKeys = useMemo(
    () => Object.entries(stats.dailyActivity)
      .filter(([, value]) => value > 0)
      .map(([date]) => date)
      .sort(),
    [stats.dailyActivity]
  )
  const activeDayCount = activeDayKeys.length
  const observedDayCount = useMemo(() => {
    if (activeDayKeys.length === 0) return 0

    const start = new Date(activeDayKeys[0])
    const end = new Date(activeDayKeys[activeDayKeys.length - 1])
    start.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)

    return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1)
  }, [activeDayKeys])
  const activityDensityRatio = observedDayCount > 0 ? Math.round((activeDayCount / observedDayCount) * 100) : 0
  const activityDensityTitle = isKorean ? '활동 밀도' : 'Activity density'
  const activeDayLabel = isKorean ? '활동일' : 'Active days'
  const observedDayLabel = isKorean ? '관측' : 'Observed'
  const dayUnitLabel = isKorean ? '일' : 'days'

  useEffect(() => {
    if (dayPatternPinned) return

    const timer = window.setInterval(() => {
      setDayPatternMode((prev) => prev === 'count' ? 'ratio' : 'count')
    }, 10000)

    return () => window.clearInterval(timer)
  }, [dayPatternPinned])

  useEffect(() => {
    if (busyDayPinned) return
    if (!stats.busiestDay || !leastBusyDay || stats.busiestDay === leastBusyDay) return

    const timer = window.setInterval(() => {
      setShowLeastBusy((prev) => !prev)
    }, 10000)

    return () => window.clearInterval(timer)
  }, [busyDayPinned, leastBusyDay, stats.busiestDay])

  const busyDay = showLeastBusy ? leastBusyDay : stats.busiestDay
  const busyDayCount = busyDay ? stats.dailyActivity[busyDay] : 0

  function renderSessionRow(session: Session) {
    const sourceColor = getSourceColor(session.source)
    const sourceLabel = session.source === 'claude' ? 'Claude' : 'Codex'
    const messageCount = session.messageCount.user + session.messageCount.assistant
    const sessionTokenTotal = getSessionTotalTokens(session)
    const sessionDisplayName = getSessionDisplayName(session)

    return (
      <button
        key={session.id}
        onClick={() => onSelectSession(session)}
        className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-bg-hover"
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1 truncate text-sm font-medium text-text-bright">
            {session.messages[0]?.text.slice(0, 80) || untitledSessionLabel}
          </div>
          <div className="mb-1 truncate text-[11px] text-text/38">
            {sessionNameLabel} · {sessionDisplayName}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-text/60">
            <span>{new Date(session.startTime).toLocaleDateString(isKorean ? 'ko-KR' : 'en-US')}</span>
            <span>{formatMessageCount(messageCount)}</span>
            {session.startTime && session.endTime && (
              <span>{formatDuration(session.startTime, session.endTime)}</span>
            )}
            <span className="flex flex-wrap items-center gap-1">
              <span
                className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                style={{
                  color: sourceColor.text,
                  borderColor: sourceColor.border,
                  background: sourceColor.soft,
                }}
              >
                {sourceLabel}
              </span>
              {session.model && (
                <span className="rounded-full border border-cyan/20 bg-cyan/8 px-2 py-0.5 text-[10px] font-medium text-cyan">
                  {shortModelName(session.model)}
                </span>
              )}
              <span className="rounded-full border border-text/12 bg-white/4 px-2 py-0.5 text-[10px] font-medium text-text-bright">
                {formatTokens(sessionTokenTotal)}
              </span>
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] text-text/28">{openSessionLabel}</div>
        </div>
      </button>
    )
  }

  const sessionListContent = filteredSessions.length === 0 ? (
    <div className="px-6 py-16 text-center text-sm text-text/40">
      {emptySessionListLabel}
    </div>
  ) : (
    filteredSessions.map((session) => renderSessionRow(session))
  )

  return (
    <div className="dashboard-shell">
      <div className="animate-in mb-5 flex items-center justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-text/55">
            <a
              href={BLOG_URL}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-3 transition-colors hover:text-text-bright hover:underline"
            >
              dev.blog
            </a>
            <span className="text-text/25">·</span>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-3 transition-colors hover:text-text-bright hover:underline"
            >
              github
            </a>
          </div>
          <DashboardBrand />
          <p className="mt-1 text-sm text-text">
            {t('dashboard.subtitle', { count: stats.totalSessions })}
          </p>
        </div>
        <div className="flex w-[min(100vw-3rem,42rem)] flex-wrap items-center justify-end gap-2">
          {onOpenWrapped && (
            <button
              onClick={onOpenWrapped}
              className="dashboard-button-attention order-2 flex h-9 items-center gap-2 rounded-xl border border-accent/25 bg-accent/10 px-3 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
            >
              <span className="dashboard-button-attention-runner" aria-hidden="true" />
              <span className="dashboard-button-attention-icon relative z-[1]">✦</span>
              <span className="relative z-[1] hidden sm:inline">{t('dashboard.wrapped')}</span>
            </button>
          )}
          <button
            onClick={() => setUpdatesOpen(true)}
            className="order-1 flex h-9 items-center gap-2 rounded-xl bg-bg-card/70 px-3 text-sm text-text transition-colors hover:bg-bg-hover hover:text-text-bright"
          >
            <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">{t('dashboard.news')}</span>
            <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              {latestProductUpdate.version}
            </span>
          </button>
          {onOpenPersonality && (
            <button
              onClick={onOpenPersonality}
              className="group relative order-3 flex h-9 w-9 items-center justify-center rounded-xl bg-bg-card/70 text-text/70 transition-colors hover:bg-bg-hover hover:text-text-bright"
              title={t('dashboard.personality')}
            >
              <Brain className="h-4 w-4" />
              <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-bg-hover px-2.5 py-1.5 text-xs text-text-bright opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {t('dashboard.personality')}
              </span>
            </button>
          )}
          <div className="order-4">
            <ThemeSwitcher
              theme={themeProps.theme}
              accent={themeProps.accent}
              onThemeChange={themeProps.setTheme}
              onAccentChange={themeProps.setAccent}
            />
          </div>
        </div>
      </div>

      <UpdatesPopover open={updatesOpen} onClose={() => setUpdatesOpen(false)} />

      <div className="dashboard-stats-grid animate-in">
        <div className="dashboard-card">
          <div className="mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-accent" />
            <span className="text-sm text-text">총 대화</span>
          </div>
          <div className="count-up text-2xl font-bold text-text-bright">{stats.totalMessages.toLocaleString()}</div>
          <div className="mt-1 text-xs text-text/60">{stats.totalSessions}개 세션 (턴 기준)</div>
        </div>

        <div className="dashboard-card dashboard-card-token">
          <div className="dashboard-token-header">
            <div className="dashboard-token-title">
              <Zap className="dashboard-token-title-icon h-4 w-4" aria-hidden="true" />
              <span className="whitespace-nowrap text-sm text-text">{tokenUsageLabel}</span>
            </div>
            <div className="dashboard-token-header-actions">
              <div className="dashboard-token-switch">
                {(['claude', 'codex'] as const).map((source) => {
                  const active = tokenSource === source
                  const disabled = sourceSessions[source].length === 0
                  const color = getSourceColor(source)

                  return (
                    <button
                      key={source}
                      type="button"
                      onClick={() => !disabled && setTokenSource(source)}
                      disabled={disabled}
                      className="min-w-[4.1rem] rounded-full px-2.5 py-1 text-[10px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-35"
                      style={{
                        color: active ? color.text : undefined,
                        background: active ? color.soft : undefined,
                        boxShadow: active ? `inset 0 0 0 1px ${color.border}` : undefined,
                      }}
                    >
                      {source === 'claude' ? 'Claude' : 'Codex'}
                    </button>
                  )
                })}
              </div>
              <div className="dashboard-token-cost group">
                <button
                  type="button"
                  className="dashboard-token-cost-trigger"
                  aria-label={tokenCostLabel}
                >
                  {tokenCostTriggerLabel}
                </button>
                <div className="dashboard-tooltip-panel dashboard-token-cost-panel pointer-events-none absolute bottom-full right-0 mb-2 w-60 rounded-lg border border-border bg-bg-hover p-3 text-xs text-text/70 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <div className="mb-2 flex justify-between gap-3">
                    <span>{tokenCostLabel}</span>
                    <span
                      className="font-mono"
                      style={{ color: hasBothSources ? 'var(--color-text-bright)' : tokenSourceColor.text }}
                    >
                      ${totalEstimatedCost.toFixed(2)}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {sourceSessions.claude.length > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <span style={{ color: getSourceColor('claude').text }}>Claude</span>
                        <span className="font-mono">${claudeEstimatedCost.toFixed(2)}</span>
                      </div>
                    )}
                    {sourceSessions.codex.length > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <span style={{ color: getSourceColor('codex').text }}>Codex</span>
                        <span className="font-mono">${codexEstimatedCost.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-[10px] text-text/40">{tokenEstimateLabel}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="dashboard-token-body">
            <div className="dashboard-token-source" style={{ color: tokenSourceColor.text }}>
              {tokenSourceLabel}
            </div>
            <div className="count-up dashboard-token-total" style={{ color: tokenSourceColor.text }}>
              {formatTokens(displayInputTokens + activeTokenTotals.output)}
            </div>
            <div className="dashboard-token-breakdown text-xs text-text/60">
              {isKorean ? '입력' : 'Input'} {formatTokens(displayInputTokens)} / {isKorean ? '출력' : 'Output'}{' '}
              {formatTokens(activeTokenTotals.output)}
              {(activeTokenTotals.cachedInput || 0) > 0 && (
                <span className="ml-1 text-text/35">cache {formatTokens(activeTokenTotals.cachedInput || 0)}</span>
              )}
            </div>
          </div>
        </div>
        <div className="dashboard-card">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-green" />
            <span className="text-sm text-text">세션당 대화</span>
          </div>
          <div className="count-up text-2xl font-bold text-text-bright">{stats.avgMessagesPerSession}</div>
          <div className="mt-1 text-xs text-text/60">일 평균 {dailyAvg}개 메시지</div>
        </div>

        <div className="dashboard-card">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-rose" />
              <span key={`${busyDay}-label`} className="dashboard-cycle-drop text-sm text-text">
                {showLeastBusy ? '한가한 날' : '바쁜 날'}
              </span>
            </div>
            <button
              type="button"
              aria-pressed={busyDayPinned}
              onClick={() => setBusyDayPinned((prev) => !prev)}
              className={`rounded-full border px-2.5 py-1 text-[10px] transition-all ${
                busyDayPinned
                  ? 'translate-y-px border-accent/50 bg-accent/12 text-accent shadow-[inset_0_1px_2px_rgba(0,0,0,0.28)]'
                  : 'dashboard-button-attention-soft border-border/70 bg-bg text-text/55 hover:border-accent/25 hover:text-text-bright'
              }`}
            >
              고정
            </button>
          </div>
          <div key={`${busyDay}-date`} className="dashboard-cycle-drop text-2xl font-bold text-text-bright">{busyDay || '-'}</div>
          <div key={`${busyDay}-count`} className="dashboard-cycle-drop mt-1 text-xs text-text/60">{busyDay ? `${busyDayCount}개 메시지` : ''}</div>
        </div>
      </div>

      <div className="dashboard-activity-grid animate-in">
        <div className="dashboard-card dashboard-card-compact dashboard-card-tight">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text-bright">
            <TrendingUp className="h-3.5 w-3.5 text-green" />
            활동 히트맵
          </h2>
          <div className="dashboard-heatmap-body">
            <Heatmap dailyActivity={stats.dailyActivity} />
          </div>
        </div>

        <div className="dashboard-side-stack">
          <div className="dashboard-card dashboard-card-compact dashboard-card-tight dashboard-side-card dashboard-side-card-primary">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text-bright">
              <Zap className="h-3.5 w-3.5 text-amber" />
              연속 기록
            </h3>
            <div className="dashboard-card-body-compact dashboard-streak-body dashboard-streak-body-single">
              <div>
                <div className="mb-0.5 text-[10px] text-text/50">최장 연속</div>
                <div className="text-2xl font-bold text-accent">
                  {longestStreak}
                  <span className="ml-1 text-xs font-normal text-text/50">일</span>
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-card dashboard-card-compact dashboard-card-tight dashboard-side-card dashboard-side-card-secondary">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text-bright">
              <BarChart3 className="h-3.5 w-3.5 text-accent" />
              {activityDensityTitle}
            </h3>
            <div className="dashboard-card-body-compact dashboard-density-body">
              <div className="dashboard-density-panel">
                <div className="dashboard-density-ratio font-bold text-text-bright">{activityDensityRatio}%</div>
                <div className="dashboard-density-divider" />
                <div className="dashboard-density-caption">
                  {activeDayLabel} {activeDayCount}{dayUnitLabel} / {observedDayLabel} {observedDayCount}{dayUnitLabel}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-card dashboard-card-compact dashboard-card-tight dashboard-side-card">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text-bright">
            <Calendar className="h-3.5 w-3.5 text-cyan" />
            요일별 패턴
          </h3>
          <DayOfWeekPatternPanel
            values={dayOfWeekActivity}
            mode={dayPatternMode}
            total={dayPatternTotal}
            pinned={dayPatternPinned}
            onTogglePinned={() => setDayPatternPinned((prev) => !prev)}
          />
        </div>
      </div>

      <div className="dashboard-analytics-grid">
        <div className="dashboard-card dashboard-card-roomy animate-in">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <Brain className="h-4 w-4 text-accent" /> 사용한 모델
          </h2>
          <div className="dashboard-card-body-center">
            <InteractiveDonutChart data={topModels} />
          </div>
        </div>

        <div className="dashboard-card dashboard-card-roomy animate-in">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-text-bright">
            <MessageSquare className="h-5 w-5 text-cyan" />
            시간대별 활동
          </h2>
          <div className="dashboard-card-body-center">
            <HourChart data={stats.hourlyActivity} />
          </div>
        </div>

        <div className="dashboard-card dashboard-card-roomy animate-in">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-text-bright">
            <Brain className="h-5 w-5 text-rose" />
            자주 쓴 단어
          </h2>
          <WordCloud
            words={stats.topWords}
            wordsUser={stats.topWordsUser}
            wordsAssistant={stats.topWordsAssistant}
          />
        </div>
      </div>


      <div className="dashboard-card dashboard-card-flush animate-in">
        <div className="border-b border-border p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-bright">{sessionListTitle}</h2>
            <span className="text-xs text-text/40">{formatSessionCount(filteredSessions.length)}</span>
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'claude', 'codex'] as const).map((source) => {
                const active = sessionSourceFilter === source
                const sourceColor = source === 'all' ? null : getSourceColor(source)
                const count = sourceFilterCounts[source]
                const activeStyles = source === 'all'
                  ? {
                      color: 'var(--color-text-bright)',
                      borderColor: 'var(--color-border)',
                      background: 'var(--color-bg-hover)',
                    }
                  : {
                      color: sourceColor?.text,
                      borderColor: sourceColor?.border,
                      background: sourceColor?.soft,
                    }

                return (
                  <button
                    key={source}
                    type="button"
                    onClick={() => setSessionSourceFilter(source)}
                    className="rounded-full border px-3 py-1 text-[11px] font-medium transition-all"
                    style={active ? activeStyles : undefined}
                  >
                    {source === 'all' ? allSourceLabel : source === 'claude' ? 'Claude' : 'Codex'} {count}
                  </button>
                )
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-text/40">{sortLabel}</span>
              {([
                ['date', sortByDateLabel],
                ['tokens', sortByTokensLabel],
              ] as const).map(([sortKey, label]) => (
                <button
                  key={sortKey}
                  type="button"
                  onClick={() => setSessionSort(sortKey)}
                  className="rounded-full border px-3 py-1 text-[11px] font-medium transition-all"
                  style={sessionSort === sortKey
                    ? {
                        color: 'var(--color-text-bright)',
                        borderColor: 'var(--color-border)',
                        background: 'var(--color-bg-hover)',
                      }
                    : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <input
            type="text"
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            placeholder={sessionSearchPlaceholder}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-bright placeholder:text-text/30 focus:border-accent/50 focus:outline-none"
          />
        </div>

        <div className="max-h-[600px] divide-y divide-border overflow-y-auto">
          {sessionListContent}
        </div>
      </div>
    </div>
  )
}
