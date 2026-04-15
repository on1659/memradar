import { motion } from 'framer-motion'
import { SlideLayout, FadeInText } from './SlideLayout'
import type { PersonalityResult, AxisKey } from '../../../lib/personality'

interface Props {
  personality: PersonalityResult
}

const AXIS_COLORS: Record<AxisKey, string> = {
  style: 'bg-accent/60',
  scope: 'bg-cyan/60',
  rhythm: 'bg-amber/60',
}

const AXIS_HELP: Record<AxisKey, [string, string]> = {
  style: [
    '읽기형: 코드를 먼저 살피고 원인을 파악하는 쪽에 가까워요.',
    '실행형: 바로 수정하고 만들면서 전진하는 쪽에 가까워요.',
  ],
  scope: [
    '깊이파: 한 문제를 깊게 파고들어 구조와 원인을 이해하는 성향이에요.',
    '넓이파: 여러 파일, 도구, 주제를 넓게 오가며 해결하는 성향이에요.',
  ],
  rhythm: [
    '마라토너: 긴 호흡으로 오래 이어가는 작업 리듬에 가까워요.',
    '스프린터: 짧고 빠른 반복으로 문제를 해결하는 작업 리듬에 가까워요.',
  ],
}

function TooltipLabel({
  active,
  children,
  description,
}: {
  active: boolean
  children: React.ReactNode
  description: string
}) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className={`cursor-help rounded px-1 py-0.5 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-accent/50 ${
          active ? 'text-text-bright font-semibold' : 'text-text/40 hover:text-text/75'
        }`}
      >
        {children}
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-52 -translate-x-1/2 rounded-lg border border-border bg-bg-card px-3 py-2 text-left text-[11px] leading-relaxed text-text opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {description}
      </span>
    </span>
  )
}

export function PersonalitySlide({ personality }: Props) {
  const axisOrder: AxisKey[] = ['style', 'scope', 'rhythm']

  return (
    <SlideLayout gradient="from-[#06060e] via-[#10081e] to-[#06060e]">
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', duration: 1 }}
        className="text-8xl mb-4"
      >
        {personality.emoji}
      </motion.div>

      <FadeInText delay={0.4} className="text-accent/60 text-sm tracking-widest uppercase mb-3">
        Your Coding Personality
      </FadeInText>
      <FadeInText delay={0.6} className="text-4xl md:text-6xl font-bold text-text-bright mb-1 text-center" style={{ fontFamily: "'Instrument Serif', serif" } as React.CSSProperties}>
        {personality.title}
      </FadeInText>
      <FadeInText delay={0.8} className="text-lg text-accent mb-2">
        {personality.subtitle}
      </FadeInText>
      <FadeInText delay={1} className="text-text/50 text-center max-w-md leading-relaxed text-sm mb-8">
        {personality.description}
      </FadeInText>

      {/* 3 Axis Bars */}
      <motion.div
        className="w-full max-w-sm space-y-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        {axisOrder.map((key, i) => {
          const axis = personality.axes[key]
          const leftActive = axis.value < 0.5
          const pct = Math.max(0, Math.min(100, Math.round(axis.value * 100)))
          const leftPct = 100 - pct
          const rightPct = pct
          const handlePct = Math.max(2, Math.min(98, pct))
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.3 + i * 0.15 }}
            >
              <div className="flex justify-between mb-1">
                <TooltipLabel active={leftActive} description={AXIS_HELP[key][0]}>
                  <span>{axis.label[0]}</span>
                  <span className="ml-1 text-[10px] font-normal text-text/35">{leftPct}%</span>
                </TooltipLabel>
                <TooltipLabel active={!leftActive} description={AXIS_HELP[key][1]}>
                  <span>{axis.label[1]}</span>
                  <span className="ml-1 text-[10px] font-normal text-text/35">{rightPct}%</span>
                </TooltipLabel>
              </div>
              <div className="relative h-2 rounded-full bg-white/5">
                <motion.div
                  className={`absolute top-0 h-full rounded-full ${AXIS_COLORS[key]}`}
                  style={axis.value >= 0.5
                    ? { left: '50%', width: 0 }
                    : { right: '50%', width: 0 }
                  }
                  animate={axis.value >= 0.5
                    ? { width: `${pct - 50}%` }
                    : { width: `${50 - pct}%` }
                  }
                  transition={{ delay: 1.5 + i * 0.15, duration: 0.6 }}
                />
                <div className="absolute top-0 left-1/2 w-px h-full bg-white/20" />
                <motion.div
                  className="absolute top-1/2 z-10 h-3 w-3 rounded-full border border-white/50 bg-text-bright shadow-[0_0_0_3px_rgba(255,255,255,0.08)]"
                  style={{ marginLeft: '-6px', marginTop: '-6px' }}
                  initial={{ left: '50%' }}
                  animate={{ left: `${handlePct}%` }}
                  transition={{ delay: 1.5 + i * 0.15, duration: 0.6 }}
                />
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Strengths & Caution */}
      <motion.div
        className="mt-8 flex gap-4 w-full max-w-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 }}
      >
        <div className="group relative flex-1 bg-white/5 rounded-lg p-3">
          <div className="text-[10px] text-accent/60 mb-1 cursor-help">STRENGTHS</div>
          <div className="text-xs text-text/70">{personality.strengths}</div>
          <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-56 rounded-lg border border-border bg-bg-card px-3 py-2 text-[11px] leading-relaxed text-text opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
            이 성향에서 상대적으로 강하게 드러나는 작업 방식이에요.
          </div>
        </div>
        <div className="group relative flex-1 bg-white/5 rounded-lg p-3">
          <div className="text-[10px] text-amber/60 mb-1 cursor-help">HEADS UP</div>
          <div className="text-xs text-text/70">{personality.caution}</div>
          <div className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-56 rounded-lg border border-border bg-bg-card px-3 py-2 text-[11px] leading-relaxed text-text opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
            이 성향에서 가끔 조심하면 좋은 작업 습관이에요.
          </div>
        </div>
      </motion.div>
    </SlideLayout>
  )
}
