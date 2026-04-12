import { motion } from 'framer-motion'
import { SlideLayout, AnimatedNumber, FadeInText } from './SlideLayout'

interface Props {
  totalPrompts: number
}

export function PromptsSlide({ totalPrompts }: Props) {
  const bookEquiv = Math.round(totalPrompts * 50 / 60000)

  return (
    <SlideLayout gradient="from-[#06060e] via-[#100820] to-[#06060e]">
      <FadeInText className="text-accent/60 text-sm tracking-widest uppercase mb-8">
        Your Prompts
      </FadeInText>
      <div className="text-7xl md:text-9xl font-bold text-text-bright mb-6" style={{ fontFamily: "'Instrument Serif', serif" }}>
        <AnimatedNumber value={totalPrompts} />
      </div>
      <FadeInText delay={0.5} className="text-xl text-text/60 mb-4">
        개의 프롬프트를 작성했습니다
      </FadeInText>
      {bookEquiv > 0 && (
        <FadeInText delay={0.8} className="text-sm text-text/40">
          소설 약 {bookEquiv}권 분량
        </FadeInText>
      )}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ delay: 1, duration: 1 }}
      >
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-accent rounded-full"
            style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
            animate={{ scale: [0, 1.5, 0], opacity: [0, 1, 0] }}
            transition={{ duration: 2, delay: 1 + Math.random() * 2, repeat: Infinity, repeatDelay: Math.random() * 3 }}
          />
        ))}
      </motion.div>
    </SlideLayout>
  )
}
