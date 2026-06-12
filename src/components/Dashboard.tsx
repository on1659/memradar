import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Fingerprint,
  Lightbulb,
  LineChart,
  MessageSquare,
  RotateCcw,
  SlidersHorizontal,
  Timer,
  TrendingUp,
} from 'lucide-react'
import { PERSONALITY_ICONS, ROLE_ICONS, ToolDefaultIcon, type RoleIconKey } from '../icons'
import { AnimatePresence, motion } from 'framer-motion'
import type { Session, SessionSource, Stats } from '../types'
import { computeStats, toLocalDayKey } from '../parser'
import { useI18n } from '../i18n'
import { computePersonality } from '../lib/personality'
import { analyzeUsageTopCategories, USAGE_CATEGORIES, type UsageCategoryScore } from '../lib/usageProfile'
import {
  buildCodingRhythm,
  BURST_TOP_DAY_FRACTION,
  collectUserTimestamps,
  MIN_ACTIVE_DAYS_FOR_RHYTHM,
  RHYTHM_LIFT_CAP,
  type RhythmLabelEvidence,
  type RhythmLabelId,
} from '../lib/codingRhythm'
import {
  buildDailyCollab,
  MIN_ACTIVE_DAYS_FOR_STORY,
  MIN_USER_MESSAGES_PER_DAY,
  scoreStoryDays,
  type StoryOfDay,
} from '../lib/storyOfDay'
import {
  buildCollabFingerprint,
  FINGERPRINT_LIFT_CAP,
  LONG_SESSION_MIN_TURNS,
  MIN_FINGERPRINT_SIGNAL_N,
  MIN_FINGERPRINT_TOP_SIGNALS,
  STRUCTURED_RECENT_WINDOW_DAYS,
  type FingerprintSignal,
  type FingerprintSignalId,
} from '../lib/collabFingerprint'
import { applyCalibrationOverUniverse } from '../lib/personaQuiz'
import { loadPersonaQuiz } from '../lib/personaQuizStorage'
import { shortModelName } from '../lib/modelNames'
import { cleanClaudeText } from '../lib/cleanClaudeText'
import { maskSecrets } from '../lib/secretMask'
import { calculateSessionCost, calculateSourceCost, getSourceColor, getTokenTotals } from '../lib/tokenPricing'
import { GrowthCoaching } from './growth/GrowthCoaching'
import { GrowthComplexity } from './growth/GrowthComplexity'
import { GrowthRetry } from './growth/GrowthRetry'
import { GrowthSkillCurve } from './growth/GrowthSkillCurve'
import { Heatmap } from './Heatmap'
import { HourChart } from './HourChart'
import { MemradarTopBar } from './MemradarTopBar'
import { PersonalitySections } from './PersonalityView'
import { WordCloud } from './WordCloud'
import { analyzeLanguages, type LanguageScore } from '../lib/languageProfile'

export interface DashboardFilters {
  sessionFilter: string
  sessionSourceFilter: 'all' | 'claude' | 'codex'
  sessionSort: 'date' | 'date-asc' | 'tokens' | 'tokens-asc'
  dateFrom: string
  dateTo: string
  /** 그날 이야기 카드 점프용 로컬 날짜 필터 ("YYYY-MM-DD", '' = 해제) */
  storyDay: string
}

interface DashboardProps {
  sessions: Session[]
  onSelectSession: (session: Session, index: number) => void
  onOpenWrapped?: () => void
  onOpenPersonality?: () => void
  onOpenDashboard?: () => void
  onOpenPersonaQuiz?: () => void
  onReload?: () => void
  sectionMode?: 'dashboard' | 'personality'
  restoreScrollY?: number
  filters?: DashboardFilters
  onFiltersChange?: (filters: DashboardFilters) => void
  themeProps: {
    theme: string
    accent: string
    setTheme: (theme: string) => void
    setAccent: (accent: string) => void
  }
}

