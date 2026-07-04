import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Lightbulb, TrendingUp } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { GrowthStats } from '../../types'
import {
  buildPromptCoaching,
  type CoachingInsight,
  HIGH_RETRY_MIN_FOLLOWUPS,
  HIGH_RETRY_MIN_RATE,
  LOW_RETRY_MAX_RATE,
  LONG_PROMPT_MIN_AVG_WORDS,
  LOW_STRUCTURED_MAX_RATE,
  SHORT_PROMPT_MAX_AVG_WORDS,
  LOW_SKILL_VARIETY_MAX,
  HIGH_SKILL_VARIETY_MIN,
  IMPROVING_MIN_SCORE_DELTA,
} from '../../lib/promptCoaching'
// buildGrowth 와 동일 분모/클램프로 improving 의 A/B/C 분해를 재현 (하드코딩 금지 — _common.md L-10)
import { AVG_WORDS_NORMALIZER, UNIQUE_SKILLS_NORMALIZER, clamp01 } from '../../parser'

interface GrowthCoachingProps {
  growth: GrowthStats
}

interface InsightCopy {
  headline: string
  body: string
}

// 0~1 분수 → % 문자열 (변환은 UI에서만 — lessons/_common.md L-5)
const pct1 = (v: number): string => (v * 100).toFixed(1)
const pct0 = (v: number): string => (v * 100).toFixed(0)

/**
 * 카피 생성 — evidence 의 실제 수치만 삽입, 단정·보편 조언 금지 ("~수 있어요" 톤).
 * 사용자 프롬프트 원문 인용 금지 (마커 단어·숫자만 노출).
 */
