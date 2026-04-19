import { useEffect, useState, useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, SkipForward, X } from 'lucide-react'
import type { Session, Stats } from '../../types'
import { computeStats } from '../../parser'
import { computePersonality, getCodingTimeLabel } from '../../lib/personality'
import { analyzeUsageTopCategories, getUsageHeadline } from '../../lib/usageProfile'
import { useI18n } from '../../i18n'
import { CoverSlide } from './slides/CoverSlide'
import { IntroSlide } from './slides/IntroSlide'
import { PromptsSlide } from './slides/PromptsSlide'
import { ModelSlide } from './slides/ModelSlide'
import { HoursSlide } from './slides/HoursSlide'
import { PersonalitySlide } from './slides/PersonalitySlide'
import { UsageSlide } from './slides/UsageSlide'
import { ShareSlide } from './slides/ShareSlide'

interface WrappedViewProps {
  sessions: Session[]
  onClose: () => void
}

const INTERACTIVE_SELECTOR =
  'button,a,input,textarea,select,[role="button"],[data-wrapped-control="true"]'

export function WrappedView({ sessions, onClose }: WrappedViewProps) {
  const { locale, t } = useI18n()
  const [slideIndex, setSlideIndex] = useState(0)
  const [dashboardPromptOpen, setDashboardPromptOpen] = useState(false)
  const [dashboardPromptReady, setDashboardPromptReady] = useState(false)

  const stats: Stats = useMemo(() => computeStats(sessions), [sessions])
  const personality = useMemo(() => computePersonality(sessions, stats), [sessions, stats])
  const codingTime = useMemo(() => getCodingTimeLabel(stats), [stats])

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [sessions]
  )

  const totalPrompts = useMemo(
    () => sessions.reduce((sum, s) => sum + s.messageCount.user, 0),
    [sessions]
  )

  const topModel = useMemo(() => {
    const sorted = Object.entries(stats.modelsUsed).sort((a, b) => b[1] - a[1])
    return sorted[0]?.[0] || 'Unknown'
  }, [stats])

  const topUsageCategory = useMemo(
    () => analyzeUsageTopCategories(sessions, 1)[0] ?? null,
    [sessions]
  )
  const usageHeadline = useMemo(
    () => getUsageHeadline(topUsageCategory),
    [topUsageCategory]
  )
  const reportLabel = t('dashboard.wrapped')
  const dashboardPromptTitle = locale === 'ko'
    ? '전체 분석 화면으로 이동할까요?'
    : 'Move to the full analysis dashboard?'
  const dashboardPromptBody = locale === 'ko'
    ? `이동하면 ${reportLabel}를 닫고 세션, 토큰, 활동 패턴이 모인 대시보드로 돌아갑니다.`
    : `This closes ${reportLabel} and returns to the dashboard with sessions, tokens, and activity patterns.`
  const dashboardPromptStayLabel = locale === 'ko'
    ? `${reportLabel} 계속 보기`
    : `Keep Viewing ${reportLabel}`
  const dashboardPromptMoveLabel = locale === 'ko'
    ? '대시보드로 이동'
    : 'Go to Dashboard'

  const lastSlideIndex = sessions.length === 0 ? 0 : 7

  useEffect(() => {
    if (sessions.length === 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient prompt state when slide index changes
    setDashboardPromptOpen(false)
    setDashboardPromptReady(false)

    if (slideIndex !== lastSlideIndex) return

    const timer = window.setTimeout(() => {
      setDashboardPromptReady(true)
    }, 2500)

    return () => window.clearTimeout(timer)
  }, [lastSlideIndex, slideIndex, sessions.length])

  if (sessions.length === 0) {
    return (
      <div className="wrapped-surface flex h-screen w-full flex-col items-center justify-center gap-4 bg-[#06060e] text-text">
        <div className="text-4xl">📭</div>
        <div className="text-lg font-semibold text-text-bright">
          {locale === 'ko' ? '분석할 세션이 없습니다' : 'No sessions to analyze'}
        </div>
        <p className="max-w-sm text-center text-sm text-text/55">
          {locale === 'ko'
            ? '세션 로그를 먼저 불러와 주세요. npx memradar 또는 파일 드래그로 시작할 수 있어요.'
            : 'Please load session logs first. Start with npx memradar or drag your files.'}
        </p>
        <button
          onClick={onClose}
          className="mt-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-dim"
        >
          {locale === 'ko' ? '돌아가기' : 'Go Back'}
        </button>
      </div>
    )
  }

  const slides = [
    <CoverSlide key="cover" totalSessions={stats.totalSessions} />,
    <IntroSlide key="intro" firstDate={sortedSessions[0]?.startTime || ''} totalSessions={stats.totalSessions} />,
    <PromptsSlide key="prompts" totalPrompts={totalPrompts} />,
    <ModelSlide key="model" modelsUsed={stats.modelsUsed} />,
    <HoursSlide key="hours" stats={stats} />,
    <PersonalitySlide key="personality" personality={personality} />,
    <UsageSlide key="usage" sessions={sessions} />,
    <ShareSlide
      key="share"
      personality={personality}
      stats={stats}
      codingLabel={codingTime.label}
      topModel={topModel}
      usageHeadline={usageHeadline}
      onOpenDashboard={onClose}
    />,
  ]

  const canPrev = slideIndex > 0
  const canNext = slideIndex < slides.length - 1

  function goNext() {
    if (canNext) setSlideIndex((i) => Math.min(i + 1, lastSlideIndex))
  }

  function goPrev() {
    if (canPrev) setSlideIndex((i) => Math.max(i - 1, 0))
  }

  function handleSurfaceClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    if (target.closest(INTERACTIVE_SELECTOR)) return

    if (canNext) {
      goNext()
      return
    }

    if (dashboardPromptReady) {
      setDashboardPromptOpen(true)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault()
      goNext()
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goPrev()
    }
    if (e.key === 'End') {
      e.preventDefault()
      setSlideIndex(lastSlideIndex)
    }
    if (e.key === 'Escape') {
      if (dashboardPromptOpen) setDashboardPromptOpen(false)
      else onClose()
    }
  }

  return (
    <div
      className={`wrapped-surface relative h-screen w-full overflow-hidden bg-[#06060e] text-text ${
        canNext || dashboardPromptReady ? 'cursor-pointer' : 'cursor-default'
      }`}
      onClick={handleSurfaceClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <AnimatePresence mode="wait">
        {slides[slideIndex]}
      </AnimatePresence>

      <div
        className="absolute bottom-6 left-0 right-0 z-10 flex cursor-default items-center justify-center gap-4"
        data-wrapped-control="true"
      >
        <button
          onClick={goPrev}
          disabled={!canPrev}
          className="rounded-full bg-white/5 p-2 text-text transition-colors hover:bg-white/10 disabled:opacity-20"
          aria-label="이전 슬라이드"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlideIndex(i)}
              className={`h-2 rounded-full transition-all ${
                i === slideIndex ? 'w-6 bg-accent' : 'w-2 bg-white/15 hover:bg-white/25'
              }`}
              aria-label={`${i + 1}번째 슬라이드로 이동`}
            />
          ))}
        </div>

        <button
          onClick={goNext}
          disabled={!canNext}
          className="rounded-full bg-white/5 p-2 text-text transition-colors hover:bg-white/10 disabled:opacity-20"
          aria-label="다음 슬라이드"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>

      {canNext && (
        <button
          onClick={() => setSlideIndex(lastSlideIndex)}
          data-wrapped-control="true"
          className="absolute right-16 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-text transition-colors hover:border-accent/30 hover:bg-white/10 hover:text-text-bright"
          aria-label="마지막 슬라이드로 건너뛰기"
        >
          <span>스킵</span>
          <SkipForward className="h-4 w-4" />
        </button>
      )}

      <button
        onClick={onClose}
        data-wrapped-control="true"
        className="absolute right-4 top-4 z-10 rounded-full bg-white/5 p-2 text-text transition-colors hover:bg-white/10"
        aria-label="전체 보기로 돌아가기"
      >
        <X className="h-5 w-5" />
      </button>

      {dashboardPromptOpen && (
        <div
          className="absolute inset-0 z-50 flex cursor-default items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
          data-wrapped-control="true"
        >
          <div className="relative w-full max-w-sm rounded-3xl border border-accent/25 bg-[#11101d] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <button
              onClick={() => setDashboardPromptOpen(false)}
              className="absolute right-4 top-4 rounded-full bg-white/5 p-2 text-text/70 transition-colors hover:bg-white/10 hover:text-text-bright"
              aria-label="팝업 닫기"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="pr-10 text-lg font-semibold text-text-bright">
              {dashboardPromptTitle}
            </div>
            <div className="mt-2 text-sm leading-relaxed text-text/55">
              {dashboardPromptBody}
            </div>
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setDashboardPromptOpen(false)}
                className="flex-1 rounded-xl bg-white/5 px-4 py-3 text-sm font-medium text-text transition-colors hover:bg-white/10"
              >
                {dashboardPromptStayLabel}
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-dim"
              >
                {dashboardPromptMoveLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute left-0 right-0 top-0 z-10 h-0.5 bg-white/5">
        <div
          className="h-full bg-accent/50 transition-all duration-500"
          style={{ width: `${((slideIndex + 1) / slides.length) * 100}%` }}
        />
      </div>
    </div>
  )
}