const sectionTransition = {
  initial: { opacity: 0.35, y: -16, filter: 'blur(8px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0.2, y: 10, filter: 'blur(4px)' },
} as const

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
  const visibleData = data.slice(0, 5)
  const otherCount = data.slice(5).reduce((sum, [, count]) => sum + count, 0)
  const chartData = otherCount > 0 ? [...visibleData, ['__other__', otherCount] as [string, number]] : visibleData
  const colors = [
    'var(--color-accent)',
    'var(--color-green)',
    'var(--color-amber)',
    'var(--color-rose)',
    'var(--color-cyan)',
    'color-mix(in srgb, var(--color-text) 36%, transparent)',
  ]
  const outerRadius = 70
  const innerRadius = 45
  const cx = 90
  const cy = 90

  const arcs = chartData.map(([model, count], index) => {
    const pct = count / total
    const label = model === '__other__' ? '기타 모델' : shortModelName(model)
    const startAngle = chartData
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
        <title>{label}: {Math.round(pct * 100)}%</title>
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
        {visibleData.map(([model, count], index) => (
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
  const visibleData = data.slice(0, 5)
  const otherCount = data.slice(5).reduce((sum, [, count]) => sum + count, 0)
  const chartData = otherCount > 0 ? [...visibleData, ['__other__', otherCount] as [string, number]] : visibleData
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
    'color-mix(in srgb, var(--color-text) 36%, transparent)',
  ]
  const outerRadius = 70
  const innerRadius = 45
  const cx = 90
  const cy = 90

  const arcs = chartData.map(([model, count], index) => {
    const pct = count / total
    const label = model === '__other__' ? '기타 모델' : shortModelName(model)
    const color = colors[index % colors.length]
    const startAngle = chartData
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

      <svg viewBox="0 0 180 180" className="h-32 w-32 shrink-0 overflow-visible">
        {arcs}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--color-text-bright)" fontSize="18" fontWeight="700">
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--color-text)" fontSize="10">
          세션
        </text>
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5">
        {visibleData.map(([model, count], index) => (
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

function GenericDonutChart({ data, centerLabel = '' }: { data: [string, number][]; centerLabel?: string }) {
  const [hovered, setHovered] = useState<{ label: string; percent: number; color: string } | null>(null)
  const total = data.reduce((sum, [, c]) => sum + c, 0)
  if (total === 0) return <p className="py-6 text-center text-sm text-text/40">데이터가 없어요</p>
  const visibleData = data.slice(0, 5)
  const otherCount = data.slice(5).reduce((sum, [, c]) => sum + c, 0)
  const chartData = otherCount > 0 ? [...visibleData, ['__other__', otherCount] as [string, number]] : visibleData
  const colors = [
    'var(--color-accent)',
    'var(--color-green)',
    'var(--color-amber)',
    'var(--color-rose)',
    'var(--color-cyan)',
    'color-mix(in srgb, var(--color-text) 36%, transparent)',
  ]
  const outerRadius = 70
  const innerRadius = 45
  const cx = 90
  const cy = 90

  const arcs = chartData.map(([key, count], index) => {
    const pct = count / total
    const label = key === '__other__' ? '기타' : key
    const color = colors[index % colors.length]
    const startAngle = chartData.slice(0, index).reduce((a, [, c]) => a + (c / total) * 360, 0)
    const endAngle = startAngle + pct * 360
    const startRad = (startAngle - 90) * Math.PI / 180
    const endRad = (endAngle - 90) * Math.PI / 180
    const largeArc = pct > 0.5 ? 1 : 0
    const x1 = cx + outerRadius * Math.cos(startRad)
    const y1 = cy + outerRadius * Math.sin(startRad)
    const x2 = cx + outerRadius * Math.cos(endRad)
    const y2 = cy + outerRadius * Math.sin(endRad)
    const x3 = cx + innerRadius * Math.cos(endRad)
    const y3 = cy + innerRadius * Math.sin(endRad)
    const x4 = cx + innerRadius * Math.cos(startRad)
    const y4 = cy + innerRadius * Math.sin(startRad)
    const d = `M${x1},${y1} A${outerRadius},${outerRadius} 0 ${largeArc},1 ${x2},${y2} L${x3},${y3} A${innerRadius},${innerRadius} 0 ${largeArc},0 ${x4},${y4} Z`
    return (
      <path
        key={key}
        d={d}
        fill={color}
        className="dashboard-donut-slice"
        opacity={0.8}
        onMouseEnter={() => setHovered({ label, percent: Math.round(pct * 100), color })}
        onMouseLeave={() => setHovered(null)}
      >
        <title>{label}: {Math.round(pct * 100)}%</title>
      </path>
    )
  })

  return (
    <div className="relative flex items-center gap-4">
      {hovered && (
        <div className="pointer-events-none absolute -top-8 left-3 z-10 rounded-full border border-border bg-bg-hover px-3 py-1 text-xs text-text-bright shadow-lg">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: hovered.color }} />
            <span>{hovered.label}</span>
            <span className="text-text/45">{hovered.percent}%</span>
          </span>
        </div>
      )}
      <svg viewBox="0 0 180 180" className="h-32 w-32 shrink-0 overflow-visible">
        {arcs}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--color-text-bright)" fontSize="18" fontWeight="700">
          {total}
        </text>
        {centerLabel && (
          <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--color-text)" fontSize="10">
            {centerLabel}
          </text>
        )}
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5">
        {visibleData.map(([key, count], index) => (
          <div
            key={key}
            className="dashboard-hover-grow flex items-center gap-2 rounded-lg px-1 py-0.5 text-sm"
            onMouseEnter={() => setHovered({ label: key, percent: Math.round((count / total) * 100), color: colors[index % colors.length] })}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[index % colors.length] }} />
            <span className="truncate text-text">{key}</span>
            <span className="ml-auto shrink-0 text-text/40">{Math.round((count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function InteractiveRoleDonutChart({
  categories,
  metricMode,
  isKorean,
}: {
  categories: UsageCategoryScore[]
  metricMode: 'count' | 'ratio'
  isKorean: boolean
}) {
  const total = categories.reduce((sum, category) => sum + category.score, 0) || 1
  const maxScore = categories[0]?.score || 1

  return (
    <div className="space-y-2.5">
      {categories.map((category, index) => {
        const sharePct = Math.round((category.score / total) * 100)
        const barPct = Math.max(4, Math.round((category.score / maxScore) * 100))
        const CategoryIcon = ROLE_ICONS[category.id as RoleIconKey]
        const metricLabel = metricMode === 'count'
          ? (isKorean ? `${category.score}회` : `${category.score}`)
          : `${sharePct}%`
        const tooltipDescription = `${category.subtitle}. ${isKorean ? '이 역할과 관련된 요청 패턴이 자주 잡혔어요.' : 'This role pattern showed up frequently in your requests.'}`

        return (
          <DashboardHoverTooltip
            key={category.id}
            title={category.title}
            description={tooltipDescription}
            align="left"
            wrapperClassName="group relative block"
            buttonClassName="dashboard-hover-grow block w-full rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--t-text-bright)_4%,transparent)] focus:outline-none focus:ring-1 focus:ring-accent/35"
            tooltipWidthClass="w-64"
          >
            <div className="flex items-center gap-3">
              <span className="flex w-6 shrink-0 justify-center">
                <CategoryIcon size={22} aria-hidden="true" />
              </span>
              <div className="w-28 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-bold text-text-bright">{category.title}</span>
                </div>
              </div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${barPct}%`,
                    backgroundColor: category.color,
                    opacity: index === 0 ? 0.85 : 0.6,
                  }}
                />
              </div>
              <div className="w-12 shrink-0 text-right text-[11px] text-text/40">
                <span
                  key={`${category.id}-${metricMode}`}
                  className="dashboard-cycle-drop inline-block"
                  style={{ animationDelay: `${index * 45}ms` }}
                >
                  {metricLabel}
                </span>
              </div>
            </div>
          </DashboardHoverTooltip>
        )
      })}
    </div>
  )
}

const DAY_OF_WEEK_LABELS = ['일', '월', '화', '수', '목', '금', '토']

type DashboardAxisKey = 'style' | 'scope' | 'rhythm'

const DASHBOARD_AXIS_HELP: Record<DashboardAxisKey, [string, string]> = {
  style: [
    '탐험가: AI와 주고받으면서 방향을 잡는 대화형 작업 방식이에요.',
    '설계자: 긴 요청으로 구조와 맥락을 한 번에 맡기는 설계형 작업 방식이에요.',
  ],
  scope: [
    '한우물: 한 프로젝트를 오래 붙잡고 깊게 파는 집중형 작업 방식이에요.',
    '유목민: 여러 프로젝트를 오가며 넓게 다루는 멀티형 작업 방식이에요.',
  ],
  rhythm: [
    '스프린터: 짧고 빠른 반복으로 문제를 해결하는 작업 리듬이에요.',
    '마라토너: 긴 세션으로 오래 이어가며 쌓아가는 작업 리듬이에요.',
  ],
}

const DASHBOARD_PERSONALITY_PANEL_HELP = {
  strengths: '이 유형에서 특히 강하게 드러나는 작업 강점이에요.',
  headsUp: '이 유형일 때 한 번 더 의식하면 좋은 작업 습관이에요.',
} as const

const DASHBOARD_USAGE_CARD_HELP =
  '사용자 메시지에 자주 나온 요청 패턴을 바탕으로, AI가 어떤 역할을 많이 맡았는지 보여줘요. 키워드 기반 가벼운 추정이라, 정확한 분류는 아니에요.'

function DashboardHoverTooltip({
  children,
  title,
  description,
  align = 'center',
  wrapperClassName = 'group relative inline-flex',
  buttonClassName = 'inline-flex',
  tooltipWidthClass = 'w-56',
}: {
  children: ReactNode
  title?: string
  description: string
  align?: 'left' | 'center' | 'right'
  wrapperClassName?: string
  buttonClassName?: string
  tooltipWidthClass?: string
}) {
  const tooltipPositionClass =
    align === 'left'
      ? 'left-0'
      : align === 'right'
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2'

  return (
    <span className={wrapperClassName}>
      <button type="button" className={buttonClassName}>
        {children}
      </button>
      <span
        className={`pointer-events-none absolute bottom-full z-30 mb-2 ${tooltipWidthClass} rounded-lg border border-border bg-bg-card px-3 py-2 text-left text-[11px] leading-relaxed text-text opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${tooltipPositionClass}`}
      >
        {title && <span className="block font-semibold text-text-bright">{title}</span>}
        <span className={title ? 'mt-1 block text-text/75' : 'block text-text'}>
          {description}
        </span>
      </span>
    </span>
  )
}

function DashboardTooltipLabel({
  active,
  children,
  description,
  align = 'center',
}: {
  active: boolean
  children: string
  description: string
  align?: 'left' | 'center' | 'right'
}) {
  const tooltipPositionClass =
    align === 'left'
      ? 'left-0'
      : align === 'right'
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2'

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className="cursor-help rounded px-0.5 py-0.5 transition-colors focus:outline-none focus:ring-1 focus:ring-accent/40"
        style={{ color: active ? 'var(--t-text-bright)' : 'color-mix(in srgb, var(--t-text) 52%, transparent)' }}
      >
        {children}
      </button>
      <span
        className={`pointer-events-none absolute bottom-full z-30 mb-2 w-52 rounded-lg border border-border bg-bg-card px-3 py-2 text-left text-[11px] leading-relaxed text-text opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${tooltipPositionClass}`}
      >
        {description}
      </span>
    </span>
  )
}

function getDashboardAxisTooltipCopy(axis: { label: [string, string]; value: number }, axisKey: DashboardAxisKey) {
  const leaningRight = axis.value >= 0.5
  const balanced = Math.abs(axis.value - 0.5) < 0.04
  const dominantIndex = leaningRight ? 1 : 0

  if (balanced) {
    return {
      title: '균형형',
      description: '양쪽 성향이 거의 비슷하게 섞여 있어요.',
    }
  }

  return {
    title: axis.label[dominantIndex],
    description: DASHBOARD_AXIS_HELP[axisKey][dominantIndex],
  }
}

function DashboardAxisBar({
  axis,
  axisKey,
  color,
}: {
  axis: { label: [string, string]; value: number }
  axisKey: DashboardAxisKey
  color: string
}) {
  const pct = Math.round(axis.value * 100)
  const leftActive = axis.value < 0.5
  const axisTooltip = getDashboardAxisTooltipCopy(axis, axisKey)

  return (
    <div className="w-full">
      <div className="mb-0.5 flex justify-between text-[10px]">
        <DashboardTooltipLabel active={leftActive} description={DASHBOARD_AXIS_HELP[axisKey][0]} align="left">
          {axis.label[0]}
        </DashboardTooltipLabel>
        <DashboardTooltipLabel active={!leftActive} description={DASHBOARD_AXIS_HELP[axisKey][1]} align="right">
          {axis.label[1]}
        </DashboardTooltipLabel>
      </div>
      <div className="group relative cursor-help">
        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-lg border border-border bg-bg-card px-3 py-2 text-left text-[11px] leading-relaxed text-text opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
          <span className="block font-semibold text-text-bright">{axisTooltip.title}</span>
          <span className="mt-1 block text-text/75">{axisTooltip.description}</span>
        </div>
        <div
          className="relative h-1.5 overflow-hidden rounded-full"
          style={{ background: 'color-mix(in srgb, var(--t-text-bright) 8%, transparent)' }}
        >
          <div
            className="absolute top-0 h-full rounded-full transition-all duration-500"
            style={axis.value >= 0.5
              ? { left: '50%', width: `${pct - 50}%`, background: color, opacity: 0.5 }
              : { right: '50%', width: `${50 - pct}%`, background: color, opacity: 0.5 }
            }
          />
          <div
            className="absolute top-0 left-1/2 h-full w-px"
            style={{ background: 'color-mix(in srgb, var(--t-border) 72%, transparent)' }}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * 코딩 리듬 한 줄 서사 — evidence 의 실측 수치(lift 배수·비율·n=)만 삽입.
 * hedged 어조 필수("~형으로 보여요"), 단정("당신은 ~다") 금지 (설계 문서 단정 판정 금지 제약).
 * 사용자 프롬프트 원문 인용 금지 — 라벨 사전 단어 + 수치만 (GrowthCoaching insightCopy 패턴).
 */
function rhythmNarrative(label: RhythmLabelId, ev: RhythmLabelEvidence, isKorean: boolean): string {
  const lift = ev.lift >= RHYTHM_LIFT_CAP ? null : ev.lift.toFixed(1)
  const pct = Math.round(ev.share * 100)
  switch (label) {
    case 'night-surge':
      return isKorean
        ? `심야형으로 보여요 — 22~02시 메시지가 균등 기대치의 ${lift}배예요 (전체의 ${pct}%, n=${ev.n})`
        : `Looks like a night-surge pattern — 22:00–02:00 messages run ${lift}x the uniform expectation (${pct}% of all, n=${ev.n})`
    case 'early-bird':
      return isKorean
        ? `아침형으로 보여요 — 05~09시 메시지가 균등 기대치의 ${lift}배예요 (전체의 ${pct}%, n=${ev.n})`
        : `Looks like an early-bird pattern — 05:00–09:00 messages run ${lift}x the uniform expectation (${pct}% of all, n=${ev.n})`
    case 'weekend-builder':
      return lift === null
        ? isKorean
          ? `주말 빌더형으로 보여요 — 메시지의 ${pct}%가 주말에 몰려 있고 주중 활동은 거의 없어요 (관측 ${ev.n}일)`
          : `Looks like a weekend-builder pattern — ${pct}% of messages land on weekends with almost no weekday activity (${ev.n} days observed)`
        : isKorean
          ? `주말 빌더형으로 보여요 — 주말 하루 평균이 주중의 ${lift}배예요 (관측 ${ev.n}일)`
          : `Looks like a weekend-builder pattern — weekend daily average runs ${lift}x your weekday average (${ev.n} days observed)`
    case 'weekday-steady':
      return isKorean
        ? `평일 정시형으로 보여요 — 주중 09~18시 메시지가 균등 기대치의 ${lift}배예요 (전체의 ${pct}%, n=${ev.n})`
        : `Looks like a weekday 9-to-6 pattern — weekday 09:00–18:00 messages run ${lift}x the uniform expectation (${pct}% of all, n=${ev.n})`
    case 'burst-sprinter': {
      // 잠정값 상수에서 도출 — "상위 20%" 하드코딩 시 BURST_TOP_DAY_FRACTION 변경에 카피가 드리프트
      const topPct = Math.round(BURST_TOP_DAY_FRACTION * 100)
      return isKorean
        ? `몰아치기형으로 보여요 — 상위 ${topPct}% 활동일에 메시지의 ${pct}%가 몰려 있어요 (활동 ${ev.n}일)`
        : `Looks like a burst-sprinter pattern — the top ${topPct}% of active days hold ${pct}% of your messages (${ev.n} active days)`
    }
    case 'daily-steady':
      return isKorean
        ? `꾸준형으로 보여요 — 관측일의 ${pct}%에 활동이 있고 일별 편차도 낮아요 (관측 ${ev.n}일)`
        : `Looks like a daily-steady pattern — activity on ${pct}% of observed days with low day-to-day variance (${ev.n} days observed)`
  }
}

/**
 * 그날 이야기 패턴 요약 1문장 — dominantTerm 별 분기, receipts 실측 수치만 삽입.
 * hedged 어조 필수("~로 보여요"), 단정 금지. 원문 인용 금지 — 수치 + 사전 단어만 (rhythmNarrative 패턴).
 */
function storyNarrative(story: StoryOfDay, isKorean: boolean): string {
  const r = story.receipts
  switch (story.dominantTerm) {
    case 'tokenAnomaly': {
      // dominant 가 tokenAnomaly 면 dayAvgTokens > 0 (항 결측 시 dominant 불가) — 방어적 가드만
      const ratio = r.dayAvgTokens > 0 ? (r.tokens / r.dayAvgTokens).toFixed(1) : '?'
      return isKorean
        ? `이날은 평소의 ${ratio}배 토큰을 쓴 집중일로 보여요`
        : `Looks like a deep-focus day — about ${ratio}x your daily average tokens`
    }
    case 'sessionDensity':
      return isKorean
        ? `세션 ${r.sessionCount}개를 ${r.spanHours.toFixed(1)}시간에 걸쳐 이어간 날로 보여요`
        : `Looks like a marathon day — ${r.sessionCount} sessions across about ${r.spanHours.toFixed(1)} hours`
    case 'retryRecovery': {
      const first = Math.round((r.retryRateFirst ?? 0) * 100)
      const second = Math.round((r.retryRateSecond ?? 0) * 100)
      return isKorean
        ? `재질문률이 ${first}%→${second}%로 줄어든, 막힘이 풀린 날로 보여요 (n=${r.followUpCount})`
        : `Looks like a breakthrough day — retry rate dropped from ${first}% to ${second}% (n=${r.followUpCount})`
    }
    case 'variety':
      return isKorean
        ? r.hasClaudeSession && r.skillCount > 0
          ? `스킬 ${r.skillCount}종·언어 ${r.languageCount}종을 오간 다작의 날로 보여요`
          : `언어 ${r.languageCount}종을 오간 다작의 날로 보여요`
        : r.hasClaudeSession && r.skillCount > 0
          ? `Looks like a variety day — ${r.skillCount} skills and ${r.languageCount} languages in one day`
          : `Looks like a variety day — ${r.languageCount} languages in one day`
  }
}

// ── AI 협업 지문 카드 헬퍼 ────────────────────────────────────────────────────
// 카드 경계: 성격 카드 = "어떤 사람인가(작업 스타일)" / AI 역할 도넛 = "AI에게 무엇을 시키나(요청 주제)"
// / 지문 = "AI와 어떻게 협업하나(상호작용 행동)". 성격 카드의 'rhythm' 축과 지문 신호는 별개 개념 —
// 카피 어휘도 분리한다 ("리듬/유형" 대신 "패턴/경향" 계열만, collabFingerprint.ts 모듈 주석 참조).

/** 잠정값 — 실측 보정 전 (지문 미니 lift 바 풀스케일 — 이 배수 이상은 100% 폭, UI 전용) */
const FINGERPRINT_BAR_MAX_LIFT = 3

// 분수(0~1) → 표시 문자열 변환은 이 헬퍼 3종만 사용 (lessons/_common.md L-5 — 인라인 ×100 반복 금지)
const fmtPct0 = (fraction: number) => `${Math.round(fraction * 100)}%`
const fmtPct1 = (fraction: number) => `${(fraction * 100).toFixed(1)}%`
const fmtSignedPp = (fraction: number, isKorean: boolean) => {
  const pp = Math.round(fraction * 100)
  return `${pp >= 0 ? '+' : ''}${pp}${isKorean ? '%p' : 'pp'}`
}

function fingerprintSignalLabel(id: FingerprintSignalId, isKorean: boolean): string {
  switch (id) {
    case 'weekend-focus':
      return isKorean ? '주말 집중' : 'Weekend focus'
    case 'structured-shift':
      return isKorean ? '구조화 프롬프트 변화' : 'Structured-prompt shift'
    case 'plan-after-correction':
      return isKorean ? '정정 후 계획 요청' : 'Plan-first after corrections'
    case 'late-night-share':
      return isKorean ? '심야 비중' : 'Late-night share'
    case 'long-session-preference':
      return isKorean ? '긴 세션 선호' : 'Long-session preference'
  }
}

/**
 * 지문 신호 한 줄 서사 — 실측 수치 + n= 만 삽입, hedge 어조("~로 보여요/~는 편이에요"), 단정 금지.
 * 원문 인용 금지 — 수치 + 사전 단어만 (rhythmNarrative 패턴).
 */
function fingerprintNarrative(signal: FingerprintSignal, isKorean: boolean): string {
  // "기준선 없음" 서술 우회는 분모가 실제 0일 때만 — 분모 > 0 인데 CAP 에 닿은 경우(극소 기대치)는
  // 기준선이 존재하므로 "99+"배로 표기 (영수증 liftLabel 과 동일 구분 — 서사가 영수증보다 덜 정직해지지 않게)
  const lift = signal.lift >= FINGERPRINT_LIFT_CAP
    ? (signal.denominator <= 0 ? null : '99+')
    : signal.lift.toFixed(1)
  switch (signal.id) {
    case 'weekend-focus':
      if (lift === null) {
        return isKorean
          ? `세션이 주말에만 모여 있어요 — 주중엔 거의 없어요 (주말 일평균 ${signal.numerator.toFixed(1)}개, n=관측 ${signal.n}일)`
          : `Sessions cluster on weekends only — almost none on weekdays (weekend daily avg ${signal.numerator.toFixed(1)}, n=${signal.n} days observed)`
      }
      return isKorean
        ? `주말에 세션이 주중의 ${lift}배로 모여 있어요 (주말 일평균 ${signal.numerator.toFixed(1)} vs 주중 ${signal.denominator.toFixed(1)}, n=관측 ${signal.n}일)`
        : `Weekend sessions run ${lift}x your weekday pace (daily avg ${signal.numerator.toFixed(1)} weekend vs ${signal.denominator.toFixed(1)} weekday, n=${signal.n} days observed)`
    case 'structured-shift':
      return isKorean
        ? `최근 ${STRUCTURED_RECENT_WINDOW_DAYS}일 구조화 프롬프트가 ${fmtSignedPp(signal.delta ?? 0, true)} 달라진 것으로 보여요 (최근 ${fmtPct0(signal.numerator)} n=${signal.n.toLocaleString()} vs 이전 ${fmtPct0(signal.denominator)} n=${(signal.n2 ?? 0).toLocaleString()})`
        : `Structured prompts look to have shifted ${fmtSignedPp(signal.delta ?? 0, false)} over the last ${STRUCTURED_RECENT_WINDOW_DAYS} days (recent ${fmtPct0(signal.numerator)} n=${signal.n.toLocaleString()} vs prior ${fmtPct0(signal.denominator)} n=${(signal.n2 ?? 0).toLocaleString()})`
    case 'plan-after-correction':
      // 분모 = 이벤트별 창 크기 가중 우연 기대 (2창 1−(1−p)², 1창 p) — collabFingerprint.ts ③ 주석 참고
      if (lift === null) {
        return isKorean
          ? `정정 직후에 유독 계획 요청이 몰려 있어요 (정정 후 ${fmtPct0(signal.numerator)}, 우연 기대는 거의 0 — n=정정 ${signal.n}건)`
          : `Plan requests cluster right after corrections (${fmtPct0(signal.numerator)} post-correction vs a near-zero chance rate, n=${signal.n} corrections)`
      }
      return isKorean
        ? `정정 직후엔 계획부터 다시 잡는 경향이 보여요 — 우연 기대의 ${lift}배 (정정 후 ${fmtPct0(signal.numerator)} vs 우연 기대 ${fmtPct0(signal.denominator)}, n=정정 ${signal.n}건)`
        : `After a correction you tend to ask for a plan first — ${lift}x the chance rate for the same window (${fmtPct0(signal.numerator)} post-correction vs ${fmtPct0(signal.denominator)} chance, n=${signal.n} corrections)`
    case 'late-night-share':
      // 코딩 리듬 카드의 night-surge 와 동일 수치 (rhythm 주입값 재사용) — 표현만 지문 어휘
      return isKorean
        ? `심야(22~02시) 메시지가 균등 기대치의 ${lift}배예요 (전체의 ${fmtPct0(signal.numerator)}, n=${signal.n.toLocaleString()})`
        : `Late-night (22:00–02:00) messages run ${lift}x the uniform expectation (${fmtPct0(signal.numerator)} of all, n=${signal.n.toLocaleString()})`
    case 'long-session-preference':
      if (lift === null) {
        return isKorean
          ? `긴 세션(${LONG_SESSION_MIN_TURNS}턴+) 비중이 본인 분포 기대치를 크게 웃돌아요 (실측 ${fmtPct1(signal.numerator)}, n=세션 ${signal.n}건)`
          : `Long sessions (${LONG_SESSION_MIN_TURNS}+ turns) far exceed what your own length distribution would expect (actual ${fmtPct1(signal.numerator)}, n=${signal.n} sessions)`
      }
      return isKorean
        ? `긴 세션(${LONG_SESSION_MIN_TURNS}턴+)을 본인 분포 기대치의 ${lift}배로 이어가는 편이에요 (실측 ${fmtPct1(signal.numerator)} vs 기대 ${fmtPct1(signal.denominator)}, n=세션 ${signal.n}건)`
        : `Long sessions (${LONG_SESSION_MIN_TURNS}+ turns) run ${lift}x what your own length distribution would expect (actual ${fmtPct1(signal.numerator)} vs expected ${fmtPct1(signal.denominator)}, n=${signal.n} sessions)`
  }
}

/** 영수증 수치부 — 신호별 분자/분모/lift/n 표기 (비율은 분모 n= 동반) */
function fingerprintReceiptNumbers(signal: FingerprintSignal, isKorean: boolean): string {
  // "기준선 없음"은 분모가 실제로 0일 때만 — 분모 > 0 인데 비율이 CAP 에 닿은 경우(⑤ 극소 기대치 등)는
  // 기준선이 존재하므로 "99x+" 로 표기 (영수증 정직성 — 분모 수치와 라벨이 모순되지 않게)
  const liftLabel = signal.lift >= FINGERPRINT_LIFT_CAP
    ? (signal.denominator <= 0 ? (isKorean ? '기준선 없음' : 'no baseline') : '99x+')
    : `${signal.lift.toFixed(1)}x`
  switch (signal.id) {
    case 'weekend-focus':
      return isKorean
        ? `주말 일평균 ${signal.numerator.toFixed(1)} vs 주중 ${signal.denominator.toFixed(1)} · ${liftLabel} (n=관측 ${signal.n}일)`
        : `weekend daily avg ${signal.numerator.toFixed(1)} vs weekday ${signal.denominator.toFixed(1)} · ${liftLabel} (n=${signal.n} days observed)`
    case 'structured-shift':
      return isKorean
        ? `최근 ${fmtPct0(signal.numerator)} (n=${signal.n.toLocaleString()}) vs 이전 ${fmtPct0(signal.denominator)} (n=${(signal.n2 ?? 0).toLocaleString()}) · ${fmtSignedPp(signal.delta ?? 0, true)}`
        : `recent ${fmtPct0(signal.numerator)} (n=${signal.n.toLocaleString()}) vs prior ${fmtPct0(signal.denominator)} (n=${(signal.n2 ?? 0).toLocaleString()}) · ${fmtSignedPp(signal.delta ?? 0, false)}`
    case 'plan-after-correction':
      return isKorean
        ? `정정 후 ${fmtPct0(signal.numerator)} vs 우연 기대 ${fmtPct0(signal.denominator)} · ${liftLabel} (n=정정 ${signal.n}건)`
        : `post-correction ${fmtPct0(signal.numerator)} vs chance ${fmtPct0(signal.denominator)} · ${liftLabel} (n=${signal.n} corrections)`
    case 'late-night-share':
      return isKorean
        ? `심야 비중 ${fmtPct0(signal.numerator)} vs 기대 ${fmtPct1(signal.denominator)} · ${liftLabel} (n=${signal.n.toLocaleString()})`
        : `late-night share ${fmtPct0(signal.numerator)} vs expected ${fmtPct1(signal.denominator)} · ${liftLabel} (n=${signal.n.toLocaleString()})`
    case 'long-session-preference':
      return isKorean
        ? `${LONG_SESSION_MIN_TURNS}턴+ 세션 ${fmtPct1(signal.numerator)} vs 기대 ${fmtPct1(signal.denominator)} · ${liftLabel} (n=세션 ${signal.n}건)`
        : `${LONG_SESSION_MIN_TURNS}+ turn sessions ${fmtPct1(signal.numerator)} vs expected ${fmtPct1(signal.denominator)} · ${liftLabel} (n=${signal.n} sessions)`
  }
}

/** 영수증 한 줄 — viable 미달이어도 측정값을 숨기지 않고 미달 사유를 병기 (반증가능 원칙) */
function fingerprintReceiptLine(signal: FingerprintSignal, isKorean: boolean): string {
  const numbers = fingerprintReceiptNumbers(signal, isKorean)
  if (signal.viable) return numbers
  const shortfall = signal.id === 'plan-after-correction' && signal.n >= MIN_FINGERPRINT_SIGNAL_N
    ? (isKorean ? '기준선 없음 (계획 요청 마커 0건)' : 'no baseline (zero plan-marker messages)')
    : signal.id === 'structured-shift'
      ? (isKorean
        ? `표본 부족 (최근 n=${signal.n} · 이전 n=${signal.n2 ?? 0} — 최소 각 ${MIN_FINGERPRINT_SIGNAL_N})`
        : `insufficient sample (recent n=${signal.n} · prior n=${signal.n2 ?? 0} — needs ${MIN_FINGERPRINT_SIGNAL_N} each)`)
      : (isKorean
        ? `표본 부족 (n=${signal.n} < ${MIN_FINGERPRINT_SIGNAL_N})`
        : `insufficient sample (n=${signal.n} < ${MIN_FINGERPRINT_SIGNAL_N})`)
  return `${numbers} — ${shortfall}`
}

function FingerprintSignalRow({ signal, isKorean }: { signal: FingerprintSignal; isKorean: boolean }) {
  const barWidth = Math.round(Math.min(signal.rankScore / FINGERPRINT_BAR_MAX_LIFT, 1) * 100)
  const liftBadge = signal.id === 'structured-shift'
    ? fmtSignedPp(signal.delta ?? 0, isKorean)
    : signal.lift >= FINGERPRINT_LIFT_CAP
      ? (signal.denominator <= 0 ? (isKorean ? '기준선 없음' : 'no baseline') : '99x+')
      : `${signal.lift.toFixed(1)}x`
  return (
    <div className="rounded-xl border border-border/60 bg-bg-hover/30 px-3.5 py-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-text-bright">{fingerprintSignalLabel(signal.id, isKorean)}</span>
        <span className="shrink-0 font-mono text-[10px] font-bold text-accent">{liftBadge}</span>
      </div>
      <p className="text-xs leading-relaxed text-text/70">{fingerprintNarrative(signal, isKorean)}</p>
      {/* 미니 lift 바 — SVG 비등방 왜곡 이슈 회피, 단순 div 바 (lessons/_common.md L-7) */}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-accent/60" style={{ width: `${barWidth}%` }} />
      </div>
    </div>
  )
}

function LanguageBar({ languages }: { languages: LanguageScore[] }) {
  const [hoveredLanguage, setHoveredLanguage] = useState<{
    name: string
    percent: number
    color: string
  } | null>(null)
  if (languages.length === 0) {
    return <p className="py-4 text-center text-sm text-text/40">감지된 언어가 없습니다</p>
  }

  const total = languages.reduce((sum, l) => sum + l.count, 0)
  const visibleLanguages = languages.slice(0, 5)
  const otherLanguageCount = languages.slice(5).reduce((sum, lang) => sum + lang.count, 0)
  const chartLanguages = otherLanguageCount > 0
    ? [
        ...visibleLanguages,
        { name: '기타 언어', count: otherLanguageCount, color: 'color-mix(in srgb, var(--color-text) 36%, transparent)' },
      ]
    : visibleLanguages
  const outerRadius = 70
  const innerRadius = 45
  const cx = 90
  const cy = 90

  const arcs = chartLanguages.map((lang, index) => {
    const pct = lang.count / total
    const startAngle = chartLanguages
      .slice(0, index)
      .reduce((angle, previous) => angle + (previous.count / total) * 360, 0)
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
        key={lang.name}
        d={d}
        fill={lang.color}
        className="dashboard-donut-slice"
        opacity={0.82}
        onMouseEnter={() => setHoveredLanguage({
          name: lang.name,
          percent: Number(((lang.count / total) * 100).toFixed(1)),
          color: lang.color,
        })}
        onMouseLeave={() => setHoveredLanguage(null)}
      >
        <title>{lang.name}: {((lang.count / total) * 100).toFixed(1)}%</title>
      </path>
    )
  })

  return (
    <div className="relative flex items-center gap-4">
      {hoveredLanguage && (
        <div className="pointer-events-none absolute -top-8 left-3 z-10 rounded-full border border-border bg-bg-hover px-3 py-1 text-xs text-text-bright shadow-lg">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: hoveredLanguage.color }} />
            <span>{hoveredLanguage.name}</span>
            <span className="text-text/45">{hoveredLanguage.percent}%</span>
          </span>
        </div>
      )}

      <svg viewBox="0 0 180 180" className="h-32 w-32 shrink-0 overflow-visible">
        {arcs}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--color-text-bright)" fontSize="18" fontWeight="700">
          {languages.length}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--color-text)" fontSize="10">
          언어
        </text>
      </svg>

      <div className="min-w-0 flex-1 space-y-1.5">
        {visibleLanguages.map((lang, i) => {
          const pct = ((lang.count / total) * 100).toFixed(1)

          return (
            <div
              key={lang.name}
              className="dashboard-hover-grow flex items-center gap-2 rounded-lg px-1 py-0.5 text-sm"
              style={{ animationDelay: `${i * 50}ms` }}
              onMouseEnter={() => setHoveredLanguage({ name: lang.name, percent: Number(pct), color: lang.color })}
              onMouseLeave={() => setHoveredLanguage(null)}
            >
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: lang.color }}
              />
              <span className="truncate text-text">{lang.name}</span>
              <span className="ml-auto shrink-0 text-text/40">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Dashboard({
  sessions,
  onSelectSession,
  onOpenWrapped,
  onOpenPersonality,
  onOpenDashboard,
  onOpenPersonaQuiz,
  onReload,
  sectionMode = 'dashboard',
  restoreScrollY,
  filters,
  onFiltersChange,
  themeProps,
}: DashboardProps) {
  const { locale, t } = useI18n()

  useEffect(() => {
    if (restoreScrollY != null && restoreScrollY > 0) {
      window.scrollTo({ top: restoreScrollY, behavior: 'instant' })
    }
  }, [restoreScrollY])

  const stats: Stats = useMemo(() => computeStats(sessions), [sessions])
  const personality = useMemo(() => computePersonality(sessions, stats), [sessions, stats])
  const PersonalityIcon = PERSONALITY_ICONS[personality.type]
  const [sessionFilterLocal, setSessionFilterLocal] = useState(filters?.sessionFilter ?? '')
  const [dateFromLocal, setDateFromLocal] = useState(filters?.dateFrom ?? '')
  const [dateToLocal, setDateToLocal] = useState(filters?.dateTo ?? '')
  const [sessionSourceFilterLocal, setSessionSourceFilterLocal] = useState<'all' | 'claude' | 'codex'>(filters?.sessionSourceFilter ?? 'all')
  const [sessionSortLocal, setSessionSortLocal] = useState<'date' | 'date-asc' | 'tokens' | 'tokens-asc'>(filters?.sessionSort ?? 'date')
  const [storyDayLocal, setStoryDayLocal] = useState(filters?.storyDay ?? '')

  const sessionFilter = sessionFilterLocal
  const dateFrom = dateFromLocal
  const dateTo = dateToLocal
  const sessionSourceFilter = sessionSourceFilterLocal
  const sessionSort = sessionSortLocal
  const storyDay = storyDayLocal

  const setSessionFilter = (v: string) => { setSessionFilterLocal(v); onFiltersChange?.({ sessionFilter: v, dateFrom, dateTo, sessionSourceFilter, sessionSort, storyDay }) }
  const setDateFrom = (v: string) => { setDateFromLocal(v); onFiltersChange?.({ sessionFilter, dateFrom: v, dateTo, sessionSourceFilter, sessionSort, storyDay }) }
  const setDateTo = (v: string) => { setDateToLocal(v); onFiltersChange?.({ sessionFilter, dateFrom, dateTo: v, sessionSourceFilter, sessionSort, storyDay }) }
  const setSessionSourceFilter = (v: 'all' | 'claude' | 'codex') => { setSessionSourceFilterLocal(v); onFiltersChange?.({ sessionFilter, dateFrom, dateTo, sessionSourceFilter: v, sessionSort, storyDay }) }
  const setSessionSort = (v: 'date' | 'date-asc' | 'tokens' | 'tokens-asc') => { setSessionSortLocal(v); onFiltersChange?.({ sessionFilter, dateFrom, dateTo, sessionSourceFilter, sessionSort: v, storyDay }) }
  const setStoryDay = (v: string) => { setStoryDayLocal(v); onFiltersChange?.({ sessionFilter, dateFrom, dateTo, sessionSourceFilter, sessionSort, storyDay: v }) }
  // 여러 필터를 한 번에 바꿀 때는 setter 연쇄 호출 금지 — 각 setter가 stale closure 값으로
  // onFiltersChange 를 emit 하므로 마지막 emit 이 앞선 변경을 되돌린다. 단일 emit 헬퍼 사용.
  const applyFilters = (next: Partial<DashboardFilters>) => {
    const merged: DashboardFilters = { sessionFilter, dateFrom, dateTo, sessionSourceFilter, sessionSort, storyDay, ...next }
    setSessionFilterLocal(merged.sessionFilter)
    setDateFromLocal(merged.dateFrom)
    setDateToLocal(merged.dateTo)
    setSessionSourceFilterLocal(merged.sessionSourceFilter)
    setSessionSortLocal(merged.sessionSort)
    setStoryDayLocal(merged.storyDay)
    onFiltersChange?.(merged)
  }

  const [rhythmReceiptsOpen, setRhythmReceiptsOpen] = useState(false)
  const [storyReceiptsOpen, setStoryReceiptsOpen] = useState(false)
  const [fingerprintReceiptsOpen, setFingerprintReceiptsOpen] = useState(false)
  const [aiRoleMetricMode, setAiRoleMetricMode] = useState<'count' | 'ratio'>('count')
  const [tokenSource, setTokenSource] = useState<'claude' | 'codex'>('claude')

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        const dateDiff = new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        if (sessionSort === 'date') return dateDiff
        if (sessionSort === 'date-asc') return -dateDiff

        const tokenDiff = getSessionTotalTokens(b) - getSessionTotalTokens(a)
        if (sessionSort === 'tokens') return tokenDiff !== 0 ? tokenDiff : dateDiff
        return tokenDiff !== 0 ? -tokenDiff : dateDiff
      }),
    [sessionSort, sessions]
  )

  // 세션별 로컬 일 키 집합 — 그날 이야기 날짜 필터용 사전 계산 (자정 넘는 세션도 그날 메시지가 있으면 매칭)
  const sessionDayKeys = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const session of sessions) {
      const days = new Set<string>()
      for (const message of session.messages) {
        if (!message.timestamp) continue
        const date = new Date(message.timestamp)
        if (Number.isNaN(date.getTime())) continue
        days.add(toLocalDayKey(date))
      }
      map.set(session.id, days)
    }
    return map
  }, [sessions])

  const filteredSessions = useMemo(() => {
    const query = sessionFilter.toLowerCase()
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null
    const toTs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null

    return sortedSessions.filter((session) => {
      const matchesSource = sessionSourceFilter === 'all' || session.source === sessionSourceFilter
      if (!matchesSource) return false

      if (fromTs !== null && new Date(session.startTime).getTime() < fromTs) return false
      if (toTs !== null && new Date(session.startTime).getTime() > toTs) return false

      if (storyDay && !sessionDayKeys.get(session.id)?.has(storyDay)) return false

      if (!sessionFilter.trim()) return true
      return (
        cleanClaudeText(session.messages[0]?.text ?? '').text.toLowerCase().includes(query) ||
        session.messages.some((message) => message.text.toLowerCase().includes(query))
      )
    })
  }, [sessionFilter, sessionSourceFilter, dateFrom, dateTo, storyDay, sessionDayKeys, sortedSessions])

  const sessionDateBounds = useMemo(() => {
    if (sessions.length === 0) return { min: '', max: '' }
    const times = sessions.map(s => new Date(s.startTime).getTime())
    const toDateStr = (ts: number) => new Date(ts).toISOString().slice(0, 10)
    return {
      min: toDateStr(Math.min(...times)),
      max: new Date().toISOString().slice(0, 10),
    }
  }, [sessions])

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- correct stale selection when the chosen source becomes empty
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
  const sourceColor = (source: SessionSource) => getSourceColor(source, themeProps.theme)
  const tokenSourceColor = sourceColor(tokenSource)
  const tokenSourceLabel = tokenSource === 'claude' ? 'Claude' : 'Codex'
  const displayInputTokens = activeTokenTotals.input + (activeTokenTotals.cachedInput || 0) + (activeTokenTotals.cacheWriteInput || 0)
  const isKorean = locale === 'ko'
  const isPersonalityMode = sectionMode === 'personality'
  const handleSectionSwitch = isPersonalityMode ? onOpenDashboard : onOpenPersonality
  const sectionSwitchLabel = isPersonalityMode
    ? (isKorean ? '대시보드' : 'Dashboard')
    : t('dashboard.personality')
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
  const personaQuiz = useMemo(() => loadPersonaQuiz(), [])
  const topUsageCategories = useMemo(() => {
    const auto = analyzeUsageTopCategories(sessions, USAGE_CATEGORIES.length)
    return applyCalibrationOverUniverse(auto, personaQuiz?.finalDistribution, USAGE_CATEGORIES).slice(0, 8)
  }, [sessions, personaQuiz])
  const topUsageCategory = topUsageCategories[0] ?? null
  const hasCalibration = personaQuiz != null

  const topLanguages = useMemo(() => analyzeLanguages(sessions), [sessions])

  // 그날 이야기 — stats.dailyTokens(UTC 키)는 재사용 금지, buildDailyCollab 이 로컬 키로 재집계 (설계 공통 데이터 정책 1·2항)
  const dailyCollab = useMemo(() => buildDailyCollab(sessions), [sessions])
  const storyResult = useMemo(() => scoreStoryDays(dailyCollab), [dailyCollab])
  const story = storyResult.best
  const sessionListRef = useRef<HTMLDivElement | null>(null)
  const handleStoryJump = (dayKey: string) => {
    // "이날 세션 보기"의 약속은 그날 세션이 실제로 보이는 것 — 충돌 가능한 필터(텍스트·소스·날짜범위)는
    // 함께 해제한다 (날짜범위는 session.startTime 축이라 자정 걸친 세션을 숨길 수 있음). 정렬은 유지.
    applyFilters({ sessionFilter: '', dateFrom: '', dateTo: '', sessionSourceFilter: 'all', storyDay: dayKey })
    // 필터 반영 렌더 후 스크롤 (SessionView highlight 스크롤 패턴)
    window.setTimeout(() => {
      sessionListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }
  const axisOrder = ['style', 'scope', 'rhythm'] as const
  const axisColors = {
    style: 'var(--color-accent)',
    scope: 'var(--color-cyan)',
    rhythm: 'var(--color-amber)',
  } as const
  const aiRoleLabel = isKorean ? 'AI가 자주 한 일' : 'What AI Did'
  const aiRoleFallbackTitle = isKorean ? '아직 탐색 중' : 'Still Exploring'
  const aiRoleFallbackBody = isKorean
    ? '메시지가 더 쌓이면 패턴이 또렷해져요.'
    : 'More messages will sharpen the pattern.'
  const aiRoleSummary = topUsageCategory
    ? isKorean
      ? '자주 보인 요청 패턴'
      : 'Frequently observed patterns'
    : aiRoleFallbackBody
  const aiRoleTooltipDescription = isKorean
    ? DASHBOARD_USAGE_CARD_HELP
    : 'Shows which roles your AI most often took based on recurring request patterns in your messages. Rough estimate based on keywords, not a precise classification.'
  const personaQuizLabel = hasCalibration
    ? (isKorean ? '다시 진단' : 'Retake quiz')
    : (isKorean ? '내 페르소나 진단' : 'Diagnose persona')
  const calibratedBadgeLabel = isKorean ? '보정됨' : 'Calibrated'

  // 코딩 리듬 — 일 단위 집계는 로컬 날짜 키 (stats.dailyActivity 의 UTC dayKey 와 다른 축)
  const rhythm = useMemo(() => buildCodingRhythm(collectUserTimestamps(sessions)), [sessions])
  const rhythmWeekdayMax = Math.max(...rhythm.weekdayDistribution.map((entry) => entry.count), 1)
  const rhythmBestWeekday = rhythm.weekdayDistribution.reduce(
    (best, entry, index) => (entry.count > rhythm.weekdayDistribution[best].count ? index : best),
    0
  )
  const activityDensityTitle = isKorean ? '활동 밀도' : 'Activity density'
  const activeDayLabel = isKorean ? '활동일' : 'Active days'
  const observedDayLabel = isKorean ? '관측' : 'Observed'
  const dayUnitLabel = isKorean ? '일' : ' days'

  // AI 협업 지문 — dailyCollab(그날 이야기)·rhythm(코딩 리듬) 인스턴스를 그대로 주입 (카드 간 수치 드리프트 방지)
  const fingerprint = useMemo(() => buildCollabFingerprint(sessions, dailyCollab, rhythm), [sessions, dailyCollab, rhythm])
  const fingerprintTitle = isKorean ? 'AI 협업 지문' : 'AI Collaboration Fingerprint'
  // 상시 추정 부제 — 프롬프트 코칭 카드 패턴 (바넘 회피: 단정 0건, 모든 주장에 수치 + n=)
  const fingerprintSubtitle = isKorean
    ? '본인 과거 기준선 대비 추정이에요 — 정확한 진단은 아니에요.'
    : 'Estimated against your own past baseline — not a precise diagnosis.'
  const fingerprintTooltipDescription = isKorean
    ? '주말 집중·구조화 변화·정정 후 계획 요청·심야 비중·긴 세션 선호 5가지 상호작용 신호를 본인 과거 기준선과 비교해 두드러진 패턴 2~3개를 보여줘요. 성격 카드(작업 스타일)·AI 역할(요청 주제)과 달리 "AI와 어떻게 협업하나"를 봐요. 키워드·시간 분포 기반 추정이에요.'
    : 'Compares five interaction signals (weekend focus, structured-prompt shift, plan-first after corrections, late-night share, long-session preference) against your own baseline and surfaces the 2–3 that stand out. Unlike the personality card (work style) or the AI-role donut (request topics), this asks "how do you collaborate with AI". Keyword and time-distribution based estimate.'
  const fingerprintEmptyCopy = fingerprint.viableCount < MIN_FINGERPRINT_TOP_SIGNALS
    ? (isKorean
      ? `지문을 수집하는 중이에요 — 신호가 ${MIN_FINGERPRINT_TOP_SIGNALS}개 이상 모이면 보여드려요 (지금 ${fingerprint.viableCount}개)`
      : `Collecting your fingerprint — it shows once ${MIN_FINGERPRINT_TOP_SIGNALS}+ signals are viable (${fingerprint.viableCount} so far)`)
    : fingerprint.topSignals.length === 1
      // 두드러진 신호가 1개 있는데 "기준선과 비슷한 범위"라고 말하면 영수증과 모순 (반증가능 원칙)
      ? (isKorean
        ? `두드러진 패턴이 1개뿐이에요 — 분포로 보여드리려면 ${MIN_FINGERPRINT_TOP_SIGNALS}개부터예요 (세부 수치에서 확인할 수 있어요)`
        : `Only one pattern stands out — the distribution view starts at ${MIN_FINGERPRINT_TOP_SIGNALS} (see Details below)`)
      : (isKorean
        ? `아직 두드러진 패턴이 안 보여요 — 본인 기준선과 비슷한 범위예요 (성립 신호 ${fingerprint.viableCount}개)`
        : `No standout pattern yet — everything sits near your own baseline (${fingerprint.viableCount} viable signals)`)

  useEffect(() => {
    if (topUsageCategories.length === 0) return

    const timer = window.setInterval(() => {
      setAiRoleMetricMode((prev) => prev === 'count' ? 'ratio' : 'count')
    }, 10000)

    return () => window.clearInterval(timer)
  }, [topUsageCategories.length])

  function renderSessionRow(session: Session, index: number) {
    const sessionSourceColor = sourceColor(session.source)
    const sourceLabel = session.source === 'claude' ? 'Claude' : 'Codex'
    const messageCount = session.messageCount.user + session.messageCount.assistant
    const sessionTokenTotal = getSessionTotalTokens(session)
    const sessionCost = sessionTokenTotal > 0 ? calculateSessionCost(session) : 0
    const sessionCostLabel = sessionCost >= 0.01
      ? `$${sessionCost.toFixed(2)}`
      : sessionCost > 0
        ? `<$0.01`
        : ''
    const sessionDisplayName = getSessionDisplayName(session)

    return (
      <button
        key={session.id}
        onClick={() => onSelectSession(session, index)}
        className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-bg-hover"
      >
        <div className="w-10 shrink-0 text-right text-sm font-mono font-medium text-text">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 truncate text-sm font-medium text-text-bright">
            {/* 프리뷰 표면 — 항상 마스킹. slice 전에 마스킹해야 잘린 시크릿 조각이 안 샌다 */}
            {maskSecrets(cleanClaudeText(session.messages[0]?.text ?? '').text).masked.slice(0, 80) || untitledSessionLabel}
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
                  color: sessionSourceColor.text,
                  borderColor: sessionSourceColor.border,
                  background: sessionSourceColor.soft,
                }}
              >
                {sourceLabel}
              </span>
              {session.model && (
                <span className="rounded-full border border-green/25 bg-green/8 px-2 py-0.5 text-[10px] font-medium text-green">
                  {shortModelName(session.model)}
                </span>
              )}
              {sessionTokenTotal > 0 && (
                <span className="group relative inline-flex">
                  <span
                    className="rounded-full border border-text/12 bg-bg-hover px-2 py-0.5 text-[10px] font-medium text-text-bright"
                    title={sessionCostLabel ? `예상 비용 ${sessionCostLabel}` : undefined}
                  >
                    {formatTokens(sessionTokenTotal)} 토큰
                  </span>
                  {sessionCostLabel && (
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-bg-card px-2 py-1 text-[10px] font-mono font-semibold text-text-bright opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                      {sessionCostLabel}
                    </span>
                  )}
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] text-text/28">{openSessionLabel}</div>
        </div>
      </button>
    )
  }

  const SESSION_PAGE_SIZE = 50
  const [sessionLimit, setSessionLimit] = useState(SESSION_PAGE_SIZE)
  const [prevFilteredCount, setPrevFilteredCount] = useState(filteredSessions.length)

  if (filteredSessions.length !== prevFilteredCount) {
    setPrevFilteredCount(filteredSessions.length)
    setSessionLimit(SESSION_PAGE_SIZE)
  }

  const visibleSessions = filteredSessions.slice(0, sessionLimit)
  const hasMore = filteredSessions.length > sessionLimit

  const sessionListContent = filteredSessions.length === 0 ? (
    <div className="px-6 py-16 text-center text-sm text-text/40">
      {emptySessionListLabel}
    </div>
  ) : (
    <>
      {visibleSessions.map((session, i) => renderSessionRow(session, filteredSessions.length - 1 - i))}
      {hasMore && (
        <button
          onClick={() => setSessionLimit((l) => l + SESSION_PAGE_SIZE)}
          className="w-full rounded-xl bg-white/5 py-3 text-sm text-text/60 transition-colors hover:bg-white/10 hover:text-text-bright"
        >
          {filteredSessions.length - sessionLimit}개 더 보기
        </button>
      )}
    </>
  )

  return (
    <div className="dashboard-shell">
      <MemradarTopBar
        sessionCount={stats.totalSessions}
        themeProps={themeProps}
        onOpenWrapped={onOpenWrapped}
        onReload={onReload}
      />

      <div className="dashboard-overview-grid animate-in mb-5">
        <div className="h-full rounded-[26px] border border-border bg-bg-card p-5">
          <div className="mx-auto w-full max-w-xl text-center">
            <div className="mb-3 flex items-center justify-center gap-2">
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                style={{
                  background: 'color-mix(in srgb, var(--t-accent) 10%, var(--t-bg-card))',
                  color: 'color-mix(in srgb, var(--t-accent) 82%, var(--t-text-bright) 18%)',
                }}
              >
                {isKorean ? '내 전체 성향' : 'My Overall Type'}
              </span>
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-mono font-bold tracking-widest"
                style={{
                  background: 'color-mix(in srgb, var(--t-accent) 15%, var(--t-bg-card))',
                  color: 'color-mix(in srgb, var(--t-accent) 90%, var(--t-text-bright) 10%)',
                  border: '1px solid color-mix(in srgb, var(--t-accent) 30%, transparent)',
                }}
              >
                {personality.type}
              </span>
            </div>

            <div className="mb-3 flex justify-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-3xl border border-border/70 bg-bg-hover/40">
                <PersonalityIcon size={56} aria-hidden="true" />
              </span>
            </div>
            <h2 className="mb-1 text-3xl font-bold text-text-bright">{personality.title}</h2>
            <p className="mb-3 text-sm text-accent">{personality.subtitle}</p>
            <p className="mx-auto max-w-lg text-sm leading-relaxed text-text/70">{personality.description}</p>

            <div className="mx-auto mt-5 w-full max-w-md space-y-3 text-left">
              {axisOrder.map((key) => {
                const axis = personality.axes[key]
                return (
                  <DashboardAxisBar key={key} axis={axis} axisKey={key} color={axisColors[key]} />
                )
              })}
            </div>

            <div className="mt-5 grid gap-3 text-left sm:grid-cols-2">
              <div
                className="rounded-xl border p-3.5"
                style={{
                  borderColor: 'color-mix(in srgb, var(--t-border) 88%, transparent)',
                  background: 'color-mix(in srgb, var(--t-text-bright) 6%, transparent)',
                }}
              >
                <DashboardHoverTooltip
                  title="STRENGTHS"
                  description={DASHBOARD_PERSONALITY_PANEL_HELP.strengths}
                  align="left"
                  wrapperClassName="group relative block"
                  buttonClassName="mb-1 inline-flex cursor-help rounded text-[10px] font-semibold tracking-wide text-text/35 focus:outline-none focus:ring-1 focus:ring-accent/40"
                >
                  STRENGTHS
                </DashboardHoverTooltip>
                <div className="text-xs leading-relaxed text-text/70">{personality.strengths}</div>
              </div>
              <div
                className="rounded-xl border p-3.5"
                style={{
                  borderColor: 'color-mix(in srgb, var(--t-border) 88%, transparent)',
                  background: 'color-mix(in srgb, var(--t-text-bright) 6%, transparent)',
                }}
              >
                <DashboardHoverTooltip
                  title="HEADS UP"
                  description={DASHBOARD_PERSONALITY_PANEL_HELP.headsUp}
                  align="right"
                  wrapperClassName="group relative block"
                  buttonClassName="mb-1 inline-flex cursor-help rounded text-[10px] font-semibold tracking-wide text-text/35 focus:outline-none focus:ring-1 focus:ring-accent/40"
                >
                  HEADS UP
                </DashboardHoverTooltip>
                <div className="text-xs leading-relaxed text-text/70">{personality.caution}</div>
              </div>
            </div>

          </div>
        </div>

        <div className="rounded-[26px] border border-border bg-bg-card p-5">
          <div className="mb-1 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-lg font-bold text-text-bright">{aiRoleLabel}</h2>
              <DashboardHoverTooltip
                title={aiRoleLabel}
                description={aiRoleTooltipDescription}
                align="left"
                tooltipWidthClass="w-60"
                buttonClassName="rounded-full p-0.5 text-text/35 transition-colors hover:text-text/70 focus:outline-none focus:ring-1 focus:ring-accent/40"
              >
                <CircleHelp className="h-3.5 w-3.5" />
              </DashboardHoverTooltip>
              {hasCalibration && (
                <span className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                  {calibratedBadgeLabel}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onOpenPersonaQuiz && (
                <button
                  type="button"
                  onClick={onOpenPersonaQuiz}
                  className="flex h-8 items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 text-sm font-medium text-accent transition-colors hover:border-accent/55 hover:bg-accent/20"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>{personaQuizLabel}</span>
                </button>
              )}
              {handleSectionSwitch && (
                <button
                  type="button"
                  onClick={handleSectionSwitch}
                  className="flex h-8 items-center gap-2 rounded-xl border border-border/70 bg-bg-card/70 px-3 text-sm font-medium text-text transition-colors hover:bg-bg-hover hover:text-text-bright"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  <span>{sectionSwitchLabel}</span>
                </button>
              )}
            </div>
          </div>
          <p className="mb-3 text-sm text-text/50">{aiRoleSummary}</p>
          {topUsageCategories.length > 0 ? (
            <InteractiveRoleDonutChart
              categories={topUsageCategories}
              metricMode={aiRoleMetricMode}
              isKorean={isKorean}
            />
          ) : (
            <div className="rounded-xl border border-border/70 bg-white/4 p-4 text-sm text-text/55">
              <div className="font-semibold text-text-bright">{aiRoleFallbackTitle}</div>
              <div className="mt-1">{aiRoleFallbackBody}</div>
            </div>
          )}

        </div>

        {/* AI 협업 지문 — 카드 경계: 성격 카드 = "어떤 사람인가(작업 스타일)" / AI 역할 도넛 =
            "AI에게 무엇을 시키나(요청 주제)" / 지문 = "AI와 어떻게 협업하나(상호작용 행동)".
            성격 카드의 'rhythm' 축 ≠ 지문 신호 — 어휘 분리 (collabFingerprint.ts 모듈 주석).
            전폭 2행 배치 (span 4) — 성격/도넛 카드 레이아웃은 무변경. */}
        <div className="dashboard-overview-card-fingerprint rounded-[26px] border border-border bg-bg-card p-5">
          <div className="mb-1 flex min-w-0 items-center gap-2">
            <Fingerprint className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <h2 className="truncate text-lg font-bold text-text-bright">{fingerprintTitle}</h2>
            <DashboardHoverTooltip
              title={fingerprintTitle}
              description={fingerprintTooltipDescription}
              align="left"
              tooltipWidthClass="w-60"
              buttonClassName="rounded-full p-0.5 text-text/35 transition-colors hover:text-text/70 focus:outline-none focus:ring-1 focus:ring-accent/40"
            >
              <CircleHelp className="h-3.5 w-3.5" />
            </DashboardHoverTooltip>
          </div>
          {/* 상시 추정 부제 — 빈상태에서도 유지 (프롬프트 코칭 카드 패턴) */}
          <p className="mb-3 text-[11px] text-text/45">{fingerprintSubtitle}</p>

          {fingerprint.topSignals.length >= MIN_FINGERPRINT_TOP_SIGNALS ? (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {fingerprint.topSignals.map((signal) => (
                <FingerprintSignalRow key={signal.id} signal={signal} isKorean={isKorean} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-text/40">{fingerprintEmptyCopy}</p>
          )}

          <div className="mt-3">
            <button
              type="button"
              onClick={() => setFingerprintReceiptsOpen((prev) => !prev)}
              aria-expanded={fingerprintReceiptsOpen}
              className="flex items-center gap-1.5 rounded-full border border-border/40 bg-bg px-2.5 py-1 text-[10px] text-text/60 transition-colors hover:border-border hover:text-text"
            >
              <span>{isKorean ? '세부 수치' : 'Details'}</span>
              {fingerprintReceiptsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {fingerprintReceiptsOpen && (
              <div className="mt-3 space-y-1.5 rounded-xl border border-border/60 bg-bg-hover/40 px-3.5 py-3 text-xs text-text/70">
                {/* viable 미달 신호도 측정 현황을 그대로 표기 — 숨기지 않음 (반증가능 원칙). 수집 중 빈상태에서도 표시 */}
                {fingerprint.signals.map((signal) => (
                  <div key={signal.id}>
                    <span className="font-medium text-text-bright/85">{fingerprintSignalLabel(signal.id, isKorean)}</span>
                    <span className="text-text/45"> — </span>
                    {fingerprintReceiptLine(signal, isKorean)}
                  </div>
                ))}
                <div className="flex items-center gap-1 text-[10px] text-text/40">
                  <span>{isKorean ? '일 단위는 로컬 날짜 기준' : 'Daily stats use local dates'}</span>
                  <DashboardHoverTooltip
                    align="left"
                    description={isKorean
                      ? '일 단위 수치(주말 집중·구조화 변화 구간)는 로컬 날짜 기준이고, 월 단위 통계(성장 섹션)는 UTC 기준이에요.'
                      : 'Daily numbers (weekend focus, structured-shift windows) use your local date; monthly stats (growth section) use UTC.'}
                  >
                    <CircleHelp className="h-3 w-3 text-text/40" aria-hidden="true" />
                  </DashboardHoverTooltip>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {isPersonalityMode ? (
          <motion.div
            key="personality-sections"
            initial={sectionTransition.initial}
            animate={sectionTransition.animate}
            exit={sectionTransition.exit}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'top center', willChange: 'transform, opacity, filter' }}
          >
            <PersonalitySections />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard-sections"
            className="space-y-6"
            initial={sectionTransition.initial}
            animate={sectionTransition.animate}
            exit={sectionTransition.exit}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'top center', willChange: 'transform, opacity, filter' }}
          >
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
              <BarChart3 className="dashboard-token-title-icon h-4 w-4" aria-hidden="true" />
              <span className="whitespace-nowrap text-sm text-text">{tokenUsageLabel}</span>
            </div>
            <div className="dashboard-token-header-actions">
              <div className="dashboard-token-switch">
                {(['claude', 'codex'] as const).map((source) => {
                  const active = tokenSource === source
                  const disabled = sourceSessions[source].length === 0
                  const color = sourceColor(source)

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
                        <span style={{ color: sourceColor('claude').text }}>Claude</span>
                        <span className="font-mono">${claudeEstimatedCost.toFixed(2)}</span>
                      </div>
                    )}
                    {sourceSessions.codex.length > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <span style={{ color: sourceColor('codex').text }}>Codex</span>
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
              {((activeTokenTotals.cachedInput || 0) + (activeTokenTotals.cacheWriteInput || 0)) > 0 && (
                <span className="ml-1 text-text/35">cache {formatTokens((activeTokenTotals.cachedInput || 0) + (activeTokenTotals.cacheWriteInput || 0))}</span>
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
          <div className="mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-amber" />
            <span className="text-sm text-text">{isKorean ? '그날 이야기' : 'Story of the Day'}</span>
          </div>
          {story !== null ? (
            <>
              <div className="text-2xl font-bold text-text-bright">{story.dayKey}</div>
              <p className="mt-1 text-xs leading-relaxed text-text/70">
                {storyNarrative(story, isKorean)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* 명시적 버튼 — 카드 전체 div 클릭 금지 (접근성) */}
                <button
                  type="button"
                  onClick={() => handleStoryJump(story.dayKey)}
                  className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-medium text-accent transition-colors hover:border-accent/55 hover:bg-accent/20"
                >
                  {isKorean ? '이날 세션 보기' : 'View sessions'}
                </button>
                <button
                  type="button"
                  onClick={() => setStoryReceiptsOpen((prev) => !prev)}
                  aria-expanded={storyReceiptsOpen}
                  className="flex items-center gap-1.5 rounded-full border border-border/40 bg-bg px-2.5 py-1 text-[10px] text-text/60 transition-colors hover:border-border hover:text-text"
                >
                  <span>{isKorean ? '세부 수치' : 'Details'}</span>
                  {storyReceiptsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              </div>
              {storyReceiptsOpen && (
                <div className="mt-3 space-y-1.5 rounded-xl border border-border/60 bg-bg-hover/40 px-3.5 py-3 text-xs text-text/70">
                  <div>
                    {isKorean
                      ? `세션 ${story.receipts.sessionCount}개 · 시간 범위 ${story.receipts.spanHours.toFixed(1)}시간`
                      : `${story.receipts.sessionCount} sessions · ${story.receipts.spanHours.toFixed(1)}h span`}
                  </div>
                  <div>
                    {isKorean
                      ? `토큰 ${formatTokens(story.receipts.tokens)}`
                      : `${formatTokens(story.receipts.tokens)} tokens`}
                    {story.receipts.dayAvgTokens > 0 && (
                      <span className="text-text/45">
                        {isKorean
                          ? ` (일평균의 ${(story.receipts.tokens / story.receipts.dayAvgTokens).toFixed(1)}배, n=활동 ${storyResult.activeDayCount}일)`
                          : ` (${(story.receipts.tokens / story.receipts.dayAvgTokens).toFixed(1)}x daily avg, n=${storyResult.activeDayCount} days)`}
                      </span>
                    )}
                  </div>
                  {/* 결측 항(③ follow-up 미달)은 행 자체 생략 — 비율은 분모 n= 필수 */}
                  {story.receipts.retryRateFirst !== null && story.receipts.retryRateSecond !== null && (
                    <div>
                      {isKorean
                        ? `재질문 ${Math.round(story.receipts.retryRateFirst * 100)}%→${Math.round(story.receipts.retryRateSecond * 100)}% (n=${story.receipts.followUpCount})`
                        : `Retries ${Math.round(story.receipts.retryRateFirst * 100)}%→${Math.round(story.receipts.retryRateSecond * 100)}% (n=${story.receipts.followUpCount})`}
                    </div>
                  )}
                  <div>
                    {/* 스킬 서브항은 Claude 세션 있는 날만 (source-aware) — 없는 날은 언어만 */}
                    {story.receipts.hasClaudeSession && (
                      <span>{isKorean ? `스킬 ${story.receipts.skillCount}종 · ` : `${story.receipts.skillCount} skills · `}</span>
                    )}
                    {isKorean
                      ? `언어 ${story.receipts.languageCount}종 · user 메시지 ${story.receipts.userMessageCount}건`
                      : `${story.receipts.languageCount} languages · ${story.receipts.userMessageCount} user messages`}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-text/40">
                    <span>{isKorean ? '일 단위는 로컬 날짜 기준' : 'Daily stats use local dates'}</span>
                    <DashboardHoverTooltip
                      align="left"
                      description={isKorean
                        ? '일 단위 수치(그날 이야기·캘린더·요일 분포)는 로컬 날짜 기준이고, 월 단위 통계(성장 섹션)는 UTC 기준이에요.'
                        : 'Daily numbers (story of the day, calendar, weekday distribution) use your local date; monthly stats (growth section) use UTC.'}
                    >
                      <CircleHelp className="h-3 w-3 text-text/40" aria-hidden="true" />
                    </DashboardHoverTooltip>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-text/40">
              {storyResult.activeDayCount < MIN_ACTIVE_DAYS_FOR_STORY
                ? (isKorean
                  ? `이야기를 모으는 중이에요 — 활동일이 ${MIN_ACTIVE_DAYS_FOR_STORY}일이 되면 그날의 이야기를 골라요 (지금 ${storyResult.activeDayCount}일)`
                  : `Collecting your story — a day gets picked at ${MIN_ACTIVE_DAYS_FOR_STORY} active days (${storyResult.activeDayCount} so far)`)
                : (isKorean
                  ? `아직 이야기로 꼽을 만큼 대화가 몰린 날이 없어요 — 하루 user 메시지 ${MIN_USER_MESSAGES_PER_DAY}건 이상인 날이 생기면 골라요`
                  : `No single day has enough conversation for a story yet — it takes ${MIN_USER_MESSAGES_PER_DAY}+ user messages in one day`)}
            </p>
          )}
        </div>
      </div>

      <div className="dashboard-activity-grid animate-in">
        <div className="dashboard-card dashboard-card-tight">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <Calendar className="h-4 w-4 text-green" />
            {isKorean ? '코딩 리듬' : 'Coding Rhythm'}
          </h2>

          <div className="dashboard-heatmap-body">
            <Heatmap localDailyCounts={rhythm.localDailyCounts} />
          </div>

          {rhythm.label !== null && rhythm.labelEvidence !== null ? (
            <p className="mt-3 text-sm font-medium text-text-bright">
              {rhythmNarrative(rhythm.label, rhythm.labelEvidence, isKorean)}
            </p>
          ) : (
            <p className="mt-3 text-sm text-text/40">
              {rhythm.activeDayCount < MIN_ACTIVE_DAYS_FOR_RHYTHM
                ? (isKorean
                  ? `리듬이 모이는 중이에요 — 활동일이 ${MIN_ACTIVE_DAYS_FOR_RHYTHM}일이 되면 분석해요 (지금 ${rhythm.activeDayCount}일)`
                  : `Rhythm is still collecting — analysis starts at ${MIN_ACTIVE_DAYS_FOR_RHYTHM} active days (${rhythm.activeDayCount} so far)`)
                : (isKorean
                  ? `아직 라벨을 붙일 만큼 강한 신호는 부족해 보여요 (활동 ${rhythm.activeDayCount}일)`
                  : `Signals don't look strong enough for a rhythm label yet (${rhythm.activeDayCount} active days)`)}
            </p>
          )}

          <div className="mt-3">
            <button
              type="button"
              onClick={() => setRhythmReceiptsOpen((prev) => !prev)}
              aria-expanded={rhythmReceiptsOpen}
              className="flex items-center gap-1.5 rounded-full border border-border/40 bg-bg px-2.5 py-1 text-[10px] text-text/60 transition-colors hover:border-border hover:text-text"
            >
              <span>{isKorean ? '세부 수치' : 'Details'}</span>
              {rhythmReceiptsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {rhythmReceiptsOpen && (
              <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-bg-hover/40 px-3.5 py-3">
                <div>
                  <div className="mb-1.5 text-[10px] text-text/50">
                    {isKorean ? '요일 분포' : 'Weekday distribution'}
                  </div>
                  <div className="space-y-1">
                    {DAY_OF_WEEK_LABELS.map((label, index) => {
                      const entry = rhythm.weekdayDistribution[index]
                      const width = Math.round((entry.count / rhythmWeekdayMax) * 100)
                      const isBest = index === rhythmBestWeekday && entry.count > 0
                      return (
                        <div key={label} className="dashboard-pattern-row flex items-center gap-1.5 rounded-md px-1 py-0.5">
                          <span className={`w-3 text-right text-[10px] ${isBest ? 'font-bold text-accent' : 'text-text/50'}`}>
                            {label}
                          </span>
                          <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
                            <div
                              className={`dashboard-pattern-bar h-full rounded-full ${isBest ? 'bg-accent/70' : 'bg-accent/30'}`}
                              style={{ width: `${width}%` }}
                            />
                          </div>
                          <span className={`w-16 text-right text-[10px] ${isBest ? 'font-bold text-accent' : 'text-text/40'}`}>
                            {entry.count.toLocaleString()} · {(entry.share * 100).toFixed(1)}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text/70">
                  <span>
                    {activityDensityTitle} {Math.round(rhythm.densityRatio * 100)}%
                    {' '}({activeDayLabel} {rhythm.activeDayCount}{dayUnitLabel} / {observedDayLabel} {rhythm.observedDayCount}{dayUnitLabel})
                  </span>
                  <span>
                    {isKorean ? '최장 연속' : 'Longest streak'} {rhythm.longestStreak}{dayUnitLabel}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-[10px] text-text/40">
                  <span>{isKorean ? '일 단위는 로컬 날짜 기준' : 'Daily stats use local dates'}</span>
                  <DashboardHoverTooltip
                    align="left"
                    description={isKorean
                      ? '일 단위 수치(캘린더·요일 분포·연속 기록)는 로컬 날짜 기준이고, 월 단위 통계(성장 섹션)는 UTC 기준이에요.'
                      : 'Daily numbers (calendar, weekday distribution, streak) use your local date; monthly stats (growth section) use UTC.'}
                  >
                    <CircleHelp className="h-3 w-3 text-text/40" aria-hidden="true" />
                  </DashboardHoverTooltip>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-analytics-grid">
        <div className="dashboard-card dashboard-card-tight animate-in dashboard-analytics-card dashboard-analytics-card-model">
          <h2 className="mb-3 text-sm font-semibold text-text-bright">사용한 모델</h2>
          <div className="dashboard-card-body-center">
            <InteractiveDonutChart data={topModels} />
          </div>
        </div>

        <div className="dashboard-card dashboard-card-tight animate-in dashboard-analytics-card dashboard-analytics-card-language">
          <h2 className="mb-3 text-sm font-semibold text-text-bright">
            {isKorean ? '사용한 언어' : 'Languages'}
          </h2>
          <div className="dashboard-card-body-center">
            <LanguageBar languages={topLanguages} />
          </div>
        </div>

        <div className="dashboard-card dashboard-card-tight animate-in dashboard-analytics-card dashboard-analytics-card-hour">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <MessageSquare className="h-4 w-4 text-cyan" />
            시간대별 활동
          </h2>
          <div className="dashboard-card-body-center">
            <HourChart data={stats.hourlyActivity} />
          </div>
        </div>

        <div className="dashboard-card dashboard-card-tight animate-in dashboard-analytics-card dashboard-analytics-card-skills">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <ToolDefaultIcon className="h-4 w-4 text-violet" aria-hidden="true" />
            자주 쓴 스킬
          </h2>
          <GenericDonutChart data={stats.topSkills} centerLabel="스킬" />
        </div>

        <div className="dashboard-card dashboard-card-tight animate-in dashboard-analytics-card dashboard-analytics-card-session-length">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <Timer className="h-4 w-4 text-accent" />
            세션 길이
          </h2>
          <GenericDonutChart data={stats.sessionLengthDist} centerLabel="세션" />
        </div>

        <div className="dashboard-card dashboard-card-tight animate-in dashboard-analytics-card dashboard-analytics-card-words">
          <h2 className="mb-3 text-sm font-semibold text-text-bright">자주 쓴 단어</h2>
          <WordCloud
            words={stats.topWords}
            wordsUser={stats.topWordsUser}
            wordsAssistant={stats.topWordsAssistant}
          />
        </div>
      </div>

      <div className="dashboard-growth-grid">
        <div className="dashboard-card dashboard-card-tight animate-in dashboard-growth-card-complexity">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <TrendingUp className="h-4 w-4 text-violet" />
            {isKorean ? '질문 복잡도' : 'Prompt Complexity'}
          </h2>
          <GrowthComplexity data={stats.growth.monthlyComplexity} />
        </div>
        <div className="dashboard-card dashboard-card-tight animate-in dashboard-growth-card-retry">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <RotateCcw className="h-4 w-4 text-violet" />
            {isKorean ? '재질문 빈도' : 'Retry Rate'}
          </h2>
          <GrowthRetry retryStats={stats.growth.retryStats} />
        </div>
        <div className="dashboard-card dashboard-card-tight animate-in dashboard-growth-card-curve">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <LineChart className="h-4 w-4 text-violet" />
            {isKorean ? '프롬프트 숙련도 곡선' : 'Prompt Skill Curve'}
          </h2>
          <GrowthSkillCurve data={stats.growth.skillCurve} />
        </div>
        <div className="dashboard-card dashboard-card-tight animate-in dashboard-growth-card-coaching">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <Lightbulb className="h-4 w-4 text-violet" />
            {isKorean ? '프롬프트 코칭' : 'Prompt Coaching'}
          </h2>
          <p className="mb-3 text-[11px] text-text/45">
            {isKorean
              ? '키워드·길이 기반 추정이에요 — 정확한 진단은 아니에요.'
              : 'Estimated from keywords and length — not a precise diagnosis.'}
          </p>
          <GrowthCoaching growth={stats.growth} />
        </div>
      </div>


      <div ref={sessionListRef} className="dashboard-card dashboard-card-flush animate-in">
        <div className="border-b border-border p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-bright">{sessionListTitle}</h2>
            <span className="text-xs text-text/40">{formatSessionCount(filteredSessions.length)}</span>
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'claude', 'codex'] as const).map((source) => {
                const active = sessionSourceFilter === source
                const sessionSourceColor2 = source === 'all' ? null : sourceColor(source)
                const count = sourceFilterCounts[source]
                const activeStyles = source === 'all'
                  ? {
                      color: 'var(--color-text-bright)',
                      borderColor: 'var(--color-border)',
                      background: 'var(--color-bg-hover)',
                    }
                  : {
                      color: sessionSourceColor2?.text,
                      borderColor: sessionSourceColor2?.border,
                      background: sessionSourceColor2?.soft,
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
              ] as const).map(([sortKey, label]) => {
                const isActive = sessionSort === sortKey || sessionSort === `${sortKey}-asc`
                const isAscending = sessionSort === `${sortKey}-asc`
                const arrow = isActive ? (isAscending ? ' ↑' : ' ↓') : ''

                return (
                  <button
                    key={sortKey}
                    type="button"
                    onClick={() => {
                      if (sessionSort === sortKey) {
                        // 같은 버튼 재클릭 → 반대 방향으로 토글
                        setSessionSort(`${sortKey}-asc` as 'date-asc' | 'tokens-asc')
                      } else if (sessionSort === `${sortKey}-asc`) {
                        // 오름차순 상태에서 다시 클릭 → 내림차순으로
                        setSessionSort(sortKey as 'date' | 'tokens')
                      } else {
                        // 다른 버튼 클릭 → 해당 정렬의 기본값(내림차순)으로 변경
                        setSessionSort(sortKey as 'date' | 'tokens')
                      }
                    }}
                    className="rounded-full border px-3 py-1 text-[11px] font-medium transition-all"
                    style={isActive
                      ? {
                          color: 'var(--color-text-bright)',
                          borderColor: 'var(--color-border)',
                          background: 'var(--color-bg-hover)',
                        }
                      : undefined}
                  >
                    {label}{arrow}
                  </button>
                )
              })}
            </div>
          </div>
          <input
            type="text"
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            placeholder={sessionSearchPlaceholder}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-bright placeholder:text-text/30 focus:border-accent/50 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-text/40">날짜</span>
            <input
              type="date"
              value={dateFrom}
              min={sessionDateBounds.min}
              max={dateTo || sessionDateBounds.max}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-border bg-bg px-2 py-1 text-[11px] text-text-bright focus:border-accent/50 focus:outline-none [color-scheme:dark]"
            />
            <span className="text-[11px] text-text/40">~</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || sessionDateBounds.min}
              max={sessionDateBounds.max}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-border bg-bg px-2 py-1 text-[11px] text-text-bright focus:border-accent/50 focus:outline-none [color-scheme:dark]"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => applyFilters({ dateFrom: '', dateTo: '', storyDay: '' })}
                className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text/50 transition-colors hover:border-rose/40 hover:text-rose/70"
              >
                초기화
              </button>
            )}
            {storyDay && (
              <button
                type="button"
                onClick={() => setStoryDay('')}
                aria-label={isKorean ? '그날 이야기 날짜 필터 해제' : 'Clear story day filter'}
                className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] text-accent transition-colors hover:border-rose/40 hover:text-rose/70"
              >
                {storyDay} ✕
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[600px] divide-y divide-border overflow-y-auto">
          {sessionListContent}
        </div>
      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
