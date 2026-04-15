import { createPortal } from 'react-dom'
import { Bell, Palette, Search, Sparkles, Wrench, X } from 'lucide-react'
import { latestProductUpdate, productUpdates, type ProductUpdate } from '../../content/productUpdates'

const UPDATE_META: Record<ProductUpdate['category'], { icon: typeof Sparkles; accent: string; soft: string; label: string }> = {
  dashboard: {
    icon: Sparkles,
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
    icon: Wrench,
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

export function UpdatesPopover({ open, onClose }: UpdatesPopoverProps) {
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <>
      <div className="dashboard-overlay bg-black/20 backdrop-blur-[1px]" onClick={onClose} />

      <div className="dashboard-popover right-6 top-20 w-[min(27rem,calc(100vw-2rem))] rounded-2xl border border-border bg-bg-card p-4 shadow-2xl animate-in max-sm:left-4 max-sm:right-4 max-sm:top-18 max-sm:w-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-text/45">대시보드 헤더 후보</div>
            <div className="mt-1 text-sm font-semibold text-text-bright">새소식 팝오버</div>
            <p className="mt-2 text-xs leading-5 text-text/60">
              메인 화면은 가볍게 두고, 궁금한 사람만 눌러서 업데이트를 보는 방식입니다.
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

        <div className="mt-4 space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {productUpdates.map((update) => (
            <UpdateItem key={update.id} update={update} compact showHighlights />
          ))}
        </div>
      </div>
    </>,
    document.body
  )
}

export { latestProductUpdate }
