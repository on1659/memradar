import { useMemo } from 'react'
import { Lightbulb, TrendingUp } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { GrowthStats } from '../../types'
import { buildPromptCoaching, type CoachingInsight } from '../../lib/promptCoaching'

interface GrowthCoachingProps {
  growth: GrowthStats
}

interface InsightCopy {
  headline: string
  body: string
}

/**
 * 카피 생성 — evidence 의 실제 수치만 삽입, 단정·보편 조언 금지 ("~수 있어요" 톤).
 * 사용자 프롬프트 원문 인용 금지 (마커 단어·숫자만 노출).
 */
function insightCopy(insight: CoachingInsight, isKorean: boolean): InsightCopy {
  const ev = insight.evidence
  switch (insight.id) {
    case 'high-retry': {
      const pct = (Number(ev.retryRate) * 100).toFixed(1)
      return isKorean
        ? {
            headline: `후속 질문 ${ev.totalFollowups}회 중 ${ev.retryCount}회(${pct}%)가 정정으로 시작했어요`,
            body: `"${ev.topMarker}" 같은 정정이 ${ev.topMarkerCount}회 — 첫 프롬프트에 기대 결과와 제약 조건을 명시하면 정정 루프가 줄어들 수 있어요.`,
          }
        : {
            headline: `${ev.retryCount} of ${ev.totalFollowups} follow-ups (${pct}%) started with a correction`,
            body: `"${ev.topMarker}" appeared ${ev.topMarkerCount} times — stating the expected output and constraints up front may reduce correction loops.`,
          }
    }
    case 'long-unstructured': {
      const structPct = (Number(ev.structuredRate) * 100).toFixed(0)
      return isKorean
        ? {
            headline: `긴 프롬프트(평균 ${ev.avgWords}단어)를 쓰지만 구조화 마커는 ${structPct}%뿐이에요`,
            body: '불릿·번호·역할 지정으로 항목을 나눠 쓰면 누락이 줄어들 수 있어요.',
          }
        : {
            headline: `Long prompts (avg ${ev.avgWords} words) but only ${structPct}% use structure markers`,
            body: 'Splitting items with bullets, numbers, or role statements may reduce omissions.',
          }
    }
    case 'short-prompts':
      return isKorean
        ? {
            headline: `최근 달 평균 ${ev.avgWords}단어의 짧은 프롬프트예요`,
            body: '파일 경로·기대 출력·제약을 한 줄씩 추가하면 재질문이 줄어들 수 있어요.',
          }
        : {
            headline: `Short prompts — avg ${ev.avgWords} words in the latest month`,
            body: 'Adding a line each for file paths, expected output, and constraints may reduce retries.',
          }
    case 'low-skill-variety':
      return isKorean
        ? {
            headline: `최근 달 slash command ${ev.uniqueSkills}종 사용이에요`,
            body: '반복 작업은 스킬로 만들면 프롬프트 자체가 짧아질 수 있어요.',
          }
        : {
            headline: `Only ${ev.uniqueSkills} slash command kinds used in the latest month`,
            body: 'Turning repeated tasks into skills may shorten your prompts.',
          }
    case 'improving':
      return isKorean
        ? {
            headline: `숙련도 곡선이 첫 유효 월 대비 +${ev.scoreDeltaPp}%p 올랐어요`,
            body: `${ev.firstMonth} → ${ev.lastMonth} 구간에서 구조화·길이·스킬 지표가 함께 올라간 추정이에요.`,
          }
        : {
            headline: `Skill curve up +${ev.scoreDeltaPp}%p since the first valid month`,
            body: `Structure, length, and skill metrics appear to have risen together from ${ev.firstMonth} to ${ev.lastMonth}.`,
          }
  }
}

/** 프롬프트 코칭 카드 — 성장 데이터에서 도출한 증거 기반 인사이트 (전폭) */
export function GrowthCoaching({ growth }: GrowthCoachingProps) {
  const { locale } = useI18n()
  const isKorean = locale === 'ko'
  const insights = useMemo(() => buildPromptCoaching(growth), [growth])

  if (insights.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-text/40">
        {isKorean ? '아직 패턴이 모이는 중이에요' : 'Patterns are still accumulating'}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {insights.map((insight) => {
        const copy = insightCopy(insight, isKorean)
        const isPraise = insight.kind === 'praise'
        const Icon = isPraise ? TrendingUp : Lightbulb
        return (
          <li key={insight.id} className="flex items-start gap-3 rounded-xl border border-border/60 bg-bg-hover/40 px-3.5 py-3">
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                isPraise ? 'bg-green/10 text-green' : 'bg-accent/10 text-accent'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text-bright">{copy.headline}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-text/70">{copy.body}</div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
