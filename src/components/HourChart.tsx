interface HourChartProps {
  data: number[]
}

export function HourChart({ data }: HourChartProps) {
  const max = Math.max(...data, 1)

  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((count, hour) => {
        const height = (count / max) * 100
        const isNight = hour < 6 || hour >= 22
        return (
          <div key={hour} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div
              className={`w-full rounded-t transition-all ${
                isNight ? 'bg-accent/20' : 'bg-accent/50'
              } group-hover:bg-accent/80`}
              style={{ height: `${Math.max(height, 2)}%` }}
            />
            {hour % 3 === 0 && (
              <span className="text-[10px] text-text/40">{hour}</span>
            )}
            {count > 0 && (
              <div className="absolute bottom-full mb-2 px-2 py-1 bg-bg-hover rounded text-xs text-text-bright whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-border">
                {hour}시: {count}개
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
