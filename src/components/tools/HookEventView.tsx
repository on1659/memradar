import { useState } from 'react'
import { ChevronRight, Webhook } from 'lucide-react'
import type { HookExecutionDetail } from '../../types'
import { Truncate } from './Truncate'
import { useSecretMask } from '../../lib/secretMask'
import { SecretMaskToggle } from '../SecretMaskToggle'

// 훅 실행 상세 행 (docs/goal/hooks-analytics.md D6) — ToolCallView 패턴.
// 접힌 행 = 결과 배지 + exitCode + durationMs. 펼침 = command/stdout/stderr/
// additionalContext 를 maskSecrets 먼저 적용한 뒤 Truncate (구조적 프라이버시).
// 서버 tier-2(heavy parse) 전용 데이터 — Session 에 절대 할당되지 않는다.

interface HookEventViewProps {
  event: HookExecutionDetail
}

function outcomeMeta(event: HookExecutionDetail): { label: string; cls: string } {
  switch (event.outcome) {
    case 'denied':
      return { label: '차단', cls: 'border-amber/30 bg-amber/10 text-amber' }
    case 'blocking_error':
      return { label: '실패', cls: 'border-rose/30 bg-rose/10 text-rose' }
    case 'non_blocking_error':
      return { label: '실패(비차단)', cls: 'border-rose/25 bg-rose/8 text-rose/85' }
    case 'cancelled':
      return event.timedOut
        ? { label: '시간초과', cls: 'border-amber/30 bg-amber/10 text-amber' }
        : { label: '취소', cls: 'border-text/20 bg-text/8 text-text/60' }
    case 'success':
    default:
      return { label: '성공', cls: 'border-green/25 bg-green/10 text-green/80' }
  }
}

function fmtDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}

// 페이로드 표면 — 렌더 직전 마스킹 + 리빌 토글. 복사도 마스킹본을 직렬화한다.
function MaskedField({ label, text, maxChars }: { label: string; text: string; maxChars: number }) {
  const { masked, hitCount } = useSecretMask(text)
  const [revealed, setRevealed] = useState(false)
  if (!text) return null
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-text/35">{label}</div>
      <Truncate text={revealed ? text : masked} maxChars={maxChars} />
      <SecretMaskToggle hitCount={hitCount} revealed={revealed} onToggle={() => setRevealed((v) => !v)} />
    </div>
  )
}

export function HookEventView({ event }: HookEventViewProps) {
  const [expanded, setExpanded] = useState(false)
  const meta = outcomeMeta(event)
  const additionalContext =
    event.additionalContext && event.additionalContext.length > 0 ? event.additionalContext.join('\n\n') : ''
  const hasBody = !!(event.command || event.stdout || event.stderr || additionalContext)

  return (
    <div className="overflow-hidden rounded-md border border-violet/20 bg-violet/5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-violet/10 ${expanded ? 'border-b border-violet/15' : ''}`}
      >
        <ChevronRight className={`h-3 w-3 flex-shrink-0 text-text/40 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <Webhook className="h-3 w-3 flex-shrink-0 text-violet" aria-hidden="true" />
        <span className="flex-shrink-0 font-mono text-[10px] font-semibold text-text-bright">{event.hookName}</span>
        <span className="flex-shrink-0 rounded border border-text/12 px-1 py-px text-[9px] text-text/45">{event.hookEvent}</span>
        <span className={`flex-shrink-0 rounded-full border px-1.5 py-px text-[9px] font-medium ${meta.cls}`}>{meta.label}</span>
        <span className="ml-auto flex flex-shrink-0 items-center gap-2 text-[9px] tabular-nums text-text/40">
          {typeof event.exitCode === 'number' && <span>exit {event.exitCode}</span>}
          {typeof event.durationMs === 'number' && <span>{fmtDuration(event.durationMs)}</span>}
        </span>
      </button>
      {expanded && (
        <div className="space-y-2 px-2.5 py-2">
          <MaskedField label="command" text={event.command} maxChars={600} />
          <MaskedField label="stdout" text={event.stdout ?? ''} maxChars={1200} />
          <MaskedField label="stderr" text={event.stderr ?? ''} maxChars={1200} />
          <MaskedField label="additional context" text={additionalContext} maxChars={1200} />
          {!hasBody && <p className="text-[10px] text-text/35">표시할 상세 내용이 없어요</p>}
        </div>
      )}
    </div>
  )
}
