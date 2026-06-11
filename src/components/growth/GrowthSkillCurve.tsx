import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n'
import type { GrowthStats } from '../../types'

interface GrowthSkillCurveProps {
  data: GrowthStats['skillCurve']
}

type CurvePoint = GrowthStats['skillCurve'][number]

type TooltipState = {
  point: CurvePoint
  x: number
  y: number
}

const CHART_WIDTH = 320
const CHART_HEIGHT = 140
const CHART_PAD_Y = 10
const TOOLTIP_HALF_WIDTH = 110
const TOOLTIP_OFFSET = 14

function scoreToY(score: number): number {
  // 0~1 고정 축 — 월별 점수가 절대 스케일로 비교되게
  return CHART_HEIGHT - CHART_PAD_Y - score * (CHART_HEIGHT - CHART_PAD_Y * 2)
}

/** 카드 3 — 프롬프트 숙련도 곡선: 월별 라인 차트 + hover 툴팁 (docs/GROWTH-SECTION-SPEC.md §카드 3) */
export function GrowthSkillCurve({ data }: GrowthSkillCurveProps) {
  const { locale } = useI18n()
  const isKorean = locale === 'ko'
  const [hovered, setHovered] = useState<TooltipState | null>(null)

  if (data.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-text/40">
        {isKorean ? '데이터 모으는 중이에요' : 'Still collecting data'}
      </p>
    )
  }

  const xFor = (i: number) => (i / (data.length - 1)) * CHART_WIDTH
  const points = data.map((d, i) => `${xFor(i).toFixed(1)},${scoreToY(d.score).toFixed(1)}`).join(' ')

  const first = data[0]
  const latest = data[data.length - 1]
  const latestPct = Math.round(latest.score * 100)
  // 델타 표시는 유효 월 ≥ 3 일 때만 (스펙 리뷰 반영 #6)
  const showDelta = data.length >= 3
  const deltaPp = Math.round((latest.score - first.score) * 100)
  const deltaLabel = `${deltaPp >= 0 ? '+' : ''}${deltaPp}%p`
  const deltaColor = deltaPp >= 0 ? 'text-green' : 'text-rose'

  // X축: 첫/중간/마지막 월만 표시
  const midIndex = Math.floor((data.length - 1) / 2)
  const axisLabels = data.length >= 3 && midIndex !== 0 && midIndex !== data.length - 1
    ? [first.month, data[midIndex].month, latest.month]
    : [first.month, latest.month]

  const updateTooltip = (event: React.MouseEvent<HTMLSpanElement>, point: CurvePoint) => {
    setHovered({ point, x: event.clientX, y: event.clientY })
  }

  const tooltipLeft = hovered
    ? Math.min(
        Math.max(hovered.x, TOOLTIP_HALF_WIDTH),
        typeof window !== 'undefined' ? window.innerWidth - TOOLTIP_HALF_WIDTH : hovered.x
      )
    : 0
  const tooltipTop = hovered ? Math.max(hovered.y - TOOLTIP_OFFSET, 18) : 0

  return (
    <div className="relative flex flex-1 flex-col justify-between gap-3">
      {hovered && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="dashboard-tooltip pointer-events-none fixed max-w-[260px] rounded-lg border border-border bg-bg-hover px-3 py-2 text-xs text-text-bright shadow-lg"
              style={{
                left: tooltipLeft,
                top: tooltipTop,
                transform: 'translate(-50%, -100%)',
                zIndex: 120,
              }}
            >
              <div className="mb-1 font-medium">
                {hovered.point.month} · {Math.round(hovered.point.score * 100)}%
              </div>
              <div className="space-y-0.5 leading-snug text-text/70">
                <div>
                  {isKorean ? '구조화 비율 (A)' : 'Structured rate (A)'}:{' '}
                  <span className="text-text-bright">{Math.round(hovered.point.structured * 100)}%</span>
                </div>
                <div>
                  {isKorean ? '평균 단어 (B)' : 'Avg words (B)'}:{' '}
                  <span className="text-text-bright">{Math.round(hovered.point.avgWords)}</span>
                </div>
                <div>
                  {isKorean ? '스킬 다양성 (C)' : 'Skill variety (C)'}:{' '}
                  <span className="text-text-bright">
                    {hovered.point.hasClaudeSession
                      ? `${hovered.point.uniqueSkills}${isKorean ? '종' : ''}`
                      : isKorean ? '— (Codex 월)' : '— (Codex month)'}
                  </span>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      <div>
        <div className="text-2xl font-bold text-text-bright">
          {latestPct}%
          {showDelta && (
            <span className={`ml-2 text-sm font-semibold ${deltaColor}`}>{deltaLabel}</span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-text/45">
          {isKorean
            ? '최근 달 숙련도 점수 — 구조화·길이·스킬 다양성 평균'
            : 'Latest month score — avg of structure, length, skill variety'}
        </div>
      </div>

      {/* preserveAspectRatio="none" 스트레치는 stroke/도형을 비등방 왜곡시킴 —
          라인은 non-scaling-stroke, 데이터 점은 % 좌표 HTML 오버레이로 원형 유지 */}
      <div className="relative h-36 w-full">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
        >
          <line
            x1="0"
            y1={scoreToY(0)}
            x2={CHART_WIDTH}
            y2={scoreToY(0)}
            stroke="var(--color-border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
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
        {data.map((point, i) => (
          <span
            key={point.month}
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-default rounded-full"
            style={{
              left: `${((i / (data.length - 1)) * 100).toFixed(2)}%`,
              top: `${((scoreToY(point.score) / CHART_HEIGHT) * 100).toFixed(2)}%`,
              background: 'var(--color-accent)',
              border: '1.5px solid var(--color-bg-card)',
            }}
            onMouseEnter={(event) => updateTooltip(event, point)}
            onMouseMove={(event) => updateTooltip(event, point)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </div>

      <div className="flex justify-between text-[10px] text-text/35">
        {axisLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  )
}
