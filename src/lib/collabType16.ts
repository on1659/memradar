import type { Session, SessionSource, SessionStyleSignals, StyleCue } from '../types'

/**
 * AI 협업 16유형 — "내 AI" 의 네 글자(E/I · S/N · T/F · J/P) 추정.
 *
 * React 없는 순수 함수 (usageCoaching.ts / collabFingerprint.ts 패턴). LLM/네트워크 호출 없음.
 * 문자열 카피는 리턴하지 않는다 — 글자 + 수치 evidence 만 리턴하고 ko/en 카피는 UI 에서 분기한다.
 *
 * 재는 대상은 사람이 아니라 **AI 의 행동**이다. 같은 모델도 사용자의 설정(CLAUDE.md·AGENTS.md)에
 * 따라 다르게 일하므로 "모델 + 내 설정" 이 곧 내 AI 다. 그래서 Claude 와 Codex 를 따로 판정한다.
 *
 * 네 축 — MBTI 각 축의 원래 뜻을 AI 의 행동으로 옮긴 것:
 *  - E/I (에너지가 밖으로 가나, 안에서 도나)   ← 일을 에이전트에게 나눠 맡기는 비율
 *  - S/N (사실을 보나, 가능성을 보나)          ← 답에서 확인으로 말하나, 추측으로 말하나
 *  - T/F (원칙이 먼저냐, 사람이 먼저냐)        ← 사용자가 감정·반응을 드러냈을 때 먼저 받아 주나
 *  - J/P (결정하고 닫나, 열어 두나)            ← 답을 결론으로 끝내나, 질문·선택지로 끝내나
 * 재료는 Session.styleSignals (cli/lib/styleSignals.mjs — 병합 이전 raw 라인에서 센 정수).
 *
 * 이것은 "AI 가 일하는 방식" 추정이지 심리검사 결과가 아니다 — UI 는 상시 "추정" 부제를 붙인다.
 * 바넘 방지: 모든 글자에 실측 수치를 동반하고, 중앙에 가까운 축은 borderline 으로 표시한다.
 * 근거가 모자란 축은 글자를 붙이지 않는다('?') — 관측이 0건인데 중앙값으로 N·F 가 붙던 것을 막는다.
 */

// ── 임계값 (모두 잠정값 — 한 사용자의 Claude·Codex 실측으로만 잡았다) ──────────
export const MIN_TYPE16_ANSWERS = 50        // 최종 답이 이보다 적으면 판정하지 않는다
export const MIN_SPOKEN_ANSWERS = 20        // 확인·추측 표현이 든 답이 이보다 적으면 S/N 은 판정 보류
export const MIN_CUED_TURNS = 20            // 감정이 드러난 요청이 이보다 적으면 T/F 는 판정 보류
export const AGENT_MID_RATE = 0.15          // 에이전트를 부른 요청 비율이 이 값이면 E/I 중앙 (실측 Claude 4% · Codex 39%)
export const ASK_MID_RATE = 0.15            // 질문으로 끝난 답 비율이 이 값이면 J/P 중앙 (실측 Claude 25% · Codex 5%)
export const TYPE16_BORDERLINE_BAND = 0.05  // 0.5 ± 이 범위면 "거의 반반"

export type Type16Source = Extract<SessionSource, 'claude' | 'codex'>
export type Type16AxisId = 'ei' | 'sn' | 'tf' | 'jp'
export type Type16Letter = 'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P'

/** 축별 [왼쪽 글자, 오른쪽 글자] — value ≥ 0.5 면 오른쪽 */
export const TYPE16_POLES: Record<Type16AxisId, [Type16Letter, Type16Letter]> = {
  ei: ['I', 'E'],
  sn: ['S', 'N'],
  tf: ['T', 'F'],
  jp: ['P', 'J'],
}

/** 코드 표기 순서 (E/I → S/N → T/F → J/P) */
export const TYPE16_AXIS_ORDER: Type16AxisId[] = ['ei', 'sn', 'tf', 'jp']

/** T/F 상황 표기 순서 */
export const STYLE_CUES: StyleCue[] = ['frustration', 'correction', 'worry', 'joy', 'thanks']

export interface Type16Axis {
  id: Type16AxisId
  /** 근거가 모자라면 '?' (lowSample) */
  letter: Type16Letter | '?'
  /** 0~1 — 0.5 이상이면 오른쪽 글자(E·N·F·J) */
  value: number
  /** 중앙에 가까워 어느 쪽이라 단정하기 어렵다 */
  borderline: boolean
  /** 이 축의 근거가 되는 표본이 적어 판정을 보류했다 */
  lowSample: boolean
  /** 카피에 삽입할 실측 수치만 — 본문·경로 인용 금지 */
  evidence: Record<string, number>
}

