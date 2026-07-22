import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Cpu,
  Fingerprint,
  Lightbulb,
  LineChart,
  MessageSquare,
  RotateCcw,
  SlidersHorizontal,
  Timer,
  TrendingUp,
  Users,
  Webhook,
} from 'lucide-react'
import { PERSONALITY_ICONS, ROLE_ICONS, type RoleIconKey } from '../icons'
import { AnimatePresence, motion } from 'framer-motion'
import type { HookAggregateRow, HookConfigServerEntry, HookOutcomeCounts, HookStats, Session, SessionSource, Stats } from '../types'
import { computeStats, toLocalDayKey } from '../parser'
import { useI18n } from '../i18n'
import { computePersonality } from '../lib/personality'
import { analyzeUsageTopCategories, USAGE_CATEGORIES, type UsageCategoryScore } from '../lib/usageProfile'
import {
  buildCodingRhythm,
  collectUserTimestamps,
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
  MULTI_PROJECT_MIN_DAY_SESSIONS,
  STRUCTURED_RECENT_WINDOW_DAYS,
  type FingerprintSignal,
  type FingerprintSignalId,
} from '../lib/collabFingerprint'
import { applyCalibrationOverUniverse } from '../lib/personaQuiz'
import { loadPersonaQuiz } from '../lib/personaQuizStorage'
import { shortModelName } from '../lib/modelNames'
import { cleanClaudeText } from '../lib/cleanClaudeText'
import { maskSecrets } from '../lib/secretMask'
import { buildModelIntensity, type ModelIntensity } from '../lib/modelIntensity'
import { buildAuthorshipRatio } from '../lib/authorshipRatio'
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
        const roundedScore = Math.round(category.score)
        const metricLabel = metricMode === 'count'
          ? (isKorean ? `${roundedScore.toLocaleString()}회` : roundedScore.toLocaleString())
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
              <div className="w-16 shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-text/40">
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
const DAY_OF_WEEK_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

/**
 * 영수증(receipts) 접힘 패턴 — 그날 이야기·AI 협업 지문 카드 공통.
 * "세부 수치"/"Details" 토글 pill + 접힘 패널 + "일 단위는 로컬 날짜 기준" 푸터를 렌더한다.
 *
 * - controlled: open 상태는 Dashboard 가 유지한다 (카드별 단일 토글).
 * - spacing: 'tight' = space-y-1.5 + text-xs text-text/70 (이야기·지문 텍스트 행),
 *   'loose' = space-y-3.
 * - dateBasisTooltip: 푸터 CircleHelp 툴팁 문구만 카드별로 상이 — 주입식.
 * - leading: 토글 pill 과 같은 행에 놓일 액션 슬롯 (이야기 카드의 "이날 세션 보기" 점프 버튼).
 *   마크업 공통화를 위한 최소 확장이며 기존 문구/className/aria-expanded 계약은 보존한다.
 * - DashboardHoverTooltip 의존 때문에 같은 파일 내 추출 (기존 헬퍼 관례).
 */
