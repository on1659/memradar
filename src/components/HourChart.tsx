import type { CSSProperties } from 'react'

interface HourChartProps {
  data: number[]
}

export function HourChart({ data }: HourChartProps) {
  const max = Math.max(...data, 1)

  return (
    <div
      className="dashboard-visual-frame flex w-full flex-col"
      style={{ '--dashboard-visual-max': '360px' } as CSSProperties}
    >
      <div className="flex h-36 items-end" style={{ gap: '2px' }}>
        {data.map((count, hour) => {
          const pct = (count / max) * 100
          const isNight = hour < 6 || hour >= 22
          const barHeight = Math.max(pct, 1)

          return (
            <div
              key={hour}
              className="group relative flex flex-1 flex-col justify-end"
              style={{ height: '100%' }}
            >
              <div
                className={`dashboard-hour-bar w-full rounded-sm transition-all ${
                  isNight ? 'bg-accent/20' : 'bg-accent/50'
                } group-hover:bg-accent`}
                style={{ height: `${barHeight}%`, minHeight: '2px' }}
              />

              {count > 0 && (
                <div
                  className="dashboard-tooltip pointer-events-none absolute left-1/2 min-w-[56px] -translate-x-1/2 rounded-lg border border-border bg-bg-hover px-2.5 py-1.5 text-center text-xs leading-tight text-text-bright opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                  style={{ bottom: `calc(${barHeight}% + 6px)` }}
                >
                  <div className="whitespace-nowrap break-keep">{hour}시</div>
                  <div className="mt-0.5 whitespace-nowrap break-keep text-text/70">{count}개</div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-2 flex" style={{ gap: '2px' }}>
        {data.map((_, hour) => (
          <div key={hour} className="dashboard-axis-label flex-1 text-[10px] text-text/40">
            {hour % 6 === 0 ? `${hour}시` : ''}
          </div>
        ))}
      </div>
    </div>
  )
}
