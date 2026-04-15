import { useState, useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import type { Session, Stats } from '../../types'
import { computeStats } from '../../parser'
import { computePersonality, getCodingTimeLabel } from '../../lib/personality'
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

export function WrappedView({ sessions, onClose }: WrappedViewProps) {
  const [slideIndex, setSlideIndex] = useState(0)

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

  const slides = [
    <IntroSlide key="intro" firstDate={sortedSessions[0]?.startTime || ''} totalSessions={stats.totalSessions} />,
    <PromptsSlide key="prompts" totalPrompts={totalPrompts} />,
    <ModelSlide key="model" modelsUsed={stats.modelsUsed} />,
    <HoursSlide key="hours" stats={stats} />,
    <PersonalitySlide key="personality" personality={personality} />,
    <UsageSlide key="usage" sessions={sessions} />,
    <ShareSlide key="share" personality={personality} stats={stats} codingLabel={codingTime.label} topModel={topModel} />,
  ]

  const canPrev = slideIndex > 0
  const canNext = slideIndex < slides.length - 1

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault()
      if (canNext) setSlideIndex((i) => i + 1)
    }
    if (e.key === 'ArrowLeft') {
      if (canPrev) setSlideIndex((i) => i - 1)
    }
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <AnimatePresence mode="wait">
        {slides[slideIndex]}
      </AnimatePresence>

      {/* Navigation */}
      <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-4 z-10">
        <button
          onClick={() => canPrev && setSlideIndex((i) => i - 1)}
          disabled={!canPrev}
          className="p-2 rounded-full bg-white/5 text-text hover:bg-white/10 transition-colors disabled:opacity-20"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlideIndex(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === slideIndex ? 'bg-accent w-6' : 'bg-white/15 hover:bg-white/25'
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => canNext && setSlideIndex((i) => i + 1)}
          disabled={!canNext}
          className="p-2 rounded-full bg-white/5 text-text hover:bg-white/10 transition-colors disabled:opacity-20"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/5 text-text hover:bg-white/10 transition-colors z-10"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Progress */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/5 z-10">
        <div
          className="h-full bg-accent/50 transition-all duration-500"
          style={{ width: `${((slideIndex + 1) / slides.length) * 100}%` }}
        />
      </div>
    </div>
  )
}
