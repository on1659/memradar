import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Lightbulb, TrendingUp } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { GrowthStats } from '../../types'
import {
  buildPromptCoaching,
  type CoachingInsight,
  LOW_STRUCTURED_MAX_RATE,
} from '../../lib/promptCoaching'

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

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 월 키("2026-06") → 사람 친화 표기. 형식이 어긋나면 원본 그대로 (내부용어 노출 방지). */
function formatMonth(monthKey: string, isKorean: boolean): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return monthKey
  const year = m[1]
  const mon = Number(m[2])
  if (mon < 1 || mon > 12) return monthKey
  return isKorean ? `${year}년 ${mon}월` : `${MONTHS_EN[mon - 1]} ${year}`
}

interface ImprovingView {
  firstMonthLabel: string
  lastMonthLabel: string
  firstAvg: number
  lastAvg: number
  firstSkills: number
  lastSkills: number
  lengthRose: boolean
  skillsRose: boolean
  structureLow: boolean
}

/**
 * improving 카피의 실측 근거 — skillCurve 의 첫/끝 월 실제값에서 도출 (하드코딩 0).
 * 첫 월이 Codex 전용이면 uniqueSkills 0 → "새로 활용" 표현으로 자연스럽게 (미집계 사실을 숫자로 왜곡 금지).
 * 구조화가 함께 올랐다고 단정하지 않는다 — 실측상 길이·스킬만 오르고 구조는 낮은 편으로 유지.
 */
function improvingView(insight: CoachingInsight, growth: GrowthStats, isKorean: boolean): ImprovingView {
  const ev = insight.evidence
  const firstMonth = String(ev.firstMonth)
  const lastMonth = String(ev.lastMonth)
  const firstEntry = growth.skillCurve.find((e) => e.month === firstMonth)
  const lastEntry = growth.skillCurve.find((e) => e.month === lastMonth)
  const firstAvg = firstEntry ? Math.round(firstEntry.avgWords) : 0
  const lastAvg = lastEntry ? Math.round(lastEntry.avgWords) : 0
  const firstSkills = firstEntry ? firstEntry.uniqueSkills : 0
  const lastSkills = lastEntry ? lastEntry.uniqueSkills : 0
  return {
    firstMonthLabel: formatMonth(firstMonth, isKorean),
    lastMonthLabel: formatMonth(lastMonth, isKorean),
    firstAvg,
    lastAvg,
    firstSkills,
    lastSkills,
    lengthRose: lastAvg > firstAvg,
    skillsRose: lastSkills > firstSkills,
    structureLow: lastEntry ? lastEntry.structured < LOW_STRUCTURED_MAX_RATE : false,
  }
}

/**
 * 카피 생성 — 일반 사용자가 이해할 수 있는 쉬운 말. evidence 의 실측 수치를 문장에 녹여
 * 바넘(보편 조언)을 방지한다. 내부 용어(기준·판정월·구조화 마커·A/B/C·%p 등) 노출 금지.
 * 사용자 프롬프트 원문 인용 금지 (마커 단어·숫자만 노출). 조언은 "~수 있어요" 톤.
 */