function ReceiptsDisclosure({
  open,
  onToggle,
  isKorean,
  spacing = 'tight',
  dateBasisTooltip,
  containerClassName = 'mt-3',
  leading,
  children,
}: {
  open: boolean
  onToggle: () => void
  isKorean: boolean
  spacing?: 'tight' | 'loose'
  dateBasisTooltip: string
  containerClassName?: string
  leading?: ReactNode
  children: ReactNode
}) {
  const panelClassName = spacing === 'tight'
    ? 'mt-3 space-y-1.5 rounded-xl border border-border/60 bg-bg-hover/40 px-3.5 py-3 text-xs text-text/70'
    : 'mt-3 space-y-3 rounded-xl border border-border/60 bg-bg-hover/40 px-3.5 py-3'

  return (
    <div className={containerClassName}>
      <div className="flex flex-wrap items-center gap-2">
        {leading}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded-full border border-border/40 bg-bg px-2.5 py-1 text-[10px] text-text/60 transition-colors hover:border-border hover:text-text"
        >
          <span>{isKorean ? '세부 수치' : 'Details'}</span>
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {open && (
        <div className={panelClassName}>
          {children}
          <div className="flex items-center gap-1 text-[10px] text-text/40">
            <span>{isKorean ? '일 단위는 로컬 날짜 기준' : 'Daily stats use local dates'}</span>
            <DashboardHoverTooltip align="left" description={dateBasisTooltip}>
              <CircleHelp className="h-3 w-3 text-text/40" aria-hidden="true" />
            </DashboardHoverTooltip>
          </div>
        </div>
      )}
    </div>
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
 * 그날 이야기 패턴 요약 1문장 — dominantTerm 별 분기, receipts 실측 수치만 삽입.
 * hedged 어조 필수("~로 보여요"), 단정 금지. 원문 인용 금지 — 수치 + 사전 단어만.
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

// 분수(0~1) → 표시 문자열 변환은 이 헬퍼 4종만 사용 (lessons/_common.md L-5 — 인라인 ×100 반복 금지)
const fmtPct0 = (fraction: number) => `${Math.round(fraction * 100)}%`
const fmtPct1 = (fraction: number) => `${(fraction * 100).toFixed(1)}%`
const fmtSignedPp = (fraction: number, isKorean: boolean) => {
  const pp = Math.round(fraction * 100)
  return `${pp >= 0 ? '+' : ''}${pp}${isKorean ? '%p' : 'pp'}`
}
// 방향 동사("늘어난/줄어든", "rose/dropped")와 병기하는 서사 전용 — 부호까지 넣으면 이중 표기가 된다
// (ko "-5%p 줄어든" 부호·동사 중복, en "dropped -5pp" 이중부정으로 방향 오독). 영수증은 fmtSignedPp 유지.
const fmtAbsPp = (fraction: number, isKorean: boolean) =>
  `${Math.round(Math.abs(fraction) * 100)}${isKorean ? '%p' : 'pp'}`

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
    case 'ai-share-shift':
      return isKorean ? 'AI 작성 비중 변화' : 'AI-written share shift'
    case 'delegation-size-shift':
      return isKorean ? '지시 길이 변화' : 'Prompt-length shift'
    case 'multi-project-days':
      return isKorean ? '프로젝트 병행' : 'Multi-project days'
    case 'model-mix-shift':
      return isKorean ? '모델 믹스 변화' : 'Model-mix shift'
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
    case 'ai-share-shift': {
      // 방향 분기 — 양방향 신호는 늘어난 쪽/줄어든 쪽 서술이 달라야 한다 (delta 부호 기준).
      // 방향은 동사가 전달하므로 %p 는 절대값(fmtAbsPp) — 부호 병기 시 이중 표기 (영수증은 fmtSignedPp)
      const aiShareGrew = (signal.delta ?? 0) >= 0
      return isKorean
        ? `최근 ${STRUCTURED_RECENT_WINDOW_DAYS}일 AI가 쓰는 분량 비중이 이전보다 ${fmtAbsPp(signal.delta ?? 0, true)} ${aiShareGrew ? '늘어난' : '줄어든'} 것으로 보여요 (최근 ${fmtPct0(signal.numerator)} vs 이전 ${fmtPct0(signal.denominator)}, n=최근 ${signal.n.toLocaleString()}단어 · 이전 ${(signal.n2 ?? 0).toLocaleString()}단어)`
        : `Looks like the AI-written share of text ${aiShareGrew ? 'rose' : 'dropped'} ${fmtAbsPp(signal.delta ?? 0, false)} over the last ${STRUCTURED_RECENT_WINDOW_DAYS} days (recent ${fmtPct0(signal.numerator)} vs prior ${fmtPct0(signal.denominator)}, n=${signal.n.toLocaleString()} recent words · ${(signal.n2 ?? 0).toLocaleString()} prior)`
    }
    case 'delegation-size-shift': {
      // 방향 분기 — 배수 축이라 lift ≥ 1(길어짐) / < 1(짧아짐) 기준. 표시는 이전→최근 평균 단어 수.
      const promptsGrew = signal.lift >= 1
      return isKorean
        ? `최근 ${STRUCTURED_RECENT_WINDOW_DAYS}일 지시가 평균 ${signal.denominator.toFixed(1)}단어→${signal.numerator.toFixed(1)}단어로 ${promptsGrew ? '길어진' : '짧아진'} 편이에요 (n=최근 ${signal.n.toLocaleString()}건 · 이전 ${(signal.n2 ?? 0).toLocaleString()}건)`
        : `Your prompts look to have gotten ${promptsGrew ? 'longer' : 'shorter'} over the last ${STRUCTURED_RECENT_WINDOW_DAYS} days — avg ${signal.denominator.toFixed(1)} → ${signal.numerator.toFixed(1)} words (n=${signal.n.toLocaleString()} recent · ${(signal.n2 ?? 0).toLocaleString()} prior messages)`
    }
    case 'multi-project-days':
      if (lift === null) {
        return isKorean
          ? `세션 ${MULTI_PROJECT_MIN_DAY_SESSIONS}개+ 인 날의 프로젝트 병행을 잴 기준선이 없어요 (실측 ${fmtPct0(signal.numerator)}, n=해당 ${signal.n}일)`
          : `No baseline to compare multi-project days against (actual ${fmtPct0(signal.numerator)}, n=${signal.n} days with ${MULTI_PROJECT_MIN_DAY_SESSIONS}+ sessions)`
      }
      return isKorean
        ? `세션 ${MULTI_PROJECT_MIN_DAY_SESSIONS}개+ 인 날엔 프로젝트를 여러 개 오가는 편이에요 — 독립 기대치의 ${lift}배 (실측 ${fmtPct0(signal.numerator)} vs 기대 ${fmtPct1(signal.denominator)}, n=해당 ${signal.n}일)`
        : `On days with ${MULTI_PROJECT_MIN_DAY_SESSIONS}+ sessions you tend to span multiple projects — ${lift}x the independence expectation (actual ${fmtPct0(signal.numerator)} vs expected ${fmtPct1(signal.denominator)}, n=${signal.n} qualifying days)`
    case 'model-mix-shift': {
      // 방향 분기 — ⑥ 과 동일하게 delta 부호 기준, %p 는 절대값(fmtAbsPp — 방향은 동사가 전달)
      const mixGrew = (signal.delta ?? 0) >= 0
      return isKorean
        ? `여러 모델을 오가는 날이 이전보다 ${fmtAbsPp(signal.delta ?? 0, true)} ${mixGrew ? '늘어난' : '줄어든'} 것으로 보여요 (최근 ${fmtPct0(signal.numerator)} n=${signal.n}일 vs 이전 ${fmtPct0(signal.denominator)} n=${signal.n2 ?? 0}일)`
        : `Looks like multi-model days ${mixGrew ? 'rose' : 'dropped'} ${fmtAbsPp(signal.delta ?? 0, false)} vs your prior period (recent ${fmtPct0(signal.numerator)} of n=${signal.n} active days vs prior ${fmtPct0(signal.denominator)} of n=${signal.n2 ?? 0})`
    }
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
    case 'ai-share-shift':
      return isKorean
        ? `최근 ${fmtPct0(signal.numerator)} (n=${signal.n.toLocaleString()}단어) vs 이전 ${fmtPct0(signal.denominator)} (n=${(signal.n2 ?? 0).toLocaleString()}단어) · ${fmtSignedPp(signal.delta ?? 0, true)}`
        : `recent ${fmtPct0(signal.numerator)} (n=${signal.n.toLocaleString()} words) vs prior ${fmtPct0(signal.denominator)} (n=${(signal.n2 ?? 0).toLocaleString()} words) · ${fmtSignedPp(signal.delta ?? 0, false)}`
    case 'delegation-size-shift':
      return isKorean
        ? `최근 평균 ${signal.numerator.toFixed(1)}단어 (n=${signal.n.toLocaleString()}건) vs 이전 ${signal.denominator.toFixed(1)}단어 (n=${(signal.n2 ?? 0).toLocaleString()}건) · ${liftLabel}`
        : `recent avg ${signal.numerator.toFixed(1)} words (n=${signal.n.toLocaleString()}) vs prior ${signal.denominator.toFixed(1)} (n=${(signal.n2 ?? 0).toLocaleString()}) · ${liftLabel}`
    case 'multi-project-days':
      return isKorean
        ? `프로젝트 2+ 일 ${fmtPct0(signal.numerator)} vs 기대 ${fmtPct1(signal.denominator)} · ${liftLabel} (n=세션 ${MULTI_PROJECT_MIN_DAY_SESSIONS}+ ${signal.n}일)`
        : `multi-project days ${fmtPct0(signal.numerator)} vs expected ${fmtPct1(signal.denominator)} · ${liftLabel} (n=${signal.n} days with ${MULTI_PROJECT_MIN_DAY_SESSIONS}+ sessions)`
    case 'model-mix-shift':
      return isKorean
        ? `최근 ${fmtPct0(signal.numerator)} (n=${signal.n}일) vs 이전 ${fmtPct0(signal.denominator)} (n=${signal.n2 ?? 0}일) · ${fmtSignedPp(signal.delta ?? 0, true)}`
        : `recent ${fmtPct0(signal.numerator)} (n=${signal.n} days) vs prior ${fmtPct0(signal.denominator)} (n=${signal.n2 ?? 0} days) · ${fmtSignedPp(signal.delta ?? 0, false)}`
  }
}

