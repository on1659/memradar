import { useMemo, useRef, useState } from 'react'

interface WordCloudProps {
  words: [string, number][]
  wordsUser?: [string, number][]
  wordsAssistant?: [string, number][]
}

const COLORS = [
  '#818cf8', '#34d399', '#fbbf24', '#fb7185', '#22d3ee',
  '#a78bfa', '#6ee7b7', '#fcd34d', '#f9a8d4', '#67e8f9',
]

type Tab = 'user' | 'assistant'

type TooltipState = {
  word: string
  count: number
  x: number
  y: number
  originX: number
  originY: number
}

function Cloud({ words }: { words: [string, number][] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<TooltipState | null>(null)
  const [suppressed, setSuppressed] = useState(false)

  if (words.length === 0) {
    return <p className="text-sm text-text/40">데이터가 충분하지 않습니다</p>
  }

  const maxCount = words[0][1]
  const minCount = words[words.length - 1]?.[1] || 1
  const range = maxCount - minCount || 1

  const showTooltip = (event: React.MouseEvent<HTMLSpanElement>, word: string, count: number) => {
    if (suppressed) return

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = event.clientX - rect.left
    const y = event.clientY - rect.top - 14

    setHovered({
      word,
      count,
      x,
      y,
      originX: event.clientX,
      originY: event.clientY,
    })
  }

  const handleWordMove = (event: React.MouseEvent<HTMLSpanElement>) => {
    if (!hovered) return

    const movedX = event.clientX - hovered.originX
    const movedY = event.clientY - hovered.originY

    if (Math.hypot(movedX, movedY) > 8) {
      setHovered(null)
      setSuppressed(true)
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseLeave={() => {
        setHovered(null)
        setSuppressed(false)
      }}
    >
      {hovered && (
        <div
          className="dashboard-tooltip pointer-events-none absolute rounded-lg border border-border bg-bg-hover px-3 py-1.5 text-xs text-text-bright shadow-lg"
          style={{
            left: hovered.x,
            top: hovered.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <span className="font-medium">{hovered.word}</span>
          <span className="ml-2 text-text/70">{hovered.count}번</span>
        </div>
      )}

      <div className="flex min-h-[160px] flex-wrap items-baseline justify-center gap-x-3 gap-y-1 py-2">
        {words.slice(0, 30).map(([word, count], i) => {
          const ratio = (count - minCount) / range
          const size = 13 + ratio * 26
          const weight = ratio > 0.6 ? 700 : ratio > 0.3 ? 600 : 400
          const opacity = 0.5 + ratio * 0.5

          return (
            <span
              key={word}
              style={{
                fontSize: `${size}px`,
                fontWeight: weight,
                color: COLORS[i % COLORS.length],
                opacity,
                lineHeight: 1.2,
              }}
              className="cursor-default whitespace-nowrap transition-opacity hover:opacity-100"
              onMouseEnter={(event) => showTooltip(event, word, count)}
              onMouseMove={handleWordMove}
              onMouseLeave={() => setHovered(null)}
            >
              {word}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function WordCloud({ words, wordsUser, wordsAssistant }: WordCloudProps) {
  const [tab, setTab] = useState<Tab>('user')
  const hasTabs = wordsUser && wordsAssistant

  const activeWords = useMemo(() => {
    if (!hasTabs) return words
    return tab === 'user' ? wordsUser : wordsAssistant
  }, [hasTabs, tab, words, wordsUser, wordsAssistant])

  return (
    <div>
      {hasTabs && (
        <div className="mb-3 flex gap-1">
          <button
            type="button"
            onClick={() => setTab('user')}
            className={`rounded-md px-3 py-1 text-xs transition-colors ${
              tab === 'user'
                ? 'bg-accent/20 text-accent'
                : 'bg-bg text-text/60 hover:text-text'
            }`}
          >
            내가 쓴 단어
          </button>
          <button
            type="button"
            onClick={() => setTab('assistant')}
            className={`rounded-md px-3 py-1 text-xs transition-colors ${
              tab === 'assistant'
                ? 'bg-accent/20 text-accent'
                : 'bg-bg text-text/60 hover:text-text'
            }`}
          >
            AI가 쓴 단어
          </button>
        </div>
      )}
      <Cloud words={activeWords} />
    </div>
  )
}
