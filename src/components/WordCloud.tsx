import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

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
}

const TOOLTIP_OFFSET = 14
const TOOLTIP_HALF_WIDTH = 72

function Cloud({ words }: { words: [string, number][] }) {
  const [hovered, setHovered] = useState<TooltipState | null>(null)

  if (words.length === 0) {
    return <p className="text-sm text-text/40">데이터가 충분하지 않습니다</p>
  }

  const maxCount = words[0][1]
  const minCount = words[words.length - 1]?.[1] || 1
  const range = maxCount - minCount || 1

  const updateTooltip = (event: React.MouseEvent<HTMLSpanElement>, word: string, count: number) => {
    setHovered({
      word,
      count,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const tooltipLeft = hovered
    ? Math.min(Math.max(hovered.x, TOOLTIP_HALF_WIDTH), window.innerWidth - TOOLTIP_HALF_WIDTH)
    : 0
  const tooltipTop = hovered
    ? Math.max(hovered.y - TOOLTIP_OFFSET, 18)
    : 0

  return (
    <div className="relative">
      {hovered && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="dashboard-tooltip pointer-events-none fixed rounded-lg border border-border bg-bg-hover px-3 py-1.5 text-center text-xs text-text-bright shadow-lg"
              style={{
                left: tooltipLeft,
                top: tooltipTop,
                transform: 'translate(-50%, -100%)',
                zIndex: 120,
              }}
            >
              <div className="whitespace-nowrap font-medium">{hovered.word}</div>
              <div className="whitespace-nowrap text-text/70">{hovered.count}번</div>
            </div>,
            document.body
          )
        : null}

      <div className="flex min-h-[136px] flex-wrap items-baseline justify-center gap-x-3 gap-y-1 py-1.5">
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
              className="dashboard-hover-grow inline-block cursor-default whitespace-nowrap transition-opacity hover:opacity-100"
              onMouseEnter={(event) => updateTooltip(event, word, count)}
              onMouseMove={(event) => updateTooltip(event, word, count)}
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
