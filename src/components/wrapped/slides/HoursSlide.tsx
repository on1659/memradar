import { motion } from 'framer-motion'
import { SlideLayout, FadeInText } from './SlideLayout'
import { getCodingTimeLabel } from '../../../lib/personality'
import type { Stats } from '../../../types'

interface Props {
  stats: Stats
}

export function HoursSlide({ stats }: Props) {
  const { label, emoji } = getCodingTimeLabel(stats)
  const max = Math.max(...stats.hourlyActivity, 1)

  return (
    <SlideLayout gradient="from-[#06060e] via-[#060e14] to-[#06060e]">
      <FadeInText className="text-cyan/60 text-sm tracking-widest uppercase mb-8">
        Your Coding Hours
      </FadeInText>
      <FadeInText delay={0.3} className="text-6xl mb-2">{emoji}</FadeInText>
      <FadeInText delay={0.5} className="text-4xl md:text-5xl font-bold text-text-bright mb-2" style={{ fontFamily: "'Instrument Serif', serif" } as React.CSSProperties}>
        {label}
      </FadeInText>
      <FadeInText delay={0.7} className="text-text/50 mb-10">
        당신의 코딩 리듬
      </FadeInText>

      <div className="flex items-end gap-[3px] h-24 w-full max-w-md">
        {stats.hourlyActivity.map((count, hour) => (
          <motion.div
            key={hour}
            className="flex-1 rounded-t bg-gradient-to-t from-cyan/30 to-accent/40"
            initial={{ height: 0 }}
            animate={{ height: `${Math.max((count / max) * 100, 3)}%` }}
            transition={{ delay: 0.8 + hour * 0.04, duration: 0.4 }}
          />
        ))}
      </div>
      <div className="flex justify-between w-full max-w-md mt-1 text-[10px] text-text/30">
        <span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>24시</span>
      </div>
    </SlideLayout>
  )
}
