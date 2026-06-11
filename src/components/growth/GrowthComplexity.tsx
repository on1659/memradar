import { useI18n } from '../../i18n'
import type { GrowthStats } from '../../types'

interface GrowthComplexityProps {
  data: GrowthStats['monthlyComplexity']
}

const SPARK_WIDTH = 120
const SPARK_HEIGHT = 44
const SPARK_PAD = 4

/** 카드 1 — 질문 복잡도 변화: 미니 스파크라인 + 델타 (docs/GROWTH-SECTION-SPEC.md §카드 1) */
export function GrowthComplexity({ data }: GrowthComplexityProps) {
  const { locale } = useI18n()
  const isKorean = locale === 'ko'

  // 유효 월 < 2 → 빈상태
  if (data.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-text/40">
        {isKorean ? '데이터 모으는 중이에요' : 'Still collecting data'}
      </p>
    )
  }

  const values = data.map((d) => d.avgWords)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min

  const points = values
    .map((v, i) => {
      const x = data.length > 1 ? (i / (data.length - 1)) * SPARK_WIDTH : SPARK_WIDTH / 2
      const y = range > 0
        ? SPARK_HEIGHT - SPARK_PAD - ((v - min) / range) * (SPARK_HEIGHT - SPARK_PAD * 2)
        : SPARK_HEIGHT / 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const latest = data[data.length - 1]
  const first = data[0]
  const latestAvg = Math.round(latest.avgWords)
  // 델타는 유효 월 ≥ 3 일 때만 표시 (저샘플 노이즈 방지 — 스펙 리뷰 반영 #6)
  const showDelta = data.length >= 3
  const delta = Math.round(latest.avgWords - first.avgWords)
  const deltaLabel = `${delta >= 0 ? '+' : ''}${delta}`
  const deltaColor = delta >= 0 ? 'text-green' : 'text-rose'

  return (
    <div className="flex flex-1 flex-col justify-between gap-3">
      <div>
        <div className="text-2xl font-bold text-text-bright">
          {latestAvg}
          <span className="ml-1 text-sm font-normal text-text/55">
            {isKorean ? '단어' : 'words'}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-text/45">
          {isKorean ? '최근 달 평균 단어 수' : 'Avg words in latest month'}
          {showDelta && (
            <span className={`ml-1.5 font-semibold ${deltaColor}`}>
              {deltaLabel} {isKorean ? '(첫 달 대비)' : '(vs first month)'}
            </span>
          )}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-12 w-full"
        aria-hidden="true"
      >
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between text-[10px] text-text/35">
        <span>{first.month}</span>
        <span>{latest.month}</span>
      </div>
    </div>
  )
}
