import { motion } from 'framer-motion'
import { SlideLayout, FadeInText } from './SlideLayout'
import type { PersonalityResult } from '../../../lib/personality'

interface Props {
  personality: PersonalityResult
}

export function PersonalitySlide({ personality }: Props) {
  return (
    <SlideLayout gradient="from-[#06060e] via-[#10081e] to-[#06060e]">
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', duration: 1 }}
        className="text-8xl mb-6"
      >
        {personality.emoji}
      </motion.div>

      <FadeInText delay={0.4} className="text-accent/60 text-sm tracking-widest uppercase mb-4">
        Your Coding Personality
      </FadeInText>
      <FadeInText delay={0.6} className="text-4xl md:text-6xl font-bold text-text-bright mb-2 text-center" style={{ fontFamily: "'Instrument Serif', serif" } as React.CSSProperties}>
        {personality.title}
      </FadeInText>
      <FadeInText delay={0.8} className="text-xl text-accent mb-6">
        {personality.subtitle}
      </FadeInText>
      <FadeInText delay={1} className="text-text/50 text-center max-w-md leading-relaxed">
        {personality.description}
      </FadeInText>

      <motion.div
        className="mt-10 grid grid-cols-4 gap-4 w-full max-w-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        {(Object.entries(personality.scores) as [string, number][]).map(([key, score]) => (
          <div key={key} className="text-center">
            <div className="relative w-full aspect-square mb-1">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                <motion.circle
                  cx="18" cy="18" r="15.5" fill="none"
                  stroke={key === personality.type ? 'rgba(123,108,246,0.8)' : 'rgba(123,108,246,0.25)'}
                  strokeWidth="3"
                  strokeDasharray={`${score * 97.4} 97.4`}
                  initial={{ strokeDasharray: '0 97.4' }}
                  animate={{ strokeDasharray: `${score * 97.4} 97.4` }}
                  transition={{ delay: 1.4, duration: 0.8 }}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs text-text/50">
                {Math.round(score * 100)}
              </span>
            </div>
            <span className="text-[10px] text-text/40 capitalize">{key}</span>
          </div>
        ))}
      </motion.div>
    </SlideLayout>
  )
}
