import { useEffect, useState } from 'react'

const THEME_STORAGE_KEY = 'memradar-theme'
const ACCENT_STORAGE_KEY = 'memradar-accent'

function normalizeTheme(theme: string): string {
  if (theme === 'amoled') return 'night'
  if (theme === 'warm') return 'paper'
  return theme
}

function getSystemTheme(): string {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialTheme(): string {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored ? normalizeTheme(stored) : getSystemTheme()
  } catch {
    return getSystemTheme()
  }
}

function getInitialAccent(): string {
  try {
    return localStorage.getItem(ACCENT_STORAGE_KEY) || 'indigo'
  } catch {
    return 'indigo'
  }
}

function applyTheme(theme: string, accent: string) {
  const normalizedTheme = normalizeTheme(theme)
  document.documentElement.setAttribute('data-theme', normalizedTheme)
  document.documentElement.setAttribute('data-accent', accent)

  try {
    localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme)
    localStorage.setItem(ACCENT_STORAGE_KEY, accent)
  } catch {
    // Ignore storage failures.
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(() => getInitialTheme())
  const [accent, setAccent] = useState(() => getInitialAccent())

  useEffect(() => {
    applyTheme(theme, accent)
  }, [theme, accent])

  return { theme, accent, setTheme, setAccent }
}
