import { useMemo, type ReactNode } from 'react'
import { ArrowLeft, ArrowLeftRight, CircleHelp } from 'lucide-react'
import type { Session } from '../types'
import { computeStats } from '../parser'
import { computePersonality } from '../lib/personality'
import type { PersonalityResult, TypeCode, AxisKey } from '../lib/personality'
import { USAGE_CATEGORIES, analyzeUsageTopCategories } from '../lib/usageProfile'
import type { UsageCategoryScore } from '../lib/usageProfile'
import { MemradarTopBar } from './MemradarTopBar'

interface Props {
  sessions: Session[]
  onBack?: () => void
  onOpenWrapped?: () => void
  onOpenDashboard?: () => void
  themeProps: {
    theme: string
    accent: string
    setTheme: (theme: string) => void
    setAccent: (accent: string) => void
  }
}

const ALL_TYPES: TypeCode[] = ['RDM', 'RDS', 'RWM', 'RWS', 'EDM', 'EDS', 'EWM', 'EWS']

const AXIS_LABELS: Record<string, [string, string]> = {
  R: ['탐험가', 'Explorer'],
  E: ['설계자', 'Architect'],
  D: ['한우물', 'Deep'],
  W: ['유목민', 'Wide'],
  M: ['마라토너', 'Marathon'],
  S: ['스프린터', 'Sprint'],
}

const PERSONALITY_CARD_THEME = {
  badgeBg: 'color-mix(in srgb, var(--t-accent) 10%, var(--t-bg-card))',
  badgeText: 'color-mix(in srgb, var(--t-accent) 82%, var(--t-text-bright) 18%)',
  codeBg: 'color-mix(in srgb, var(--t-text-bright) 8%, transparent)',
  codeText: 'color-mix(in srgb, var(--t-text) 52%, transparent)',
  title: 'var(--t-text-bright)',
  subtitle: 'color-mix(in srgb, var(--t-accent) 78%, var(--t-text-bright) 22%)',
  body: 'color-mix(in srgb, var(--t-text) 82%, transparent)',
  axisTrack: 'color-mix(in srgb, var(--t-text-bright) 8%, transparent)',
  axisDivider: 'color-mix(in srgb, var(--t-border) 72%, transparent)',
  panelBorder: 'color-mix(in srgb, var(--t-border) 88%, transparent)',
  strengthsBg: 'color-mix(in srgb, var(--t-text-bright) 6%, transparent)',
  headsUpBg: 'color-mix(in srgb, var(--t-text-bright) 6%, transparent)',
  panelLabel: 'color-mix(in srgb, var(--t-text) 60%, transparent)',
  panelText: 'color-mix(in srgb, var(--t-text-bright) 84%, var(--t-text) 16%)',
} as const

const CODE_REPORT_AXIS_COLORS: Record<AxisKey, string> = {
  style: '#6d63dc',
  scope: '#22b8c9',
  rhythm: '#d69416',
}

const AXIS_HELP_KO: Record<AxisKey, [string, string]> = {
  style: [
    '탐험가: AI와 짧게 주고받으며 방향을 찾아가는 대화형 작업 스타일에 가까워요.',
    '설계자: 길고 구조화된 프롬프트로 한 번에 맡기는 설계형 작업 스타일에 가까워요.',
  ],
  scope: [
    '한우물: 한 프로젝트를 오래 붙잡고 깊게 파는 집중형 작업 성향에 가까워요.',
    '유목민: 여러 프로젝트를 오가며 동시에 넓게 다루는 멀티 프로젝트 성향에 가까워요.',
  ],
  rhythm: [
    '스프린터: 짧고 빠른 반복으로 문제를 밀어붙이는 작업 리듬에 가까워요.',
    '마라토너: 긴 호흡으로 한 세션을 오래 이어가는 작업 리듬에 가까워요.',
  ],
}

const PERSONALITY_PANEL_HELP = {
  strengths: '이 유형에서 특히 강하게 드러나는 작업 방식이에요.',
  headsUp: '이 유형일 때 가끔 의식하면 좋은 작업 습관이에요.',
} as const

const USAGE_CARD_HELP = '사용자 메시지에서 자주 나온 작업 패턴을 바탕으로, AI가 어떤 역할을 많이 맡았는지 보여줘요.'

