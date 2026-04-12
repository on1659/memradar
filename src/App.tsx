import { useState, useCallback } from 'react'
import { DropZone } from './components/DropZone'
import { Dashboard } from './components/Dashboard'
import { SessionView } from './components/SessionView'
import { parseJsonl } from './parser'
import type { Session } from './types'

type View = { type: 'drop' } | { type: 'dashboard' } | { type: 'session'; session: Session }

function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [view, setView] = useState<View>({ type: 'drop' })

  const handleFilesLoaded = useCallback((files: { name: string; content: string }[]) => {
    const parsed: Session[] = []
    for (const file of files) {
      const session = parseJsonl(file.content, file.name)
      if (session) parsed.push(session)
    }
    setSessions((prev) => {
      const existingIds = new Set(prev.map((s) => s.id))
      const newSessions = parsed.filter((s) => !existingIds.has(s.id))
      return [...prev, ...newSessions]
    })
    setView({ type: 'dashboard' })
  }, [])

  if (view.type === 'drop' && sessions.length === 0) {
    return <DropZone onFilesLoaded={handleFilesLoaded} />
  }

  if (view.type === 'session') {
    return (
      <SessionView
        session={view.session}
        onBack={() => setView({ type: 'dashboard' })}
      />
    )
  }

  return (
    <Dashboard
      sessions={sessions}
      onSelectSession={(session) => setView({ type: 'session', session })}
    />
  )
}

export default App
