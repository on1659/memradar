import { useI18n } from '../../../i18n'
import { SlideLayout, FadeInText, TypewriterText } from './SlideLayout'

interface Props {
  totalSessions: number
}

export function CoverSlide({ totalSessions }: Props) {
  const { locale } = useI18n()
  const subtitle = locale === 'ko' ? '당신의 AI 성향은?' : 'What is your AI style?'
  const summary = locale === 'ko'
    ? `${totalSessions}개의 세션을 바탕으로 당신의 AI 사용 흐름을 읽어볼게요.`
    : `We will read your AI usage patterns from ${totalSessions} sessions.`

  // "Memradar" = 8chars × 0.1s = 0.8s → subtitle starts at 0.3 + 0.8 + 0.25 = 1.35s
  const titleStart = 0.3
  const titleEnd = titleStart + 'Memradar'.length * 0.1
  const subtitleStart = titleEnd + 0.25
  const subtitleEnd = subtitleStart + subtitle.length * 0.065
  const summaryStart = subtitleEnd + 0.4

  return (
    <SlideLayout gradient="from-[#06060e] via-[#0a0a20] to-[#0e0820]">
      <FadeInText className="mb-6 text-sm tracking-widest uppercase text-accent/60">
        Your Memradar
      </FadeInText>
      <TypewriterText
        delay={titleStart}
        stagger={0.1}
        showCursor
        cursorHideAt={subtitleStart - 0.05}
        className="mb-3 text-center text-5xl font-bold text-text-bright md:text-7xl"
        style={{ fontFamily: "'Instrument Serif', serif" } as React.CSSProperties}
      >
        Memradar
      </TypewriterText>
      <TypewriterText
        delay={subtitleStart}
        stagger={0.065}
        showCursor
        className="mb-4 text-center text-2xl text-accent"
      >
        {subtitle}
      </TypewriterText>
      <FadeInText delay={summaryStart} className="max-w-md text-center text-sm leading-relaxed text-text/60">
        {summary}
      </FadeInText>
    </SlideLayout>
  )
}