const USAGE_CATEGORY_HELP: Record<string, string> = {
  feature: '새 기능 구현, 컴포넌트 추가, API 연결처럼 "만들어줘" 요청이 많을 때 올라가요.',
  debug: '에러 원인 찾기, 깨진 동작 수정, 경고 해결 같은 디버깅 요청이 많을 때 올라가요.',
  refactor: '리팩터링, 구조 정리, 가독성 개선, 코드 정돈 요청이 많을 때 올라가요.',
  review: '코드 설명, 분석, 검토, 이해를 돕는 요청이 많을 때 올라가요.',
  writing: '문서 작성, 요약, 번역, README나 리포트 정리 요청이 많을 때 올라가요.',
  design: 'UI/UX, 스타일, CSS, 레이아웃, 반응형 조정 요청이 많을 때 올라가요.',
  devops: '배포, 빌드, 환경 변수, CI/CD, 서버 설정 요청이 많을 때 올라가요.',
  data: '데이터 처리, 쿼리, JSON/CSV, 스키마, 모델 관련 요청이 많을 때 올라가요.',
  test: '테스트 작성, 검증 자동화, e2e/unit/spec 관련 요청이 많을 때 올라가요.',
}

// --- Usage category analysis: shared engine from usageProfile.ts (analyzeUsageTopCategories)

