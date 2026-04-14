import { useMemo, useState } from 'react'
import {
  ArrowRightLeft,
  BarChart3,
  Brain,
  Calendar,
  CircleHelp,
  MessageSquare,
  RefreshCw,
  Search,
  TrendingUp,
  Zap,
} from 'lucide-react'
import type { Session, Stats } from '../types'
import { computeStats } from '../parser'
import { shortModelName } from '../lib/modelNames'
import { Heatmap } from './Heatmap'
import { HourChart } from './HourChart'
import { ThemeSwitcher } from './ThemeSwitcher'
import { WordCloud } from './WordCloud'

interface DashboardProps {
  sessions: Session[]
  onSelectSession: (session: Session) => void
  onOpenSearch: () => void
  onOpenWrapped?: () => void
  onRefresh?: () => void
  refreshing?: boolean
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
        <div className="pointer-events-none absolute left-3 top-0 z-10 rounded-full border border-border bg-bg-hover px-3 py-1 text-xs text-text-bright shadow-lg">
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
            className="flex items-center gap-2 text-sm"
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

const TOOL_DESC: Record<string, string> = {
  Read: '파일 읽기',
  Write: '파일 쓰기',
  Edit: '파일 수정',
  Bash: '터미널 명령',
  Glob: '파일 검색',
  Grep: '코드 검색',
  Agent: '서브에이전트',
  WebSearch: '웹 검색',
  WebFetch: '웹 요청',
  AskUserQuestion: '사용자 질문',
  TodoWrite: 'TODO 작성',
  NotebookEdit: '노트북 수정',
}

export function Dashboard({
  sessions,
  onSelectSession,
  onOpenSearch,
  onOpenWrapped,
  onRefresh,
  refreshing,
  themeProps,
}: DashboardProps) {
  const stats: Stats = useMemo(() => computeStats(sessions), [sessions])
  const [sessionFilter, setSessionFilter] = useState('')
  const [showLeastBusy, setShowLeastBusy] = useState(false)

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
    [sessions]
  )

  const filteredSessions = useMemo(() => {
    if (!sessionFilter.trim()) return sortedSessions
    const query = sessionFilter.toLowerCase()

    return sortedSessions.filter((session) =>
      session.messages[0]?.text.toLowerCase().includes(query) ||
      session.messages.some((message) => message.text.toLowerCase().includes(query))
    )
  }, [sessionFilter, sortedSessions])

  const tokenCost = useMemo(() => {
    const inputCost = (stats.totalTokens.input / 1_000_000) * 10
    const outputCost = (stats.totalTokens.output / 1_000_000) * 30
    return inputCost + outputCost
  }, [stats])

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

  const topTools = useMemo(
    () => Object.entries(stats.toolsUsed).sort((a, b) => b[1] - a[1]).slice(0, 8),
    [stats]
  )

  const topModels = useMemo(
    () => Object.entries(stats.modelsUsed).sort((a, b) => b[1] - a[1]),
    [stats]
  )

  const { currentStreak, longestStreak } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let current = 0
    let longest = 0
    let streak = 0

    const cursor = new Date(today)
    const todayKey = cursor.toISOString().slice(0, 10)
    const todayHasActivity = (stats.dailyActivity[todayKey] || 0) > 0

    if (!todayHasActivity) cursor.setDate(cursor.getDate() - 1)

    while (true) {
      const key = cursor.toISOString().slice(0, 10)
      if ((stats.dailyActivity[key] || 0) > 0) {
        streak++
        cursor.setDate(cursor.getDate() - 1)
      } else {
        break
      }
    }

    current = streak

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

