import { useMemo } from 'react'
import {
  MessageSquare, Zap, Clock, BarChart3,
  Brain, Wrench, TrendingUp, Calendar, Search,
} from 'lucide-react'
import type { Session, Stats } from '../types'
import { computeStats } from '../parser'
import { Heatmap } from './Heatmap'
import { HourChart } from './HourChart'
import { WordCloud } from './WordCloud'
import { ThemeSwitcher } from './ThemeSwitcher'

interface DashboardProps {
  sessions: Session[]
  onSelectSession: (session: Session) => void
  onOpenSearch: () => void
  onOpenWrapped?: () => void
  themeProps: { theme: string; accent: string; setTheme: (t: string) => void; setAccent: (a: string) => void }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
  return String(n)
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}분`
  const hours = Math.floor(mins / 60)
  return `${hours}시간 ${mins % 60}분`
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: typeof MessageSquare
  label: string
  value: string | number
  sub?: string
  color: string
}) {
  return (
    <div className="bg-bg-card rounded-xl p-5 border border-border hover:border-accent/30 transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-sm text-text">{label}</span>
      </div>
      <div className="count-up text-2xl font-bold text-text-bright">{value}</div>
      {sub && <div className="text-xs text-text/60 mt-1">{sub}</div>}
    </div>
  )
}

export function Dashboard({ sessions, onSelectSession, onOpenSearch, onOpenWrapped, themeProps }: DashboardProps) {
  const stats: Stats = useMemo(() => computeStats(sessions), [sessions])

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
    [sessions]
  )

  const topTools = useMemo(
    () => Object.entries(stats.toolsUsed).sort((a, b) => b[1] - a[1]).slice(0, 8),
    [stats]
  )

  const topModels = useMemo(
    () => Object.entries(stats.modelsUsed).sort((a, b) => b[1] - a[1]),
    [stats]
  )

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 animate-in">
        <div>
          <h1 className="text-3xl font-bold text-text-bright flex items-center gap-2">
            <span className="text-accent">✦</span> Promptale
          </h1>
          <p className="text-text text-sm mt-1">
            {stats.totalSessions}개의 세션에서 발견한 당신의 이야기
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenWrapped && (
            <button
              onClick={onOpenWrapped}
              className="flex items-center gap-2 px-4 py-2 bg-accent/10 border border-accent/20 rounded-lg text-sm text-accent hover:bg-accent/20 transition-colors"
            >
              <span>✦</span>
              <span className="hidden sm:inline">Wrapped</span>
            </button>
          )}
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border rounded-lg text-sm text-text hover:text-text-bright hover:border-accent/30 transition-colors"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">검색</span>
            <kbd className="hidden sm:inline text-[10px] text-text/30 bg-bg px-1.5 py-0.5 rounded ml-1">Ctrl+K</kbd>
          </button>
          <ThemeSwitcher
            theme={themeProps.theme}
            accent={themeProps.accent}
            onThemeChange={themeProps.setTheme}
            onAccentChange={themeProps.setAccent}
          />
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 animate-in">
        <StatCard
          icon={MessageSquare}
          label="총 대화"
          value={stats.totalMessages.toLocaleString()}
          sub={`${stats.totalSessions}개 세션`}
          color="text-accent"
        />
        <StatCard
          icon={Zap}
          label="토큰 사용"
          value={formatTokens(stats.totalTokens.input + stats.totalTokens.output)}
          sub={`입력 ${formatTokens(stats.totalTokens.input)} / 출력 ${formatTokens(stats.totalTokens.output)}`}
          color="text-amber"
        />
        <StatCard
          icon={BarChart3}
          label="평균 대화 수"
          value={stats.avgMessagesPerSession}
          sub="세션당"
          color="text-green"
        />
        <StatCard
          icon={Calendar}
          label="가장 바쁜 날"
          value={stats.busiestDay || '-'}
          sub={stats.busiestDay ? `${stats.dailyActivity[stats.busiestDay]}개 메시지` : ''}
          color="text-rose"
        />
      </div>

      {/* Heatmap */}
      <div className="bg-bg-card rounded-xl p-6 border border-border mb-8 animate-in">
        <h2 className="text-lg font-semibold text-text-bright mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green" />
          활동 히트맵
        </h2>
        <Heatmap dailyActivity={stats.dailyActivity} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Hour Chart */}
        <div className="bg-bg-card rounded-xl p-6 border border-border animate-in">
          <h2 className="text-lg font-semibold text-text-bright mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-cyan" />
            시간대별 활동
          </h2>
          <HourChart data={stats.hourlyActivity} />
        </div>

        {/* Word Cloud */}
        <div className="bg-bg-card rounded-xl p-6 border border-border animate-in">
          <h2 className="text-lg font-semibold text-text-bright mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-rose" />
            자주 쓴 단어
          </h2>
          <WordCloud words={stats.topWords} />
        </div>
      </div>

      {/* Models & Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-bg-card rounded-xl p-6 border border-border animate-in">
          <h2 className="text-sm font-semibold text-text-bright mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-accent" /> 사용한 모델
          </h2>
          <div className="space-y-2">
            {topModels.map(([model, count]) => (
              <div key={model} className="flex items-center justify-between text-sm">
                <span className="text-text truncate">{model}</span>
                <span className="text-text-bright font-mono">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-bg-card rounded-xl p-6 border border-border animate-in">
          <h2 className="text-sm font-semibold text-text-bright mb-3 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-amber" /> 많이 쓴 도구
          </h2>
          <div className="space-y-2">
            {topTools.map(([tool, count]) => {
              const max = topTools[0][1]
              return (
                <div key={tool} className="flex items-center gap-3 text-sm">
                  <span className="text-text w-28 truncate">{tool}</span>
                  <div className="flex-1 h-2 bg-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber/40 rounded-full"
                      style={{ width: `${(count / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-text-bright font-mono w-10 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Session List */}
      <div className="bg-bg-card rounded-xl border border-border animate-in">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-text-bright">세션 목록</h2>
        </div>
        <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
          {sortedSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelectSession(session)}
              className="w-full text-left p-4 hover:bg-bg-hover transition-colors flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-text-bright truncate">
                    {session.messages[0]?.text.slice(0, 80) || '(빈 세션)'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-text/60">
                  <span>{new Date(session.startTime).toLocaleDateString('ko-KR')}</span>
                  <span>{session.messageCount.user + session.messageCount.assistant}개 메시지</span>
                  {session.startTime && session.endTime && (
                    <span>{formatDuration(session.startTime, session.endTime)}</span>
                  )}
                  {session.model && <span className="text-accent/60">{session.model}</span>}
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
