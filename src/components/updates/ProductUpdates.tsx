import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { BarChart3, Bell, Palette, Search, X } from 'lucide-react'
import { ToolDefaultIcon, type IconComponent } from '../../icons'
import { latestProductUpdate, productUpdates, type ProductUpdate } from '../../content/productUpdates'
import { useI18n } from '../../i18n'

const UPDATE_META: Record<ProductUpdate['category'], { icon: IconComponent; accent: string; soft: string; label: string }> = {
  dashboard: {
    icon: BarChart3,
    accent: 'text-cyan',
    soft: 'bg-cyan/10 text-cyan',
    label: 'Dashboard',
  },
  theme: {
    icon: Palette,
    accent: 'text-amber',
    soft: 'bg-amber/10 text-amber',
    label: 'Theme',
  },
  insight: {
    icon: Search,
    accent: 'text-accent',
    soft: 'bg-accent/10 text-accent',
    label: 'Insight',
  },
  workflow: {
    icon: ToolDefaultIcon,
    accent: 'text-green',
    soft: 'bg-green/10 text-green',
    label: 'Workflow',
  },
}

function formatUpdateDate(date: string, includeYear = false) {
  return new Intl.DateTimeFormat('ko-KR', includeYear
    ? { year: 'numeric', month: 'long', day: 'numeric' }
    : { month: 'long', day: 'numeric' }
  ).format(new Date(date))
}

