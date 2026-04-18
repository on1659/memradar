import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { SlideLayout, FadeInText } from './SlideLayout'
import type { Session } from '../../../types'
import { analyzeUsageTopCategories, getUsageHeadline } from '../../../lib/usageProfile'

interface Props {
  sessions: Session[]
}

export function UsageSlide({ sessions }: Props) {
  const top3 = useMemo(() => analyzeUsageTopCategories(sessions, 3), [sessions])
  const primary = top3[0]

  if (!primary) return null

  return (
    <SlideLayout gradient="from-[#0a0612] via-[#120a1e] to-[#0a0612]">
      <FadeInText delay={0.2} className="mb-6 text-sm text-accent/60 uppercase tracking-widest">
        내 AI는 무슨 일을 할까?
      </FadeInText>

      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', duration: 1, delay: 0.4 }}
        className="mb-4 text-8xl"
      >
        {primary.emoji}
      </motion.div>

      <FadeInText
        delay={0.7}
        className="mb-1 text-center text-4xl font-bold text-text-bright md:text-6xl"
        style={{ fontFamily: "'Instrument Serif', serif" }}
      >
        {primary.title}
      </FadeInText>
      <FadeInText delay={0.9} className="mb-3 text-base text-text/45">
        {primary.subtitle}
      </FadeInText>
      <FadeInText delay={1.05} className="mb-8 text-sm text-accent/80">
        {getUsageHeadline(primary)}
      </FadeInText>

      {top3.length > 1 && (
        <motion.div
          className="flex flex-wrap justify-center gap-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
        >
          {top3.slice(1).map((category, index) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, x: index === 0 ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.35 + index * 0.15 }}
              className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3"
            >
              <span className="text-2xl">{category.emoji}</span>
              <div>
                <div className="text-xs font-semibold text-text-bright">{category.title}</div>
                <div className="text-[10px] text-text/30">{category.subtitle}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      <FadeInText delay={1.8} className="mt-8 text-xs text-text/20">
        사용자 메시지 패턴을 기준으로 정리했어요
      </FadeInText>
    </SlideLayout>
  )
}