function UsageProfile({ sessions }: { sessions: Session[] }) {
  const categories = useMemo(() => analyzeUsageTopCategories(sessions, USAGE_CATEGORIES.length), [sessions])
  const maxScore = categories[0]?.score || 1

  if (categories.length === 0) return null

  // Top category — fun verdict
  const top = categories[0]
  const topVerdict = top.score > (categories[1]?.score || 0) * 1.5
    ? `당신의 AI 직업은 "${top.title}" 입니다`
    : `"${top.title}" 겸 "${categories[1]?.title}" — 투잡 뛰는 중`

  return (
    <div className="animate-in h-full rounded-xl border border-border bg-bg-card p-5">
      <h2 className="text-lg font-bold text-text-bright mb-1">AI 활용 직업</h2>
      <p className="text-sm text-text/50 mb-4">{topVerdict}</p>
      <div className="space-y-3">
        {categories.map((category, rank) => {
          const pct = Math.round((category.score / maxScore) * 100)
          return (
            <div key={category.id} className="rounded-lg border border-border bg-bg-card p-3">
              <div className="flex items-center gap-3 mb-1.5">
                <span className="text-xl">{category.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-text-bright">{category.title}</span>
                    {rank === 0 && (
                      <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                        주직업
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-text/40">{category.subtitle}</span>
                </div>
                <div className="shrink-0 text-right text-xs text-text/40">
                  <div>{Math.round(category.score)}점</div>
                  <div>{category.sessionCount}세션</div>
                </div>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: category.color, opacity: 0.7 }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

void UsageProfile

function UsageAllJobs({
  categories,
  onSwitchView,
}: {
  categories: UsageCategoryScore[]
  onSwitchView?: () => void
}) {
  const maxScore = categories[0]?.score || 1

  if (categories.length === 0) return null

  const top = categories[0]
  const next = categories[1]
  const topVerdict = next && top.score <= next.score * 1.5
    ? `${top.title}와(과) ${next.title}, 투잡 뛰는 중`
    : `당신의 AI는 주로 이런 일을 해요`

  return (
    <div className="animate-in rounded-xl border border-border bg-bg-card p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="truncate text-lg font-bold text-text-bright">내 AI의 직업</h2>
          <HoverTooltip
            title="AI 직업이란?"
            description={USAGE_CARD_HELP}
            align="left"
            tooltipWidthClass="w-60"
            buttonClassName="rounded-full p-0.5 text-text/35 transition-colors hover:text-text/70 focus:outline-none focus:ring-1 focus:ring-accent/40"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </HoverTooltip>
        </div>
        {onSwitchView && (
          <button
            type="button"
            onClick={onSwitchView}
            className="flex h-8 shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-bg-card/70 px-3 text-sm font-medium text-text transition-colors hover:bg-bg-hover hover:text-text-bright"
          >
            <ArrowLeftRight className="h-4 w-4" />
            <span>대시보드</span>
          </button>
        )}
      </div>
      <p className="mb-4 text-sm text-text/50">{topVerdict}</p>
      <div className="space-y-1">
        {categories.map((category, index) => {
          const pct = Math.round((category.score / maxScore) * 100)
          const tooltipDescription = `${category.subtitle}. ${USAGE_CATEGORY_HELP[category.id] ?? '이 카테고리와 관련된 요청이 자주 잡혔어요.'}`
          return (
            <HoverTooltip
              key={category.id}
              title={category.title}
              description={tooltipDescription}
              align="left"
              wrapperClassName="group relative block"
              buttonClassName="block w-full rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--t-text-bright)_4%,transparent)] focus:outline-none focus:ring-1 focus:ring-accent/35"
              tooltipWidthClass="w-64"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 text-center text-lg">{category.emoji}</span>
                <div className="w-24 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-text-bright truncate">{category.title}</span>
                    {index === 0 && (
                      <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent">
                        대표
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-1 h-2 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: category.color, opacity: index === 0 ? 0.85 : 0.5 }}
                  />
                </div>
                <div className="w-16 shrink-0 text-right text-[11px] text-text/40">
                  {Math.round(category.score)}점 · {category.sessionCount}세션
                </div>
              </div>
            </HoverTooltip>
          )
        })}
      </div>
    </div>
  )
}

function HoverTooltip({
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

function TooltipLabel({
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

function getAxisTooltipCopy(axis: { label: [string, string]; value: number }, axisKey: AxisKey) {
  const leaningRight = axis.value >= 0.5
  const balanced = Math.abs(axis.value - 0.5) < 0.04
  const dominantIndex = leaningRight ? 1 : 0

  if (balanced) {
    return {
      title: '균형형',
      description: '두 성향이 거의 비슷하게 나타나고 있어요.',
    }
  }

  return {
    title: axis.label[dominantIndex],
    description: AXIS_HELP_KO[axisKey][dominantIndex],
  }
}

function AxisBar({
  axis,
  axisKey,
}: {
  axis: { label: [string, string]; value: number }
  axisKey: AxisKey
}) {
  const pct = Math.round(axis.value * 100)
  const leftActive = axis.value < 0.5
  const axisTooltip = getAxisTooltipCopy(axis, axisKey)
  return (
    <div className="w-full">
      <div className="mb-0.5 flex justify-between text-[10px]">
        <TooltipLabel active={leftActive} description={AXIS_HELP_KO[axisKey][0]} align="left">
          {axis.label[0]}
        </TooltipLabel>
        <TooltipLabel active={!leftActive} description={AXIS_HELP_KO[axisKey][1]} align="right">
          {axis.label[1]}
        </TooltipLabel>
      </div>
      <div className="group relative cursor-help">
        <div
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-lg border border-border bg-bg-card px-3 py-2 text-left text-[11px] leading-relaxed text-text opacity-0 shadow-xl transition-opacity group-hover:opacity-100"
        >
          <span className="block font-semibold text-text-bright">{axisTooltip.title}</span>
          <span className="mt-1 block text-text/75">{axisTooltip.description}</span>
        </div>
        <div
          className="relative h-1.5 overflow-hidden rounded-full"
          style={{ background: PERSONALITY_CARD_THEME.axisTrack }}
        >
          <div
            className="absolute top-0 h-full rounded-full transition-all duration-500"
            style={axis.value >= 0.5
              ? { left: '50%', width: `${pct - 50}%`, background: CODE_REPORT_AXIS_COLORS[axisKey], opacity: 0.5 }
              : { right: '50%', width: `${50 - pct}%`, background: CODE_REPORT_AXIS_COLORS[axisKey], opacity: 0.5 }
            }
          />
          <div
            className="absolute top-0 left-1/2 h-full w-px"
            style={{ background: PERSONALITY_CARD_THEME.axisDivider }}
          />
        </div>
      </div>
    </div>
  )
}

function TypeCard({ type }: {
  type: TypeCode
}) {
  const info = useMemo(() => {
    return computePersonalityStatic(type)
  }, [type])
  const axisTags = [
    { label: AXIS_LABELS[type[0]][0], color: CODE_REPORT_AXIS_COLORS.style },
    { label: AXIS_LABELS[type[1]][0], color: CODE_REPORT_AXIS_COLORS.scope },
    { label: AXIS_LABELS[type[2]][0], color: CODE_REPORT_AXIS_COLORS.rhythm },
  ]

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 transition-all hover:border-border/80">
      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl">{info.emoji}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-text-bright">{info.title}</h3>
          <p className="text-xs text-text/50">{info.subtitle}</p>
        </div>
        <span
          className="shrink-0 self-start rounded-full border px-2.5 py-1 text-[10px] font-mono font-semibold leading-none"
          style={{
            borderColor: 'color-mix(in srgb, var(--t-accent) 35%, var(--t-border))',
            background: 'color-mix(in srgb, var(--t-accent) 8%, var(--t-bg-card))',
            color: 'color-mix(in srgb, var(--t-accent) 78%, var(--t-text-bright))',
          }}
        >
          {type}
        </span>
      </div>

      <p className="text-xs text-text/70 leading-relaxed mb-3">{info.description}</p>

      {/* Axis breakdown */}
      <div className="mb-3">
        <div className="mb-1.5 text-[9px] font-semibold tracking-[0.16em] text-text/35">성향 조합</div>
        <div className="flex flex-wrap gap-2 text-[10px]">
          {axisTags.map((tag) => (
            <span
              key={`${type}-${tag.label}`}
              className="rounded-full border px-2 py-1 font-semibold"
              style={{
                borderColor: `color-mix(in srgb, ${tag.color} 38%, var(--t-border))`,
                background: `color-mix(in srgb, ${tag.color} 14%, var(--t-bg-card))`,
                color: `color-mix(in srgb, ${tag.color} 72%, var(--t-text-bright))`,
              }}
            >
              {tag.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 rounded-lg bg-white/5 p-2">
          <div className="text-[9px] text-accent/60 mb-0.5">STRENGTHS</div>
          <div className="text-[11px] text-text/60">{info.strengths}</div>
        </div>
        <div className="flex-1 rounded-lg bg-white/5 p-2">
          <div className="text-[9px] text-amber/60 mb-0.5">HEADS UP</div>
          <div className="text-[11px] text-text/60">{info.caution}</div>
        </div>
      </div>
    </div>
  )
}

/** Get static personality info for a type code without session data */
function computePersonalityStatic(type: TypeCode): PersonalityResult {
  // Create fake axes that match the type code
  const styleValue = type[0] === 'E' ? 0.8 : 0.2
  const scopeValue = type[1] === 'W' ? 0.8 : 0.2
  const rhythmValue = type[2] === 'M' ? 0.8 : 0.2

  const axes: Record<AxisKey, { label: [string, string]; value: number }> = {
    style: { label: ['탐험가', '설계자'], value: styleValue },
    scope: { label: ['한우물', '유목민'], value: scopeValue },
    rhythm: { label: ['스프린터', '마라토너'], value: rhythmValue },
  }

  // We need the actual type defs — call computePersonality with mock data
  // Instead, just import from the TYPE_DEFS via computePersonality
  // Since TYPE_DEFS is not exported, we'll use a workaround
  return {
    type,
    axes,
    ...getTypeDef(type),
  }
}

function getTypeDef(type: TypeCode) {
  const defs: Record<TypeCode, { title: string; subtitle: string; emoji: string; description: string; shareQuote: string; strengths: string; caution: string }> = {
    RDM: {
      title: '심해 잠수부',
      subtitle: 'Deep Diver',
      emoji: '🤿',
      description: '코드의 깊은 곳까지 잠수해서 진짜 원인을 찾아내는 타입. 한번 파고들면 끝을 봅니다.',
      shareQuote: '나는 AI랑 코딩할 때 심해 잠수부 타입이래',
      strengths: '근본 원인 추적, 아키텍처 이해',
      caution: '시작이 느릴 수 있어요',
    },
    RDS: {
      title: '코드 감별사',
      subtitle: 'Code Appraiser',
      emoji: '🔎',
      description: '빠르게 코드를 읽고 핵심을 짚어내는 타입. 리뷰의 신이라 불립니다.',
      shareQuote: '나는 AI랑 코딩할 때 코드 감별사 타입이래',
      strengths: '코드 리뷰, 빠른 판단력',
      caution: '직접 만드는 건 미룰 수 있어요',
    },
    RWM: {
      title: '도서관 사서',
      subtitle: 'Librarian',
      emoji: '📚',
      description: '넓은 범위를 꼼꼼히 살피며 전체 그림을 그리는 타입. 놓치는 게 없습니다.',
      shareQuote: '나는 AI랑 코딩할 때 도서관 사서 타입이래',
      strengths: '전체 파악, 문서화, 기술 조사',
      caution: '완벽주의에 빠질 수 있어요',
    },
    RWS: {
      title: '트렌드 헌터',
      subtitle: 'Trend Hunter',
      emoji: '🏄',
      description: '새로운 기술을 빠르게 훑어보고 적용하는 타입. 항상 최신을 쫓습니다.',
      shareQuote: '나는 AI랑 코딩할 때 트렌드 헌터 타입이래',
      strengths: '최신 기술 도입, PoC',
      caution: '깊이가 부족할 수 있어요',
    },
    EDM: {
      title: '장인 대장장이',
      subtitle: 'Master Smith',
      emoji: '⚒️',
      description: '한 프로젝트에 몰두해서 완성도 높은 결과물을 만드는 타입. 묵묵한 장인입니다.',
      shareQuote: '나는 AI랑 코딩할 때 장인 대장장이 타입이래',
      strengths: '높은 완성도, 깊은 전문성',
      caution: '다른 방법을 놓칠 수 있어요',
    },
    EDS: {
      title: '번개 해결사',
      subtitle: 'Lightning Fixer',
      emoji: '⚡',
      description: '문제가 보이면 바로 뚝딱 해치우는 타입. 생산성 괴물이라 불립니다.',
      shareQuote: '나는 AI랑 코딩할 때 번개 해결사 타입이래',
      strengths: '빠른 실행력, 문제 해결',
      caution: '기술 부채에 주의하세요',
    },
    EWM: {
      title: '만능 빌더',
      subtitle: 'All-round Builder',
      emoji: '🏗️',
      description: '이것도 만들고 저것도 만드는 끝없는 에너지. 풀스택의 화신입니다.',
      shareQuote: '나는 AI랑 코딩할 때 만능 빌더 타입이래',
      strengths: '풀스택 능력, 멀티태스킹',
      caution: '체력 관리가 필요해요',
    },
    EWS: {
      title: '카오스 크리에이터',
      subtitle: 'Chaos Creator',
      emoji: '🌪️',
      description: '동시다발 실험! 정신없지만 결국 뭔가 나오는 타입. 해커톤의 왕입니다.',
      shareQuote: '나는 AI랑 코딩할 때 카오스 크리에이터 타입이래',
      strengths: '아이디어 폭발, 빠른 프로토타이핑',
      caution: '마무리를 놓치지 마세요',
    },
  }
  return defs[type]
}

export function PersonalitySections() {
  return (
    <>
      <div className="animate-in mb-6">
        <h2 className="mb-3 text-lg font-bold text-text-bright">3축 시스템</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-bg-card p-4">
            <div className="mb-1 text-xs font-semibold text-accent/60">AXIS 1 — Conversation Style</div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-text-bright">설계자 (A)</span>
              <span className="text-text/30">vs</span>
              <span className="font-medium text-text-bright">탐험가 (E)</span>
            </div>
            <p className="text-xs text-text/50">메시지 길이와 대화 턴 수로 측정</p>
            <p className="mt-1.5 text-[11px] italic text-text/30">"한 번에 설명" vs "대화하면서 찾아감"</p>
          </div>
          <div className="rounded-lg border border-border bg-bg-card p-4">
            <div className="mb-1 text-xs font-semibold text-accent/60">AXIS 2 — Work Scope</div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-text-bright">한우물 (D)</span>
              <span className="text-text/30">vs</span>
              <span className="font-medium text-text-bright">유목민 (W)</span>
            </div>
            <p className="text-xs text-text/50">프로젝트 집중도와 전환 빈도로 측정</p>
            <p className="mt-1.5 text-[11px] italic text-text/30">"끝날 때까지 한 군데" vs "동시에 굴려"</p>
          </div>
          <div className="rounded-lg border border-border bg-bg-card p-4">
            <div className="mb-1 text-xs font-semibold text-accent/60">AXIS 3 — Work Rhythm</div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-text-bright">마라토너 (M)</span>
              <span className="text-text/30">vs</span>
              <span className="font-medium text-text-bright">스프린터 (S)</span>
            </div>
            <p className="text-xs text-text/50">세션 종류와 작업 호흡의 길이로 측정</p>
            <p className="mt-1.5 text-[11px] italic text-text/30">"1-2시간 기본" vs "짧고 빠르게"</p>
          </div>
        </div>
      </div>

      <div className="animate-in">
        <h2 className="mb-3 text-lg font-bold text-text-bright">전체 유형 도감</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ALL_TYPES.map((type) => (
            <TypeCard key={type} type={type} />
          ))}
        </div>
      </div>

      <div className="animate-in mt-8">
        <div className="mb-3">
          <h2 className="text-lg font-bold text-text-bright">AI 직업 종류 설명</h2>
          <p className="text-sm text-text/50">`내 AI의 직업` 카드에 보이는 역할이 각각 어떤 의미인지 정리했어요.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {USAGE_CATEGORIES.map((category) => (
            <div
              key={category.id}
              className="rounded-xl border bg-bg-card p-4"
              style={{ borderColor: 'var(--t-border)' }}
            >
              <div className="mb-2 flex items-start gap-3">
                <span className="text-2xl">{category.emoji}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-text-bright">{category.title}</h3>
                  <p className="text-xs text-text/45">{category.subtitle}</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-text/70">
                {USAGE_CATEGORY_HELP[category.id] ?? '이 역할과 관련된 요청이 자주 보일 때 올라가요.'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

export function PersonalityView({ sessions, onBack, onOpenWrapped, onOpenDashboard, themeProps }: Props) {
  const stats = useMemo(() => computeStats(sessions), [sessions])
  const personality = useMemo(() => computePersonality(sessions, stats), [sessions, stats])
  const usageCategories = useMemo(() => analyzeUsageTopCategories(sessions, USAGE_CATEGORIES.length), [sessions])

  const axisOrder: AxisKey[] = ['style', 'scope', 'rhythm']

  return (
    <div className="dashboard-shell">
      <MemradarTopBar
        sessionCount={stats.totalSessions}
        themeProps={themeProps}
        onOpenWrapped={onOpenWrapped}
        onOpenDashboard={onOpenDashboard}
      />
      <div className="hidden animate-in mb-6 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-text transition-colors hover:border-accent/30 hover:text-text-bright"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-text-bright">AI 코딩 성향 도감</h1>
          <p className="text-sm text-text/50">3축 성격 유형 시스템 — 8가지 코딩 페르소나</p>
        </div>
      </div>

      {/* My Personality Summary + Usage Profile */}
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="animate-in h-full rounded-[26px] border border-border bg-bg-card p-5">
          <div className="mx-auto w-full max-w-xl text-center">
            <div className="mb-3 flex items-center justify-center gap-2">
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                style={{ background: PERSONALITY_CARD_THEME.badgeBg, color: PERSONALITY_CARD_THEME.badgeText }}
              >
                나의 유형
              </span>
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-mono"
                style={{ background: PERSONALITY_CARD_THEME.codeBg, color: PERSONALITY_CARD_THEME.codeText }}
              >
                {personality.type}
              </span>
            </div>

            <div className="mb-3 text-[56px] leading-none">{personality.emoji}</div>
            <h2 className="mb-1 text-3xl font-bold" style={{ color: PERSONALITY_CARD_THEME.title }}>
              {personality.title}
            </h2>
            <p className="mb-3 text-sm" style={{ color: PERSONALITY_CARD_THEME.subtitle }}>
              {personality.subtitle}
            </p>
            <p
              className="mx-auto max-w-lg text-sm leading-relaxed"
              style={{ color: PERSONALITY_CARD_THEME.body }}
            >
              {personality.description}
            </p>

            <div className="mx-auto mt-5 w-full max-w-md space-y-3 text-left">
              {axisOrder.map((key) => (
                <AxisBar key={key} axis={personality.axes[key]} axisKey={key} />
              ))}
            </div>

            <div className="mt-5 grid gap-3 text-left sm:grid-cols-2">
              <div
                className="group relative rounded-xl border p-3.5"
                style={{
                  borderColor: PERSONALITY_CARD_THEME.panelBorder,
                  background: PERSONALITY_CARD_THEME.strengthsBg,
                }}
              >
                <button
                  type="button"
                  className="mb-1 cursor-help rounded text-[10px] font-semibold tracking-wide focus:outline-none focus:ring-1 focus:ring-accent/40"
                  style={{ color: PERSONALITY_CARD_THEME.panelLabel }}
                >
                  STRENGTHS
                </button>
                <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-56 rounded-lg border border-border bg-bg-card px-3 py-2 text-[11px] leading-relaxed text-text opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  {PERSONALITY_PANEL_HELP.strengths}
                </div>
                <div className="text-xs leading-relaxed" style={{ color: PERSONALITY_CARD_THEME.panelText }}>
                  {personality.strengths}
                </div>
              </div>
              <div
                className="group relative rounded-xl border p-3.5"
                style={{
                  borderColor: PERSONALITY_CARD_THEME.panelBorder,
                  background: PERSONALITY_CARD_THEME.headsUpBg,
                }}
              >
                <button
                  type="button"
                  className="mb-1 cursor-help rounded text-[10px] font-semibold tracking-wide focus:outline-none focus:ring-1 focus:ring-accent/40"
                  style={{ color: PERSONALITY_CARD_THEME.panelLabel }}
                >
                  HEADS UP
                </button>
                <div className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-56 rounded-lg border border-border bg-bg-card px-3 py-2 text-[11px] leading-relaxed text-text opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  {PERSONALITY_PANEL_HELP.headsUp}
                </div>
                <div className="text-xs leading-relaxed" style={{ color: PERSONALITY_CARD_THEME.panelText }}>
                  {personality.caution}
                </div>
              </div>
            </div>
          </div>
        </div>

        <UsageAllJobs categories={usageCategories} onSwitchView={onOpenDashboard ?? onBack} />
      </div>

      {/* 3-Axis Explanation */}
      <div className="animate-in mb-6">
        <h2 className="text-lg font-bold text-text-bright mb-3">3축 시스템</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-bg-card p-4">
            <div className="text-xs text-accent/60 font-semibold mb-1">AXIS 1 — Conversation Style</div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-text-bright font-medium">설계자 (A)</span>
              <span className="text-text/30">vs</span>
              <span className="text-text-bright font-medium">탐험가 (E)</span>
            </div>
            <p className="text-xs text-text/50">메시지 길이와 대화 턴 수로 측정</p>
            <p className="mt-1.5 text-[11px] text-text/30 italic">"한 번에 다 설명" vs "대화하면서 찾아감"</p>
          </div>
          <div className="rounded-lg border border-border bg-bg-card p-4">
            <div className="text-xs text-accent/60 font-semibold mb-1">AXIS 2 — Work Scope</div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-text-bright font-medium">한우물 (D)</span>
              <span className="text-text/30">vs</span>
              <span className="text-text-bright font-medium">유목민 (W)</span>
            </div>
            <p className="text-xs text-text/50">프로젝트 집중도와 전환 빈도로 측정</p>
            <p className="mt-1.5 text-[11px] text-text/30 italic">"끝날 때까지 안 건드려" vs "동시에 굴려"</p>
          </div>
          <div className="rounded-lg border border-border bg-bg-card p-4">
            <div className="text-xs text-accent/60 font-semibold mb-1">AXIS 3 — Work Rhythm</div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-text-bright font-medium">마라토너 (M)</span>
              <span className="text-text/30">vs</span>
              <span className="text-text-bright font-medium">스프린터 (S)</span>
            </div>
            <p className="text-xs text-text/50">세션 종류(Quick/Standard/Deep) 비율로 측정</p>
            <p className="mt-1.5 text-[11px] text-text/30 italic">"1-2시간 기본" vs "틈틈이 짧게"</p>
          </div>
        </div>
      </div>

      {/* All 8 Types Grid */}
      <div className="animate-in">
        <h2 className="text-lg font-bold text-text-bright mb-3">전체 유형 도감</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ALL_TYPES.map((type) => (
            <TypeCard
              key={type}
              type={type}
            />
          ))}
        </div>
      </div>

      <div className="animate-in mt-8">
        <div className="mb-3">
          <h2 className="text-lg font-bold text-text-bright">AI 직업 종류 설명</h2>
          <p className="text-sm text-text/50">`내 AI의 직업` 카드에 보이는 역할이 각각 어떤 의미인지 정리했어요.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {USAGE_CATEGORIES.map((category) => {
            return (
              <div
                key={category.id}
                className="rounded-xl border bg-bg-card p-4"
                style={{ borderColor: 'var(--t-border)' }}
              >
                <div className="mb-2 flex items-start gap-3">
                  <span className="text-2xl">{category.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-text-bright">{category.title}</h3>
                    <p className="text-xs text-text/45">{category.subtitle}</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-text/70">
                  {USAGE_CATEGORY_HELP[category.id] ?? '이 카테고리와 관련된 요청이 자주 보일 때 잡히는 역할이에요.'}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
