import { motion } from 'framer-motion'
import type { UsageCategoryScore } from '../lib/usageProfile'

interface UsageRadarProps {
  categories: UsageCategoryScore[]
  size?: number
  className?: string
}

// viewBox 는 정방 고정(280) — size prop 은 렌더 크기만 조절하므로 내부 좌표계는 불변.
const V = 280
const CENTER = V / 2 // 140
const R = V / 2 - 42 // 98 — 긴 한글 라벨 여백 넉넉히 확보
const LABEL_GAP = 18 // 라벨은 R 바깥(R+18) 극 방향에 배치
const GRID_LEVELS = [0.25, 0.5, 0.75, 1] as const

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)
const round = (n: number) => Math.round(n * 100) / 100

/**
 * 역할 분포 레이더 — 단방향 N각형. 성향 레이더(PersonalityRadar, 양극 6극)와 달리
 * 각 카테고리가 축 하나이며 반지름 = score / maxScore (한 방향 값).
 * i번째 카테고리 = 12시부터 시계방향 i번째 꼭짓점, θ = i*2π/N,
 * 좌표 x = cx + R·v·sinθ, y = cy - R·v·cosθ (12시 기준 시계방향, 화면 y 아래로 증가).
 */
export function UsageRadar({ categories, size = 190, className }: UsageRadarProps) {
  const n = categories.length
  // 삼각형 미만은 레이더로 의미 없음 — 방어(호출부도 가드하지만 컴포넌트에서도 안전장치).
  if (n < 3) return null

  // categories 는 score 내림차순이라 [0]이 최대. score=0/undefined 방어로 || 1.
  const maxScore = categories[0]?.score || 1
  const angleAt = (i: number) => (i * 2 * Math.PI) / n

  const points = categories.map((cat, i) => {
    const a = angleAt(i)
    const sin = Math.sin(a)
    const cos = Math.cos(a)
    const v = clamp01(cat.score / maxScore)
    return {
      key: cat.id,
      color: cat.color,
      title: cat.title,
      x: CENTER + R * v * sin,
      y: CENTER - R * v * cos,
      lx: CENTER + (R + LABEL_GAP) * sin,
      ly: CENTER - (R + LABEL_GAP) * cos,
      anchor: (Math.abs(sin) < 0.001 ? 'middle' : sin > 0 ? 'start' : 'end') as
        | 'start'
        | 'middle'
        | 'end',
    }
  })

  const dataPolygon = points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ')

  // level(0~1) 동심 N각형 꼭짓점 문자열
  const gridPointsAt = (level: number) =>
    categories
      .map((_, i) => {
        const a = angleAt(i)
        return `${round(CENTER + R * level * Math.sin(a))},${round(CENTER - R * level * Math.cos(a))}`
      })
      .join(' ')

  const ariaLabel = `역할 분포 레이더 — ${categories.map((c) => c.title).join(', ')}`

  return (
    <svg
      viewBox={`0 0 ${V} ${V}`}
      width={size}
      height={size}
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={{ overflow: 'visible' }}
    >
      {/* 그리드 — 동심 N각형 4레벨 + N 축선 (정적, CSS 변수 stroke) */}
      <g fill="none" stroke="var(--color-border)" strokeLinejoin="round">
        {GRID_LEVELS.map((level) => (
          <polygon
            key={level}
            points={gridPointsAt(level)}
            strokeWidth={1}
            strokeOpacity={level === 1 ? 0.9 : 0.45}
          />
        ))}
        {categories.map((_, i) => {
          const a = angleAt(i)
          return (
            <line
              key={i}
              x1={CENTER}
              y1={CENTER}
              x2={round(CENTER + R * Math.sin(a))}
              y2={round(CENTER - R * Math.cos(a))}
              strokeWidth={1}
              strokeOpacity={0.35}
            />
          )
        })}
      </g>

      {/* 데이터 폴리곤 + 꼭짓점 — 중심에서 펼치듯 등장 (fill-box 중심 기준 scale) */}
      <motion.g
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      >
        <polygon
          points={dataPolygon}
          fill="var(--color-accent)"
          fillOpacity={0.16}
          stroke="var(--color-accent)"
          strokeWidth={1.75}
          strokeLinejoin="round"
        />
        {points.map((p) => (
          <circle key={p.key} cx={round(p.x)} cy={round(p.y)} r={3.5} fill={p.color} />
        ))}
      </motion.g>

      {/* 역할 라벨 — 단방향이라 dominant 강조 없이 균일 (정적, 폰트는 페이지 Pretendard 상속) */}
      <g>
        {points.map((p) => (
          <text
            key={p.key}
            x={round(p.lx)}
            y={round(p.ly)}
            textAnchor={p.anchor}
            dominantBaseline="middle"
            fontSize={14}
            fill="color-mix(in srgb, var(--color-text) 68%, transparent)"
          >
            {p.title}
          </text>
        ))}
      </g>
    </svg>
  )
}
