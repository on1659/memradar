import { useState } from 'react'
import { useI18n } from '../i18n'
import {
  STYLE_CUES,
  TYPE16_POLES,
  type CollabType16,
  type Type16Axis,
  type Type16Letter,
  type Type16Source,
} from '../lib/collabType16'
import { getSourceColor } from '../lib/tokenPricing'
import { NICKNAMES, POLE_LABEL, SOURCE_NAME, type16Nickname } from './collabType16Copy'
import type { StyleCue } from '../types'

interface CollabType16HeroProps {
  /** 판정된 소스만, 1건 이상 — 빈 배열이면 부르지 말 것 (Dashboard 가 기존 성향 카드로 대체한다) */
  results: CollabType16[]
  /** 소스 색(Claude amber · Codex indigo)의 명도를 맞추기 위한 현재 테마 */
  theme?: string
  /**
   * 차례로 보여 주는 연출용 — 지금까지 드러난 단계 수. 축 하나가 한 단계(근거 → 막대 → 글자),
   * 축을 다 지난 다음 단계에서 별명과 소개가 나온다. 생략하면 처음부터 전부 보인다 (대시보드).
   */
  revealed?: number
}

// 비율 → % 문자열 (변환은 UI에서만 — lessons/_common.md L-5)
const pct0 = (part: number, whole: number): string => (whole > 0 ? (part / whole) * 100 : 0).toFixed(0)
const num = (v: number): string => v.toLocaleString('en-US')

/** 상황별 비율을 보여 줄 최소 건수 — 이보다 적으면 한두 건에 휘둘린다 */
const CUE_MIN_SHOWN = 10

const CUE_LABEL: Record<StyleCue, [string, string]> = {
  frustration: ['짜증', 'frustration'],
  correction: ['지적', 'corrections'],
  worry: ['걱정', 'worry'],
  joy: ['기쁨', 'joy'],
  thanks: ['고마움', 'thanks'],
}

/** 소개 문장 조각 [ko, en] — 네 글자를 이으면 두 문장이 된다 (E/I + S/N, T/F + J/P) */
const LETTER_PHRASE: Record<Type16Letter, [string, string]> = {
  I: ['일은 혼자 끝까지 처리하고', 'Works things through alone'],
  E: ['일은 에이전트에게 나눠 맡기고', 'Hands work out to agents'],
  S: ['확인한 것으로 말해요.', 'and speaks from what it checked.'],
  N: ['짐작과 가능성으로 말해요.', 'and speaks from hunches.'],
  T: ['감정을 보이면 해결부터 가고', 'Goes straight to the fix when you show feelings'],
  F: ['감정을 보이면 마음부터 받고', 'Acknowledges your feelings first'],
  P: ['답은 질문과 선택지로 열어 둬요.', 'and leaves answers open with questions.'],
  J: ['답은 결론을 내리고 끝내요.', 'and closes answers with a decision.'],
}

/** 판정을 보류한 축의 소개 문장 조각 [ko, en] — 보류는 S/N·T/F 에만 생긴다 */
const UNDECIDED_PHRASE: Partial<Record<Type16Axis['id'], [string, string]>> = {
  sn: ['어떻게 말하는지는 아직 근거가 부족해요.', "and hasn't shown enough yet to tell how it speaks."],
  tf: ['감정에 어떻게 답하는지는 아직 알 수 없고', "Hasn't shown yet how it handles feelings"],
}

function description(result: CollabType16, isKorean: boolean): string {
  const i = isKorean ? 0 : 1
  const [ei, sn, tf, jp] = result.axes.map((axis) =>
    axis.letter === '?' ? (UNDECIDED_PHRASE[axis.id]?.[i] ?? '') : LETTER_PHRASE[axis.letter][i],
  )
  return isKorean ? `${ei}, ${sn} ${tf}, ${jp}` : `${ei} ${sn} ${tf} ${jp}`
}

