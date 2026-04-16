import { useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { motion } from 'framer-motion'
import { Camera, Download, LayoutDashboard, MessageCircle, Send, Share2, X } from 'lucide-react'
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
  onOpenDashboard?: () => void
}

type SharePlatform = 'threads'

export function ShareSlide({
  personality,
  stats,
  codingLabel,
  topModel,
  usageHeadline,
  onOpenDashboard,
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
      'My Memradar Code Report',
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
      triggerDownload(dataUrl, 'memradar-code-report.png')
      setShareStatus('이미지를 저장했어요.')
    } catch {
      setShareStatus('이미지 저장 중 문제가 생겼어요. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function copyImageToClipboard(blob: Blob): Promise<boolean> {
    try {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        return false
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      return true
    } catch {
      return false
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
      const file = new File([blob], 'memradar-code-report.png', { type: 'image/png' })
      const fullText = `${shareCaption}\n${publicShareUrl}`

      // Mobile / PWA: 네이티브 공유 시트에서 이미지를 직접 전달.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: fullText })
          setShareStatus('공유를 마쳤어요.')
          return
        } catch (err) {
          // 사용자가 공유 시트에서 취소한 경우엔 다른 동작을 추가로 하지 않음.
          if ((err as DOMException)?.name === 'AbortError') {
            setShareStatus(null)
            return
          }
          // 그 외 실패는 데스크톱 폴백으로 진행.
        }
      }

      // 데스크톱 폴백: 이미지를 클립보드로 복사 + 파일 저장 + Threads 탭 열기.
      const clipboardOK = await copyImageToClipboard(blob)
      if (!clipboardOK) {
        triggerDownload(dataUrl, 'memradar-code-report.png')
      }

      const targetUrl = platform === 'threads'
        ? `https://www.threads.net/intent/post?text=${encodeURIComponent(fullText)}`
        : 'https://www.threads.net/'

      const opened = window.open(targetUrl, '_blank', 'noopener,noreferrer')

      if (clipboardOK) {
        setShareStatus(
          opened
            ? '이미지를 클립보드에 복사했어요. 열린 Threads 창에 Ctrl+V(또는 ⌘+V)로 붙여넣어 주세요.'
            : '이미지를 클립보드에 복사했어요. Threads를 열어 Ctrl+V로 붙여넣어 주세요.'
        )
      } else {
        setShareStatus(
          opened
            ? 'Threads용 이미지를 저장했어요. 열린 탭의 작성창에 파일을 올려주세요.'
            : 'Threads용 이미지를 저장했어요. Threads를 열어 저장된 이미지를 올려주세요.'
        )
      }
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
        className="w-[356px] overflow-hidden rounded-[26px]"
        style={{
          background: 'linear-gradient(135deg, #0c0c1a 0%, #10081e 50%, #0c0c1a 100%)',
          border: '1px solid rgba(123,108,246,0.2)',
          padding: '28px 28px 24px',
        }}
      >
        <div className="text-center">
          <div className="mb-3 text-[48px] leading-none">{personality.emoji}</div>
          <div
            className="mb-1 text-[2.2rem] font-bold leading-none"
            style={{ fontFamily: "'Instrument Serif', serif", color: '#e8e6f0' }}
          >
            {personality.title}
          </div>
          <div className="mb-4 text-[15px]" style={{ color: '#7b6cf6' }}>
            {personality.subtitle}
          </div>

          <div
            style={{
              marginBottom: '16px',
              fontSize: '13px',
              lineHeight: 1.45,
              color: 'rgba(232,230,240,0.62)',
            }}
          >
            {usageHeadline}
          </div>

          <div style={{ marginBottom: '16px' }}>
            {axisOrder.map((key) => {
              const axis = personality.axes[key]
              const pct = Math.round(axis.value * 100)

              return (
                <div key={key} style={{ marginBottom: '10px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      marginBottom: '4px',
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
                      height: '7px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '4px',
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
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '13px' }}>
              <div style={{ fontSize: '11px', color: 'rgba(232,230,240,0.4)', marginBottom: '4px' }}>
                Sessions
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#e8e6f0' }}>
                {stats.totalSessions}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '13px' }}>
              <div style={{ fontSize: '11px', color: 'rgba(232,230,240,0.4)', marginBottom: '4px' }}>
                Messages
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#e8e6f0' }}>
                {stats.totalMessages.toLocaleString()}
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              marginTop: '10px',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                borderRadius: '10px',
                padding: '11px 13px',
                background: 'rgba(123,108,246,0.08)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'rgba(232,230,240,0.38)', marginBottom: '4px' }}>
                Rhythm
              </div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#e8e6f0',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {codingLabel}
              </div>
            </div>
            <div
              style={{
                borderRadius: '10px',
                padding: '11px 13px',
                background: 'rgba(255,255,255,0.05)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'rgba(232,230,240,0.38)', marginBottom: '4px' }}>
                Top Model
              </div>
              <div
                style={{
                  fontSize: '13px',
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
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-8 flex items-center justify-center gap-3"
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

      {onOpenDashboard && (
        <FadeInText delay={0.9} className="mt-5">
          <button
            onClick={onOpenDashboard}
            data-wrapped-control="true"
            className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-xs font-semibold text-text-bright transition-all hover:-translate-y-0.5 hover:border-accent/55 hover:bg-accent/20"
          >
            <LayoutDashboard className="h-4 w-4 text-accent" />
            <span>전체 보기로 돌아가기</span>
          </button>
        </FadeInText>
      )}

      {shareMenuOpen && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm"
          data-wrapped-control="true"
          onClick={() => setShareMenuOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-sm rounded-2xl border border-border bg-bg-card p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-text-bright">공유할 곳을 고르세요</div>
                <div className="mt-1 text-xs leading-relaxed text-text/45">
                  Threads는 이미지를 클립보드에 복사해 드려요. 열린 작성창에 붙여넣기만 하면 끝! X와 Instagram은 개발 예정입니다.
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
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
          data-wrapped-control="true"
          onClick={() => setComingSoonOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-xs rounded-2xl border border-border bg-bg-card p-5 text-center shadow-2xl"
            onClick={(event) => event.stopPropagation()}
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

      <FadeInText delay={0.95} className="mt-6 text-xs tracking-[0.24em] text-text/30">
        Made in 이더
      </FadeInText>

      <FadeInText delay={1} className="mt-5 min-h-[3.5rem] pb-10 text-center text-xs leading-relaxed text-text/35">
        {shareStatus ?? '공유하기를 누르면 X, Threads, Instagram 중 하나를 고를 수 있어요.'}
      </FadeInText>
    </SlideLayout>
  )
}