export interface CollabType16 {
  source: Type16Source
  /** 네 글자 코드 (예: 'ISTP') — 보류한 축은 '?' (예: 'I??J') */
  code: string
  /** 판정에 쓴 최종 답 수 — 여러 AI 중 주로 쓴 쪽을 고를 때 쓴다 */
  answers: number
  /** TYPE16_AXIS_ORDER 순서 */
  axes: Type16Axis[]
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function axis(id: Type16AxisId, value: number, evidence: Record<string, number>, lowSample = false): Type16Axis {
  const [left, right] = TYPE16_POLES[id]
  return {
    id,
    letter: lowSample ? '?' : value >= 0.5 ? right : left,
    value,
    borderline: Math.abs(value - 0.5) < TYPE16_BORDERLINE_BAND,
    lowSample,
    evidence,
  }
}

/** 한 소스의 styleSignals 합 — 신호가 붙은 세션이 없으면 null */
export function sumStyleSignals(
  sessions: readonly Pick<Session, 'source' | 'styleSignals'>[],
  source: Type16Source,
): SessionStyleSignals | null {
  let total: SessionStyleSignals | null = null
  for (const session of sessions) {
    const s = session.styleSignals
    if (session.source !== source || !s) continue
    if (!total) {
      total = {
        turns: 0, agentTurns: 0, answers: 0, askEndings: 0, guessAnswers: 0, verifiedAnswers: 0,
        cuedTurns: 0, cuedReceived: 0,
        cues: { frustration: [0, 0], joy: [0, 0], thanks: [0, 0], correction: [0, 0], worry: [0, 0] },
      }
    }
    total.turns += s.turns
    total.agentTurns += s.agentTurns
    total.answers += s.answers
    total.askEndings += s.askEndings
    total.guessAnswers += s.guessAnswers
    total.verifiedAnswers += s.verifiedAnswers
    total.cuedTurns += s.cuedTurns
    total.cuedReceived += s.cuedReceived
    for (const cue of STYLE_CUES) {
      total.cues[cue][0] += s.cues[cue][0]
      total.cues[cue][1] += s.cues[cue][1]
    }
  }
  return total
}

/**
 * 최종 답이 MIN_TYPE16_ANSWERS 미만이면 null (카드 빈상태).
 * 중앙이 임의값인 축은 E/I·J/P 둘뿐이다 — S/N·T/F 는 "반반" 이 자연스러운 중앙이다.
 */
export function buildCollabType16(
  sessions: readonly Pick<Session, 'source' | 'styleSignals'>[],
  source: Type16Source,
): CollabType16 | null {
  const s = sumStyleSignals(sessions, source)
  if (!s || s.answers < MIN_TYPE16_ANSWERS) return null

  const agentRate = s.agentTurns / s.turns
  const askRate = s.askEndings / s.answers
  const spoken = s.guessAnswers + s.verifiedAnswers

  const tfEvidence: Record<string, number> = { cuedTurns: s.cuedTurns, cuedReceived: s.cuedReceived }
  for (const cue of STYLE_CUES) {
    tfEvidence[cue] = s.cues[cue][0]
    tfEvidence[`${cue}Received`] = s.cues[cue][1]
  }

  const axes: Record<Type16AxisId, Type16Axis> = {
    ei: axis('ei', clamp01(agentRate / (2 * AGENT_MID_RATE)), { turns: s.turns, agentTurns: s.agentTurns }),
    sn: axis(
      'sn',
      spoken > 0 ? s.guessAnswers / spoken : 0.5,
      { verifiedAnswers: s.verifiedAnswers, guessAnswers: s.guessAnswers },
      spoken < MIN_SPOKEN_ANSWERS,
    ),
    tf: axis('tf', s.cuedTurns > 0 ? s.cuedReceived / s.cuedTurns : 0.5, tfEvidence, s.cuedTurns < MIN_CUED_TURNS),
    // 질문으로 많이 끝낼수록 P(왼쪽) — 그래서 뒤집는다
    jp: axis('jp', 1 - clamp01(askRate / (2 * ASK_MID_RATE)), { answers: s.answers, askEndings: s.askEndings }),
  }

  const ordered = TYPE16_AXIS_ORDER.map((id) => axes[id])
  return { source, code: ordered.map((a) => a.letter).join(''), answers: s.answers, axes: ordered }
}