/** 판정 근거 한 줄 — evidence 의 실측 수치만 (바넘 방지). 내부 용어·임계값 노출 금지. */
function evidenceLine(axis: Type16Axis, isKorean: boolean): string {
  const ev = axis.evidence
  if (axis.letter === '?') {
    const spoken = ev.verifiedAnswers + ev.guessAnswers
    if (axis.id === 'sn') {
      return isKorean ? `확인이나 짐작을 말한 답이 아직 ${num(spoken)}개예요` : `Only ${num(spoken)} answers cite a check or a guess so far`
    }
    return isKorean ? `감정이 드러난 요청이 아직 ${num(ev.cuedTurns)}번이에요` : `Only ${num(ev.cuedTurns)} emotional requests so far`
  }
  switch (axis.id) {
    case 'ei':
      return isKorean
        ? `요청 ${num(ev.turns)}번 중 ${num(ev.agentTurns)}번(${pct0(ev.agentTurns, ev.turns)}%)에서 에이전트를 불렀어요`
        : `Called agents in ${num(ev.agentTurns)} of ${num(ev.turns)} requests (${pct0(ev.agentTurns, ev.turns)}%)`
    case 'sn':
      return isKorean
        ? `확인했다고 말한 답 ${num(ev.verifiedAnswers)}개 · 짐작으로 말한 답 ${num(ev.guessAnswers)}개`
        : `${num(ev.verifiedAnswers)} answers cite a check · ${num(ev.guessAnswers)} speak from a guess`
    case 'tf': {
      const cues = STYLE_CUES.filter((cue) => ev[cue] >= CUE_MIN_SHOWN)
        .map((cue) => `${CUE_LABEL[cue][isKorean ? 0 : 1]} ${pct0(ev[`${cue}Received`], ev[cue])}%`)
        .join(' · ')
      const head = isKorean
        ? `감정이 드러난 요청 ${num(ev.cuedTurns)}번 중 ${num(ev.cuedReceived)}번(${pct0(ev.cuedReceived, ev.cuedTurns)}%)은 마음부터 받았어요`
        : `Acknowledged the feeling first in ${num(ev.cuedReceived)} of ${num(ev.cuedTurns)} emotional requests (${pct0(ev.cuedReceived, ev.cuedTurns)}%)`
      return cues ? `${head} — ${cues}` : head
    }
    case 'jp':
      return isKorean
        ? `답 ${num(ev.answers)}개 중 ${num(ev.askEndings)}개(${pct0(ev.askEndings, ev.answers)}%)를 질문이나 선택지로 끝냈어요`
        : `Ended ${num(ev.askEndings)} of ${num(ev.answers)} answers (${pct0(ev.askEndings, ev.answers)}%) with a question or options`
  }
}

function hedge(axis: Type16Axis, isKorean: boolean): string {
  if (axis.lowSample) return isKorean ? ' (판정하기엔 부족해요)' : ' (too few to call)'
  if (axis.borderline) return isKorean ? ' (반대쪽과 거의 반반)' : ' (nearly even with the other side)'
  return ''
}

/** 축 막대 — 기존 성향 카드의 축 막대와 같은 규격 (가운데에서 값 쪽으로 채움, 중앙 기준선) */
function AxisBar({ axis, color, isKorean, shown, staged }: { axis: Type16Axis; color: string; isKorean: boolean; shown: boolean; staged: boolean }) {
  const [left, right] = TYPE16_POLES[axis.id]
  const i = isKorean ? 0 : 1
  const pct = Math.round(axis.value * 100)
  const note = hedge(axis, isKorean)
  // 연출 중에는 근거 문장이 먼저 보이고, 막대가 차오른 뒤에 어느 쪽인지 밝아진다
  const poleClass = (active: boolean) =>
    `${active && shown ? 'font-semibold text-text-bright' : 'text-text/40'}${staged ? ' transition-colors duration-300 delay-700' : ''}`
  const fill = shown ? Math.abs(pct - 50) : 0

  return (
    <li className={`transition-opacity duration-500 ${shown ? 'opacity-100' : 'opacity-0'}`}>
      <div className="mb-1 flex justify-between gap-3 text-[11px]">
        <span className={poleClass(axis.letter === left)}>
          <span className="mr-1 font-bold">{left}</span>
          {POLE_LABEL[left][i]}
        </span>
        <span className={`text-right ${poleClass(axis.letter === right)}`}>
          {POLE_LABEL[right][i]}
          <span className="ml-1 font-bold">{right}</span>
        </span>
      </div>
      <div
        className="relative h-1.5 overflow-hidden rounded-full"
        style={{ background: 'color-mix(in srgb, var(--t-text-bright) 8%, transparent)' }}
        aria-hidden="true"
      >
        {axis.letter !== '?' && (
          <div
            className={`absolute top-0 h-full rounded-full transition-all duration-500${staged ? ' delay-300' : ''}`}
            style={
              axis.value >= 0.5
                ? { left: '50%', width: `${fill}%`, background: color, opacity: 0.6 }
                : { right: '50%', width: `${fill}%`, background: color, opacity: 0.6 }
            }
          />
        )}
        <div
          className="absolute left-1/2 top-0 h-full w-px"
          style={{ background: 'color-mix(in srgb, var(--t-border) 72%, transparent)' }}
        />
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-text/55">
        {evidenceLine(axis, isKorean)}
        {note && <span className="text-text/40">{note}</span>}
      </p>
    </li>
  )
}

/**
 * 대시보드 맨 위 성향 카드 자리의 본문 — "내 AI" 16유형.
 * 기존 성향 카드와 같은 뼈대(배지 → 큰 이름 → 소개 → 축 막대)를 따른다.
 * Claude·Codex 가 둘 다 판정되면 배지 옆 토글로 바꿔 본다.
 */
