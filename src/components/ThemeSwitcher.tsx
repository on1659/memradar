import { useState, useEffect } from 'react'
import { Palette } from 'lucide-react'

const THEMES = [
  { id: 'dark', label: '다크', preview: '#111116' },
  { id: 'amoled', label: 'AMOLED', preview: '#000000' },
  { id: 'light', label: '라이트', preview: '#f5f5f0' },
  { id: 'warm', label: '따뜻한', preview: '#181410' },
] as const

const ACCENTS = [
  { id: 'indigo', label: 'Indigo', color: '#6366f1' },
  { id: 'violet', label: 'Violet', color: '#8b5cf6' },
  { id: 'teal', label: 'Teal', color: '#14b8a6' },
  { id: 'rose', label: 'Rose', color: '#f43f5e' },
  { id: 'amber', label: 'Amber', color: '#f59e0b' },
] as const

function getStored(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}

function applyTheme(theme: string, accent: string) {
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.setAttribute('data-accent', accent)
  try {
    localStorage.setItem('memradar-theme', theme)
    localStorage.setItem('memradar-accent', accent)
  } catch { /* ignore */ }
}

export function useTheme() {
  const [theme, setTheme] = useState(() => getStored('memradar-theme', 'dark'))
  const [accent, setAccent] = useState(() => getStored('memradar-accent', 'indigo'))

  useEffect(() => { applyTheme(theme, accent) }, [theme, accent])

  return { theme, accent, setTheme, setAccent }
}

interface ThemeSwitcherProps {
  theme: string
  accent: string
  onThemeChange: (theme: string) => void
  onAccentChange: (accent: string) => void
}

export function ThemeSwitcher({ theme, accent, onThemeChange, onAccentChange }: ThemeSwitcherProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg bg-bg-card border border-border text-text hover:text-text-bright hover:border-accent/30 transition-colors"
        title="테마 변경"
      >
        <Palette className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 bg-bg-card border border-border rounded-xl p-4 shadow-lg w-56 animate-in">
            <div className="mb-3">
              <div className="text-xs text-text/50 mb-2">배경</div>
              <div className="grid grid-cols-4 gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onThemeChange(t.id)}
                    className={`flex flex-col items-center gap-1 p-1.5 rounded-lg transition-colors ${
                      theme === t.id ? 'ring-2 ring-accent' : 'hover:bg-bg-hover'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-md border border-border"
                      style={{ background: t.preview }}
                    />
                    <span className="text-[10px] text-text/60">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-text/50 mb-2">액센트</div>
              <div className="flex gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => onAccentChange(a.id)}
                    className={`w-7 h-7 rounded-full transition-all ${
                      accent === a.id ? 'ring-2 ring-offset-2 ring-offset-bg scale-110' : 'hover:scale-105'
                    }`}
                    style={{ background: a.color, '--tw-ring-color': a.color } as React.CSSProperties}
                    title={a.label}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
