import { motion } from 'framer-motion'
import { SlideLayout, FadeInText } from './SlideLayout'
import { getModelLabel } from '../../../lib/personality'

interface Props {
  modelsUsed: Record<string, number>
}

export function ModelSlide({ modelsUsed }: Props) {
  const sorted = Object.entries(modelsUsed).sort((a, b) => b[1] - a[1])
  const topModel = sorted[0]
  const total = sorted.reduce((a, [, c]) => a + c, 0)

  if (!topModel) return null

  return (
    <SlideLayout gradient="from-[#06060e] via-[#0c0818] to-[#08061a]">
      <FadeInText className="text-accent/60 text-sm tracking-widest uppercase mb-8">
        Your Favorite Model
      </FadeInText>
      <FadeInText delay={0.3} className="text-4xl md:text-6xl font-bold text-text-bright mb-4 text-center" style={{ fontFamily: "'Instrument Serif', serif" } as React.CSSProperties}>
        {topModel[0]}
      </FadeInText>
      <FadeInText delay={0.6} className="text-lg text-accent mb-8">
        {getModelLabel(topModel[0])}
      </FadeInText>

      <div className="w-full max-w-sm space-y-2">
        {sorted.slice(0, 4).map(([model, count], i) => {
          const pct = Math.round((count / total) * 100)
          return (
            <motion.div
              key={model}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + i * 0.15 }}
              className="flex items-center gap-3"
            >
              <span className="text-xs text-text/60 w-32 truncate text-right">{model}</span>
              <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-accent/60 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: 1 + i * 0.15, duration: 0.6 }}
                />
              </div>
              <span className="text-xs text-text/40 w-10">{pct}%</span>
            </motion.div>
          )
        })}
      </div>
    </SlideLayout>
  )
}
