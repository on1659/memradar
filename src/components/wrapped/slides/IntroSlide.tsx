import { useI18n } from '../../../i18n'
import { SlideLayout, FadeInText, TypewriterText } from './SlideLayout'

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

  const titleLines = locale === 'ko'
    ? ['당신의 이야기가', '시작된 날']
    : ['The day your', 'story began']
  const body = locale === 'ko'
    ? `그 이후로 ${totalSessions}개의 세션을 함께했습니다`
    : `${totalSessions} sessions together since then`

  // 핵심 문장은 0.12s/글자로 천천히, 날짜는 0.07s/글자
  const line1Start = 0.4
  const line1End = line1Start + titleLines[0].length * 0.12
  const line2Start = line1End + 0.18
  const line2End = line2Start + titleLines[1].length * 0.12
  const dateStart = line2End + 1.0
  const dateEnd = dateStart + dateStr.length * 0.07
  const bodyStart = dateEnd + 0.5

  return (
    <SlideLayout gradient="from-[#06060e] via-[#0a0a20] to-[#0e0820]">
      <FadeInText className="mb-8 text-sm tracking-widest uppercase text-accent/60">
        Your Memradar
      </FadeInText>
      <div
        className="mb-6 text-center text-5xl font-bold text-text-bright md:text-7xl"
        style={{ fontFamily: "'Instrument Serif', serif" }}
      >
        <TypewriterText
          delay={line1Start}
          stagger={0.12}
          showCursor
          cursorHideAt={line2Start - 0.05}
          className="block"
        >
          {titleLines[0]}
        </TypewriterText>
        <TypewriterText
          delay={line2Start}
          stagger={0.12}
          showCursor
          cursorHideAt={dateStart - 0.1}
          className="block"
        >
          {titleLines[1]}
        </TypewriterText>
      </div>
      <TypewriterText
        delay={dateStart}
        stagger={0.07}
        showCursor
        className="mb-4 text-2xl text-accent"
      >
        {dateStr}
      </TypewriterText>
      <FadeInText delay={bodyStart} className="text-text/60">
        {body}
      </FadeInText>
    </SlideLayout>
  )
}
