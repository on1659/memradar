import { useState, useCallback, useEffect, useRef } from 'react'
import { DropZone } from './components/DropZone'
import { Dashboard } from './components/Dashboard'
import { SessionView } from './components/SessionView'
import { SearchView } from './components/search/SearchView'
import { WrappedView } from './components/wrapped/WrappedView'
import { useTheme } from './components/theme'
import { detectAndParse } from './providers'
import { useI18n } from './i18n'
import type { Session } from './types'

declare global {
  interface Window {
    __MEMRADAR_SESSIONS__?: Session[]
    __MEMRADAR_SKILLS__?: Record<string, string>
  }
}

type View =
  | { type: 'loading' }
  | { type: 'drop' }
  | { type: 'dashboard' }
  | { type: 'session'; session: Session; highlightMessageIndex?: number }
  | { type: 'search' }
  | { type: 'wrapped' }
  | { type: 'personality' }

function viewFromHash(hash: string, sessions: Session[]): View | null {
  if (!hash || hash === '#') return null

  const rawHash = hash.slice(1)
  if (rawHash === 'dashboard') return { type: 'dashboard' }
  if (rawHash === 'search') return { type: 'search' }
  if (rawHash === 'wrapped') return { type: 'wrapped' }
  if (rawHash === 'personality') return { type: 'personality' }

  if (rawHash.startsWith('session/')) {
    const sessionId = decodeURIComponent(rawHash.slice('session/'.length))
    const session = sessions.find((s) => s.id === sessionId)
    return session ? { type: 'session', session } : null
  }

  return null
}

function getInitialDataView(sessions: Session[]): View {
  return viewFromHash(location.hash, sessions) || { type: 'wrapped' }
}

