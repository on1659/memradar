import { useEffect, useMemo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
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
  // 드래그-스크롤 상태 — pointerdown 시점의 시작 위치/scrollLeft (ref 로 리렌더 없이 추적)
  const dragRef = useRef<{ active: boolean; startX: number; startScrollLeft: number }>({
    active: false,
    startX: 0,
    startScrollLeft: 0,
  })

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
  // 고정 셀 크기 — 컨테이너 폭과 무관하게 한 주가 일정 폭. 전체 주가 카드(1칸)보다 넓으면
  // overflow-x-auto 로 가로 스크롤 (최근=최우측 기본 노출).
  const cellSize = 13

  // 마운트/주 수 변경 시 최우측(최근)으로 스크롤 — 최근 약 3개월이 먼저 보이게 한다.
  useEffect(() => {
    const node = containerRef.current
    if (node) node.scrollLeft = node.scrollWidth
  }, [weeks.length])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const node = containerRef.current
    if (!node) return
    dragRef.current = { active: true, startX: event.clientX, startScrollLeft: node.scrollLeft }
    node.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const node = containerRef.current
    if (!node || !dragRef.current.active) return
    node.scrollLeft = dragRef.current.startScrollLeft - (event.clientX - dragRef.current.startX)
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const node = containerRef.current
    if (!dragRef.current.active) return
    dragRef.current.active = false
    if (node?.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId)
  }

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
    <div className="w-full">
      <div
        ref={containerRef}
        className="w-full cursor-grab overflow-x-auto active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
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

        </div>
      </div>

      {/* 범례는 스크롤 컨테이너 밖 — 가로 스크롤(최근 3개월) 시에도 항상 고정 노출 */}
      <div className="mt-3 flex items-center gap-1.5 text-xs text-text/40" style={{ paddingLeft: labelWidth }}>
        <span>적음</span>
        {['bg-white/5', 'bg-accent/20', 'bg-accent/40', 'bg-accent/60', 'bg-accent/90'].map((color, index) => (
          <div key={index} className={`rounded-sm ${color}`} style={{ width: 14, height: 14 }} />
        ))}
        <span>많음</span>
      </div>
    </div>
  )
}
