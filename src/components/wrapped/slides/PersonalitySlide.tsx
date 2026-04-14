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
          const pct = Math.round(axis.value * 100)
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.3 + i * 0.15 }}
            >
              <div className="flex justify-between text-xs mb-1">
                <span className={leftActive ? 'text-text-bright font-semibold' : 'text-text/40'}>{axis.label[0]}</span>
                <span className={!leftActive ? 'text-text-bright font-semibold' : 'text-text/40'}>{axis.label[1]}</span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden relative">
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
        <div className="flex-1 bg-white/5 rounded-lg p-3">
          <div className="text-[10px] text-accent/60 mb-1">STRENGTHS</div>
          <div className="text-xs text-text/70">{personality.strengths}</div>
        </div>
        <div className="flex-1 bg-white/5 rounded-lg p-3">
          <div className="text-[10px] text-amber/60 mb-1">HEADS UP</div>
          <div className="text-xs text-text/70">{personality.caution}</div>
        </div>
      </motion.div>
    </SlideLayout>
  )
}