function App() {
  const themeProps = useTheme()
  const { t } = useI18n()
  const [sessions, setSessions] = useState<Session[]>([])
  const [view, setView] = useState<View>({ type: 'loading' })
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 })

  const loadSessions = useCallback(async () => {
    try {
      const embedded = window.__MEMRADAR_SESSIONS__
      if (embedded && embedded.length > 0) {
        setSessions(embedded)
        setView(getInitialDataView(embedded))
        return
      }

      const res = await fetch('/api/sessions')
      if (!res.ok) throw new Error('API not available')
      const fileList: { path: string; name: string; project: string }[] = await res.json()

      if (fileList.length === 0) {
        setView({ type: 'drop' })
        return
      }

      setLoadProgress({ loaded: 0, total: fileList.length })
      const parsed: Session[] = []

      // Load in batches of 10
      for (let i = 0; i < fileList.length; i += 10) {
        const batch = fileList.slice(i, i + 10)
        const results = await Promise.all(
          batch.map(async (f) => {
            try {
              const r = await fetch(`/api/session-content?path=${encodeURIComponent(f.path)}`)
              if (!r.ok) return null
              const content = await r.text()
              return detectAndParse(content, f.name)
            } catch {
              return null
            }
          })
        )
        for (const s of results) {
          if (s) parsed.push(s)
        }
        setLoadProgress({ loaded: Math.min(i + 10, fileList.length), total: fileList.length })
      }

      setSessions(parsed)
      setView(getInitialDataView(parsed))
    } catch {
      setView({ type: 'drop' })
    }
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const handleFilesLoaded = useCallback((files: { name: string; content: string }[]) => {
    const parsed: Session[] = []
    for (const file of files) {
      const session = detectAndParse(file.content, file.name)
      if (session) parsed.push(session)
    }
    setSessions((prev) => {
      const existingIds = new Set(prev.map((s) => s.id))
      const newSessions = parsed.filter((s) => !existingIds.has(s.id))
      return [...prev, ...newSessions]
    })
    setView(getInitialDataView(parsed))
  }, [])

  // Navigate with hash routing for browser back button support
  const navigate = useCallback((newView: View, replace = false) => {
    setView(newView)
    const hash = newView.type === 'dashboard' ? ''
      : newView.type === 'session' ? `#session/${newView.session.id}`
      : `#${newView.type}`
    if (replace) {
      history.replaceState({ viewType: newView.type, sessionId: newView.type === 'session' ? newView.session.id : undefined }, '', hash || location.pathname)
    } else {
      history.pushState({ viewType: newView.type, sessionId: newView.type === 'session' ? newView.session.id : undefined }, '', hash || location.pathname)
    }
  }, [])

  useEffect(() => {
    function handlePopState(e: PopStateEvent) {
      const state = e.state
      const hashView = viewFromHash(location.hash, sessions)
      if (hashView && (!state || !state.viewType)) {
        setView(hashView)
        return
      }
      if (!state || !state.viewType || state.viewType === 'dashboard') {
        setView({ type: 'dashboard' })
      } else if (state.viewType === 'session' && state.sessionId) {
        const session = sessions.find(s => s.id === state.sessionId)
        if (session) setView({ type: 'session', session })
        else setView({ type: 'dashboard' })
      } else if (state.viewType === 'search') {
        setView({ type: 'search' })
      } else if (state.viewType === 'wrapped') {
        setView({ type: 'wrapped' })
      } else if (state.viewType === 'personality') {
        setView({ type: 'personality' })
      } else {
        setView({ type: 'dashboard' })
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [sessions])

  const viewRef = useRef(view.type)
  viewRef.current = view.type

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        if (viewRef.current === 'wrapped') return
        e.preventDefault()
        if (sessions.length > 0) {
          setView((prev) => prev.type === 'search' ? { type: 'dashboard' } : { type: 'search' })
        }
      }
      if (e.key === 'Escape' && viewRef.current === 'search') {
        setView({ type: 'dashboard' })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sessions.length])

  if (view.type === 'loading') {
    const brandLetters = 'Memradar'.split('')

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="text-3xl font-bold text-text-bright flex items-center gap-2">
          <span className="loading-brand-spark text-accent">✦</span>
          <span aria-label="Memradar" className="inline-flex">
            {brandLetters.map((letter, index) => (
              <span
                key={`${letter}-${index}`}
                className="loading-brand-letter"
                style={{ animationDelay: `${index * 70}ms` }}
                aria-hidden="true"
              >
                {letter}
              </span>
            ))}
          </span>
        </div>
        <div className="w-64 h-2 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-300"
            style={{ width: loadProgress.total ? `${(loadProgress.loaded / loadProgress.total) * 100}%` : '10%' }}
          />
        </div>
        <p className="text-sm text-text">
          {loadProgress.total > 0
            ? t('app.loading.progress', { loaded: loadProgress.loaded, total: loadProgress.total })
            : t('app.loading.searching')}
        </p>
        <div className="loading-status-rotator h-5 text-xs text-text/50">
          <span>{t('app.loading.status.memory')}</span>
          <span>{t('app.loading.status.flow')}</span>
          <span>{t('app.loading.status.wrapped')}</span>
          <span>{t('app.loading.status.privacy')}</span>
        </div>
      </div>
    )
  }

  if (view.type === 'drop' && sessions.length === 0) {
    return <DropZone onFilesLoaded={handleFilesLoaded} />
  }

  if (view.type === 'session') {
    return (
      <SessionView
        session={view.session}
        onBack={() => history.back()}
        highlightMessageIndex={view.highlightMessageIndex}
      />
    )
  }

  if (view.type === 'wrapped') {
    return (
      <WrappedView
        sessions={sessions}
        onClose={() => navigate({ type: 'dashboard' })}
      />
    )
  }

  if (view.type === 'personality') {
    return (
      <Dashboard
        sessions={sessions}
        onSelectSession={(session) => navigate({ type: 'session', session })}
        onOpenWrapped={() => navigate({ type: 'wrapped' })}
        onOpenPersonality={() => navigate({ type: 'personality' })}
        onOpenDashboard={() => navigate({ type: 'dashboard' })}
        sectionMode="personality"
        themeProps={themeProps}
      />
    )
  }

  if (view.type === 'search') {
    return (
      <SearchView
        sessions={sessions}
        onSelectResult={(session, messageIndex) =>
          navigate({ type: 'session', session, highlightMessageIndex: messageIndex })
        }
        onClose={() => navigate({ type: 'dashboard' })}
      />
    )
  }

  return (
    <Dashboard
      sessions={sessions}
      onSelectSession={(session) => navigate({ type: 'session', session })}
      onOpenWrapped={() => navigate({ type: 'wrapped' })}
      onOpenPersonality={() => navigate({ type: 'personality' })}
      onOpenDashboard={() => navigate({ type: 'dashboard' })}
      themeProps={themeProps}
    />
  )
}

export default App
