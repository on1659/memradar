import { useState, useCallback, useEffect, useRef } from 'react'
import { DropZone } from './components/DropZone'
import { Dashboard } from './components/Dashboard'
import { SessionView } from './components/SessionView'
import { SearchView } from './components/search/SearchView'
import { WrappedView } from './components/wrapped/WrappedView'
import { detectAndParse } from './providers'
import { useTheme } from './components/ThemeSwitcher'
import type { Session } from './types'

type View =
  | { type: 'loading' }
  | { type: 'drop' }
  | { type: 'dashboard' }
  | { type: 'session'; session: Session; highlightMessageIndex?: number }
  | { type: 'search' }
  | { type: 'wrapped' }

function App() {
  const themeProps = useTheme()
  const [sessions, setSessions] = useState<Session[]>([])
  const [view, setView] = useState<View>({ type: 'loading' })
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 })

  // Auto-load from local API
  useEffect(() => {
    async function autoLoad() {
      try {
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
        setView({ type: 'dashboard' })
      } catch {
        setView({ type: 'drop' })
      }
    }

    autoLoad()
  }, [])

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
    setView({ type: 'dashboard' })
  }, [])

  const viewRef = useRef(view.type)
  viewRef.current = view.type

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
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
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="text-3xl font-bold text-text-bright flex items-center gap-2">
          <span className="text-accent">✦</span> Memradar
        </div>
        <div className="w-64 h-2 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-300"
            style={{ width: loadProgress.total ? `${(loadProgress.loaded / loadProgress.total) * 100}%` : '10%' }}
          />
        </div>
        <p className="text-sm text-text">
          {loadProgress.total > 0
            ? `세션 로딩 중... ${loadProgress.loaded} / ${loadProgress.total}`
            : '세션 파일 검색 중...'}
        </p>
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
        onBack={() => setView({ type: 'dashboard' })}
        highlightMessageIndex={view.highlightMessageIndex}
      />
    )
  }

  if (view.type === 'wrapped') {
    return (
      <WrappedView
        sessions={sessions}
        onClose={() => setView({ type: 'dashboard' })}
      />
    )
  }

  if (view.type === 'search') {
    return (
      <SearchView
        sessions={sessions}
        onSelectResult={(session, messageIndex) =>
          setView({ type: 'session', session, highlightMessageIndex: messageIndex })
        }
        onClose={() => setView({ type: 'dashboard' })}
      />
    )
  }

  return (
    <Dashboard
      sessions={sessions}
      onSelectSession={(session) => setView({ type: 'session', session })}
      onOpenSearch={() => setView({ type: 'search' })}
      onOpenWrapped={() => setView({ type: 'wrapped' })}
      themeProps={themeProps}
    />
  )
}

export default App
