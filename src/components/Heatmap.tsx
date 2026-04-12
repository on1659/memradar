import { useMemo } from 'react'

interface HeatmapProps {
  dailyActivity: Record<string, number>
}

export function Heatmap({ dailyActivity }: HeatmapProps) {
  const { weeks, maxCount, months } = useMemo(() => {
    const today = new Date()
    const start = new Date(today)
    start.setDate(start.getDate() - 6 * 30) // ~6 months back

    // Align to Sunday
    start.setDate(start.getDate() - start.getDay())

    const weeks: { date: string; count: number; day: number }[][] = []
    let currentWeek: { date: string; count: number; day: number }[] = []
    let maxCount = 0

    const cursor = new Date(start)
    while (cursor <= today) {
      const key = cursor.toISOString().slice(0, 10)
      const count = dailyActivity[key] || 0
      if (count > maxCount) maxCount = count
      currentWeek.push({ date: key, count, day: cursor.getDay() })

      if (cursor.getDay() === 6) {
        weeks.push(currentWeek)
        currentWeek = []
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    if (currentWeek.length) weeks.push(currentWeek)

    // Month labels
    const months: { label: string; col: number }[] = []
    let lastMonth = -1
    for (let w = 0; w < weeks.length; w++) {
      const firstDay = weeks[w][0]
      if (firstDay) {
        const m = new Date(firstDay.date).getMonth()
        if (m !== lastMonth) {
          months.push({
            label: new Date(firstDay.date).toLocaleDateString('ko-KR', { month: 'short' }),
            col: w,
          })
          lastMonth = m
        }
      }
    }

    return { weeks, maxCount, months }
  }, [dailyActivity])

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
    <div className="overflow-x-auto">
      <div className="flex gap-1 text-xs text-text/40 mb-1 ml-8">
        {months.map((m, i) => (
          <span key={i} style={{ marginLeft: i === 0 ? 0 : `${(m.col - (months[i - 1]?.col || 0) - 1) * 14}px` }}>
            {m.label}
          </span>
        ))}
      </div>
      <div className="flex gap-0.5">
        <div className="flex flex-col gap-0.5 text-xs text-text/40 mr-1 mt-0.5">
          {dayLabels.map((d, i) => (
            <div key={i} className="h-[12px] leading-[12px] w-5 text-right">{d}</div>
          ))}
        </div>
        <div className="flex gap-0.5">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
                const cell = week.find((c) => c.day === dayIdx)
                if (!cell) return <div key={dayIdx} className="w-[12px] h-[12px]" />
                return (
                  <div
                    key={dayIdx}
                    className={`heatmap-cell w-[12px] h-[12px] rounded-[2px] ${getColor(cell.count)} relative group`}
                  >
                    {cell.count > 0 && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-bg-hover rounded text-xs text-text-bright whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 border border-border">
                        {cell.date}: {cell.count}개 메시지
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1 mt-3 text-xs text-text/40 ml-8">
        <span>적음</span>
        <div className="w-[12px] h-[12px] rounded-[2px] bg-white/5" />
        <div className="w-[12px] h-[12px] rounded-[2px] bg-accent/20" />
        <div className="w-[12px] h-[12px] rounded-[2px] bg-accent/40" />
        <div className="w-[12px] h-[12px] rounded-[2px] bg-accent/60" />
        <div className="w-[12px] h-[12px] rounded-[2px] bg-accent/90" />
        <span>많음</span>
      </div>
    </div>
  )
}