/** 영수증 한 줄 — viable 미달이어도 측정값을 숨기지 않고 미달 사유를 병기 (반증가능 원칙) */
function fingerprintReceiptLine(signal: FingerprintSignal, isKorean: boolean): string {
  const numbers = fingerprintReceiptNumbers(signal, isKorean)
  if (signal.viable) return numbers
  const shortfall = signal.id === 'plan-after-correction' && signal.n >= MIN_FINGERPRINT_SIGNAL_N
    ? (isKorean ? '기준선 없음 (계획 요청 마커 0건)' : 'no baseline (zero plan-marker messages)')
    : signal.id === 'multi-project-days' && signal.n >= MIN_FINGERPRINT_SIGNAL_N
      // ⑧ 은 n 충족이어도 프로젝트 기록 0건이면 기대치 근거가 없다 — ③의 기준선 없음 분기와 같은 축
      ? (isKorean ? '기준선 없음 (프로젝트 기록 0건)' : 'no baseline (zero project records)')
      : signal.id === 'ai-share-shift'
        // ⑥ 의 n/n2 는 단어 수인데 성립 게이트는 창별 user 메시지 수 — 단위가 달라 일반형 문구를 쓰면 거짓 영수증
        ? (isKorean
          ? `표본 부족 (최근/이전 창의 user 메시지 각 ${MIN_FINGERPRINT_SIGNAL_N}건 필요 — n= 은 단어 수)`
          : `insufficient sample (needs ${MIN_FINGERPRINT_SIGNAL_N} user messages per window — n= counts words)`)
        // 최근/이전 창 신호(②⑦⑨)는 n/n2 가 곧 게이트 표본 — 양쪽 병기
        : (signal.delta !== null || signal.n2 !== null)
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
  // delta 신호(②⑥⑨)는 %p 가 주 표기 — 그 외는 배수. 양방향(⑦)의 감소 방향은 마지막 분기에서 자연히 '0.7x' 꼴
  const liftBadge = signal.delta !== null
    ? fmtSignedPp(signal.delta, isKorean)
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

/**
 * 모델별 사용 강도 — 모델별 가로 막대 리스트 (InteractiveRoleDonutChart 막대 패턴 차용).
 * 막대 길이 = 평균 토큰(최댓값 정규화). 라벨 옆에 평균 user 턴/토큰 사실 수치만 표기 — 단정 아님.
 * 빈입력 가드는 호출부(빈상태). 모델 raw 이름은 shortModelName 으로 단축 (집계는 modelIntensity.ts).
 */
function ModelIntensityBars({ models, isKorean }: { models: ModelIntensity[]; isKorean: boolean }) {
  const maxAvgTokens = Math.max(...models.map((m) => m.avgTokens), 1)

  return (
    <div className="w-full space-y-2.5">
      {models.map((model, index) => {
        const barPct = Math.max(4, Math.round((model.avgTokens / maxAvgTokens) * 100))
        const turnsLabel = isKorean
          ? `평균 ${model.avgUserTurns.toFixed(1)}턴`
          : `${model.avgUserTurns.toFixed(1)} turns`
        const tokensLabel = `${formatTokens(Math.round(model.avgTokens))}`
        return (
          <div key={model.model} className="flex items-center gap-3">
            <div className="w-24 shrink-0">
              <span className="block truncate text-xs font-bold text-text-bright">{shortModelName(model.model)}</span>
              <span className="block text-[10px] text-text/40">
                {isKorean ? `세션 ${model.sessionCount}개` : `${model.sessionCount} sessions`}
              </span>
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${barPct}%`, opacity: index === 0 ? 0.85 : 0.6 }}
              />
            </div>
            <div className="w-24 shrink-0 text-right text-[10px] text-text/45">
              <span className="block">{turnsLabel}</span>
              <span className="block text-text/35">{tokensLabel} {isKorean ? '토큰' : 'tok'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── 훅 활동 카드 (docs/goal/hooks-analytics.md D5) ────────────────────────────
// TopSkillsCard 를 대체. stats.hooks (Session.hookSummary 집계)로 top-5 훅을
// 보여주고, 하단 팝오버에서 설정(scanHooks) 대 관측을 대조한다.
// violet accent 유지 · 단색 카운트 바 + 결과 칩 (스택 세그먼트 금지) ·
// 모든 문구 isKorean 삼항(양쪽 브랜치). 정적 모드는 window.__MEMRADAR_HOOKS__,
// 서버 모드는 /api/hooks 를 소비하고, 업로드 모드는 팝오버 pill 을 숨긴다.

interface HookCardConfigEntry {
  event: string
  matcher: string | null
  observed: boolean
  confidence: 'command' | 'event' | null
  /** 정적: sourceLabel (이미 한국어 라벨) */
  provenance?: string
  /** 서버: source id — 렌더 시 라벨 매핑 */
  source?: string
  /** 서버: maskSecrets 적용된 command */
  command?: string
  /** 서버: 서브행 라벨 매핑용 다이제스트들 */
  commandKeys?: string[]
  /** 정적: 단일 다이제스트 */
  commandKey?: string
}

function hookRowTotal(c: HookOutcomeCounts): number {
  return c.success + c.denied + c.blockingError + c.nonBlockingError + c.cancelled + c.timedOut + c.summaryOnly
}

function serverSourceLabel(source: string | undefined, isKorean: boolean): string {
  switch (source) {
    case 'managed': return isKorean ? '관리형 설정' : 'Managed settings'
    case 'user': return isKorean ? '사용자 설정' : 'User settings'
    case 'project': return isKorean ? '프로젝트 설정' : 'Project settings'
    case 'project-local': return isKorean ? '프로젝트 로컬 설정' : 'Project (local) settings'
    case 'plugin': return isKorean ? '플러그인' : 'Plugin'
    default: return isKorean ? '설정' : 'Config'
  }
}

function HookActivityCard({ hooks, isKorean }: { hooks: HookStats; isKorean: boolean }) {
  // 정적 전역은 앱 JS 이전에 주입되므로 렌더 시점에 동기 확보 — useState 초기화로
  // 읽는다(effect 내부 동기 setState 회피). 서버/업로드는 effect 에서 비동기 폴백.
  const [config, setConfig] = useState<{ entries: HookCardConfigEntry[]; available: boolean } | null>(() => {
    const staticHooks = typeof window !== 'undefined' ? window.__MEMRADAR_HOOKS__ : undefined
    if (staticHooks === undefined) return null
    return {
      entries: staticHooks.map((e) => ({
        event: e.event,
        matcher: e.matcher,
        observed: e.observed,
        confidence: e.confidence,
        provenance: e.sourceLabel,
        commandKey: e.commandKey,
      })),
      available: true,
    }
  })
  const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null)
  const popoverOpen = popoverAnchor !== null

  // 정적 전역이 없을 때만 서버 /api/hooks 로 폴백. 실패 시 업로드 모드(available:false).
  useEffect(() => {
    if (typeof window === 'undefined' || window.__MEMRADAR_HOOKS__ !== undefined) return
    let cancelled = false
    fetch('/api/hooks')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('unavailable'))))
      .then((data: { entries?: HookConfigServerEntry[] }) => {
        if (cancelled) return
        const entries: HookCardConfigEntry[] = (data.entries ?? []).map((e) => ({
          event: e.event,
          matcher: e.matcher,
          observed: e.observed,
          confidence: e.confidence,
          source: e.source,
          command: e.command,
          commandKeys: e.commandKeys,
        }))
        setConfig({ entries, available: true })
      })
      .catch(() => {
        if (!cancelled) setConfig({ entries: [], available: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 팝오버 Escape / 바깥 클릭 닫기 (테마피커 레이어 선례)
  useEffect(() => {
    if (!popoverOpen || typeof document === 'undefined') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPopoverAnchor(null)
    }
    function onDown(e: MouseEvent) {
      const t = e.target as Element
      if (t.closest('[data-hooks-popover]') || t.closest('[data-hooks-pill]')) return
      setPopoverAnchor(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [popoverOpen])

  const configEntries = useMemo(() => config?.entries ?? [], [config])
  const configCount = configEntries.length
  const observedConfigCount = configEntries.filter((e) => e.observed).length
  const showPill = (config?.available ?? false) && configCount > 0
  const uploadMode = config !== null && !config.available

  const commandByKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of configEntries) {
      if (!e.command) continue
      const keys = e.commandKeys ?? (e.commandKey ? [e.commandKey] : [])
      for (const k of keys) m.set(k, e.command)
    }
    return m
  }, [configEntries])

  const groups = useMemo(() => {
    const map = new Map<string, HookAggregateRow[]>()
    for (const row of hooks.byHook) {
      const arr = map.get(row.hookName) ?? []
      arr.push(row)
      map.set(row.hookName, arr)
    }
    const emptyCounts = (): HookOutcomeCounts => ({ success: 0, denied: 0, blockingError: 0, nonBlockingError: 0, cancelled: 0, timedOut: 0, summaryOnly: 0 })
    return [...map.entries()]
      .map(([hookName, rows]) => {
        // hookName 당 여러 commandKey(스크립트)를 한 행으로 집계 — 인라인 sub-row 폭발 방지.
        // 스크립트별 상세는 hover 툴팁에서 짧은 이름으로 보여준다.
        const sorted = [...rows].sort((a, b) => hookRowTotal(b.counts) - hookRowTotal(a.counts))
        const counts = sorted.reduce((acc, r) => {
          acc.success += r.counts.success; acc.denied += r.counts.denied
          acc.blockingError += r.counts.blockingError; acc.nonBlockingError += r.counts.nonBlockingError
          acc.cancelled += r.counts.cancelled; acc.timedOut += r.counts.timedOut; acc.summaryOnly += r.counts.summaryOnly
          return acc
        }, emptyCounts())
        const durSamples = sorted.filter((r) => r.avgDurationMs != null)
        const avgDurationMs = durSamples.length ? durSamples.reduce((s, r) => s + (r.avgDurationMs as number), 0) / durSamples.length : null
        return {
          hookName,
          rows: sorted,
          counts,
          avgDurationMs,
          lastSeen: sorted.reduce((m, r) => (r.lastSeen > m ? r.lastSeen : m), ''),
          total: sorted.reduce((s, r) => s + hookRowTotal(r.counts), 0),
          isStop: rows.some((r) => r.hookEvent === 'Stop' || r.hookName === 'Stop'),
        }
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [hooks.byHook])
  const maxGroupTotal = groups[0]?.total || 1

  const fmtMs = (ms: number | null) =>
    ms == null ? '' : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
  const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString(isKorean ? 'ko-KR' : 'en-US') : '')

  // 커맨드에서 짧은 스크립트명(basename)만 뽑는다 — 긴 command 원문 라벨 오버플로 방지
  const scriptName = (cmd: string | undefined): string | null => {
    if (!cmd) return null
    const m = cmd.match(/[/\\]([A-Za-z0-9._-]+\.(?:mjs|cjs|js|ts|sh|py|rb|ps1))\b/)
    if (m) return m[1]
    const first = (cmd.trim().split(/\s+/)[0] || '').replace(/^["']|["']$/g, '')
    return first.split(/[/\\]/).pop() || cmd.slice(0, 20)
  }
  const subScriptLabel = (row: HookAggregateRow, index: number): string => {
    const short = scriptName(commandByKey.get(row.commandKey))
    return short ?? (isKorean ? '스크립트 ' : 'Script ') + String.fromCharCode(65 + (index % 26))
  }

  function OutcomeChips({ counts }: { counts: HookOutcomeCounts }) {
    const fail = counts.blockingError + counts.nonBlockingError
    const chips: { key: string; label: string; cls: string }[] = []
    if (counts.success) chips.push({ key: 'ok', label: `${isKorean ? '성공' : 'ok'} ${counts.success}`, cls: 'border-green/25 bg-green/10 text-green/80' })
    if (counts.denied) chips.push({ key: 'denied', label: `${isKorean ? '차단' : 'blocked'} ${counts.denied}`, cls: 'border-amber/30 bg-amber/10 text-amber' })
    if (fail) chips.push({ key: 'fail', label: `${isKorean ? '실패' : 'fail'} ${fail}`, cls: 'border-rose/30 bg-rose/10 text-rose' })
    if (counts.cancelled) chips.push({ key: 'cancel', label: `${isKorean ? '취소' : 'cancelled'} ${counts.cancelled}`, cls: 'border-text/15 bg-text/8 text-text/55' })
    if (counts.timedOut) chips.push({ key: 'timeout', label: `${isKorean ? '시간초과' : 'timeout'} ${counts.timedOut}`, cls: 'border-amber/25 bg-amber/8 text-amber/80' })
    if (counts.summaryOnly) chips.push({ key: 'summary', label: `${isKorean ? '요약만' : 'summary'} ${counts.summaryOnly}`, cls: 'border-text/12 bg-text/6 text-text/45' })
    if (chips.length === 0) return null
    return (
      <div className="flex flex-wrap gap-1">
        {chips.map((c) => (
          <span key={c.key} className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium tabular-nums ${c.cls}`}>{c.label}</span>
        ))}
      </div>
    )
  }

  function RowBar({ label, counts, total, avgDurationMs, lastSeen, isStop, groupMax, scripts }: {
    label: string
    counts: HookOutcomeCounts
    total: number
    avgDurationMs: number | null
    lastSeen: string
    isStop: boolean
    groupMax: number
    scripts?: { name: string; count: number }[]
  }) {
    const width = Math.max(6, (total / (groupMax || 1)) * 100)
    return (
      <div className="group relative cursor-default">
        <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
          <span className="min-w-0 truncate font-medium text-text-bright" title={label}>{label}</span>
          <span className="shrink-0 tabular-nums text-text/50">{total}{isKorean ? '회' : ''}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
          <div className="h-full rounded-full bg-violet/70 transition-all duration-300 group-hover:brightness-110" style={{ width: `${width}%` }} />
        </div>
        <div className="mt-1"><OutcomeChips counts={counts} /></div>
        <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-60 rounded-lg border border-border bg-bg-card px-3 py-2 text-left text-[10px] leading-relaxed text-text opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <span className="block font-semibold text-text-bright">{label}{isStop ? (isKorean ? ' · 전체 집계' : ' · aggregated') : ''}</span>
          <span className="mt-1 block text-text/70">
            {[
              counts.success ? `${isKorean ? '성공' : 'ok'} ${counts.success}` : '',
              counts.denied ? `${isKorean ? '차단' : 'blocked'} ${counts.denied}` : '',
              counts.blockingError ? `${isKorean ? '차단오류' : 'blocking'} ${counts.blockingError}` : '',
              counts.nonBlockingError ? `${isKorean ? '비차단오류' : 'non-blocking'} ${counts.nonBlockingError}` : '',
              counts.cancelled ? `${isKorean ? '취소' : 'cancelled'} ${counts.cancelled}` : '',
              counts.timedOut ? `${isKorean ? '시간초과' : 'timeout'} ${counts.timedOut}` : '',
              counts.summaryOnly ? `${isKorean ? '요약만' : 'summary-only'} ${counts.summaryOnly}` : '',
            ].filter(Boolean).join(' · ')}
          </span>
          {scripts && scripts.length > 1 && (
            <div className="mt-1.5 border-t border-border/40 pt-1.5">
              {scripts.map((s) => (
                <div key={s.name} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-text/60">{s.name}</span>
                  <span className="shrink-0 tabular-nums text-text/45">{s.count}{isKorean ? '회' : ''}</span>
                </div>
              ))}
            </div>
          )}
          {avgDurationMs != null && (
            <span className="mt-1 block text-text/50">
              {isKorean ? `평균 ${fmtMs(avgDurationMs)} · 기록 있는 실행 기준` : `avg ${fmtMs(avgDurationMs)} · recorded runs only`}
            </span>
          )}
          {lastSeen && (
            <span className="mt-1 block text-text/40">{isKorean ? `최근 ${fmtDate(lastSeen)}` : `last ${fmtDate(lastSeen)}`}</span>
          )}
          {isStop && (
            <span className="mt-1 block text-text/40">{isKorean ? 'Stop 원장 기반 전체 집계' : 'Aggregated from the Stop ledger'}</span>
          )}
        </div>
      </div>
    )
  }

  const hasHookData = hooks.hasHookData

  return (
    <div className="dashboard-card dashboard-card-tight animate-in dashboard-analytics-card dashboard-analytics-card-hooks relative flex flex-col">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-bright">
        <Webhook className="h-4 w-4 text-violet" aria-hidden="true" />
        {isKorean ? '훅 활동' : 'Hook Activity'}
        <DashboardHoverTooltip
          align="left"
          tooltipWidthClass="w-64"
          description={isKorean
            ? '훅이 조용히 통과(허용)한 실행은 세션 기록에 남지 않아 집계되지 않아요. 여기 수치는 성공·차단·실패처럼 기록이 남은 실행만, 관측된 기간에 한해 센 값이에요.'
            : "Hooks that silently allow an action leave no record, so they aren't counted. These numbers reflect only executions that left a record (success, blocked, failed, ...) within the observed window."}
        >
          <CircleHelp className="h-3.5 w-3.5 text-text/35" aria-hidden="true" />
        </DashboardHoverTooltip>
      </h2>

      {hasHookData ? (
        <>
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-violet/25 bg-violet/10 px-2 py-0.5 text-[10px] font-medium tabular-nums text-violet">
              {isKorean ? `관측 ${hooks.totalObserved}` : `Observed ${hooks.totalObserved}`}
            </span>
            {hooks.deniedTotal > 0 && (
              <span className="rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-[10px] font-medium tabular-nums text-amber">
                {isKorean ? `차단 ${hooks.deniedTotal}` : `Blocked ${hooks.deniedTotal}`}
              </span>
            )}
            {hooks.failureTotal > 0 && (
              <span className="rounded-full border border-rose/30 bg-rose/10 px-2 py-0.5 text-[10px] font-medium tabular-nums text-rose">
                {isKorean ? `실패 ${hooks.failureTotal}` : `Failed ${hooks.failureTotal}`}
              </span>
            )}
          </div>
          <p className="mb-2 text-[10px] text-text/40">{isKorean ? '기록이 남은 실행 기준' : 'Based on recorded executions'}</p>

          <ul className="flex flex-col gap-2.5 py-0.5">
            {groups.map((group) => {
              const scripts = group.rows.length > 1
                ? group.rows.map((r, i) => ({ name: subScriptLabel(r, i), count: hookRowTotal(r.counts) }))
                : undefined
              return (
                <li key={group.hookName}>
                  <RowBar
                    label={group.hookName}
                    counts={group.counts}
                    total={group.total}
                    avgDurationMs={group.avgDurationMs}
                    lastSeen={group.lastSeen}
                    isStop={group.isStop}
                    groupMax={maxGroupTotal}
                    scripts={scripts}
                  />
                </li>
              )
            })}
          </ul>
        </>
      ) : configCount > 0 && hooks.eligibleSessions > 0 ? (
        <div className="flex flex-1 flex-col justify-center gap-2 py-2">
          <p className="text-sm text-text/55">
            {isKorean ? '설정된 훅은 있지만 기록된 실행이 아직 없어요.' : 'Hooks are configured, but no executions have been recorded yet.'}
          </p>
          <p className="text-[11px] leading-relaxed text-text/40">
            {isKorean
              ? '훅이 조용히 통과하면 기록이 남지 않아요. 아래에서 설정된 훅과 관측 여부를 확인할 수 있어요.'
              : 'Silently-allowed hooks leave no record. See the configured hooks and their observation status below.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center py-6">
          <p className="text-sm text-text/40">
            {uploadMode
              ? (isKorean ? '업로드한 세션에서는 훅 실행 기록을 찾지 못했어요.' : 'No hook executions found in the uploaded sessions.')
              : hooks.eligibleSessions === 0
                ? (isKorean ? 'Claude Code 세션이 없어 훅 활동을 보여줄 수 없어요.' : 'No Claude Code sessions, so there is no hook activity to show.')
                : (isKorean ? '훅 실행 기록이 아직 없어요.' : 'No hook executions recorded yet.')}
          </p>
        </div>
      )}

      {showPill && (
        <div className="mt-auto pt-3">
          <button
            type="button"
            data-hooks-pill
            onClick={(e) => setPopoverAnchor(popoverOpen ? null : e.currentTarget.getBoundingClientRect())}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-bg-hover/40 px-2.5 py-1 text-[10px] text-text/60 transition-colors hover:border-violet/30 hover:text-text-bright"
          >
            {isKorean ? `설정 ${configCount}개 · 관측 ${observedConfigCount}개` : `${configCount} configured · ${observedConfigCount} observed`}
          </button>
        </div>
      )}

      {popoverOpen && typeof document !== 'undefined' && createPortal(
        <>
          <div className="dashboard-overlay pointer-events-none bg-black/20 backdrop-blur-[1px]" />
          <div
            data-hooks-popover
            className="dashboard-popover w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border bg-bg-card p-3 shadow-2xl animate-in"
            style={(() => {
              const width = Math.min(384, window.innerWidth - 32)
              let left = popoverAnchor.left
              if (left + width > window.innerWidth - 16) left = window.innerWidth - 16 - width
              if (left < 16) left = 16
              return { left, bottom: window.innerHeight - popoverAnchor.top + 8 }
            })()}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-text-bright">{isKorean ? '설정된 훅' : 'Configured hooks'}</span>
              <span className="text-[10px] tabular-nums text-text/45">
                {isKorean ? `설정 ${configCount} · 관측 ${observedConfigCount}` : `${configCount} configured · ${observedConfigCount} observed`}
              </span>
            </div>
            <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
              {configEntries.map((e, i) => (
                <li key={`${e.event}-${e.matcher ?? ''}-${i}`} className="rounded-lg border border-border/60 bg-bg/40 px-2.5 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-text-bright">
                      {e.event}{e.matcher && e.matcher !== '*' ? ` · ${e.matcher}` : ''}
                    </span>
                    {e.observed ? (
                      <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] ${e.confidence === 'command' ? 'border-green/25 bg-green/10 text-green/80' : 'border-amber/25 bg-amber/10 text-amber/80'}`}>
                        {e.confidence === 'command' ? (isKorean ? '명령 일치' : 'command match') : (isKorean ? '이벤트 수준 추정' : 'event-level')}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-text/15 bg-text/8 px-1.5 py-0.5 text-[9px] text-text/50">
                        {isKorean ? '기록된 실행 없음' : 'no recorded run'}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-text/45">
                    <span className="shrink-0">{e.provenance ?? serverSourceLabel(e.source, isKorean)}</span>
                    {e.command && <code className="truncate font-mono text-text/40">{e.command}</code>}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] leading-relaxed text-text/35">
              {isKorean
                ? '조용히 통과한 훅은 기록이 남지 않아 "기록된 실행 없음"으로 보일 수 있어요. 관측된 기간에 한정된 값이에요.'
                : 'Silently-allowed hooks leave no record and may show as "no recorded run". Scoped to the observed window.'}
            </p>
          </div>
        </>,
        document.body,
      )}
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
    // set-state-in-effect 의도적 사용 — 선택된 소스가 비면 stale 선택을 보정.
    // (PNG export 의 flushSync 제거로 react-hooks 컴파일러 린트가 이 컴포넌트를 다시
    //  분석하게 되어 룰이 재발동 — 보정 로직 자체는 안전하므로 명시 disable.)
    if (sourceSessions.claude.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // 모델별 사용 강도 — 세션별 model 그룹화 (순수 함수, 상위 5). 빈입력이면 빈 배열 (카드 빈상태)
  const modelIntensity = useMemo(() => buildModelIntensity(sessions), [sessions])
  // 나 vs AI 글 비중 — 역할별 단어 수(내 메시지 vs AI 메시지) 사실 수치. 합 0이면 빈상태.
  // 토큰(input/output)은 캐시·컨텍스트 추정이 섞여 99:1 왜곡 → 단어 수로 정직하게 (authorshipRatio.ts 주석 참고)
  const authorship = useMemo(() => buildAuthorshipRatio(sessions), [sessions])

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
    ? (isKorean ? '정밀 진단' : 'Refine diagnosis')
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

  // 하이라이트 칩 파생값 — 전부 rhythm.* 단일 소스에서 도출 (영수증·서사와 수치 드리프트 방지).
  // 칩은 사실 수치만(단정 아님): 가장 활발한 요일·share, 최장 연속, 활동 밀도.
  const rhythmBestWeekdayLabel = (isKorean ? DAY_OF_WEEK_LABELS : DAY_OF_WEEK_LABELS_EN)[rhythmBestWeekday]
  const rhythmBestWeekdayShare = rhythm.weekdayDistribution[rhythmBestWeekday]?.share ?? 0

  // AI 협업 지문 — dailyCollab(그날 이야기)·rhythm(코딩 리듬) 인스턴스를 그대로 주입 (카드 간 수치 드리프트 방지)
  const fingerprint = useMemo(() => buildCollabFingerprint(sessions, dailyCollab, rhythm), [sessions, dailyCollab, rhythm])
  const fingerprintTitle = isKorean ? 'AI 협업 지문' : 'AI Collaboration Fingerprint'
  // 상시 추정 부제 — 프롬프트 코칭 카드 패턴 (바넘 회피: 단정 0건, 모든 주장에 수치 + n=)
  const fingerprintSubtitle = isKorean
    ? '본인 과거 기준선 대비 추정이에요 — 정확한 진단은 아니에요.'
    : 'Estimated against your own past baseline — not a precise diagnosis.'
  const fingerprintTooltipDescription = isKorean
    ? '주말 집중·구조화 변화·정정 후 계획 요청·심야 비중·긴 세션 선호·AI 작성 비중 변화·지시 길이 변화·프로젝트 병행·모델 믹스 변화 9가지 상호작용 신호를 본인 과거 기준선과 비교해 두드러진 패턴 2~3개를 보여줘요. 성격 카드(작업 스타일)·AI 역할(요청 주제)과 달리 "AI와 어떻게 협업하나"를 봐요. 키워드·시간 분포 기반 추정이에요.'
    : 'Compares nine interaction signals (weekend focus, structured-prompt shift, plan-first after corrections, late-night share, long-session preference, AI-written share shift, prompt-length shift, multi-project days, model-mix shift) against your own baseline and surfaces the 2–3 that stand out. Unlike the personality card (work style) or the AI-role donut (request topics), this asks "how do you collaborate with AI". Keyword and time-distribution based estimate.'
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

          <ReceiptsDisclosure
            open={fingerprintReceiptsOpen}
            onToggle={() => setFingerprintReceiptsOpen((prev) => !prev)}
            isKorean={isKorean}
            dateBasisTooltip={isKorean
              ? '일 단위 수치(주말 집중, 구조화·AI 작성 비중·지시 길이·모델 믹스 변화의 최근 30일 구간, 프로젝트 병행 활동일)는 로컬 날짜 기준이고, 월 단위 통계(성장 섹션)는 UTC 기준이에요.'
              : 'Daily numbers (weekend focus, the 30-day windows behind the structured/AI-share/prompt-length/model-mix shifts, multi-project active days) use your local date; monthly stats (growth section) use UTC.'}
          >
            {/* viable 미달 신호도 측정 현황을 그대로 표기 — 숨기지 않음 (반증가능 원칙). 수집 중 빈상태에서도 표시 */}
            {fingerprint.signals.map((signal) => (
              <div key={signal.id}>
                <span className="font-medium text-text-bright/85">{fingerprintSignalLabel(signal.id, isKorean)}</span>
                <span className="text-text/45"> — </span>
                {fingerprintReceiptLine(signal, isKorean)}
              </div>
            ))}
          </ReceiptsDisclosure>
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
              <ReceiptsDisclosure
                open={storyReceiptsOpen}
                onToggle={() => setStoryReceiptsOpen((prev) => !prev)}
                isKorean={isKorean}
                containerClassName="mt-2"
                dateBasisTooltip={isKorean
                  ? '일 단위 수치(그날 이야기·캘린더·요일 분포)는 로컬 날짜 기준이고, 월 단위 통계(성장 섹션)는 UTC 기준이에요.'
                  : 'Daily numbers (story of the day, calendar, weekday distribution) use your local date; monthly stats (growth section) use UTC.'}
                leading={
                  /* 명시적 버튼 — 카드 전체 div 클릭 금지 (접근성) */
                  <button
                    type="button"
                    onClick={() => handleStoryJump(story.dayKey)}
                    className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-medium text-accent transition-colors hover:border-accent/55 hover:bg-accent/20"
                  >
                    {isKorean ? '이날 세션 보기' : 'View sessions'}
                  </button>
                }
              >
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
              </ReceiptsDisclosure>
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

      {/* 활동 그리드 — "정보 하나당 칸 하나" 3카드: 활동 캘린더(span 2)·요일 분포(1)·시간대별 활동(1).
          캘린더·요일은 단일 rhythm(useMemo) 인스턴스를 공유, 시간대별 활동은 stats.hourlyActivity.
          코딩 리듬 인사이트 카드는 2026-06-14 재편으로 제거(라벨/2순위 폐지). PNG export 제거. */}
      <div className="dashboard-activity-grid animate-in">
        {/* ── 1. 활동 캘린더 ─────────────────────────────────────────── */}
        <div className="dashboard-card dashboard-card-tight dashboard-activity-card-calendar">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <Calendar className="h-4 w-4 text-green" />
            {isKorean ? '활동 캘린더' : 'Activity Calendar'}
          </h2>

          {rhythm.activeDayCount > 0 ? (
            <>
              {/* 1칸 폭(span 2)에서 고정 셀 + 가로 스크롤 — 최근 약 3개월(13주)만 노출 (Heatmap 내부) */}
              <div className="w-full">
                <div className="dashboard-heatmap-body">
                  <Heatmap localDailyCounts={rhythm.localDailyCounts} />
                </div>
              </div>

              {/* 보조 수치 — 전부 사실 수치(단정 아님). text-xs 압축 + flex-wrap */}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text/70">
                <span>
                  {isKorean ? '최장 연속' : 'Longest streak'} {rhythm.longestStreak}{dayUnitLabel}
                </span>
                <span>
                  {activityDensityTitle} {fmtPct0(rhythm.densityRatio)}
                  {' '}({activeDayLabel} {rhythm.activeDayCount}{dayUnitLabel} / {observedDayLabel} {rhythm.observedDayCount}{dayUnitLabel})
                </span>
              </div>

              {/* 로컬/UTC 날짜 각주 — 일 단위 수치는 로컬 날짜 기준 (이 카드에 귀속) */}
              <div className="mt-3 flex items-center gap-1 text-[10px] text-text/40">
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
            </>
          ) : (
            <p className="text-sm text-text/40">
              {isKorean
                ? '활동 캘린더는 활동이 기록되면 보여드려요 (아직 활동일 0일)'
                : 'Your activity calendar appears once activity is recorded (0 active days so far)'}
            </p>
          )}
        </div>

        {/* ── 2. 요일 분포 ───────────────────────────────────────────── */}
        <div className="dashboard-card dashboard-card-tight dashboard-activity-card-weekday">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <BarChart3 className="h-4 w-4 text-accent" />
            {isKorean ? '요일 분포' : 'Weekday Distribution'}
          </h2>

          {rhythm.activeDayCount > 0 ? (
            <>
              {/* 가장 활발한 요일 — 칩 대신 캡션으로 흡수 (별도 칩 행 제거) */}
              <p className="mb-3 text-xs text-text/60">
                {isKorean ? '가장 활발한 요일' : 'Most active'} · <span className="font-semibold text-accent">{rhythmBestWeekdayLabel}</span> {fmtPct0(rhythmBestWeekdayShare)}
              </p>

              <div className="space-y-1">
                {(isKorean ? DAY_OF_WEEK_LABELS : DAY_OF_WEEK_LABELS_EN).map((label, index) => {
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
            </>
          ) : (
            <p className="text-sm text-text/40">
              {isKorean
                ? '요일 분포는 활동이 기록되면 보여드려요 (아직 활동일 0일)'
                : 'Weekday distribution appears once activity is recorded (0 active days so far)'}
            </p>
          )}
        </div>

        {/* ── 3. 시간대별 활동 ───────────────────────────────────────── */}
        <div className="dashboard-card dashboard-card-tight dashboard-activity-card-hour">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <MessageSquare className="h-4 w-4 text-cyan" />
            {isKorean ? '시간대별 활동' : 'Activity by Hour'}
          </h2>
          {stats.hourlyActivity.some((count) => count > 0) ? (
            <div className="dashboard-card-body-center">
              <HourChart data={stats.hourlyActivity} />
            </div>
          ) : (
            <p className="text-sm text-text/40">
              {isKorean
                ? '활동이 기록되면 시간대 분포를 보여드려요'
                : 'Appears once activity is recorded'}
            </p>
          )}
        </div>
      </div>

      <div className="dashboard-analytics-grid">
        {/* 위 행: 훅 활동(자주 쓴 스킬 슬롯 대체, D5) · 세션 길이 · 자주 쓴 단어 */}
        <HookActivityCard hooks={stats.hooks} isKorean={isKorean} />

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

        {/* 아래 행: 사용한 모델 · 사용한 언어 · 모델별 사용 강도 · 나 vs AI 글 비중 (AI 사용 결) */}
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

        {/* 모델별 사용 강도 — "어떤 모델엔 길게 쓰나" (세션당 평균 턴/토큰). 사실 수치, 단정 아님 */}
        <div className="dashboard-card dashboard-card-tight animate-in dashboard-analytics-card dashboard-analytics-card-model-intensity">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <Cpu className="h-4 w-4 text-green" />
            {isKorean ? '모델별 사용 강도' : 'Model usage intensity'}
          </h2>
          {modelIntensity.length > 0 ? (
            <div className="dashboard-card-body-center">
              <ModelIntensityBars models={modelIntensity} isKorean={isKorean} />
            </div>
          ) : (
            <p className="text-sm text-text/40">
              {isKorean
                ? '모델 정보가 있는 세션이 모이면 보여드려요'
                : 'Appears once sessions with model info are recorded'}
            </p>
          )}
        </div>

        {/* 나 vs AI 글 비중 — 역할별 단어 수(내 글 vs AI 글). 사실 수치, 단정 아님 */}
        <div className="dashboard-card dashboard-card-tight animate-in dashboard-analytics-card dashboard-analytics-card-authorship">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-bright">
            <Users className="h-4 w-4 text-amber" />
            {isKorean ? '나 vs AI 글 비중' : 'You vs AI'}
          </h2>
          {authorship.userWords + authorship.aiWords > 0 ? (
            <>
              <div className="dashboard-card-body-center">
                <GenericDonutChart
                  data={[
                    [isKorean ? '내 글' : 'You', authorship.userWords],
                    [isKorean ? 'AI 글' : 'AI', authorship.aiWords],
                  ]}
                  centerLabel={isKorean ? '단어' : 'words'}
                />
              </div>
              <p className="mt-2 text-[11px] text-text/45">
                {isKorean
                  ? `내 글 ${fmtPct0(authorship.userShare)} · AI 글 ${fmtPct0(authorship.aiShare)}`
                  : `You ${fmtPct0(authorship.userShare)} · AI ${fmtPct0(authorship.aiShare)}`}
              </p>
            </>
          ) : (
            <p className="text-sm text-text/40">
              {isKorean
                ? '대화가 모이면 글 비중을 보여드려요'
                : 'Appears once conversations are recorded'}
            </p>
          )}
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
