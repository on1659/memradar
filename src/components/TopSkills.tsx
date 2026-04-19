import { useState } from 'react'
import { createPortal } from 'react-dom'

interface TopSkillsProps {
  skills: [string, number][]
  descriptions?: Record<string, string>
}

const BAR_COLORS = [
  '#a78bfa', '#f472b6', '#22d3ee', '#34d399', '#fbbf24',
  '#818cf8', '#fb7185', '#6ee7b7', '#c084fc', '#f9a8d4',
]

type TooltipState = {
  name: string
  description: string
  x: number
  y: number
}

const TOOLTIP_HALF_WIDTH = 160
const TOOLTIP_OFFSET = 14

function lookupDescription(name: string, descriptions?: Record<string, string>): string {
  if (!descriptions) return ''
  if (descriptions[name]) return descriptions[name]
  const tail = name.includes(':') ? name.split(':').pop() : undefined
  if (tail && descriptions[tail]) return descriptions[tail]
  return ''
}

export function TopSkills({ skills, descriptions }: TopSkillsProps) {
  const [hovered, setHovered] = useState<TooltipState | null>(null)

  if (skills.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-text/40">
        사용한 스킬이 아직 없어요
      </p>
    )
  }

  const max = skills[0][1]

  const updateTooltip = (
    event: React.MouseEvent<HTMLLIElement>,
    name: string,
    description: string
  ) => {
    setHovered({
      name,
      description,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const tooltipLeft = hovered
    ? Math.min(
        Math.max(hovered.x, TOOLTIP_HALF_WIDTH),
        typeof window !== 'undefined' ? window.innerWidth - TOOLTIP_HALF_WIDTH : hovered.x
      )
    : 0
  const tooltipTop = hovered ? Math.max(hovered.y - TOOLTIP_OFFSET, 18) : 0

  return (
    <div className="relative">
      {hovered && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="dashboard-tooltip pointer-events-none fixed max-w-[320px] rounded-lg border border-border bg-bg-hover px-3 py-2 text-xs text-text-bright shadow-lg"
              style={{
                left: tooltipLeft,
                top: tooltipTop,
                transform: 'translate(-50%, -100%)',
                zIndex: 120,
              }}
            >
              <div className="mb-1 font-medium">/{hovered.name}</div>
              <div className={`leading-snug ${hovered.description ? 'text-text/70' : 'italic text-text/40'}`}>
                {hovered.description || '설명이 없어요'}
              </div>
            </div>,
            document.body
          )
        : null}

      <ul className="flex flex-col gap-2 py-1">
        {skills.slice(0, 8).map(([name, count], i) => {
          const width = Math.max(6, (count / max) * 100)
          const color = BAR_COLORS[i % BAR_COLORS.length]
          const description = lookupDescription(name, descriptions)

          return (
            <li
              key={name}
              className="group cursor-default"
              onMouseEnter={(event) => updateTooltip(event, name, description)}
              onMouseMove={(event) => updateTooltip(event, name, description)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span
                  className="truncate font-medium text-text-bright"
                  title={`/${name}`}
                >
                  /{name}
                </span>
                <span className="shrink-0 tabular-nums text-text/60">
                  {count}회
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
                <div
                  className="h-full rounded-full transition-all duration-300 group-hover:brightness-110"
                  style={{
                    width: `${width}%`,
                    background: color,
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
