import { SlideLayout, FadeInText } from './SlideLayout'

interface Props {
  firstDate: string
  totalSessions: number
}

export function IntroSlide({ firstDate, totalSessions }: Props) {
  const dateStr = new Date(firstDate).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <SlideLayout gradient="from-[#06060e] via-[#0a0a20] to-[#0e0820]">
      <FadeInText className="text-accent/60 text-sm tracking-widest uppercase mb-8">
        Your Promptale
      </FadeInText>
      <FadeInText delay={0.3} className="text-5xl md:text-7xl font-bold text-text-bright mb-6 text-center" style={{ fontFamily: "'Instrument Serif', serif" } as React.CSSProperties}>
        당신의 이야기가<br />시작된 날
      </FadeInText>
      <FadeInText delay={0.6} className="text-2xl text-accent mb-4">
        {dateStr}
      </FadeInText>
      <FadeInText delay={0.9} className="text-text/60">
        그 이후로 {totalSessions}개의 세션을 함께했습니다
      </FadeInText>
    </SlideLayout>
  )
}
