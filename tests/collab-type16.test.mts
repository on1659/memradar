#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * AI 협업 16유형 어설션 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/collab-type16.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위: buildCollabType16 / sumStyleSignals — 소스별 합산, 표본 게이트, 네 축의 중앙과 방향,
 *       경계선 표시, 근거가 모자란 축의 판정 보류('?'), 코드 표기 순서, evidence 수치
 *       (신호를 세는 쪽은 tests/style-signals.test.mts)
 */
import assert from 'node:assert/strict'
import {
  buildCollabType16,
  sumStyleSignals,
  MIN_TYPE16_ANSWERS,
  MIN_SPOKEN_ANSWERS,
  MIN_CUED_TURNS,
  AGENT_MID_RATE,
  ASK_MID_RATE,
  TYPE16_BORDERLINE_BAND,
} from '../src/lib/collabType16.ts'
import { createStyleSignalCollector } from '../src/lib/styleSignals.ts'
import type { SessionSource, SessionStyleSignals } from '../src/types.ts'

// --- 미니 테스트 러너 -----------------------------------------------------
let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  ✗ ${name}\n    ${msg}`)
  }
}

// --- 픽스처 헬퍼 -----------------------------------------------------------
/** 요청 100번·답 100개짜리 중립 신호 — 필요한 값만 덮어쓴다 */
function signals(over: Partial<SessionStyleSignals> = {}): SessionStyleSignals {
  return {
    turns: 100, agentTurns: 0, answers: 100, askEndings: 0, guessAnswers: 0, verifiedAnswers: 0,
    cuedTurns: 0, cuedReceived: 0,
    cues: { frustration: [0, 0], joy: [0, 0], thanks: [0, 0], correction: [0, 0], worry: [0, 0] },
    ...over,
  }
}

function session(styleSignals: SessionStyleSignals | undefined, source: SessionSource = 'claude') {
  return { source, styleSignals }
}

const axisOf = (result: ReturnType<typeof buildCollabType16>, id: string) => {
  const found = result?.axes.find((a) => a.id === id)
  assert.ok(found, `축 ${id} 가 없다`)
  return found
}

// === 합산·표본 게이트 ========================================================
console.log('\n[합산 · 표본 게이트]')

test('소스별로 따로 합산한다 — 신호가 없는 세션은 건너뛴다', () => {
  const sessions = [
    session(signals({ agentTurns: 3, cues: { frustration: [2, 1], joy: [0, 0], thanks: [0, 0], correction: [0, 0], worry: [0, 0] } })),
    session(signals({ agentTurns: 4, cues: { frustration: [5, 0], joy: [0, 0], thanks: [0, 0], correction: [0, 0], worry: [0, 0] } })),
    session(undefined),
    session(signals({ agentTurns: 50 }), 'codex'),
  ]
  const claude = sumStyleSignals(sessions, 'claude')
  assert.equal(claude?.turns, 200)
  assert.equal(claude?.agentTurns, 7)
  assert.deepEqual(claude?.cues.frustration, [7, 1])
  assert.equal(sumStyleSignals(sessions, 'codex')?.agentTurns, 50)
})

test('신호가 붙은 세션이 없으면 null', () => {
  assert.equal(sumStyleSignals([session(undefined)], 'claude'), null)
  assert.equal(buildCollabType16([session(undefined)], 'claude'), null)
  assert.equal(buildCollabType16([session(signals())], 'codex'), null)
})

test('최종 답이 기준 미만이면 null, 채우면 네 글자를 낸다', () => {
  assert.equal(buildCollabType16([session(signals({ answers: MIN_TYPE16_ANSWERS - 1 }))], 'claude'), null)
  const result = buildCollabType16([session(signals({ answers: MIN_TYPE16_ANSWERS }))], 'claude')
  assert.ok(result)
  assert.equal(result.source, 'claude')
  assert.equal(result.code.length, 4)
  assert.deepEqual(result.axes.map((a) => a.id), ['ei', 'sn', 'tf', 'jp'])
})

// === 네 축 ==================================================================
console.log('\n[E/I — 에이전트에게 나눠 맡기는 비율]')

test('비율이 기준 중앙이면 0.5, 아래는 I, 위는 E', () => {
  const mid = axisOf(buildCollabType16([session(signals({ agentTurns: 100 * AGENT_MID_RATE }))], 'claude'), 'ei')
  assert.equal(mid.value, 0.5)
  assert.equal(mid.borderline, true)
  assert.deepEqual(mid.evidence, { turns: 100, agentTurns: 100 * AGENT_MID_RATE })

  assert.equal(axisOf(buildCollabType16([session(signals({ agentTurns: 4 }))], 'claude'), 'ei').letter, 'I')
  const many = axisOf(buildCollabType16([session(signals({ agentTurns: 38 }))], 'claude'), 'ei')
  assert.equal(many.letter, 'E')
  assert.equal(many.value, 1, '상한은 1')
})

console.log('\n[S/N — 확인으로 말하나, 추측으로 말하나]')

test('확인이 많으면 S, 추측이 많으면 N — 값은 추측의 몫', () => {
  const s = axisOf(buildCollabType16([session(signals({ verifiedAnswers: 30, guessAnswers: 10 }))], 'claude'), 'sn')
  assert.equal(s.letter, 'S')
  assert.equal(s.value, 0.25)
  assert.deepEqual(s.evidence, { verifiedAnswers: 30, guessAnswers: 10 })
  assert.equal(axisOf(buildCollabType16([session(signals({ verifiedAnswers: 10, guessAnswers: 30 }))], 'claude'), 'sn').letter, 'N')
})

test('확인·추측 표현이 든 답이 기준 미만이면 판정을 보류한다', () => {
  const none = axisOf(buildCollabType16([session(signals())], 'claude'), 'sn')
  assert.equal(none.letter, '?')
  assert.equal(none.lowSample, true)
  const few = axisOf(buildCollabType16([session(signals({ verifiedAnswers: MIN_SPOKEN_ANSWERS - 1 }))], 'claude'), 'sn')
  assert.equal(few.letter, '?', '한두 건으로 글자가 뒤집히면 안 된다')
  const enough = axisOf(buildCollabType16([session(signals({ verifiedAnswers: MIN_SPOKEN_ANSWERS }))], 'claude'), 'sn')
  assert.equal(enough.letter, 'S')
  assert.equal(enough.lowSample, false)
})

console.log('\n[T/F — 감정을 먼저 받아 주나]')

test('받아 준 비율이 값 — 절반 아래는 T, 위는 F', () => {
  const cues = { frustration: [30, 12], joy: [0, 0], thanks: [0, 0], correction: [20, 1], worry: [0, 0] } as SessionStyleSignals['cues']
  const t = axisOf(buildCollabType16([session(signals({ cuedTurns: 40, cuedReceived: 12, cues }))], 'claude'), 'tf')
  assert.equal(t.letter, 'T')
  assert.equal(t.value, 0.3)
  assert.equal(t.lowSample, false)
  assert.equal(t.evidence.cuedTurns, 40)
  assert.equal(t.evidence.cuedReceived, 12)
  assert.equal(t.evidence.frustration, 30)
  assert.equal(t.evidence.frustrationReceived, 12)
  assert.equal(t.evidence.correctionReceived, 1)

  assert.equal(axisOf(buildCollabType16([session(signals({ cuedTurns: 40, cuedReceived: 30 }))], 'claude'), 'tf').letter, 'F')
})

test('감정이 드러난 요청이 기준 미만이면 판정을 보류한다', () => {
  const few = axisOf(buildCollabType16([session(signals({ cuedTurns: MIN_CUED_TURNS - 1, cuedReceived: 1 }))], 'claude'), 'tf')
  assert.equal(few.letter, '?')
  assert.equal(few.lowSample, true)
  const none = axisOf(buildCollabType16([session(signals())], 'claude'), 'tf')
  assert.equal(none.letter, '?')
  assert.equal(none.lowSample, true)
  const enough = axisOf(buildCollabType16([session(signals({ cuedTurns: MIN_CUED_TURNS, cuedReceived: 1 }))], 'claude'), 'tf')
  assert.equal(enough.letter, 'T')
  assert.equal(enough.lowSample, false)
})

console.log('\n[J/P — 결론으로 끝내나, 질문으로 끝내나]')

test('질문으로 끝낸 비율이 기준 중앙이면 0.5, 더 많으면 P, 적으면 J', () => {
  const mid = axisOf(buildCollabType16([session(signals({ askEndings: 100 * ASK_MID_RATE }))], 'claude'), 'jp')
  assert.equal(mid.value, 0.5)
  assert.deepEqual(mid.evidence, { answers: 100, askEndings: 100 * ASK_MID_RATE })

  const open = axisOf(buildCollabType16([session(signals({ askEndings: 28 }))], 'claude'), 'jp')
  assert.equal(open.letter, 'P')
  const closed = axisOf(buildCollabType16([session(signals({ askEndings: 3 }))], 'claude'), 'jp')
  assert.equal(closed.letter, 'J')
  assert.equal(axisOf(buildCollabType16([session(signals({ askEndings: 90 }))], 'claude'), 'jp').value, 0, '하한은 0')
})

// === 경계선·코드 ============================================================
console.log('\n[경계선 · 코드]')

test('중앙에서 밴드 안이면 borderline, 밖이면 아니다', () => {
  const inBand = 0.5 + TYPE16_BORDERLINE_BAND / 2
  const near = buildCollabType16([session(signals({ verifiedAnswers: Math.round(1000 * (1 - inBand)), guessAnswers: Math.round(1000 * inBand) }))], 'claude')
  assert.equal(axisOf(near, 'sn').borderline, true)
  const far = buildCollabType16([session(signals({ verifiedAnswers: 10, guessAnswers: 90 }))], 'claude')
  assert.equal(axisOf(far, 'sn').borderline, false)
})

test('코드는 E/I → S/N → T/F → J/P 순서 — 실측과 같은 꼴의 두 AI', () => {
  // 혼자 일하고, 확인으로 말하고, 해결부터 가고, 질문으로 끝내는 AI
  const solo = signals({ agentTurns: 4, verifiedAnswers: 33, guessAnswers: 17, cuedTurns: 60, cuedReceived: 8, askEndings: 28 })
  assert.equal(buildCollabType16([session(solo)], 'claude')?.code, 'ISTP')
  // 에이전트를 돌리고, 결론으로 끝내는 AI
  const lead = signals({ agentTurns: 38, verifiedAnswers: 25, guessAnswers: 9, cuedTurns: 30, cuedReceived: 4, askEndings: 3 })
  assert.equal(buildCollabType16([session(lead, 'codex')], 'codex')?.code, 'ESTJ')
  // 반대쪽 끝
  const warm = signals({ agentTurns: 38, verifiedAnswers: 5, guessAnswers: 30, cuedTurns: 30, cuedReceived: 25, askEndings: 40 })
  assert.equal(buildCollabType16([session(warm)], 'claude')?.code, 'ENFP')
})

test('근거가 없는 축에는 글자를 붙이지 않는다 — "진행해 → 끝냈습니다." 50회', () => {
  // 추측 표현도 감정 요청도 0건이다. 예전에는 중앙값 때문에 N·F 가 붙어 INFJ 가 나왔다.
  const collector = createStyleSignalCollector('claude')
  for (let i = 0; i < MIN_TYPE16_ANSWERS; i++) {
    collector.collect({ type: 'user', message: { role: 'user', content: '진행해' } })
    collector.collect({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '끝냈습니다.' }] } })
  }
  const result = buildCollabType16([session(collector.finalize())], 'claude')
  assert.equal(result?.code, 'I??J')
})

// --- 결과 ------------------------------------------------------------------
console.log(`\n=== ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
