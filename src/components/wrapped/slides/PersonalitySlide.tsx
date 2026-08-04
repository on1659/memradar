import { motion } from 'framer-motion'
import { SlideLayout, FadeInText } from './SlideLayout'
import type { PersonalityResult } from '../../../lib/personality'
import { useI18n } from '../../../i18n'
import { PERSONALITY_ICONS } from '../../../icons'
import { PersonalityRadar } from '../../PersonalityRadar'

interface Props {
  personality: PersonalityResult
}

export function PersonalitySlide({ personality }: Props) {
  const { locale } = useI18n()
  const PersonalityIcon = PERSONALITY_ICONS[personality.type]

  return (
    <SlideLayout gradient="from-[#06060e] via-[#10081e] to-[#06060e]">
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', duration: 1 }}
        className="mb-4 flex h-24 w-24 items-center justify-center rounded-3xl border border-white/10 bg-white/5"
      >
        <PersonalityIcon size={64} aria-hidden="true" />
      </motion.div>

      <FadeInText delay={0.4} className="text-accent/60 text-sm tracking-widest uppercase mb-3">
        Your Coding Personality
      </FadeInText>
      <FadeInText delay={0.6} className="font-display text-4xl md:text-6xl font-bold text-text-bright mb-1 text-center">
        {personality.title}
      </FadeInText>
      <FadeInText delay={0.8} className="text-lg text-accent mb-2">
        {personality.subtitle}
      </FadeInText>
      <FadeInText delay={1} className="text-text/50 text-center max-w-md leading-relaxed text-sm mb-8">
        {personality.description}
      </FadeInText>

      {/* Personality Radar — 3축 6극 육각 레이더 (막대 대체) */}
      <motion.div
        className="w-full max-w-sm flex justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        <PersonalityRadar axes={personality.axes} locale={locale} size={240} />
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

      <FadeInText delay={2} className="mt-8 max-w-md text-center text-xs text-text/30">
        대화 패턴 기반의 가벼운 성향 추정이에요. 정확한 성격 분석은 아닙니다.
      </FadeInText>
    </SlideLayout>
  )
}