    return { currentStreak: current, longestStreak: longest }
  }, [stats])

  const dayOfWeekActivity = useMemo(() => {
    const days = [0, 0, 0, 0, 0, 0, 0]

    for (const [date, count] of Object.entries(stats.dailyActivity)) {
      const day = new Date(date).getDay()
      days[day] += count
    }

    return days
  }, [stats])

  const busyDay = showLeastBusy ? leastBusyDay : stats.busiestDay
  const busyDayCount = busyDay ? stats.dailyActivity[busyDay] : 0

  return (
    <div className="dashboard-shell">
      <div className="animate-in mb-5 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-text-bright">
            <span className="text-accent">✦</span> Memradar
          </h1>
          <p className="mt-1 text-sm text-text">
            {stats.totalSessions}개의 세션에서 발견한 당신의 이야기
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-lg border border-border bg-bg-card px-4 py-2 text-sm text-text transition-colors hover:border-accent/30 hover:text-text-bright disabled:opacity-50"
              title="세션 새로고침"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
          {onOpenWrapped && (
            <button
              onClick={onOpenWrapped}
              className="dashboard-button-attention flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-sm text-accent transition-colors hover:bg-accent/20"
            >
              <span className="dashboard-button-attention-icon">✦</span>
              <span className="hidden sm:inline">Wrapped</span>
            </button>
          )}
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-2 rounded-lg border border-border bg-bg-card px-4 py-2 text-sm text-text transition-colors hover:border-accent/30 hover:text-text-bright"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">검색</span>
            <kbd className="ml-1 hidden rounded bg-bg px-1.5 py-0.5 text-[10px] text-text/30 sm:inline">Ctrl+K</kbd>
          </button>
          <ThemeSwitcher
            theme={themeProps.theme}
            accent={themeProps.accent}
            onThemeChange={themeProps.setTheme}
            onAccentChange={themeProps.setAccent}
          />
        </div>
      </div>

      <div className="dashboard-stats-grid animate-in">
        <div className="dashboard-card">
          <div className="mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-accent" />
            <span className="text-sm text-text">총 대화</span>
          </div>
          <div className="count-up text-2xl font-bold text-text-bright">{stats.totalMessages.toLocaleString()}</div>
          <div className="mt-1 text-xs text-text/60">{stats.totalSessions}개 세션 (턴 기준)</div>
        </div>

        <div className="dashboard-card">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber" />
              <span className="text-sm text-text">토큰 사용</span>
            </div>
            <div className="group relative">
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-text/55 transition-colors hover:border-accent/30 hover:text-text-bright"
                aria-label="토큰 사용 안내"
              >
                <CircleHelp className="h-3.5 w-3.5" />
              </button>
              <div className="dashboard-tooltip-panel pointer-events-none absolute bottom-full right-0 mb-2 w-48 rounded-lg border border-border bg-bg-hover p-3 text-xs text-text/70 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <div className="flex justify-between gap-3">
                  <span>API 예상 비용</span>
                  <span className="font-mono text-text-bright">${tokenCost.toFixed(2)}</span>
                </div>
                <div className="mt-1 text-[10px] text-text/40">평균 단가 기준 추정치</div>
              </div>
            </div>
          </div>
          <div className="count-up text-2xl font-bold text-text-bright">
            {formatTokens(stats.totalTokens.input + stats.totalTokens.output)}
          </div>
          <div className="mt-1 text-xs text-text/60">
            입력 {formatTokens(stats.totalTokens.input)} / 출력 {formatTokens(stats.totalTokens.output)}
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
              <span className="text-sm text-text">{showLeastBusy ? '한가한 날' : '바쁜 날'}</span>
            </div>
            <button
              onClick={() => setShowLeastBusy(!showLeastBusy)}
              className="dashboard-button-attention-soft flex items-center gap-1 rounded border border-border bg-bg px-2 py-0.5 text-[10px] text-text/60 transition-colors hover:border-accent/30 hover:text-accent"
            >
              <ArrowRightLeft className="dashboard-button-attention-icon h-3 w-3" />
              전환
            </button>
          </div>
          <div className="count-up text-2xl font-bold text-text-bright">{busyDay || '-'}</div>
          <div className="mt-1 text-xs text-text/60">{busyDay ? `${busyDayCount}개 메시지` : ''}</div>
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

        <div className="dashboard-card dashboard-card-compact dashboard-card-tight">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-text-bright">
            <Zap className="h-3.5 w-3.5 text-amber" />
            연속 기록
          </h3>
          <div className="dashboard-card-body-compact space-y-3">
            <div>
              <div className="mb-0.5 text-[10px] text-text/50">현재 연속</div>
              <div className="text-2xl font-bold text-accent">
                {currentStreak}
                <span className="ml-1 text-xs font-normal text-text/50">일</span>
              </div>
            </div>
            <div className="h-px bg-border" />
            <div>
              <div className="mb-0.5 text-[10px] text-text/50">최장 연속</div>
              <div className="text-2xl font-bold text-text-bright">
                {longestStreak}
                <span className="ml-1 text-xs font-normal text-text/50">일</span>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-card dashboard-card-compact dashboard-card-tight">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-text-bright">
            <Calendar className="h-3.5 w-3.5 text-cyan" />
            요일별 패턴
          </h3>
          {(() => {
            const labels = ['일', '월', '화', '수', '목', '금', '토']
            const max = Math.max(...dayOfWeekActivity, 1)
            const bestDay = dayOfWeekActivity.indexOf(Math.max(...dayOfWeekActivity))

            return (
              <div className="dashboard-card-body-compact space-y-1.5">
                {labels.map((label, index) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className={`w-3 text-right text-[10px] ${index === bestDay ? 'font-bold text-accent' : 'text-text/50'}`}>
                      {label}
                    </span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className={`h-full rounded-full ${index === bestDay ? 'bg-accent/70' : 'bg-accent/30'}`}
                        style={{ width: `${Math.round((dayOfWeekActivity[index] / max) * 100)}%` }}
                      />
                    </div>
                    <span className={`w-6 text-right text-[10px] ${index === bestDay ? 'font-bold text-accent' : 'text-text/40'}`}>
                      {dayOfWeekActivity[index]}
                    </span>
                  </div>
                ))}
              </div>
            )
          })()}
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

      {false && (
        <div className="dashboard-card dashboard-card-roomy animate-in mb-8">
          <h2 className="mb-4 text-sm font-semibold text-text-bright">AI가 사용한 도구</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {topTools.map(([tool, count]) => {
              const max = topTools[0][1]
              const pct = Math.round((count / max) * 100)

              return (
                <div key={tool} className="rounded-lg border border-border/50 bg-bg p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-text-bright">{tool}</span>
                    <span className="text-xs text-text/40">{count}회</span>
                  </div>
                  <div className="mb-2 text-[10px] text-text/40">{TOOL_DESC[tool] || '기타 도구'}</div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-accent/40" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="dashboard-card dashboard-card-flush animate-in">
        <div className="border-b border-border p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-bright">세션 목록</h2>
            <span className="text-xs text-text/40">{filteredSessions.length}개</span>
          </div>
          <input
            type="text"
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            placeholder="세션 검색 (제목, 내용)"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-bright placeholder:text-text/30 focus:border-accent/50 focus:outline-none"
          />
        </div>

        <div className="max-h-[600px] divide-y divide-border overflow-y-auto">
          {filteredSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelectSession(session)}
              className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-bg-hover"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-text-bright">
                    {session.messages[0]?.text.slice(0, 80) || '(빈 세션)'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-text/60">
                  <span>{new Date(session.startTime).toLocaleDateString('ko-KR')}</span>
                  <span>{session.messageCount.user + session.messageCount.assistant}개 메시지</span>
                  {session.startTime && session.endTime && (
                    <span>{formatDuration(session.startTime, session.endTime)}</span>
                  )}
                  {session.model && <span className="text-accent/60">{shortModelName(session.model)}</span>}
                </div>
              </div>
              <div className="text-xs text-text/40">→</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
