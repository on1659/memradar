import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowLeftRight,
  BarChart3,
  Brain,
  Calendar,
  CircleHelp,
  Code2,
  Flame,
  MessageSquare,
  Terminal,
  Timer,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Session, Stats } from '../types'
import { computeStats } from '../parser'
import { useI18n } from '../i18n'
import { computePersonality } from '../lib/personality'
import { analyzeUsageTopCategories, type UsageCategoryScore } from '../lib/usageProfile'
import { shortModelName } from '../lib/modelNames'
import { calculateSourceCost, getSourceColor, getTokenTotals } from '../lib/tokenPricing'
import { Heatmap } from './Heatmap'
import { HourChart } from './HourChart'
import { MemradarTopBar } from './MemradarTopBar'
import { PersonalitySections } from './PersonalityView'
import { WordCloud } from './WordCloud'
import { analyzeLanguages, type LanguageScore } from '../lib/languageProfile'

interface DashboardProps {
  sessions: Session[]
  onSelectSession: (session: Session) => void
  onOpenWrapped?: () => void
  onOpenPersonality?: () => void
  onOpenDashboard?: () => void
  sectionMode?: 'dashboard' | 'personality'
  themeProps: {
    theme: string
    accent: string
    setTheme: (theme: string) => void
    setAccent: (accent: string) => void
  }
}

