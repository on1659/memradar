import { motion } from 'framer-motion'
import type { AxisKey, AxisScore } from '../lib/personality'

interface PersonalityRadarProps {
  axes: Record<AxisKey, AxisScore>
  locale: 'ko' | 'en'
  size?: number
  className?: string
}

/**
 * 영문 극 라벨 — [좌극(label[0]측), 우극(label[1]측)].
 * ko는 axes[key].label 을 그대로 사용하고, en 은 이 상수를 쓴다.
 */
const POLE_LABELS_EN: Record<AxisKey, [string, string]> = {
  style: ['Explorer', 'Architect'],
  scope: ['Deep', 'Wide'],
  rhythm: ['Sprinter', 'Marathoner'],
}

/** 축별 색 — Dashboard.tsx 의 axisColors 와 동일. CSS 변수만 사용해 테마·Wrapped 에서 자동 적응. */
const AXIS_COLORS: Record<AxisKey, string> = {
  style: 'var(--color-accent)',
  scope: 'var(--color-cyan)',
  rhythm: 'var(--color-amber)',
}

/**
 * 3축(style·scope·rhythm)의 양극을 12시부터 시계방향 6꼭짓점으로 펼친 육각 레이더.
 * side=1(우극) → label[1], v = value / side=0(좌극) → label[0], v = 1 - value
 * → 같은 축의 두 극은 지름으로 마주보며 v 합 = 1.
 * i번째 극 각도 θ = i*60°, 좌표 x = cx + R·v·sinθ, y = cy - R·v·cosθ
 * (12시 기준 시계방향, 화면 y 는 아래로 증가 → i=0 위쪽, i=3 아래쪽).
 */
const POLES: ReadonlyArray<{ axis: AxisKey; side: 0 | 1 }> = [
  { axis: 'style', side: 1 }, // i=0  12시  설계자 / Architect
  { axis: 'scope', side: 1 }, // i=1   2시  유목민 / Wide
  { axis: 'rhythm', side: 1 }, // i=2   4시  마라토너 / Marathoner
  { axis: 'style', side: 0 }, // i=3   6시  탐험가 / Explorer
  { axis: 'scope', side: 0 }, // i=4   8시  한우물 / Deep
  { axis: 'rhythm', side: 0 }, // i=5  10시  스프린터 / Sprinter
]

const GRID_LEVELS = [0.25, 0.5, 0.75, 1] as const

// aria-label 우세극 요약 나열 순서 (축 고정 순서)
const AXIS_ORDER: readonly AxisKey[] = ['style', 'scope', 'rhythm']

// viewBox 는 정방 고정(260) — size prop 은 렌더 크기만 조절하므로 내부 좌표계는 불변.
const V = 260
const CENTER = V / 2 // 130
const R = V / 2 - 34 // 96 — 라벨용 여백 34 확보
const LABEL_GAP = 16 // 라벨은 R 바깥(R+16) 극 방향에 배치
const EPSILON = 0.04 // 균형 임계 — 기존 막대 UI(|value-0.5|<0.04)와 통일. 극 raw ≥ 0.5+ε 일 때만 우세극으로 강조.

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)
const round = (n: number) => Math.round(n * 100) / 100
const poleAngle = (i: number) => (i * Math.PI) / 3 // 60°씩

/** level(0~1)의 동심 육각형 꼭짓점 문자열 */
function hexPointsAt(level: number): string {
  return POLES.map((_, i) => {
    const a = poleAngle(i)
    const x = CENTER + R * level * Math.sin(a)
    const y = CENTER - R * level * Math.cos(a)
    return `${round(x)},${round(y)}`
  }).join(' ')
}

export function PersonalityRadar({ axes, locale, size = 220, className }: PersonalityRadarProps) {
  const isKorean = locale === 'ko'

  const poles = POLES.map((pole, i) => {
    const a = poleAngle(i)
    const sin = Math.sin(a)
    const cos = Math.cos(a)
    const raw = axes[pole.axis].value
    const v = clamp01(pole.side === 1 ? raw : 1 - raw)
    const label = isKorean ? axes[pole.axis].label[pole.side] : POLE_LABELS_EN[pole.axis][pole.side]
    return {
      key: `${pole.axis}-${pole.side}`,
      color: AXIS_COLORS[pole.axis],
      // v 는 극별 raw(우극=value, 좌극=1-value). value≈0.5 균형이면 양극 모두 false → 동시 강조 방지.
      dominant: v >= 0.5 + EPSILON,
      label,
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

  const dataPolygon = poles.map((p) => `${round(p.x)},${round(p.y)}`).join(' ')

  // 우세극(축당 최대 1개, style→scope→rhythm 순)만 모아 aria-label 요약 합성 —
  // SR이 개별 성향을 읽을 수 있게(특히 Wrapped는 텍스트 라벨 없음). 균형인 축은 제외.
  const dominantLabels = AXIS_ORDER.reduce<string[]>((acc, axis) => {
    const value = clamp01(axes[axis].value)
    if (value >= 0.5 + EPSILON) {
      acc.push(isKorean ? axes[axis].label[1] : POLE_LABELS_EN[axis][1])
    } else if (1 - value >= 0.5 + EPSILON) {
      acc.push(isKorean ? axes[axis].label[0] : POLE_LABELS_EN[axis][0])
    }
    return acc
  }, [])
  const hasDominant = dominantLabels.length > 0
  const summary = dominantLabels.join(', ')
  const ariaLabel = isKorean
    ? hasDominant
      ? `성향 레이더 — ${summary} 성향`
      : '성향 레이더 — 균형 잡힌 성향'
    : hasDominant
      ? `Personality radar — ${summary}`
      : 'Personality radar — Balanced across all axes'

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
      {/* 그리드 — 동심 육각형 4레벨 + 6 축선 (정적, CSS 변수 stroke) */}
      <g fill="none" stroke="var(--color-border)" strokeLinejoin="round">
        {GRID_LEVELS.map((level) => (
          <polygon
            key={level}
            points={hexPointsAt(level)}
            strokeWidth={1}
            strokeOpacity={level === 1 ? 0.9 : 0.45}
          />
        ))}
        {POLES.map((_, i) => {
          const a = poleAngle(i)
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
          fillOpacity={0.18}
          stroke="var(--color-accent)"
          strokeWidth={1.75}
          strokeLinejoin="round"
        />
        {poles.map((p) => (
          <circle key={p.key} cx={round(p.x)} cy={round(p.y)} r={3} fill={p.color} />
        ))}
      </motion.g>

      {/* 극 라벨 — 우세극(v≥0.5) 진하게, 반대극 흐리게 (정적, 폰트는 페이지 Pretendard 상속) */}
      <g>
        {poles.map((p) => (
          <text
            key={p.key}
            x={round(p.lx)}
            y={round(p.ly)}
            textAnchor={p.anchor}
            dominantBaseline="middle"
            fontSize={12}
            fontWeight={p.dominant ? 600 : 400}
            fill={
              p.dominant
                ? 'var(--color-text-bright)'
                : 'color-mix(in srgb, var(--color-text) 60%, transparent)'
            }
          >
            {p.label}
          </text>
        ))}
      </g>
    </svg>
  )
}
