import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, MoonStar, Palette, Sparkles, SunMedium } from 'lucide-react'

const THEMES = [
  {
    id: 'dark',
    label: '다크 모드',
    description: '기본 다크 테마',
    preview: 'linear-gradient(135deg, #10131a 0%, #1a2130 100%)',
    icon: MoonStar,
  },
  {
    id: 'night',
    label: '나이트',
    description: '더 깊은 블랙 톤',
    preview: 'linear-gradient(135deg, #04060a 0%, #10131a 100%)',
    icon: Sparkles,
  },
  {
    id: 'light',
    label: '라이트 모드',
    description: '선명한 화이트 톤',
    preview: 'linear-gradient(135deg, #f5f7fb 0%, #ffffff 100%)',
    icon: SunMedium,
  },
  {
    id: 'paper',
    label: '페이퍼',
    description: '부드러운 아이보리 톤',
    preview: 'linear-gradient(135deg, #f5efe3 0%, #fffaf2 100%)',
    icon: Palette,
  },
] as const

const ACCENTS = [
  { id: 'indigo', label: '인디고', color: '#6366f1' },
  { id: 'teal', label: '민트', color: '#14b8a6' },
  { id: 'rose', label: '로즈', color: '#f43f5e' },
  { id: 'amber', label: '앰버', color: '#f59e0b' },
  { id: 'violet', label: '바이올렛', color: '#8b5cf6' },
] as const

type Step = 'theme' | 'accent'

interface ThemeSwitcherProps {
  theme: string
  accent: string
  onThemeChange: (theme: string) => void
  onAccentChange: (accent: string) => void
}

export function ThemeSwitcher({ theme, accent, onThemeChange, onAccentChange }: ThemeSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('theme')

  const currentTheme = THEMES.find((item) => item.id === theme) ?? THEMES[0]
  const currentAccent = ACCENTS.find((item) => item.id === accent) ?? ACCENTS[0]

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
              {step === 'theme' ? '화면 모드 선택' : '포인트 색 선택'}
            </div>
            <div className="mt-1 text-sm font-semibold text-text-bright">
              {step === 'theme' ? '테마 스타일' : 'Accent Color'}
            </div>
          </div>

          {step === 'accent' ? (
            <button
              type="button"
              onClick={() => setStep('theme')}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text/70 transition-colors hover:border-accent/30 hover:text-text-bright"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              뒤로
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-border px-2 py-1 text-xs text-text/70 transition-colors hover:border-accent/30 hover:text-text-bright"
            >
              닫기
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
            <div className="text-[10px] text-text/45">현재 모드</div>
            <div className="mt-1 text-xs font-medium text-text-bright">{currentTheme.label}</div>
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
            <div className="text-[10px] text-text/45">포인트 색</div>
            <div className="mt-1 flex items-center gap-2 text-xs font-medium text-text-bright">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: currentAccent.color }} />
              {currentAccent.label}
            </div>
          </button>
        </div>

        {step === 'theme' ? (
          <div className="space-y-2">
            {THEMES.map((item) => {
              const Icon = item.icon
              const selected = item.id === theme

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
                    <div className="text-sm font-medium text-text-bright">{item.label}</div>
                    <div className="text-xs text-text/55">{item.description}</div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              {ACCENTS.map((item) => {
                const selected = item.id === accent

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
                    {item.label}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => setStep('theme')}
              className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text transition-colors hover:border-accent/30 hover:text-text-bright"
            >
              다른 모드로 다시 선택
            </button>
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openPanel}
        className="flex items-center gap-2 rounded-lg border border-border bg-bg-card px-3 py-2 text-text transition-colors hover:border-accent/30 hover:text-text-bright"
        title="테마 변경"
      >
        <Palette className="h-4 w-4" />
        <span className="hidden text-sm sm:inline">{currentTheme.label}</span>
      </button>

      {open && typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
    </div>
  )
}
