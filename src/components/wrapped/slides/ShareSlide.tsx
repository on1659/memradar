import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { motion } from 'framer-motion'
import { Download, Share2 } from 'lucide-react'
import { SlideLayout, FadeInText } from './SlideLayout'
import type { PersonalityResult } from '../../../lib/personality'
import type { Stats } from '../../../types'

interface Props {
  personality: PersonalityResult
  stats: Stats
  codingLabel: string
  topModel: string
}

export function ShareSlide({ personality, stats, codingLabel, topModel }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)

  async function handleDownload() {
    if (!cardRef.current) return
    setSaving(true)
    try {
      const url = await toPng(cardRef.current, { pixelRatio: 2 })
      const a = document.createElement('a')
      a.href = url
      a.download = 'promptale-wrapped.png'
      a.click()
    } catch {
      // fallback: ignore
    }
    setSaving(false)
  }

  async function handleShare() {
    if (!cardRef.current) return
    setSaving(true)
    try {
      const url = await toPng(cardRef.current, { pixelRatio: 2 })
      const blob = await (await fetch(url)).blob()
      const file = new File([blob], 'promptale-wrapped.png', { type: 'image/png' })
      if (navigator.share) {
        await navigator.share({ files: [file], title: 'My Promptale Wrapped' })
      } else {
        handleDownload()
      }
    } catch {
      handleDownload()
    }
    setSaving(false)
  }

  return (
    <SlideLayout gradient="from-[#06060e] via-[#0c0818] to-[#06060e]">
      <FadeInText className="text-accent/60 text-sm tracking-widest uppercase mb-6">
        Share Your Promptale
      </FadeInText>

      {/* Shareable card */}
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="w-[340px] rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0c0c1a 0%, #10081e 50%, #0c0c1a 100%)',
          border: '1px solid rgba(123,108,246,0.2)',
          padding: '32px 28px',
        }}
      >
        <div className="text-center">
          <div className="text-xs text-accent/50 tracking-widest mb-4">✦ PROMPTALE WRAPPED</div>
          <div className="text-5xl mb-3">{personality.emoji}</div>
          <div className="text-2xl font-bold text-text-bright mb-1" style={{ fontFamily: "'Instrument Serif', serif" }}>
            {personality.title}
          </div>
          <div className="text-sm text-accent mb-6">{personality.subtitle}</div>

          <div className="grid grid-cols-2 gap-3 text-left">
            <div className="bg-white/5 rounded-lg p-3">
              <div className="text-[10px] text-text/40 mb-1">Sessions</div>
              <div className="text-lg font-bold text-text-bright">{stats.totalSessions}</div>
            </div>
            <div className="bg-white/5 rounded-lg p-3">
              <div className="text-[10px] text-text/40 mb-1">Messages</div>
              <div className="text-lg font-bold text-text-bright">{stats.totalMessages.toLocaleString()}</div>
            </div>
            <div className="bg-white/5 rounded-lg p-3">
              <div className="text-[10px] text-text/40 mb-1">Style</div>
              <div className="text-sm font-medium text-text-bright">{codingLabel}</div>
            </div>
            <div className="bg-white/5 rounded-lg p-3">
              <div className="text-[10px] text-text/40 mb-1">Model</div>
              <div className="text-sm font-medium text-text-bright truncate">{topModel}</div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 text-[10px] text-text/30">
            promptale.dev
          </div>
        </div>
      </motion.div>

      {/* Buttons */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="flex gap-3 mt-8"
      >
        <button
          onClick={handleDownload}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-dim transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          이미지 저장
        </button>
        <button
          onClick={handleShare}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-white/5 text-text-bright rounded-lg text-sm hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <Share2 className="w-4 h-4" />
          공유
        </button>
      </motion.div>
    </SlideLayout>
  )
}