export function CollabType16Hero({ results, theme, revealed }: CollabType16HeroProps) {
  const { locale } = useI18n()
  const isKorean = locale === 'ko'
  const [selected, setSelected] = useState<Type16Source>(results[0].source)
  const result = results.find((r) => r.source === selected) ?? results[0]
  const color = getSourceColor(result.source, theme)
  // 별명은 네 글자가 모두 판정됐을 때만 붙인다
  const nickname = NICKNAMES[result.code]
  const staged = revealed !== undefined
  const step = revealed ?? Infinity
  // 별명·소개·토글은 네 축이 다 드러난 다음 단계에 나온다
  const finale = step > result.axes.length
  const finaleClass = `transition-all duration-700 ${finale ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`

  return (
    <div className="mx-auto w-full max-w-xl text-center">
      <div className="mb-4 flex items-center justify-center gap-2">
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
          style={{
            background: 'color-mix(in srgb, var(--t-accent) 10%, var(--t-bg-card))',
            color: 'color-mix(in srgb, var(--t-accent) 82%, var(--t-text-bright) 18%)',
          }}
        >
          {isKorean ? '내 AI 유형' : 'My AI Type'}
        </span>
        <div
          className={`inline-flex rounded-full border border-border/70 p-0.5 transition-opacity duration-700 ${finale ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          role="group"
          aria-label={isKorean ? 'AI 선택' : 'Choose AI'}
        >
          {results.map((r) => {
            const active = r.source === result.source
            const tone = getSourceColor(r.source, theme)
            return (
              <button
                key={r.source}
                type="button"
                onClick={() => setSelected(r.source)}
                aria-pressed={active}
                className="rounded-full px-2.5 py-0.5 text-[10px] font-medium text-text/50 transition-colors"
                style={active ? { color: tone.text, background: tone.soft, boxShadow: `inset 0 0 0 1px ${tone.border}` } : undefined}
              >
                {SOURCE_NAME[r.source]}
              </button>
            )
          })}
        </div>
      </div>

      <div
        className="mb-3 text-6xl font-bold leading-none tracking-[0.14em]"
        style={{ marginRight: '-0.14em' }}
        role="img"
        aria-label={isKorean ? `${SOURCE_NAME[result.source]} 추정 유형 ${result.code}` : `${SOURCE_NAME[result.source]} estimated type ${result.code}`}
      >
        {result.axes.map((axis, index) => {
          const landed = index < step
          return (
            <span key={axis.id} className={`relative inline-block ${axis.borderline || axis.lowSample ? 'text-text/45' : 'text-text-bright'}`}>
              {/* 글자는 자리를 지킨 채 숨어 있다가, 그 축의 근거와 막대가 나온 뒤에 내려앉는다 */}
              <span
                className="inline-block"
                style={{
                  opacity: landed ? 1 : 0,
                  transform: landed ? 'none' : 'translateY(-0.2em) scale(1.25)',
                  transition: staged
                    ? `opacity 350ms ease ${landed ? 700 : 0}ms, transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1) ${landed ? 700 : 0}ms`
                    : undefined,
                }}
              >
                {axis.letter}
              </span>
              {staged && (
                <span
                  className="absolute inset-0 text-text/20"
                  style={{ opacity: landed ? 0 : 1, transition: `opacity 250ms ease ${landed ? 700 : 0}ms` }}
                >
                  _
                </span>
              )}
            </span>
          )
        })}
      </div>
      <div className={finaleClass}>
        <h2 className={`${nickname ? 'mb-1' : 'mb-3'} text-3xl font-bold text-text-bright`}>
          {type16Nickname(result.code, isKorean)}
        </h2>
        {nickname && isKorean && <p className="mb-3 text-sm" style={{ color: color.text }}>{nickname[1]}</p>}
        <p className="mx-auto max-w-lg text-sm leading-relaxed text-text/70">{description(result, isKorean)}</p>
      </div>

      <ul className="mx-auto mt-6 w-full max-w-md space-y-4 text-left">
        {result.axes.map((axis, index) => (
          <AxisBar key={axis.id} axis={axis} color={color.text} isKorean={isKorean} shown={index < step} staged={staged} />
        ))}
      </ul>

      <p className={`mt-5 text-[11px] leading-relaxed text-text/40 transition-opacity duration-700 ${finale ? 'opacity-100' : 'opacity-0'}`}>
        {isKorean
          ? '로그로 추정한 "내 AI가 일하는 방식"이에요 — 모델에 내 설정이 더해진 결과예요. 성격 검사는 아니에요.'
          : 'Estimated from your logs — how your AI works, as the model plus your own settings. Not a personality test.'}
      </p>
    </div>
  )
}
