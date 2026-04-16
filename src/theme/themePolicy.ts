export const THEME_IDS = ['dark', 'night', 'light', 'paper'] as const
export const ACCENT_IDS = ['indigo', 'teal', 'rose', 'amber', 'violet'] as const

export type ThemeId = typeof THEME_IDS[number]
export type AccentId = typeof ACCENT_IDS[number]
export type ThemeAccentSelections = Partial<Record<ThemeId, AccentId>>

export interface AccentTone {
  color: string
  dim: string
}

const BASE_ACCENT_TONES: Record<AccentId, AccentTone> = {
  indigo: { color: '#6366f1', dim: '#4f46e5' },
  teal: { color: '#14b8a6', dim: '#0d9488' },
  rose: { color: '#f43f5e', dim: '#e11d48' },
  amber: { color: '#f59e0b', dim: '#d97706' },
  violet: { color: '#8b5cf6', dim: '#7c3aed' },
}

const THEME_ACCENT_TONES: Record<ThemeId, Partial<Record<AccentId, AccentTone>>> = {
  dark: {
    indigo: { color: '#7c83ff', dim: '#6366f1' },
    teal: { color: '#2dd4bf', dim: '#14b8a6' },
    violet: { color: '#a78bfa', dim: '#8b5cf6' },
  },
  night: {
    indigo: { color: '#818cf8', dim: '#6366f1' },
    teal: { color: '#5eead4', dim: '#2dd4bf' },
    violet: { color: '#b794f6', dim: '#8b5cf6' },
  },
  light: {
    indigo: { color: '#4338ca', dim: '#3730a3' },
    rose: { color: '#be123c', dim: '#9f1239' },
    violet: { color: '#6d28d9', dim: '#5b21b6' },
  },
  paper: {
    indigo: { color: '#4f46e5', dim: '#4338ca' },
    rose: { color: '#be185d', dim: '#9d174d' },
    amber: { color: '#b45309', dim: '#92400e' },
  },
}

export const THEME_ACCENT_OPTIONS: Record<ThemeId, AccentId[]> = {
  dark: ['indigo', 'teal', 'violet'],
  night: ['indigo', 'violet', 'teal'],
  light: ['indigo', 'rose', 'violet'],
  paper: ['amber', 'rose', 'indigo'],
}

export const THEME_DEFAULT_ACCENTS: Record<ThemeId, AccentId> = {
  dark: 'indigo',
  night: 'indigo',
  light: 'indigo',
  paper: 'amber',
}

export const ACCENT_LABEL_KEYS = {
  indigo: 'accent.indigo',
  teal: 'accent.teal',
  rose: 'accent.rose',
  amber: 'accent.amber',
  violet: 'accent.violet',
} as const

const themeIdSet = new Set<string>(THEME_IDS)
const accentIdSet = new Set<string>(ACCENT_IDS)

export function isThemeId(value: string): value is ThemeId {
  return themeIdSet.has(value)
}

export function isAccentId(value: string): value is AccentId {
  return accentIdSet.has(value)
}

export function normalizeThemeId(theme: string): ThemeId {
  if (theme === 'amoled') return 'night'
  if (theme === 'warm') return 'paper'
  return isThemeId(theme) ? theme : 'dark'
}

export function getAllowedAccents(theme: ThemeId): AccentId[] {
  return THEME_ACCENT_OPTIONS[theme]
}

export function isAccentAllowed(theme: ThemeId, accent: string): accent is AccentId {
  return accentIdSet.has(accent) && THEME_ACCENT_OPTIONS[theme].includes(accent as AccentId)
}

export function getDefaultAccent(theme: ThemeId): AccentId {
  return THEME_DEFAULT_ACCENTS[theme]
}

export function getAccentTone(theme: ThemeId, accent: AccentId): AccentTone {
  return THEME_ACCENT_TONES[theme][accent] ?? BASE_ACCENT_TONES[accent]
}

export function selectAccentForTheme(
  theme: ThemeId,
  preferredAccent: string | null | undefined,
  rememberedAccent: string | null | undefined,
): AccentId {
  if (preferredAccent && isAccentAllowed(theme, preferredAccent)) {
    return preferredAccent
  }

  if (rememberedAccent && isAccentAllowed(theme, rememberedAccent)) {
    return rememberedAccent
  }

  return getDefaultAccent(theme)
}
