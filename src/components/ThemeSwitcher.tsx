import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, MoonStar, Palette, Sparkles, SunMedium } from 'lucide-react'
import { useI18n } from '../i18n'
import {
  ACCENT_LABEL_KEYS,
  getAccentTone,
  getAllowedAccents,
  isAccentAllowed,
  normalizeThemeId,
} from '../theme/themePolicy'

const THEMES = [
  {
    id: 'dark',
    preview: 'linear-gradient(135deg, #10131a 0%, #1a2130 100%)',
    icon: MoonStar,
  },
  {
    id: 'night',
    preview: 'linear-gradient(135deg, #04060a 0%, #10131a 100%)',
    icon: Sparkles,
  },
  {
    id: 'light',
    preview: 'linear-gradient(135deg, #f5f7fb 0%, #ffffff 100%)',
    icon: SunMedium,
  },
  {
    id: 'paper',
    preview: 'linear-gradient(135deg, #f5efe3 0%, #fffaf2 100%)',
    icon: Palette,
  },
] as const

const THEME_LABEL_KEYS = {
  dark: 'theme.dark.label',
  night: 'theme.night.label',
  light: 'theme.light.label',
  paper: 'theme.paper.label',
} as const

const THEME_DESCRIPTION_KEYS = {
  dark: 'theme.dark.description',
  night: 'theme.night.description',
  light: 'theme.light.description',
  paper: 'theme.paper.description',
} as const

type Step = 'theme' | 'accent'

interface ThemeSwitcherProps {
  theme: string
  accent: string
  onThemeChange: (theme: string) => void
  onAccentChange: (accent: string) => void
}

export function ThemeSwitcher({ theme, accent, onThemeChange, onAccentChange }: ThemeSwitcherProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('theme')

  const currentThemeId = normalizeThemeId(theme)
  const currentTheme = THEMES.find((item) => item.id === currentThemeId) ?? THEMES[0]
  const accentOptions = getAllowedAccents(currentThemeId).map((accentId) => ({
    id: accentId,
    ...getAccentTone(currentThemeId, accentId),
  }))
  const currentAccentId = isAccentAllowed(currentThemeId, accent) ? accent : accentOptions[0].id
  const currentAccent = getAccentTone(currentThemeId, currentAccentId)
  const CurrentThemeIcon = currentTheme.icon

  const openPanel = () => {
    setOpen((prev) => {
      const next = !prev
      if (next) setStep('theme')
      return next
    })
  }

  const panel = (
    <>
      <div className="dashboard-overlay bg-black/20 backdrop-blur-[1px]" onClick={() => setOpen(false)} />

      <div className="dashboard-popover right-6 top-20 w-72 rounded-2xl border border-border bg-bg-card p-4 shadow-2xl animate-in max-sm:left-4 max-sm:right-4 max-sm:top-18 max-sm:w-auto">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-text/45">
              {step === 'theme' ? t('theme.mode.select') : t('theme.accent.select')}
            </div>
            <div className="mt-1 text-sm font-semibold text-text-bright">
              {step === 'theme' ? t('theme.style') : t('theme.accentColor')}
            </div>
          </div>

          {step === 'accent' ? (
            <button
              type="button"
              onClick={() => setStep('theme')}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text/70 transition-colors hover:border-accent/30 hover:text-text-bright"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t('theme.back')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-border px-2 py-1 text-xs text-text/70 transition-colors hover:border-accent/30 hover:text-text-bright"
            >
              {t('theme.close')}
            </button>
          )}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-bg p-2">
          <button
            type="button"
            onClick={() => setStep('theme')}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              step === 'theme'
                ? 'border-accent/50 bg-accent/8'
                : 'border-border/70 hover:border-accent/25 hover:bg-bg-hover'
            }`}
          >
            <div className="text-[10px] text-text/45">{t('theme.currentMode')}</div>
            <div className="mt-1 text-xs font-medium text-text-bright">{t(THEME_LABEL_KEYS[currentThemeId])}</div>
          </button>

          <button
            type="button"
            onClick={() => setStep('accent')}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              step === 'accent'
                ? 'border-accent/50 bg-accent/8'
                : 'border-border/70 hover:border-accent/25 hover:bg-bg-hover'
            }`}
          >
            <div className="text-[10px] text-text/45">{t('theme.accentColor')}</div>
            <div className="mt-1 flex items-center gap-2 text-xs font-medium text-text-bright">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: currentAccent.color }} />
              {t(ACCENT_LABEL_KEYS[currentAccentId])}
            </div>
          </button>
        </div>

        {step === 'theme' ? (
          <div className="space-y-2">
            {THEMES.map((item) => {
              const Icon = item.icon
              const selected = item.id === currentThemeId

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onThemeChange(item.id)
                    setStep('accent')
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                    selected
                      ? 'border-accent/60 bg-accent/8'
                      : 'border-border hover:border-accent/25 hover:bg-bg-hover'
                  }`}
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10"
                    style={{ background: item.preview }}
                  >
                    <Icon className={`h-4 w-4 ${item.id === 'light' || item.id === 'paper' ? 'text-slate-700' : 'text-white'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text-bright">{t(THEME_LABEL_KEYS[item.id])}</div>
                    <div className="text-xs text-text/55">{t(THEME_DESCRIPTION_KEYS[item.id])}</div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              {accentOptions.map((item) => {
                const selected = item.id === currentAccentId

                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onAccentChange(item.id)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition-all ${
                      selected
                        ? 'border-transparent text-text-bright shadow-sm'
                        : 'border-border text-text/70 hover:border-accent/25 hover:text-text-bright'
                    }`}
                    style={{
                      background: selected ? `color-mix(in srgb, ${item.color} 18%, var(--t-bg-card))` : undefined,
                    }}
                  >
                    <span className="h-3 w-3 rounded-full" style={{ background: item.color }} />
                    {t(ACCENT_LABEL_KEYS[item.id])}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => setStep('theme')}
              className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text transition-colors hover:border-accent/30 hover:text-text-bright"
            >
              {t('theme.reselectMode')}
            </button>
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={openPanel}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg-card/70 text-text/70 transition-colors hover:bg-bg-hover hover:text-text-bright"
        title={t('theme.change')}
      >
        <CurrentThemeIcon className="h-4 w-4" />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-bg-hover px-2.5 py-1.5 text-xs text-text-bright opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {t('theme.change')}
      </span>

      {open && typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
    </div>
  )
}
