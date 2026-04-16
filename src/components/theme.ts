import { useCallback, useEffect, useState } from 'react'
import {
  type AccentId,
  type ThemeAccentSelections,
  type ThemeId,
  isAccentAllowed,
  isAccentId,
  isThemeId,
  normalizeThemeId,
  selectAccentForTheme,
} from '../theme/themePolicy'

const THEME_STORAGE_KEY = 'memradar-theme'
const ACCENT_STORAGE_KEY = 'memradar-accent'
const THEME_ACCENT_STORAGE_KEY = 'memradar-theme-accents'

interface ThemeState {
  theme: ThemeId
  accent: AccentId
  accentSelections: ThemeAccentSelections
}

function getSystemTheme(): ThemeId {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStoredAccentSelections(): ThemeAccentSelections {
  try {
    const stored = localStorage.getItem(THEME_ACCENT_STORAGE_KEY)
    if (!stored) return {}

    const parsed = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object') return {}

    const selections: ThemeAccentSelections = {}

    for (const [theme, accent] of Object.entries(parsed)) {
      if (isThemeId(theme) && typeof accent === 'string' && isAccentId(accent) && isAccentAllowed(theme, accent)) {
        selections[theme] = accent
      }
    }

    return selections
  } catch {
    return {}
  }
}

function getInitialThemeState(): ThemeState {
  const fallbackTheme = getSystemTheme()
  let theme = fallbackTheme
  let storedAccent: string | null = null
  const accentSelections = readStoredAccentSelections()

  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
    theme = storedTheme ? normalizeThemeId(storedTheme) : fallbackTheme
    storedAccent = localStorage.getItem(ACCENT_STORAGE_KEY)
  } catch {
    theme = fallbackTheme
  }

  const accent = selectAccentForTheme(theme, storedAccent, accentSelections[theme])

  return {
    theme,
    accent,
    accentSelections: {
      ...accentSelections,
      [theme]: accent,
    },
  }
}

function applyTheme(theme: ThemeId, accent: AccentId, accentSelections: ThemeAccentSelections) {
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.setAttribute('data-accent', accent)

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    localStorage.setItem(ACCENT_STORAGE_KEY, accent)
    localStorage.setItem(THEME_ACCENT_STORAGE_KEY, JSON.stringify(accentSelections))
  } catch {
    // Ignore storage failures.
  }
}

export function useTheme() {
  const [themeState, setThemeState] = useState(() => getInitialThemeState())

  useEffect(() => {
    applyTheme(themeState.theme, themeState.accent, themeState.accentSelections)
  }, [themeState])

  const setTheme = useCallback((nextThemeInput: string) => {
    setThemeState((prev) => {
      const nextTheme = normalizeThemeId(nextThemeInput)
      const nextAccent = selectAccentForTheme(nextTheme, prev.accent, prev.accentSelections[nextTheme])

      if (nextTheme === prev.theme && nextAccent === prev.accent) {
        return prev
      }

      return {
        theme: nextTheme,
        accent: nextAccent,
        accentSelections: {
          ...prev.accentSelections,
          [prev.theme]: prev.accent,
          [nextTheme]: nextAccent,
        },
      }
    })
  }, [])

  const setAccent = useCallback((nextAccentInput: string) => {
    setThemeState((prev) => {
      if (!isAccentAllowed(prev.theme, nextAccentInput) || nextAccentInput === prev.accent) {
        return prev
      }

      return {
        theme: prev.theme,
        accent: nextAccentInput,
        accentSelections: {
          ...prev.accentSelections,
          [prev.theme]: nextAccentInput,
        },
      }
    })
  }, [])

  return {
    theme: themeState.theme,
    accent: themeState.accent,
    setTheme,
    setAccent,
  }
}
