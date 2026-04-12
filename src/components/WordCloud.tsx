interface WordCloudProps {
  words: [string, number][]
}

const COLORS = [
  'text-accent',
  'text-green',
  'text-amber',
  'text-rose',
  'text-cyan',
  'text-accent/70',
  'text-green/70',
  'text-amber/70',
]

export function WordCloud({ words }: WordCloudProps) {
  if (words.length === 0) {
    return <p className="text-text/40 text-sm">데이터가 충분하지 않습니다</p>
  }

  const maxCount = words[0]?.[1] || 1

  return (
    <div className="flex flex-wrap gap-2 items-center justify-center min-h-[120px]">
      {words.map(([word, count], i) => {
        const ratio = count / maxCount
        const size = 12 + ratio * 20
        return (
          <span
            key={word}
            className={`${COLORS[i % COLORS.length]} hover:opacity-80 transition-opacity cursor-default`}
            style={{ fontSize: `${size}px`, fontWeight: ratio > 0.5 ? 600 : 400 }}
            title={`${word}: ${count}회`}
          >
            {word}
          </span>
        )
      })}
    </div>
  )
}
