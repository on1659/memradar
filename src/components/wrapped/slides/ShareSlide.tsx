import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { motion } from 'framer-motion'
import { Download, Share2 } from 'lucide-react'
import { SlideLayout, FadeInText } from './SlideLayout'
import { shortModelName } from '../../../lib/modelNames'
import type { PersonalityResult, AxisKey } from '../../../lib/personality'
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
      a.download = 'memradar-wrapped.png'
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
      const file = new File([blob], 'memradar-wrapped.png', { type: 'image/png' })
      if (navigator.share) {
        await navigator.share({ files: [file], title: 'My Memradar Wrapped' })
      } else {
        handleDownload()
      }
    } catch {
      handleDownload()
    }
    setSaving(false)
  }

  const axisOrder: AxisKey[] = ['style', 'scope', 'rhythm']
  const axisBarColors: Record<AxisKey, string> = {
    style: '#7b6cf6',
    scope: '#22d3ee',
    rhythm: '#f59e0b',
  }

  return (
    <SlideLayout gradient="from-[#06060e] via-[#0c0818] to-[#06060e]">
      <FadeInText className="text-accent/60 text-sm tracking-widest uppercase mb-6">
        Share Your Memradar
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
          <div className="text-xs text-accent/50 tracking-widest mb-4" style={{ color: 'rgba(123,108,246,0.5)' }}>✦ MEMRADAR WRAPPED</div>
          <div className="text-5xl mb-3">{personality.emoji}</div>
          <div className="text-2xl font-bold mb-1" style={{ fontFamily: "'Instrument Serif', serif", color: '#e8e6f0' }}>
            {personality.title}
          </div>
          <div className="text-sm mb-5" style={{ color: '#7b6cf6' }}>{personality.subtitle}</div>

          {/* Axis mini bars */}
          <div style={{ marginBottom: '16px' }}>
            {axisOrder.map((key) => {
              const axis = personality.axes[key]
              const pct = Math.round(axis.value * 100)
              return (
                <div key={key} style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '3px' }}>
                    <span style={{ color: axis.value < 0.5 ? '#e8e6f0' : 'rgba(232,230,240,0.35)' }}>{axis.label[0]}</span>
                    <span style={{ color: axis.value >= 0.5 ? '#e8e6f0' : 'rgba(232,230,240,0.35)' }}>{axis.label[1]}</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      height: '100%',
                      borderRadius: '3px',
                      background: axisBarColors[key],
                      opacity: 0.6,
                      ...(pct >= 50
                        ? { left: '50%', width: `${pct - 50}%` }
                        : { right: '50%', width: `${50 - pct}%` }
                      ),
                    }} />
                    <div style={{ position: 'absolute', top: 0, left: '50%', width: '1px', height: '100%', background: 'rgba(255,255,255,0.15)' }} />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-3 text-left">
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(232,230,240,0.4)', marginBottom: '4px' }}>Sessions</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#e8e6f0' }}>{stats.totalSessions}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(232,230,240,0.4)', marginBottom: '4px' }}>Messages</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#e8e6f0' }}>{stats.totalMessages.toLocaleString()}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(232,230,240,0.4)', marginBottom: '4px' }}>Style</div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#e8e6f0' }}>{codingLabel}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(232,230,240,0.4)', marginBottom: '4px' }}>Model</div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#e8e6f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortModelName(topModel)}</div>
            </div>
          </div>

          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '10px', color: 'rgba(232,230,240,0.3)' }}>
            memradar.dev
          </div>
        </div>
      </motion.div>

      {/* Share quote */}
      <FadeInText delay={0.6} className="text-sm text-text/40 mt-4 italic">
        "{personality.shareQuote}"
      </FadeInText>

      {/* Buttons */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="flex gap-3 mt-6"
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