const sectionTransition = {
  initial: { opacity: 0.35, y: -16, clipPath: 'inset(0 0 100% 0)', filter: 'blur(8px)' },
  animate: { opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)', filter: 'blur(0px)' },
  exit: { opacity: 0.2, y: 10, clipPath: 'inset(0 0 100% 0)', filter: 'blur(4px)' },
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
              <span className="w-6 shrink-0 text-center text-lg">{category.emoji}</span>
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
  '사용자 메시지에 자주 나온 요청 패턴을 바탕으로, AI가 어떤 역할을 많이 맡았는지 보여줘요.'

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
  sectionMode = 'dashboard',
  themeProps,
}: DashboardProps) {
  const { locale, t } = useI18n()
  const stats: Stats = useMemo(() => computeStats(sessions), [sessions])
  const personality = useMemo(() => computePersonality(sessions, stats), [sessions, stats])
  const [sessionFilter, setSessionFilter] = useState('')
  const [showLowestTokenDay, setShowLowestTokenDay] = useState(false)
  const [tokenDayPinned, setTokenDayPinned] = useState(false)
  const [dayPatternMode, setDayPatternMode] = useState<'count' | 'ratio'>('count')
  const [dayPatternPinned, setDayPatternPinned] = useState(false)
  const [aiRoleMetricMode, setAiRoleMetricMode] = useState<'count' | 'ratio'>('count')
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
  const tokenSourceColor = getSourceColor(tokenSource)
  const tokenSourceLabel = tokenSource === 'claude' ? 'Claude' : 'Codex'
  const displayInputTokens = activeTokenTotals.input + (activeTokenTotals.cachedInput || 0)
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
  const topUsageCategories = useMemo(() => analyzeUsageTopCategories(sessions, 8), [sessions])
  const topUsageCategory = topUsageCategories[0] ?? null

  const topLanguages = useMemo(() => analyzeLanguages(sessions), [sessions])

  const busiestTokenDay = stats.busiestTokenDay
  const busiestTokenDayAmount = busiestTokenDay ? stats.dailyTokens[busiestTokenDay] || 0 : 0
  const leastTokenDay = useMemo(() => {
    const entries = Object.entries(stats.dailyTokens).filter(([, value]) => value > 0)
    if (entries.length === 0) return ''
    return entries.sort((a, b) => a[1] - b[1])[0][0]
  }, [stats.dailyTokens])
  const leastTokenDayAmount = leastTokenDay ? stats.dailyTokens[leastTokenDay] || 0 : 0
  const axisOrder = ['style', 'scope', 'rhythm'] as const
  const axisColors = {
    style: 'var(--color-accent)',
    scope: 'var(--color-cyan)',
    rhythm: 'var(--color-amber)',
  } as const
  const aiRoleLabel = isKorean ? '내 AI의 직업' : 'AI Role'
  const aiRoleFallbackTitle = isKorean ? '아직 탐색 중' : 'Still Exploring'
  const aiRoleFallbackBody = isKorean
    ? '메시지가 더 쌓이면 대표 역할이 보여요.'
    : 'More messages will reveal the most common role.'
  const nextUsageCategory = topUsageCategories[1] ?? null
  const aiRoleSummary = topUsageCategory
    ? nextUsageCategory && topUsageCategory.score <= nextUsageCategory.score * 1.5
      ? isKorean
        ? `${topUsageCategory.title}와(과) ${nextUsageCategory.title}, 투잡 뛰는 중`
        : `${topUsageCategory.title} and ${nextUsageCategory.title}, split roles`
      : isKorean
        ? `${topUsageCategory.title} 성향이 가장 강해요`
        : `${topUsageCategory.title} is the strongest pattern`
    : aiRoleFallbackBody
  const aiRoleTooltipDescription = isKorean
    ? DASHBOARD_USAGE_CARD_HELP
    : 'Shows which roles your AI most often took based on recurring request patterns in your messages.'

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
    if (topUsageCategories.length === 0) return

    const timer = window.setInterval(() => {
      setAiRoleMetricMode((prev) => prev === 'count' ? 'ratio' : 'count')
    }, 10000)

    return () => window.clearInterval(timer)
  }, [topUsageCategories.length])

  useEffect(() => {
    if (tokenDayPinned) return
    if (!busiestTokenDay || !leastTokenDay || busiestTokenDay === leastTokenDay) return

    const timer = window.setInterval(() => {
      setShowLowestTokenDay((prev) => !prev)
    }, 10000)

    return () => window.clearInterval(timer)
  }, [busiestTokenDay, leastTokenDay, tokenDayPinned])

  const activeTokenDay = showLowestTokenDay ? leastTokenDay : busiestTokenDay
  const activeTokenDayAmount = showLowestTokenDay ? leastTokenDayAmount : busiestTokenDayAmount
  const activeTokenDayLabel = showLowestTokenDay
    ? (isKorean ? '가장 토큰 적게 사용한 날' : 'Lowest token day')
    : (isKorean ? '가장 토큰 많이 사용한 날' : 'Highest token day')

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
      {visibleSessions.map((session) => renderSessionRow(session))}
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
                className="rounded-full px-2.5 py-1 text-[10px] font-mono"
                style={{
                  background: 'color-mix(in srgb, var(--t-text-bright) 8%, transparent)',
                  color: 'color-mix(in srgb, var(--t-text) 52%, transparent)',
                }}
              >
                {personality.type}
              </span>
            </div>

            <div className="mb-3 text-[56px] leading-none">{personality.emoji}</div>
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
              <Code2 className="h-4 w-4 shrink-0 text-accent" />
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
            </div>
            {handleSectionSwitch && (
              <button
                type="button"
                onClick={handleSectionSwitch}
                className="flex h-8 shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-bg-card/70 px-3 text-sm font-medium text-text transition-colors hover:bg-bg-hover hover:text-text-bright"
              >
                <ArrowLeftRight className="h-4 w-4" />
                <span>{sectionSwitchLabel}</span>
              </button>
            )}
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
              {showLowestTokenDay ? (
                <Calendar className="h-4 w-4 text-rose" />
              ) : (
                <Flame className="h-4 w-4 text-amber" />
              )}
              <span key={`${activeTokenDay}-label`} className="dashboard-cycle-drop text-sm text-text">
                {activeTokenDayLabel}
              </span>
            </div>
            <button
              type="button"
              aria-pressed={tokenDayPinned}
              onClick={() => setTokenDayPinned((prev) => !prev)}
              className={`rounded-full border px-2.5 py-1 text-[10px] transition-all ${
                tokenDayPinned
                  ? 'translate-y-px border-accent/50 bg-accent/12 text-accent shadow-[inset_0_1px_2px_rgba(0,0,0,0.28)]'
                  : 'dashboard-button-attention-soft border-border/70 bg-bg text-text/55 hover:border-accent/25 hover:text-text-bright'
              }`}
            >
              {isKorean ? '고정' : 'Pin'}
            </button>
          </div>
          <div key={`${activeTokenDay}-date`} className="dashboard-cycle-drop text-2xl font-bold text-text-bright">
            {activeTokenDay || '-'}
          </div>
          <div key={`${activeTokenDay}-count`} className="dashboard-cycle-drop mt-1 text-xs text-text/60">
            {activeTokenDay ? formatTokens(activeTokenDayAmount) + (isKorean ? ' 토큰' : ' tokens') : ''}
          </div>
        </div>
      </div>

      <div className="dashboard-activity-grid animate-in">
        <div className="dashboard-card dashboard-card-compact dashboard-card-tight dashboard-activity-card-heatmap">
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

        <div className="dashboard-card dashboard-card-compact dashboard-card-tight dashboard-side-card dashboard-activity-card-pattern">
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
        <div className="dashboard-card dashboard-card-tight animate-in dashboard-analytics-card dashboard-analytics-card-model">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <Brain className="h-4 w-4 text-accent" /> 사용한 모델
          </h2>
          <div className="dashboard-card-body-center">
            <InteractiveDonutChart data={topModels} />
          </div>
        </div>

        <div className="dashboard-card dashboard-card-tight animate-in dashboard-analytics-card dashboard-analytics-card-language">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <Code2 className="h-4 w-4 text-green" />
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
            <Terminal className="h-4 w-4 text-violet" />
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
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <Brain className="h-4 w-4 text-rose" />
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
