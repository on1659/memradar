import { useEffect, useMemo, useRef, useState } from 'react'
import { toLocalDayKey } from '../parser'

interface HeatmapProps {
  /** 로컬 날짜 키(YYYY-MM-DD) → 메시지 수 — codingRhythm.localDailyCounts 와 같은 축 */
  localDailyCounts: Record<string, number>
}

interface HeatmapCell {
  date: string
  count: number
  day: number
}

interface MonthMarker {
  label: string
  col: number
}

/** "YYYY-MM-DD" 로컬 키 → 로컬 자정 Date — new Date(string) UTC 파싱으로 하루 어긋나는 것 방지 */
function parseLocalDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toMonthLabel(date: Date) {
  return `${date.getMonth() + 1}월`
}

export function Heatmap({ localDailyCounts }: HeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })

    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  const { weeks, months, maxCount } = useMemo(() => {
    const activeDates = Object.entries(localDailyCounts)
      .filter(([, count]) => count > 0)
      .map(([date]) => date)
      .sort()

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 키도 커서도 로컬 자정 축 — 기존엔 로컬 자정 커서에 UTC 키(toISOString)가 섞여
    // 카운트/요일 축이 하루 어긋났다 (의도된 수정)
    const firstActive = activeDates[0] ? parseLocalDayKey(activeDates[0]) : new Date(today)

    const builtWeeks: HeatmapCell[][] = []
    let currentWeek: HeatmapCell[] = []
    let peak = 0

    const cursor = new Date(firstActive)
    while (cursor <= today) {
      const key = toLocalDayKey(cursor)
      const count = localDailyCounts[key] || 0
      peak = Math.max(peak, count)
      currentWeek.push({
        date: key,
        count,
        day: cursor.getDay(),
      })

      if (cursor.getDay() === 6) {
        builtWeeks.push(currentWeek)
        currentWeek = []
      }

      cursor.setDate(cursor.getDate() + 1)
    }

    if (currentWeek.length > 0) {
      builtWeeks.push(currentWeek)
    }

    const rawMonths: MonthMarker[] = []
    let lastMonthKey = ''

    builtWeeks.forEach((week, index) => {
      const marker = week.find((cell) => cell.date.slice(0, 7) !== lastMonthKey)
      if (!marker) return

      rawMonths.push({
        label: toMonthLabel(parseLocalDayKey(marker.date)),
        col: index,
      })
      lastMonthKey = marker.date.slice(0, 7)
    })

    const minLabelGap = builtWeeks.length <= 10 ? 4 : builtWeeks.length <= 18 ? 3 : 2
    const filteredMonths = rawMonths.filter((month, index) => {
      if (index === 0) return true
      return month.col - rawMonths[index - 1].col >= minLabelGap
    })

    return {
      weeks: builtWeeks,
      months: filteredMonths,
      maxCount: peak,
    }
  }, [localDailyCounts])

  const labelWidth = 24
  const gap = 4
  const numWeeks = weeks.length || 1
  const usableWidth = Math.max(containerWidth - labelWidth - gap * (numWeeks - 1), 0)
  const cellSize = containerWidth > 0
    ? Math.max(12, Math.min(16, Math.floor(usableWidth / numWeeks)))
    : 14

  const getColor = (count: number) => {
    if (count === 0) return 'bg-white/5'

    const ratio = count / (maxCount || 1)
    if (ratio < 0.25) return 'bg-accent/20'
    if (ratio < 0.5) return 'bg-accent/40'
    if (ratio < 0.75) return 'bg-accent/60'
    return 'bg-accent/90'
  }

  const dayLabels = ['', '월', '', '수', '', '금', '']

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
      <div className="dashboard-visual-content flex flex-col">
        <div className="mb-2 flex text-xs text-text/40" style={{ paddingLeft: labelWidth, gap: `${gap}px` }}>
          {weeks.map((_, weekIndex) => {
            const month = months.find((item) => item.col === weekIndex)

            return (
              <div
                key={weekIndex}
                className="dashboard-axis-label"
                style={{ width: cellSize, flexShrink: 0, fontSize: 10 }}
              >
                {month ? month.label : ''}
              </div>
            )
          })}
        </div>

        <div className="flex" style={{ gap: `${gap}px` }}>
          <div className="mr-1 flex flex-col text-xs text-text/40" style={{ gap: `${gap}px` }}>
            {dayLabels.map((label, index) => (
              <div
                key={index}
                className="dashboard-axis-label justify-end"
                style={{ width: 20, height: cellSize, fontSize: 10 }}
              >
                {label}
              </div>
            ))}
          </div>

          <div className="flex" style={{ gap: `${gap}px` }}>
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col" style={{ gap: `${gap}px` }}>
                {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
                  const cell = week.find((entry) => entry.day === dayIndex)

                  if (!cell) {
                    return <div key={dayIndex} style={{ width: cellSize, height: cellSize }} />
                  }

                  return (
                    <div
                      key={dayIndex}
                      className={`heatmap-cell rounded-sm ${getColor(cell.count)}`}
                      style={{ width: cellSize, height: cellSize }}
                      title={`${cell.date}: ${cell.count}개`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-xs text-text/40" style={{ paddingLeft: labelWidth }}>
          <span>적음</span>
          {['bg-white/5', 'bg-accent/20', 'bg-accent/40', 'bg-accent/60', 'bg-accent/90'].map((color, index) => (
            <div key={index} className={`rounded-sm ${color}`} style={{ width: 14, height: 14 }} />
          ))}
          <span>많음</span>
        </div>
      </div>
    </div>
  )
}