function insightCopy(insight: CoachingInsight, growth: GrowthStats, isKorean: boolean): InsightCopy {
  const ev = insight.evidence
  switch (insight.id) {
    case 'high-retry': {
      const pct = pct1(Number(ev.retryRate))
      return isKorean
        ? {
            headline: `AI 답변에 이어 "다시"·"아니"처럼 고쳐 달라고 한 게 ${ev.totalFollowups}번 중 ${ev.retryCount}번(${pct}%)이에요`,
            body: '처음 프롬프트에 원하는 결과와 조건을 미리 적어 두면 다시 고치는 일이 줄어요.',
          }
        : {
            headline: `Of ${ev.totalFollowups} follow-up messages, ${ev.retryCount} (${pct}%) started by asking to redo or fix the last answer`,
            body: 'Spelling out the result you want and any constraints in your first prompt cuts down on the back-and-forth.',
          }
    }
    case 'long-unstructured':
      return isKorean
        ? {
            headline: `프롬프트는 긴 편(평균 ${ev.avgWords}단어)인데, 항목을 나눠 쓴 경우는 드물어요`,
            body: '불릿(·)·번호(1. 2.)·"역할:"처럼 틀을 잡아 나눠 쓰면 빠뜨리는 게 줄어요.',
          }
        : {
            headline: `Your prompts run long (avg ${ev.avgWords} words) but rarely break things into parts`,
            body: 'Using bullets (·), numbers (1. 2.), or a "role:" line to split things up helps you leave less out.',
          }
    case 'short-prompts':
      return isKorean
        ? {
            headline: `최근 프롬프트가 평균 ${ev.avgWords}단어로 짧은 편이에요`,
            body: '파일 경로·원하는 결과·조건을 한 줄씩만 더 적어도 다시 묻는 일이 줄어요.',
          }
        : {
            headline: `Lately your prompts are short — avg ${ev.avgWords} words`,
            body: 'Just one extra line each for the file path, the result you want, and any constraints cuts down on re-asking.',
          }
    case 'low-skill-variety': {
      const n = Number(ev.uniqueSkills)
      return isKorean
        ? {
            headline: `최근 쓰는 슬래시 명령이 ${n}종으로 적은 편이에요`,
            body: '자주 하는 작업을 스킬로 만들어 두면 프롬프트가 짧아져요.',
          }
        : {
            headline: `Lately you're using only ${n} kind${n === 1 ? '' : 's'} of slash command`,
            body: 'Turning tasks you repeat into skills lets you write shorter prompts.',
          }
    }
    case 'improving': {
      // 길이·스킬 상승만 사실로 기술 — 구조화가 함께 올랐다는 단정 금지 (실측상 구조는 낮은 편 유지).
      const v = improvingView(insight, growth, isKorean)
      let body: string
      if (isKorean) {
        if (v.lengthRose && v.skillsRose) {
          body = `프롬프트가 평균 ${v.firstAvg}단어에서 ${v.lastAvg}단어로 길어지고, 쓰는 슬래시 명령도 다양해졌어요.`
        } else if (v.lengthRose) {
          body = `프롬프트가 평균 ${v.firstAvg}단어에서 ${v.lastAvg}단어로 더 길고 자세해졌어요.`
        } else if (v.skillsRose) {
          body = `쓰는 슬래시 명령이 ${v.lastSkills}가지로 다양해졌어요.`
        } else {
          // 폴백: 길이·스킬이 flat/하락이어도 실측 스냅샷을 남긴다 (구조화 상승 단정 금지, 바넘 방지)
          body =
            v.lastSkills > 0
              ? `프롬프트 평균 ${v.lastAvg}단어·슬래시 명령 ${v.lastSkills}가지로 꾸준히 다듬어 왔어요.`
              : `프롬프트를 평균 ${v.lastAvg}단어로 꾸준히 다듬어 왔어요.`
        }
        return { headline: `프롬프트 습관이 ${v.firstMonthLabel}보다 눈에 띄게 좋아졌어요`, body }
      }
      if (v.lengthRose && v.skillsRose) {
        body = `Your prompts grew from ${v.firstAvg} to ${v.lastAvg} words on average, and you use a wider range of slash commands.`
      } else if (v.lengthRose) {
        body = `Your prompts grew from ${v.firstAvg} to ${v.lastAvg} words on average — longer and more detailed.`
      } else if (v.skillsRose) {
        body = `You now use ${v.lastSkills} kinds of slash commands.`
      } else {
        // Fallback: keep the measured snapshot even when length/skills are flat/down (no structure-rose claim; anti-Barnum)
        body =
          v.lastSkills > 0
            ? `Your prompts now average ${v.lastAvg} words with ${v.lastSkills} kinds of slash commands, refined steadily.`
            : `Your prompts now average ${v.lastAvg} words, refined steadily.`
      }
      return { headline: `Your prompting has clearly improved since ${v.firstMonthLabel}`, body }
    }
    case 'low-retry': {
      const pct = pct1(Number(ev.retryRate))
      return isKorean
        ? {
            headline: `AI 답변 뒤에 고쳐 달라고 한 건 ${ev.totalFollowups}번 중 ${ev.retryCount}번(${pct}%)뿐이에요`,
            body: '한 번에 원하는 걸 잘 전달하는 편이에요.',
          }
        : {
            headline: `Only ${ev.retryCount} of ${ev.totalFollowups} follow-ups (${pct}%) asked to redo the last answer`,
            body: 'You tend to get your point across in one go.',
          }
    }
    case 'high-skill-variety':
      return isKorean
        ? {
            headline: `최근 슬래시 명령을 ${ev.uniqueSkills}가지나 활용했어요`,
            body: '작업에 맞는 도구를 다양하게 쓰고 있어요.',
          }
        : {
            headline: `You used ${ev.uniqueSkills} different slash commands recently`,
            body: 'You reach for a good range of tools for the job.',
          }
  }
}

