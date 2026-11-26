import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Lightbulb, TrendingUp } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { Session } from '../../types'
import { buildUsageCoaching, type UsageCoachingInsight } from '../../lib/usageCoaching'

interface UsageCoachingProps {
  sessions: Session[]
}

interface InsightCopy {
  headline: string
  body: string
  detail: string
}

// 0~1 분수 → % 문자열 (변환은 UI에서만 — lessons/_common.md L-5)
const pct0 = (v: number): string => (v * 100).toFixed(0)

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

/** 1달러 미만은 금액을 말하지 않는다 — 의미 없는 숫자로 겁주지 않기 */
function formatUsd(usd: number): string | null {
  if (usd < 1) return null
  return `$${usd >= 100 ? Math.round(usd).toLocaleString('en-US') : usd.toFixed(1)}`
}

/**
 * 카피 생성 — 일반 사용자가 이해할 수 있는 쉬운 말. evidence 의 실측 수치를 문장에 녹여
 * 바넘(보편 조언)을 방지한다. 내부 용어(임계값·TTL·rebuild 등) 노출 금지. 조언은 "~수 있어요" 톤.
 */
function insightCopy(insight: UsageCoachingInsight, isKorean: boolean): InsightCopy {
  const ev = insight.evidence
  switch (insight.id) {
    case 'idle-cache-rebuild': {
      const tokens = formatTokens(ev.tokens)
      const share = pct0(ev.share)
      const usd = formatUsd(ev.extraUsd)
      if (isKorean) {
        const cost = usd ? ` API 요금으로 치면 적어도 ${usd}쯤 더 든 셈이에요.` : ''
        return {
          headline: `한참 쉬었다 이어간 대화가 ${ev.count}번 — 그때마다 대화 전체를 처음부터 다시 읽혔어요`,
          body: '오래 쉬었다면 이어 쓰기보다 새 대화로 시작하거나, 쉬기 전에 /compact 로 줄여 두면 덜 새요.',
          detail: `AI는 방금 읽은 대화를 잠깐 기억해 두고 싸게 다시 써요. 그런데 한동안 요청이 없으면 그 기억이 사라져서, 다음 요청 때 대화 전체를 제값 주고 다시 읽어요. 이렇게 다시 읽힌 양이 ${tokens} 토큰으로, 새로 기억시킨 양 전체의 ${share}%였어요.${cost} 하던 일은 끊지 않고 이어서 끝내고, 자리를 오래 비울 땐 대화를 정리해 두는 습관이 도움이 돼요.`,
        }
      }
      const cost = usd ? ` At API prices that is at least ${usd} extra.` : ''
      return {
        headline: `You resumed a conversation after a long pause ${ev.count} times — each one re-read the whole conversation from scratch`,
        body: 'After a long break, starting a fresh conversation — or running /compact before you step away — wastes less.',
        detail: `The assistant briefly remembers what it just read and reuses it cheaply. After a quiet spell that memory expires, so the next request pays full price to re-read everything. That re-reading came to ${tokens} tokens — ${share}% of everything newly stored.${cost} Finishing a task in one stretch, and tidying the conversation before a long break, helps.`,
      }
    }
    case 'large-context': {
      const share = pct0(ev.largeShare)
      const avg = formatTokens(ev.avgContextTokens)
      const peak = formatTokens(ev.peakContextTokens)
      return isKorean
        ? {
            headline: `요청 ${ev.requests.toLocaleString('en-US')}번 중 ${share}%가 20만 토큰 넘는 대화를 통째로 싣고 갔어요`,
            body: '주제가 바뀌면 /clear 로 새로 시작하고, 길어지면 /compact 로 줄이면 매 요청이 가벼워져요.',
            detail: `대화가 길어질수록 요청 한 번마다 지금까지의 대화 전체가 같이 실려 가요. 요청당 평균 ${avg} 토큰, 가장 컸을 땐 ${peak} 토큰이었어요. 한 대화에 여러 일을 이어 붙이기보다 일 하나가 끝나면 새 대화로 넘어가면, 비용도 줄고 AI가 예전 내용에 끌려가는 일도 줄어요.`,
          }
        : {
            headline: `${share}% of your ${ev.requests.toLocaleString('en-US')} requests carried a conversation of over 200K tokens`,
            body: 'Starting fresh with /clear when the topic changes, or trimming with /compact, keeps each request light.',
            detail: `The longer a conversation runs, the more every request carries the whole thing along. Requests averaged ${avg} tokens and peaked at ${peak}. Moving to a new conversation once a task is done — instead of chaining tasks in one — cuts cost and keeps the assistant from being pulled toward old context.`,
          }
    }
    case 'top-tier-light-turns': {
      const share = pct0(ev.lightShare)
      return isKorean
        ? {
            headline: `가장 비싼 모델에게 시킨 일 ${ev.turns}번 중 ${ev.lightTurns}번(${share}%)은 가벼운 일이었어요`,
            body: '짧은 질문·간단한 확인은 /model 로 Sonnet·Haiku 에 맡기면 같은 한도로 더 오래 쓸 수 있어요.',
            detail: `답이 짧고 파일을 고치지도 않은 요청을 "가벼운 일"로 셌어요. 가장 비싼 모델(Fable·Opus)로 처리한 ${ev.turns}번 중 ${ev.lightTurns}번이 여기에 해당했어요. 설계·디버깅처럼 어려운 일에만 최상위 모델을 쓰고 나머지는 가벼운 모델로 돌리면 한도가 훨씬 천천히 닳아요.`,
          }
        : {
            headline: `${ev.lightTurns} of ${ev.turns} tasks (${share}%) you gave the most expensive models were light ones`,
            body: 'Handing short questions and quick checks to Sonnet or Haiku with /model stretches the same limit further.',
            detail: `A "light" task is one with a short answer and no file edits. Of ${ev.turns} tasks handled by the most expensive models (Fable, Opus), ${ev.lightTurns} qualified. Keeping the top models for hard work like design and debugging, and routing the rest to lighter ones, makes your limit last much longer.`,
          }
    }
    case 'cache-continuity': {
      const share = pct0(ev.share)
      return isKorean
        ? {
            headline: '하던 일을 끊지 않고 이어서 끝내는 편이에요',
            body: `쉬었다 돌아와 대화를 처음부터 다시 읽힌 양이 전체의 ${share}%뿐이에요.`,
            detail: `요청 ${ev.requests.toLocaleString('en-US')}번 동안, 오래 쉬었다 이어가서 대화 전체를 다시 읽힌 건 ${ev.count}번뿐이었어요. AI가 기억해 둔 대화를 거의 항상 싸게 다시 쓰고 있다는 뜻이에요.`,
          }
        : {
            headline: 'You tend to finish what you start in one stretch',
            body: `Only ${share}% of what you stored had to be re-read after coming back from a break.`,
            detail: `Across ${ev.requests.toLocaleString('en-US')} requests, only ${ev.count} resumed after a long pause and re-read the whole conversation. The assistant is almost always reusing what it already remembered, cheaply.`,
          }
    }
    case 'right-sized-model': {
      const share = pct0(ev.lightShare)
      return isKorean
        ? {
            headline: '비싼 모델을 무거운 일에만 쓰고 있어요',
            body: `가장 비싼 모델에게 시킨 일 ${ev.turns}번 중 가벼운 일은 ${ev.lightTurns}번(${share}%)뿐이에요.`,
            detail: `답이 짧고 파일을 고치지도 않은 요청을 "가벼운 일"로 셌어요. 최상위 모델(Fable·Opus)로 처리한 ${ev.turns}번 가운데 ${ev.lightTurns}번만 해당했어요. 모델을 일의 무게에 맞게 고르고 있다는 신호예요.`,
          }
        : {
            headline: 'You save the expensive models for heavy work',
            body: `Only ${ev.lightTurns} of ${ev.turns} tasks (${share}%) you gave the most expensive models were light ones.`,
            detail: `A "light" task is one with a short answer and no file edits. Of ${ev.turns} tasks handled by the top models (Fable, Opus), only ${ev.lightTurns} qualified — a sign you match the model to the weight of the job.`,
          }
    }
  }
}

