import { useI18n } from '../../i18n'
import type { GrowthStats } from '../../types'

interface GrowthRetryProps {
  retryStats: GrowthStats['retryStats']
}

/** 카드 2 — 재질문 빈도: 퍼센트 게이지 + Top 마커 pill (docs/GROWTH-SECTION-SPEC.md §카드 2) */
export function GrowthRetry({ retryStats }: GrowthRetryProps) {
  const { locale } = useI18n()
  const isKorean = locale === 'ko'

  if (retryStats.totalFollowups === 0) {
    return (
      <p className="py-6 text-center text-sm text-text/40">
        {isKorean ? '데이터 모으는 중이에요' : 'Still collecting data'}
      </p>
    )
  }

  // retryRate 는 0~1 분수 — 표시 시점에만 % 변환 (lessons/_common.md L-5)
  const ratePct = retryStats.retryRate * 100
  const gaugeWidth = Math.min(100, Math.max(0, ratePct))

  return (
    <div className="flex flex-1 flex-col justify-between gap-3">
      <div>
        <div className="text-2xl font-bold text-text-bright">{ratePct.toFixed(1)}%</div>
        <div className="mt-0.5 text-[11px] text-text/45">
          {isKorean
            ? `assistant 응답 뒤에 정정한 비율 (${retryStats.retryCount}/${retryStats.totalFollowups}회)`
            : `Corrections right after a reply (${retryStats.retryCount}/${retryStats.totalFollowups})`}
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${gaugeWidth}%`, background: 'var(--color-rose)' }}
        />
      </div>
      {retryStats.topMarkers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {retryStats.topMarkers.map(([marker, count]) => (
            <span
              key={marker}
              className="rounded-full border border-border bg-bg-hover px-2 py-0.5 text-[10px] text-text/70"
            >
              &ldquo;{marker}&rdquo; <span className="font-semibold text-text-bright">{count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
