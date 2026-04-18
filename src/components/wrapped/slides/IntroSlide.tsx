import { useI18n } from '../../../i18n'
import { SlideLayout, FadeInText } from './SlideLayout'

interface Props {
  firstDate: string
  totalSessions: number
}

export function IntroSlide({ firstDate, totalSessions }: Props) {
  const { locale } = useI18n()
  const dateStr = new Date(firstDate).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const subtitle = locale === 'ko' ? '당신의 AI 성향은?' : 'What is your AI style?'
  const summary = locale === 'ko'
    ? `${totalSessions}개의 세션을 바탕으로 당신의 AI 사용 흐름을 읽어볼게요.`
    : `We will read your AI usage patterns from ${totalSessions} sessions.`
  const footnote = locale === 'ko'
    ? `첫 기록 ${dateStr}`
    : `First recorded on ${dateStr}`

  return (
    <SlideLayout gradient="from-[#06060e] via-[#0a0a20] to-[#0e0820]">
      <FadeInText className="mb-6 text-sm tracking-widest uppercase text-accent/60">
        Your Memradar
      </FadeInText>
      <FadeInText
        delay={0.2}
        className="mb-3 text-center text-5xl font-bold text-text-bright md:text-7xl"
        style={{ fontFamily: "'Instrument Serif', serif" } as React.CSSProperties}
      >
        Memradar
      </FadeInText>
      <FadeInText delay={0.45} className="mb-4 text-center text-2xl text-accent">
        {subtitle}
      </FadeInText>
      <FadeInText delay={0.7} className="max-w-md text-center text-sm leading-relaxed text-text/60">
        {summary}
      </FadeInText>
      <FadeInText delay={0.95} className="mt-6 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-text/55">
        {footnote}
      </FadeInText>
    </SlideLayout>
  )
}