/**
 * 카드 펼침 상세 — 발화 근거를 쉬운 프로즈로. evidence 실측 수치 + (improving 은) skillCurve
 * 첫/끝 월 실제값을 문장에 녹인다 (하드코딩 0). 내부 용어·임계값·A/B/C·✓ 표기 금지.
 */
function insightDetail(insight: CoachingInsight, growth: GrowthStats, isKorean: boolean): string {
  const ev = insight.evidence
  switch (insight.id) {
    case 'high-retry': {
      const pct = pct1(Number(ev.retryRate))
      const marker = String(ev.topMarker)
      if (isKorean) {
        const top = marker ? ` 특히 "${marker}"로 시작한 경우가 ${ev.topMarkerCount}번으로 가장 많았어요.` : ''
        return `AI가 답한 뒤 이어서 보낸 질문이 ${ev.totalFollowups}번 있었는데, 그중 ${ev.retryCount}번(${pct}%)은 방금 답을 고쳐 달라는 말로 시작했어요.${top} 처음 프롬프트에 원하는 결과와 조건을 미리 적어 두면 이런 되돌리기가 줄어요.`
      }
      const top = marker ? ` The most common opener was "${marker}", which showed up ${ev.topMarkerCount} times.` : ''
      return `You sent ${ev.totalFollowups} follow-up messages after an answer, and ${ev.retryCount} of them (${pct}%) started by asking to fix or redo it.${top} Stating the result you want and your constraints in the first prompt reduces these redo loops.`
    }
    case 'long-unstructured': {
      const structN = pct0(Number(ev.structuredRate))
      const monthLabel = formatMonth(String(ev.month), isKorean)
      return isKorean
        ? `${monthLabel}에 쓴 프롬프트는 평균 ${ev.avgWords}단어로 긴 편이었어요. 그중 불릿(·)·번호(1. 2.)·"역할:" 같은 틀을 쓴 건 100개 중 ${structN}개뿐이었어요. 길게 쓸수록 항목을 나눠 주면 빠뜨리는 게 줄어요.`
        : `In ${monthLabel} your prompts averaged ${ev.avgWords} words — fairly long. Of those, only about ${structN} in 100 used any structure like bullets (·), numbers (1. 2.), or a "role:" line. The longer a prompt gets, the more splitting it into parts helps you not miss things.`
    }
    case 'short-prompts': {
      const monthLabel = formatMonth(String(ev.month), isKorean)
      return isKorean
        ? `${monthLabel}에 쓴 프롬프트가 평균 ${ev.avgWords}단어로 짧은 편이었어요. 파일 경로·원하는 결과·조건을 한 줄씩만 더 적어도 AI가 다시 물어보는 일이 줄어요.`
        : `In ${monthLabel} your prompts averaged ${ev.avgWords} words — on the short side. Adding just one line each for the file path, the result you want, and any constraints cuts down on the assistant re-asking.`
    }
    case 'low-skill-variety': {
      const n = Number(ev.uniqueSkills)
      const monthLabel = formatMonth(String(ev.month), isKorean)
      return isKorean
        ? `${monthLabel}에 쓴 슬래시 명령(/로 시작하는 명령)이 ${n}종뿐이었어요. 반복하는 작업을 스킬로 만들어 두면 매번 길게 설명하지 않고 명령 하나로 부를 수 있어요.`
        : `In ${monthLabel} you used only ${n} kind${n === 1 ? '' : 's'} of slash command (commands starting with /). If you turn a task you repeat into a skill, you can call it with one command instead of re-explaining it each time.`
    }
    case 'improving': {
      const v = improvingView(insight, growth, isKorean)
      if (isKorean) {
        const grew: string[] = []
        if (v.lengthRose) grew.push(`프롬프트 평균 길이가 ${v.firstAvg}단어에서 ${v.lastAvg}단어로 늘었`)
        if (v.skillsRose) {
          grew.push(
            v.firstSkills === 0
              ? `슬래시 명령을 새로 ${v.lastSkills}가지 활용하게 됐`
              : `쓰는 슬래시 명령이 ${v.firstSkills}가지에서 ${v.lastSkills}가지로 늘었`,
          )
        }
        const caveat = v.structureLow ? ' 다만 항목을 나눠 쓰는 비율은 아직 낮은 편이에요.' : ''
        if (grew.length === 0) {
          // 폴백: 길이·스킬 flat/하락이어도 실측 스냅샷을 남긴다 (구조화 상승 단정 금지, 바넘 방지)
          const steady =
            v.lastSkills > 0
              ? `프롬프트 평균 ${v.lastAvg}단어·슬래시 명령 ${v.lastSkills}가지로 꾸준히 다듬어 왔어요`
              : `프롬프트를 평균 ${v.lastAvg}단어로 꾸준히 다듬어 왔어요`
          return `${v.firstMonthLabel}부터 ${v.lastMonthLabel} 사이에 ${steady}.${caveat}`
        }
        return `${v.firstMonthLabel}부터 ${v.lastMonthLabel} 사이에 ${grew.join('고, ')}어요.${caveat}`
      }
      const grew: string[] = []
      if (v.lengthRose) grew.push(`average prompt length grew from ${v.firstAvg} to ${v.lastAvg} words`)
      if (v.skillsRose) {
        grew.push(
          v.firstSkills === 0
            ? `you began using ${v.lastSkills} kinds of slash commands`
            : `the variety of slash commands you use grew from ${v.firstSkills} to ${v.lastSkills}`,
        )
      }
      const caveat = v.structureLow ? ' Splitting prompts into clear parts, though, is still uncommon.' : ''
      if (grew.length === 0) {
        // Fallback: keep the measured snapshot even when length/skills are flat/down (no structure-rose claim; anti-Barnum)
        const steady =
          v.lastSkills > 0
            ? `your prompts settled at an average of ${v.lastAvg} words with ${v.lastSkills} kinds of slash commands, refined steadily`
            : `your prompts settled at an average of ${v.lastAvg} words, refined steadily`
        return `Between ${v.firstMonthLabel} and ${v.lastMonthLabel}, ${steady}.${caveat}`
      }
      return `Between ${v.firstMonthLabel} and ${v.lastMonthLabel}, ${grew.join(', and ')}.${caveat}`
    }
    case 'low-retry': {
      const pct = pct1(Number(ev.retryRate))
      return isKorean
        ? `AI가 답한 뒤 이어서 보낸 질문 ${ev.totalFollowups}번 중, 방금 답을 고쳐 달라고 한 건 ${ev.retryCount}번(${pct}%)뿐이었어요. 원하는 걸 한 번에 잘 전달하고 있다는 뜻이에요.`
        : `Out of ${ev.totalFollowups} follow-up messages after an answer, only ${ev.retryCount} (${pct}%) asked to fix or redo it. That means you're getting your point across in one shot.`
    }
    case 'high-skill-variety': {
      const monthLabel = formatMonth(String(ev.month), isKorean)
      return isKorean
        ? `${monthLabel}에 슬래시 명령(/로 시작하는 명령)을 ${ev.uniqueSkills}가지나 썼어요. 작업에 맞는 도구를 골라 쓰고, 반복 작업을 스킬로 잘 나눠 두었다는 신호예요.`
        : `In ${monthLabel} you used ${ev.uniqueSkills} different slash commands (commands starting with /). That's a sign you pick the right tool for each task and have split repeated work into skills.`
    }
  }
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
  const copy = insightCopy(insight, growth, isKorean)
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