/** 단일 인사이트 카드 — GrowthCoaching 의 카드와 같은 구조·클래스 (시각 일관성) */
function InsightCard({ insight, isKorean }: { insight: UsageCoachingInsight; isKorean: boolean }) {
  const [open, setOpen] = useState(false)
  const copy = insightCopy(insight, isKorean)
  const isPraise = insight.kind === 'praise'
  const Icon = isPraise ? TrendingUp : Lightbulb

  return (
    <li className="rounded-xl border border-border/60 bg-bg-hover/40 px-3.5 py-3">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
            isPraise ? 'bg-green/10 text-green' : 'bg-accent/10 text-accent'
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text-bright">{copy.headline}</div>
          <div className="mt-0.5 text-xs leading-relaxed text-text/70">{copy.body}</div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-2 flex items-center gap-1.5 rounded-full border border-border/40 bg-bg px-2.5 py-1 text-[10px] text-text/60 transition-colors hover:border-border hover:text-text"
          >
            <span>{isKorean ? '자세히' : 'Details'}</span>
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {open && (
            <div className="mt-3 rounded-xl border border-border/60 bg-bg-hover/40 px-3.5 py-3 text-xs leading-relaxed text-text/70">
              {copy.detail}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

/** 사용 습관 코칭 카드 — 캐시·컨텍스트·모델 선택에서 새는 곳을 실측 수치로 짚는다 (전폭) */
export function UsageCoaching({ sessions }: UsageCoachingProps) {
  const { locale } = useI18n()
  const isKorean = locale === 'ko'
  const insights = useMemo(() => buildUsageCoaching(sessions), [sessions])

  if (insights.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-text/40">
        {isKorean ? '아직 패턴이 모이는 중이에요' : 'Patterns are still accumulating'}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {insights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} isKorean={isKorean} />
      ))}
    </ul>
  )
}
