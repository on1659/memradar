import { useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { motion } from 'framer-motion'
import { Camera, Download, MessageCircle, Send, Share2, X } from 'lucide-react'
import { SlideLayout, FadeInText } from './SlideLayout'
import { shortModelName } from '../../../lib/modelNames'
import type { PersonalityResult, AxisKey } from '../../../lib/personality'
import type { Stats } from '../../../types'

interface Props {
  personality: PersonalityResult
  stats: Stats
  codingLabel: string
  topModel: string
  usageHeadline: string
}

type SharePlatform = 'threads'

export function ShareSlide({
  personality,
  stats,
  codingLabel,
  topModel,
  usageHeadline,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [comingSoonOpen, setComingSoonOpen] = useState(false)
  const [shareStatus, setShareStatus] = useState<string | null>(null)

  const axisOrder: AxisKey[] = ['style', 'scope', 'rhythm']
  const axisBarColors: Record<AxisKey, string> = {
    style: '#7b6cf6',
    scope: '#22d3ee',
    rhythm: '#f59e0b',
  }

  const publicShareUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://memradar.vercel.app/'
    const { protocol, hostname, origin } = window.location
    return protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1'
      ? 'https://memradar.vercel.app/'
      : origin
  }, [])

  const shareCaption = useMemo(
    () => [
      'My Memradar Wrapped',
      usageHeadline,
      `${personality.title} - ${personality.subtitle}`,
      personality.shareQuote,
    ].join('\n'),
    [personality.shareQuote, personality.subtitle, personality.title, usageHeadline]
  )

  async function exportCardDataUrl() {
    if (!cardRef.current) return null
    return toPng(cardRef.current, { pixelRatio: 2, cacheBust: true })
  }

  function triggerDownload(dataUrl: string, fileName: string) {
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = fileName
    link.click()
  }

  async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl)
    return response.blob()
  }

  function openComingSoon() {
    setShareMenuOpen(false)
    setComingSoonOpen(true)
  }

  async function handleDownload() {
    if (!cardRef.current) return

    setBusy(true)
    setShareMenuOpen(false)
    setComingSoonOpen(false)
    setShareStatus(null)

    try {
      const dataUrl = await exportCardDataUrl()
      if (!dataUrl) return
      triggerDownload(dataUrl, 'memradar-wrapped.png')
      setShareStatus('이미지를 저장했어요.')
    } catch {
      setShareStatus('이미지 저장 중 문제가 생겼어요. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function handlePlatformShare(platform: SharePlatform) {
    if (!cardRef.current) return

    setBusy(true)
    setShareMenuOpen(false)
    setComingSoonOpen(false)
    setShareStatus(null)

    try {
      const dataUrl = await exportCardDataUrl()
      if (!dataUrl) {
        setShareStatus('공유 이미지를 준비하지 못했어요. 다시 시도해 주세요.')
        return
      }

      const blob = await dataUrlToBlob(dataUrl)
      const file = new File([blob], 'memradar-wrapped.png', { type: 'image/png' })
      const fullText = `${shareCaption}\n${publicShareUrl}`

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: fullText })
          setShareStatus('공유를 마쳤어요.')
          return
        } catch {
          // If the native share sheet is canceled or unavailable, fall back to the web flow.
        }
      }

      triggerDownload(dataUrl, 'memradar-wrapped.png')

      const targetUrl = platform === 'threads'
        ? `https://www.threads.net/intent/post?text=${encodeURIComponent(fullText)}`
        : 'https://www.threads.net/'

      window.open(targetUrl, '_blank', 'noopener,noreferrer')
      setShareStatus('Threads용으로 이미지를 저장했어요. 열린 탭에서 업로드해 주세요.')
    } catch {
      setShareStatus('공유 준비 중 문제가 생겼어요. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SlideLayout gradient="from-[#06060e] via-[#0c0818] to-[#06060e]">
      <FadeInText className="mb-6 text-sm uppercase tracking-widest text-accent/60">
        Your Memradar Ending
      </FadeInText>

      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="w-[340px] overflow-hidden rounded-2xl"
        style={{
          background: 'linear-gradient(135deg, #0c0c1a 0%, #10081e 50%, #0c0c1a 100%)',
          border: '1px solid rgba(123,108,246,0.2)',
          padding: '32px 28px',
        }}
      >
        <div className="text-center">
          <div
            className="mb-4 text-xs tracking-widest text-accent/50"
            style={{ color: 'rgba(123,108,246,0.5)' }}
          >
            MEMRADAR WRAPPED
          </div>

          <div className="mb-3 text-5xl">{personality.emoji}</div>
          <div
            className="mb-1 text-2xl font-bold"
            style={{ fontFamily: "'Instrument Serif', serif", color: '#e8e6f0' }}
          >
            {personality.title}
          </div>
          <div className="mb-4 text-sm" style={{ color: '#7b6cf6' }}>
            {personality.subtitle}
          </div>

          <div
            style={{
              marginBottom: '12px',
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.05)',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                color: 'rgba(232,230,240,0.4)',
                marginBottom: '4px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Personality
            </div>
            <div style={{ fontSize: '12px', lineHeight: 1.45, color: '#e8e6f0' }}>
              {personality.shareQuote}
            </div>
          </div>

          <div
            style={{
              marginBottom: '16px',
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'rgba(123,108,246,0.1)',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                color: 'rgba(232,230,240,0.4)',
                marginBottom: '4px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Your Claude
            </div>
            <div style={{ fontSize: '12px', lineHeight: 1.45, color: '#e8e6f0' }}>
              {usageHeadline}
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            {axisOrder.map((key) => {
              const axis = personality.axes[key]
              const pct = Math.round(axis.value * 100)

              return (
                <div key={key} style={{ marginBottom: '8px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '10px',
                      marginBottom: '3px',
                    }}
                  >
                    <span style={{ color: axis.value < 0.5 ? '#e8e6f0' : 'rgba(232,230,240,0.35)' }}>
                      {axis.label[0]}
                    </span>
                    <span style={{ color: axis.value >= 0.5 ? '#e8e6f0' : 'rgba(232,230,240,0.35)' }}>
                      {axis.label[1]}
                    </span>
                  </div>
                  <div
                    style={{
                      height: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '3px',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        height: '100%',
                        borderRadius: '3px',
                        background: axisBarColors[key],
                        opacity: 0.6,
                        ...(pct >= 50
                          ? { left: '50%', width: `${pct - 50}%` }
                          : { right: '50%', width: `${50 - pct}%` }),
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: '50%',
                        width: '1px',
                        height: '100%',
                        background: 'rgba(255,255,255,0.15)',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-3 text-left">
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(232,230,240,0.4)', marginBottom: '4px' }}>
                Sessions
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#e8e6f0' }}>
                {stats.totalSessions}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(232,230,240,0.4)', marginBottom: '4px' }}>
                Messages
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#e8e6f0' }}>
                {stats.totalMessages.toLocaleString()}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(232,230,240,0.4)', marginBottom: '4px' }}>
                Style
              </div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#e8e6f0' }}>
                {codingLabel}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: 'rgba(232,230,240,0.4)', marginBottom: '4px' }}>
                Model
              </div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#e8e6f0',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {shortModelName(topModel)}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              fontSize: '10px',
              color: 'rgba(232,230,240,0.3)',
            }}
          >
            memradar.dev
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-6 flex items-center justify-center gap-3"
      >
        <button
          onClick={handleDownload}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-dim disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          이미지 저장
        </button>

        <button
          onClick={() => setShareMenuOpen(true)}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-white/5 px-5 py-2.5 text-sm text-text-bright transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          <Share2 className="h-4 w-4" />
          공유하기
        </button>
      </motion.div>

      {shareMenuOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-sm rounded-2xl border border-border bg-bg-card p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-text-bright">공유할 곳을 고르세요</div>
                <div className="mt-1 text-xs leading-relaxed text-text/45">
                  Threads는 바로 공유 준비가 가능하고, X와 Instagram은 개발 예정입니다.
                </div>
              </div>
              <button
                onClick={() => setShareMenuOpen(false)}
                className="rounded-lg p-2 text-text/60 transition-colors hover:bg-white/5 hover:text-text-bright"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                onClick={openComingSoon}
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3 text-left text-sm text-text-bright transition-colors hover:bg-white/10"
              >
                <span className="flex items-center gap-3">
                  <Send className="h-4 w-4" />
                  <span>X 공유</span>
                </span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-text/50">
                  개발중
                </span>
              </button>
              <button
                onClick={() => handlePlatformShare('threads')}
                className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-left text-sm text-text-bright transition-colors hover:bg-white/10"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Threads 공유</span>
              </button>
              <button
                onClick={openComingSoon}
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3 text-left text-sm text-text-bright transition-colors hover:bg-white/10"
              >
                <span className="flex items-center gap-3">
                  <Camera className="h-4 w-4" />
                  <span>Instagram 공유</span>
                </span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-text/50">
                  개발중
                </span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {comingSoonOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-xs rounded-2xl border border-border bg-bg-card p-5 text-center shadow-2xl"
          >
            <div className="text-base font-semibold text-text-bright">개발 예정입니다</div>
            <div className="mt-2 text-sm leading-relaxed text-text/50">
              X와 Instagram 공유는 곧 지원할게요. 지금은 Threads 공유를 사용해 주세요.
            </div>
            <button
              onClick={() => setComingSoonOpen(false)}
              className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-dim"
            >
              확인
            </button>
          </motion.div>
        </div>
      )}

      <FadeInText delay={0.95} className="mt-3 text-xs tracking-[0.24em] text-text/30">
        Made in 이더
      </FadeInText>

      <FadeInText delay={1} className="mt-3 min-h-[2.5rem] text-center text-xs leading-relaxed text-text/35">
        {shareStatus ?? '공유하기를 누르면 X, Threads, Instagram 중 하나를 고를 수 있어요.'}
      </FadeInText>
    </SlideLayout>
  )
}
