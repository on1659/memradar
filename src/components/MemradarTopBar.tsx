import { useState } from 'react'
import { Bell, RefreshCw } from 'lucide-react'
import { useI18n } from '../i18n'
import { ThemeSwitcher } from './ThemeSwitcher'
import { UpdatesPopover, latestProductUpdate } from './updates/ProductUpdates'

const BLOG_URL = 'https://radarlog.kr'
const GITHUB_URL = 'https://github.com/on1659/memradar'
const BRAND_LETTERS = 'Memradar'.split('')

interface ThemeProps {
  theme: string
  accent: string
  setTheme: (theme: string) => void
  setAccent: (accent: string) => void
}

interface MemradarTopBarProps {
  sessionCount: number
  themeProps: ThemeProps
  onOpenWrapped?: () => void
  onOpenDashboard?: () => void
  onReload?: () => void
}

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

export function MemradarTopBar({
  sessionCount,
  themeProps,
  onOpenWrapped,
  onOpenDashboard,
  onReload,
}: MemradarTopBarProps) {
  const { t } = useI18n()
  const [updatesOpen, setUpdatesOpen] = useState(false)
  const [reloading, setReloading] = useState(false)

  const brandNode = onOpenDashboard ? (
    <button
      type="button"
      onClick={onOpenDashboard}
      className="text-left transition-opacity hover:opacity-95"
      aria-label="Memradar"
    >
      <DashboardBrand />
    </button>
  ) : (
    <DashboardBrand />
  )

  return (
    <>
      <div className="animate-in mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-3 text-sm text-text/55">
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
          {brandNode}
          <p className="mt-1 text-sm text-text">
            {t('dashboard.subtitle', { count: sessionCount })}
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:flex-nowrap lg:w-auto lg:items-end">
          <div className="order-2 flex items-center gap-2">
            {onOpenWrapped && (
              <button
                onClick={onOpenWrapped}
                className="dashboard-button-attention flex h-9 items-center gap-2 rounded-xl border border-accent/25 bg-accent/10 px-3 text-sm font-medium text-accent transition-colors hover:bg-accent/20 whitespace-nowrap"
              >
                <span className="dashboard-button-attention-runner" aria-hidden="true" />
                <span className="dashboard-button-attention-icon relative z-[1]">✦</span>
                <span className="relative z-[1] hidden sm:inline">{t('dashboard.wrapped')}</span>
              </button>
            )}
          </div>

          {onReload && (
            <button
              onClick={async () => {
                setReloading(true)
                await onReload()
                setReloading(false)
              }}
              disabled={reloading}
              title="세션 데이터 새로 고침"
              className="order-1 flex h-9 w-9 items-center justify-center rounded-xl bg-bg-card/70 text-text transition-colors hover:bg-bg-hover hover:text-text-bright disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`} />
            </button>
          )}

          <button
            onClick={() => setUpdatesOpen(true)}
            className="order-1 flex h-9 items-center gap-2 rounded-xl bg-bg-card/70 px-3 text-sm text-text transition-colors hover:bg-bg-hover hover:text-text-bright whitespace-nowrap"
          >
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">{t('dashboard.news')}</span>
            <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              {latestProductUpdate.version}
            </span>
          </button>

          <div className="order-3">
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
    </>
  )
}