function insightCopy(insight: CoachingInsight, isKorean: boolean): InsightCopy {
  const ev = insight.evidence
  switch (insight.id) {
    case 'high-retry': {
      const pct = pct1(Number(ev.retryRate))
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
      const structPct = pct0(Number(ev.structuredRate))
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
      // 합성 점수 사실 기술만 — 개별 지표(구조화/길이/스킬)가 각각 올랐다는 주장 금지
      // (합성 점수 상승은 일부 proxy 하락과 공존 가능 — 2026-07 실측에서 skills 7→1 반례 확인)
      return isKorean
        ? {
            headline: `숙련도 곡선이 첫 유효 월 대비 +${ev.scoreDeltaPp}%p 올랐어요`,
            body: `${ev.firstMonth} → ${ev.lastMonth} 구간 종합 점수(구조화·길이·스킬 다양성 합성) 기준이에요.`,
          }
        : {
            headline: `Skill curve up +${ev.scoreDeltaPp}%p since the first valid month`,
            body: `Based on the composite score (structure, length, and skill variety combined) from ${ev.firstMonth} to ${ev.lastMonth}.`,
          }
    case 'low-retry': {
      // 실측 수치만 — 정정률이 낮다는 사실 기술. 개별 지표 단정 금지.
      const pct = pct1(Number(ev.retryRate))
      return isKorean
        ? {
            headline: `후속 질문 ${ev.totalFollowups}회 중 정정은 ${ev.retryCount}회(${pct}%)뿐이에요`,
            body: '한 번에 정확히 지시하는 편이에요 — 정정 루프가 드뭅니다.',
          }
        : {
            headline: `Only ${ev.retryCount} of ${ev.totalFollowups} follow-ups (${pct}%) were corrections`,
            body: 'You tend to get it right in one shot — correction loops are rare.',
          }
    }
    case 'high-skill-variety':
      return isKorean
        ? {
            headline: `최근 달 slash command ${ev.uniqueSkills}종을 활용했어요`,
            body: '도구를 다양하게 씁니다 — 반복 작업을 스킬로 잘 나눠 두었어요.',
          }
        : {
            headline: `Used ${ev.uniqueSkills} slash command kinds in the latest month`,
            body: 'You use a wide range of tools — repeated tasks are well split into skills.',
          }
  }
}

/** improving A/B/C proxy 분해 — buildGrowth 의 score 공식과 동일 (source-aware 평균) */
function proxyLine(
  entry: GrowthStats['skillCurve'][number],
  isKorean: boolean,
): string {
  const a = entry.structured
  const b = clamp01(entry.avgWords / AVG_WORDS_NORMALIZER)
  const c = clamp01(entry.uniqueSkills / UNIQUE_SKILLS_NORMALIZER)
  const composite = entry.hasClaudeSession ? (a + b + c) / 3 : (a + b) / 2
  if (isKorean) {
    const parts = entry.hasClaudeSession
      ? `A 구조화 ${pct0(a)}% · B 길이 ${pct0(b)}% · C 다양성 ${pct0(c)}%`
      : `A 구조화 ${pct0(a)}% · B 길이 ${pct0(b)}% (Codex 월, C 제외)`
    return `${entry.month} — ${parts} → 종합 ${pct0(composite)}%`
  }
  const parts = entry.hasClaudeSession
    ? `A structure ${pct0(a)}% · B length ${pct0(b)}% · C variety ${pct0(c)}%`
    : `A structure ${pct0(a)}% · B length ${pct0(b)}% (Codex month, C excluded)`
  return `${entry.month} — ${parts} → composite ${pct0(composite)}%`
}

/**
 * 카드 펼침 상세 — 발화 조건을 실제값 vs 임계값으로 (임계는 promptCoaching export const,
 * improving A/B/C 는 parser export 분모/클램프로 재현 — 하드코딩 0). 마지막 줄은 "왜 떴나".
 */
function insightDetail(insight: CoachingInsight, growth: GrowthStats, isKorean: boolean): ReactNode {
  const ev = insight.evidence
  const conds: string[] = []
  let breakdown: ReactNode = null
  let why = ''

  switch (insight.id) {
    case 'high-retry':
      conds.push(
        isKorean
          ? `후속 질문 ${ev.totalFollowups}회 ≥ 기준 ${HIGH_RETRY_MIN_FOLLOWUPS}회 ✓`
          : `Follow-ups ${ev.totalFollowups} ≥ threshold ${HIGH_RETRY_MIN_FOLLOWUPS} ✓`,
        isKorean
          ? `정정률 ${pct1(Number(ev.retryRate))}% ≥ 기준 ${pct0(HIGH_RETRY_MIN_RATE)}% ✓`
          : `Correction rate ${pct1(Number(ev.retryRate))}% ≥ threshold ${pct0(HIGH_RETRY_MIN_RATE)}% ✓`,
      )
      why = isKorean
        ? '충분한 후속 질문 중 정정 비율이 기준을 넘어 코칭이 떴어요.'
        : 'Enough follow-ups, and the correction share cleared the threshold — that is why this tip fired.'
      break
    case 'long-unstructured':
      conds.push(
        isKorean ? `판정월 ${ev.month}` : `Judged month ${ev.month}`,
        isKorean
          ? `평균 ${ev.avgWords}단어 ≥ 기준 ${LONG_PROMPT_MIN_AVG_WORDS} ✓`
          : `Avg ${ev.avgWords} words ≥ threshold ${LONG_PROMPT_MIN_AVG_WORDS} ✓`,
        isKorean
          ? `구조화 ${pct1(Number(ev.structuredRate))}% < 기준 ${pct0(LOW_STRUCTURED_MAX_RATE)}% ✓`
          : `Structure ${pct1(Number(ev.structuredRate))}% < threshold ${pct0(LOW_STRUCTURED_MAX_RATE)}% ✓`,
      )
      why = isKorean
        ? '길게 쓰지만 구조화 마커가 드물어 코칭이 떴어요.'
        : 'Long prompts but few structure markers — that is why this tip fired.'
      break
    case 'short-prompts':
      conds.push(
        isKorean ? `판정월 ${ev.month}` : `Judged month ${ev.month}`,
        isKorean
          ? `평균 ${ev.avgWords}단어 < 기준 ${SHORT_PROMPT_MAX_AVG_WORDS} ✓`
          : `Avg ${ev.avgWords} words < threshold ${SHORT_PROMPT_MAX_AVG_WORDS} ✓`,
      )
      why = isKorean
        ? '최근 유효 월의 평균 길이가 짧아 코칭이 떴어요.'
        : 'The latest valid month averages short prompts — that is why this tip fired.'
      break
    case 'low-skill-variety':
      conds.push(
        isKorean ? `판정월 ${ev.month}` : `Judged month ${ev.month}`,
        isKorean
          ? `slash command ${ev.uniqueSkills}종 ≤ 기준 ${LOW_SKILL_VARIETY_MAX}종 ✓`
          : `${ev.uniqueSkills} slash command kinds ≤ threshold ${LOW_SKILL_VARIETY_MAX} ✓`,
      )
      why = isKorean
        ? '최근 Claude 월의 도구 다양성이 낮아 코칭이 떴어요.'
        : 'Low tool variety in the latest Claude month — that is why this tip fired.'
      break
    case 'improving': {
      conds.push(
        isKorean
          ? `판정 구간 ${ev.firstMonth} → ${ev.lastMonth}`
          : `Range ${ev.firstMonth} → ${ev.lastMonth}`,
        isKorean
          ? `종합 점수 +${ev.scoreDeltaPp}%p ≥ 기준 +${pct0(IMPROVING_MIN_SCORE_DELTA)}%p ✓`
          : `Composite +${ev.scoreDeltaPp}%p ≥ threshold +${pct0(IMPROVING_MIN_SCORE_DELTA)}%p ✓`,
      )
      const firstEntry = growth.skillCurve.find((e) => e.month === String(ev.firstMonth))
      const lastEntry = growth.skillCurve.find((e) => e.month === String(ev.lastMonth))
      if (firstEntry && lastEntry) {
        breakdown = (
          <div className="space-y-1 border-t border-border/40 pt-1.5 font-mono text-[10px] leading-relaxed text-text/60">
            <div>{proxyLine(firstEntry, isKorean)}</div>
            <div>{proxyLine(lastEntry, isKorean)}</div>
          </div>
        )
      }
      why = isKorean
        ? '첫 유효 월 대비 종합 점수가 기준 이상 올라 강점이에요.'
        : 'Composite score rose past the threshold since the first valid month — that is the strength.'
      break
    }
    case 'low-retry':
      conds.push(
        isKorean
          ? `후속 질문 ${ev.totalFollowups}회 ≥ 기준 ${HIGH_RETRY_MIN_FOLLOWUPS}회 ✓ (신호 충분)`
          : `Follow-ups ${ev.totalFollowups} ≥ threshold ${HIGH_RETRY_MIN_FOLLOWUPS} ✓ (enough signal)`,
        isKorean
          ? `정정률 ${pct1(Number(ev.retryRate))}% ≤ 기준 ${pct0(LOW_RETRY_MAX_RATE)}% ✓`
          : `Correction rate ${pct1(Number(ev.retryRate))}% ≤ threshold ${pct0(LOW_RETRY_MAX_RATE)}% ✓`,
      )
      why = isKorean
        ? '충분한 후속 질문 중에도 정정이 드물어 강점이에요.'
        : 'Even across many follow-ups, corrections stay rare — that is the strength.'
      break
    case 'high-skill-variety':
      conds.push(
        isKorean ? `판정월 ${ev.month}` : `Judged month ${ev.month}`,
        isKorean
          ? `slash command ${ev.uniqueSkills}종 ≥ 기준 ${HIGH_SKILL_VARIETY_MIN}종 ✓`
          : `${ev.uniqueSkills} slash command kinds ≥ threshold ${HIGH_SKILL_VARIETY_MIN} ✓`,
      )
      why = isKorean
        ? '최근 Claude 월의 도구 다양성이 높아 강점이에요.'
        : 'High tool variety in the latest Claude month — that is the strength.'
      break
  }

  return (
    <>
      {conds.map((line, i) => (
        <div key={i} className="tabular-nums">{line}</div>
      ))}
      {breakdown}
      <div className="border-t border-border/40 pt-1.5 text-text/50">{why}</div>
    </>
  )
}

/** 단일 인사이트 카드 — 로컬 useState 로 독립 펼침 (accordion). 기본 접힘. */
function InsightCard({
  insight,
  growth,
  isKorean,
}: {
  insight: CoachingInsight
  growth: GrowthStats
  isKorean: boolean
}) {
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
            <div className="mt-3 space-y-1.5 rounded-xl border border-border/60 bg-bg-hover/40 px-3.5 py-3 text-xs text-text/70">
              {insightDetail(insight, growth, isKorean)}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

/** 프롬프트 코칭 카드 — 성장 데이터에서 도출한 증거 기반 인사이트 (전폭) */
export function GrowthCoaching({ growth }: GrowthCoachingProps) {
  const { locale } = useI18n()
  const isKorean = locale === 'ko'
  // eligibility 기준 시각 — growth 변경 시점의 현재 시각이면 충분 (렌더마다 재계산 불필요)
  const insights = useMemo(() => buildPromptCoaching(growth, new Date()), [growth])

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
        <InsightCard key={insight.id} insight={insight} growth={growth} isKorean={isKorean} />
      ))}
    </ul>
  )
}
