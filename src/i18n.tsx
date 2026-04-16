import { createContext, useContext, useMemo, type ReactNode } from 'react'

const supportedLocales = ['ko', 'en'] as const
type Locale = typeof supportedLocales[number]

const translations = {
  ko: {
    'app.loading.searching': '세션 파일 검색 중...',
    'app.loading.progress': '세션 로딩 중... {loaded} / {total}',
    'app.loading.status.memory': '기억 조각을 정리하는 중',
    'app.loading.status.flow': '대화의 흐름을 펼치는 중',
    'app.loading.status.wrapped': '당신의 코드 리포트를 준비하는 중',
    'dashboard.subtitle': '{count}개의 세션에서 발견한 당신의 이야기',
    'dashboard.refresh': '세션 새로고침',
    'dashboard.news': '새소식',
    'dashboard.wrapped': '코드 리포트',
    'dashboard.personality': '전체 성향 보기',
    'dashboard.search': '검색',
    'theme.change': '테마 변경',
    'theme.mode.select': '화면 모드 선택',
    'theme.style': '테마 스타일',
    'theme.accent.select': '포인트 색 선택',
    'theme.currentMode': '현재 모드',
    'theme.accentColor': '포인트 색',
    'theme.back': '뒤로',
    'theme.close': '닫기',
    'theme.reselectMode': '다른 모드로 다시 선택',
    'theme.dark.label': '다크 모드',
    'theme.dark.description': '기본 다크 테마',
    'theme.night.label': '나이트',
    'theme.night.description': '더 깊은 블랙 톤',
    'theme.light.label': '라이트 모드',
    'theme.light.description': '밝고 선명한 데이라이트',
    'theme.paper.label': '페이퍼',
    'theme.paper.description': '부드러운 아이보리 톤',
    'accent.indigo': '인디고',
    'accent.teal': '민트',
    'accent.rose': '로즈',
    'accent.amber': '앰버',
    'accent.violet': '바이올렛',
  },
  en: {
    'app.loading.searching': 'Searching session files...',
    'app.loading.progress': 'Loading sessions... {loaded} / {total}',
    'app.loading.status.memory': 'Organizing memory fragments',
    'app.loading.status.flow': 'Unfolding conversation flow',
    'app.loading.status.wrapped': 'Preparing your Code Report',
    'dashboard.subtitle': 'Your story discovered across {count} sessions',
    'dashboard.refresh': 'Refresh sessions',
    'dashboard.news': 'Updates',
    'dashboard.wrapped': 'Code Report',
    'dashboard.personality': 'View personality',
    'dashboard.search': 'Search',
    'theme.change': 'Change theme',
    'theme.mode.select': 'Choose display mode',
    'theme.style': 'Theme Style',
    'theme.accent.select': 'Choose accent color',
    'theme.currentMode': 'Current mode',
    'theme.accentColor': 'Accent color',
    'theme.back': 'Back',
    'theme.close': 'Close',
    'theme.reselectMode': 'Choose another mode',
    'theme.dark.label': 'Dark Mode',
    'theme.dark.description': 'Default dark theme',
    'theme.night.label': 'Night',
    'theme.night.description': 'Deeper black tone',
    'theme.light.label': 'Light Mode',
    'theme.light.description': 'Bright daylight theme',
    'theme.paper.label': 'Paper',
    'theme.paper.description': 'Soft ivory tone',
    'accent.indigo': 'Indigo',
    'accent.teal': 'Mint',
    'accent.rose': 'Rose',
    'accent.amber': 'Amber',
    'accent.violet': 'Violet',
  },
} as const

type TranslationKey = keyof typeof translations.ko
type TranslationValues = Record<string, string | number>

interface I18nContextValue {
  locale: Locale
  browserLocale: string
  t: (key: TranslationKey, values?: TranslationValues) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function readBrowserLocale(): string {
  if (typeof navigator === 'undefined') return 'en'
  return navigator.languages?.[0] || navigator.language || 'en'
}

function localeFromLanguageCode(languageCode: string): Locale | null {
  const primary = languageCode.toLowerCase().split('-')[0]
  return supportedLocales.includes(primary as Locale) ? primary as Locale : null
}

function localeFromUrl(): Locale | null {
  if (typeof location === 'undefined') return null
  const lang = new URLSearchParams(location.search).get('lang')
  return lang ? localeFromLanguageCode(lang) : null
}

function localeFromDomain(): Locale | null {
  if (typeof location === 'undefined') return null
  const hostname = location.hostname.toLowerCase()

  if (hostname.endsWith('.kr') || hostname.startsWith('ko.') || hostname.includes('.ko.')) {
    return 'ko'
  }

  if (
    hostname.endsWith('.us') ||
    hostname.endsWith('.uk') ||
    hostname.endsWith('.au') ||
    hostname.endsWith('.ca') ||
    hostname.startsWith('en.') ||
    hostname.includes('.en.')
  ) {
    return 'en'
  }

  return null
}

function localeFromTimeZone(): Locale | null {
  if (typeof Intl === 'undefined') return null
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  if (timeZone === 'Asia/Seoul') return 'ko'
  if (
    timeZone?.startsWith('America/') ||
    timeZone === 'Europe/London' ||
    timeZone === 'Australia/Sydney' ||
    timeZone === 'Australia/Melbourne'
  ) {
    return 'en'
  }

  return null
}

function detectLocale() {
  const browserLocale = readBrowserLocale()
  const locale =
    localeFromUrl() ||
    localeFromDomain() ||
    localeFromLanguageCode(browserLocale) ||
    localeFromTimeZone() ||
    'en'

  return { browserLocale, locale }
}

function interpolate(text: string, values?: TranslationValues): string {
  if (!values) return text
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    text
  )
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const value = useMemo<I18nContextValue>(() => {
    const { browserLocale, locale } = detectLocale()

    return {
      locale,
      browserLocale,
      t: (key, values) => interpolate(translations[locale][key] ?? translations.en[key], values),
    }
  }, [])

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}