function UpdateItem({
  update,
  compact = false,
  showHighlights = true,
}: {
  update: ProductUpdate
  compact?: boolean
  showHighlights?: boolean
}) {
  const meta = UPDATE_META[update.category]
  const Icon = meta.icon

  return (
    <article className={`rounded-2xl border border-border/70 bg-bg/35 ${compact ? 'p-3.5' : 'p-4'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${meta.soft}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border/70 bg-bg-card px-2 py-0.5 text-[10px] font-medium text-text/65">
                {update.version}
              </span>
              <span className="text-[10px] text-text/45">{formatUpdateDate(update.date, compact)}</span>
            </div>
            <h3 className={`mt-2 font-semibold text-text-bright ${compact ? 'text-sm' : 'text-base'}`}>
              {update.title}
            </h3>
          </div>
        </div>
        <span className={`hidden rounded-full px-2 py-1 text-[10px] font-medium sm:inline-flex ${meta.soft}`}>
          {meta.label}
        </span>
      </div>

      <p className={`mt-3 leading-6 text-text ${compact ? 'text-xs' : 'text-sm'}`}>
        {update.summary}
      </p>

      {showHighlights && (
        <div className={`mt-3 flex flex-wrap gap-2 ${compact ? 'text-[11px]' : 'text-xs'}`}>
          {update.highlights.slice(0, compact ? 2 : 3).map((highlight) => (
            <span
              key={highlight}
              className="rounded-full border border-border/70 bg-bg-card px-2.5 py-1 text-text/65"
            >
              {highlight}
            </span>
          ))}
        </div>
      )}
    </article>
  )
}

export function LandingUpdatesCard() {
  return (
    <section className="rounded-[28px] border border-border/70 bg-bg-card/84 p-5 backdrop-blur sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-accent">최근 업데이트</p>
          <h3 className="mt-1 text-xl font-semibold text-text-bright">첫 화면 후보</h3>
          <p className="mt-2 text-sm leading-6 text-text">
            처음 들어왔을 때 바로 보이는 업데이트 카드예요. 최신 릴리즈 감을 주기엔 가장 직관적인 자리입니다.
          </p>
        </div>
        <div className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
          {latestProductUpdate.version}
        </div>
      </div>

      <div className="mt-5">
        <UpdateItem update={latestProductUpdate} />
      </div>

      <div className="mt-4 space-y-3">
        {productUpdates.slice(1, 3).map((update) => (
          <UpdateItem key={update.id} update={update} compact showHighlights={false} />
        ))}
      </div>
    </section>
  )
}

export function DashboardUpdatesCard() {
  return (
    <div className="dashboard-card dashboard-card-roomy animate-in mb-8">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-text-bright">
            <Bell className="h-5 w-5 text-accent" />
            업데이트 내역
          </h2>
          <p className="mt-1 text-sm text-text/60">
            대시보드 본문 안에 바로 노출하는 후보예요. 눈에 잘 띄지만 메인 통계와 경쟁할 수도 있습니다.
          </p>
        </div>
        <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
          비교 후보
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {productUpdates.slice(0, 3).map((update) => (
          <UpdateItem key={update.id} update={update} compact={false} showHighlights />
        ))}
      </div>
    </div>
  )
}

interface UpdatesPopoverProps {
  open: boolean
  onClose: () => void
}

/** 왼쪽 상세 패널 — 선택된 업데이트의 전체 내용 (하이라이트 전부, 잘림 없음) */
function UpdateDetail({ update }: { update: ProductUpdate }) {
  const meta = UPDATE_META[update.category]
  const Icon = meta.icon

  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${meta.soft}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border/70 bg-bg-card px-2 py-0.5 text-[10px] font-medium text-text/65">
              {update.version}
            </span>
            <span className="text-[10px] text-text/45">{formatUpdateDate(update.date, true)}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.soft}`}>{meta.label}</span>
          </div>
        </div>
      </div>

      <h3 className="mt-3 text-base font-semibold leading-6 text-text-bright">{update.title}</h3>
      <p className="mt-2 text-sm leading-6 text-text">{update.summary}</p>

      <ul className="mt-4 space-y-2">
        {update.highlights.map((highlight) => (
          <li key={highlight} className="flex gap-2 text-xs leading-5 text-text/75">
            <span className={`mt-[7px] h-1 w-1 shrink-0 rounded-full ${meta.accent.replace('text-', 'bg-')}`} />
            <span>{highlight}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function UpdatesPopover({ open, onClose }: UpdatesPopoverProps) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  // Close on outside click, but skip if the click is on the toggle button itself
  // (the toggle button handles open/close via its own onClick).
  // Using pointer-events-none on the overlay to avoid z-index stacking-context battles.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Element
      if (target.closest('[data-updates-toggle]')) return
      if (target.closest('[data-updates-popover]')) return
      onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <>
      <div className="dashboard-overlay pointer-events-none bg-black/20 backdrop-blur-[1px]" />
      <UpdatesPopoverContent onClose={onClose} />
    </>,
    document.body
  )
}

/**
 * 열릴 때만 마운트되는 본문 — 선택 state 를 여기 두면 닫았다 다시 열 때
 * 마운트 초기값으로 자연 리셋된다 (effect 로 setState 하는 안티패턴 회피).
 */
function UpdatesPopoverContent({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const [selectedId, setSelectedId] = useState(productUpdates[0].id)
  const selected = productUpdates.find((u) => u.id === selectedId) ?? productUpdates[0]

  return (
    <div data-updates-popover className="dashboard-popover right-6 top-20 w-[min(46rem,calc(100vw-2rem))] rounded-2xl border border-border bg-bg-card p-4 shadow-2xl animate-in max-sm:left-4 max-sm:right-4 max-sm:top-18 max-sm:w-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mt-1 text-sm font-semibold text-text-bright">{t('dashboard.news')}</div>
            <p className="mt-2 text-xs leading-5 text-text/60">
              왼쪽에서 자세한 내용을, 오른쪽 목록에서 버전을 골라 보세요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-2 py-1 text-xs text-text/70 transition-colors hover:border-accent/30 hover:text-text-bright"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/*
          마스터-디테일: 왼쪽 = 선택 항목 상세(하이라이트 전부), 오른쪽 = 버전 목록.
          모바일(sm 미만)은 세로 스택 — 상세가 위, 목록이 아래 (데스크톱과 같은 정보, 배치만 변경).
        */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="max-h-[38vh] overflow-y-auto rounded-2xl border border-border/70 bg-bg/35 p-4 sm:max-h-[70vh] sm:flex-1">
            <UpdateDetail update={selected} />
          </div>

          <div className="max-h-[26vh] shrink-0 space-y-2 overflow-y-auto pr-1 sm:max-h-[70vh] sm:w-52" role="listbox" aria-label={t('dashboard.news')}>
            {productUpdates.map((update) => {
              const isSelected = update.id === selected.id
              return (
                <button
                  key={update.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => setSelectedId(update.id)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? 'border-accent/40 bg-accent/8'
                      : 'border-border/70 bg-bg/35 hover:border-accent/25 hover:bg-bg-hover'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium ${isSelected ? 'text-accent' : 'text-text/65'}`}>
                      {update.version}
                    </span>
                    <span className="text-[10px] text-text/40">{formatUpdateDate(update.date)}</span>
                  </div>
                  <div className={`mt-1 truncate text-xs ${isSelected ? 'font-semibold text-text-bright' : 'text-text/75'}`}>
                    {update.title}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

      </div>
  )
}

// re-export for Dashboard
// eslint-disable-next-line react-refresh/only-export-components
export { latestProductUpdate }
