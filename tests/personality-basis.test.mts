#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 성격 축 입력 보정 어설션 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/personality-basis.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위: userPrompts.ts(직접 쓴 프롬프트 선별) · buildProjectResolver(저장소 단위 프로젝트 묶기) ·
 *       computePersonality 의 style/scope 축이 자동화 세션·AI 분량에 끌려가지 않는지
 */
import assert from 'node:assert/strict'
import { collectUserPrompts, TEMPLATE_MIN_REPEATS } from '../src/lib/userPrompts.ts'
import { buildProjectResolver, computePersonality } from '../src/lib/personality.ts'
import { computeStats } from '../src/parser.ts'
import type { Session } from '../src/types.ts'

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

let seq = 0
function session(prompts: string[], cwd: string, outputTokens = 0): Session {
  const day = String((seq % 27) + 1).padStart(2, '0')
  seq++
  const messages = prompts.flatMap((text) => [
    { role: 'user' as const, text, timestamp: `2026-10-${day}T10:00:00.000Z`, toolUses: [] },
    {
      role: 'assistant' as const,
      text: '네',
      timestamp: `2026-10-${day}T10:00:05.000Z`,
      toolUses: [],
      tokens: { input: 10, output: outputTokens },
    },
  ])
  return {
    id: `s${seq}`,
    fileName: `s${seq}.jsonl`,
    source: 'claude',
    messages,
    startTime: `2026-10-${day}T10:00:00.000Z`,
    endTime: `2026-10-${day}T10:20:00.000Z`,
    cwd,
    totalTokens: { input: 10 * prompts.length, output: outputTokens * prompts.length },
    messageCount: { user: prompts.length, assistant: prompts.length },
  }
}

const LONG_TEMPLATE = (i: number) => `You are generating one raw sprite sheet for the batch. Follow the layout rules exactly. ${'rule '.repeat(60)} #${i}`
const personalityOf = (sessions: Session[]) => computePersonality(sessions, computeStats(sessions))

// === 프롬프트 선별 ==========================================================
console.log('\n[collectUserPrompts]')

test('시스템이 끼워 넣은 문구와 빈 프롬프트는 뺀다', () => {
  const s = session(['고쳐줘', '<task-notification>done</task-notification>', '[Request interrupted by user]'], '/Users/a/Work/x')
  assert.deepEqual(collectUserPrompts([s]).prompts, ['고쳐줘'])
})

test('같은 긴 문장으로 시작하는 프롬프트가 기준만큼 반복되면 자동 프롬프트로 뺀다', () => {
  const repeated = Array.from({ length: TEMPLATE_MIN_REPEATS }, (_, i) => LONG_TEMPLATE(i))
  const s = session(['직접 쓴 말', ...repeated], '/Users/a/Work/x')
  assert.deepEqual(collectUserPrompts([s]).prompts, ['직접 쓴 말'])
})

test('기준보다 적게 반복된 긴 프롬프트와 짧은 반복은 사람의 말로 남긴다', () => {
  const few = Array.from({ length: TEMPLATE_MIN_REPEATS - 1 }, (_, i) => LONG_TEMPLATE(i))
  const s = session(['계속', '계속', '계속', '계속', ...few], '/Users/a/Work/x')
  assert.equal(collectUserPrompts([s]).prompts.length, 4 + few.length)
})

test('bySession 은 입력 세션과 같은 인덱스', () => {
  const a = session(['하나'], '/Users/a/Work/x')
  const b = session(['<system-reminder>x</system-reminder>'], '/Users/a/Work/y')
  const corpus = collectUserPrompts([a, b])
  assert.deepEqual(corpus.bySession, [['하나'], []])
})

// === 프로젝트 묶기 ==========================================================
console.log('\n[buildProjectResolver]')

test('실제 작업 폴더로 쓰인 조상이 있으면 그 아래 폴더를 한 프로젝트로 묶는다', () => {
  const cwds = ['/Users/a/Work/sprite', '/Users/a/Work/sprite/out/batch-1', '/Users/a/Work/sprite/out/batch-2', '/Users/a/Work/blog']
  const resolve = buildProjectResolver(cwds)
  assert.equal(resolve('/Users/a/Work/sprite/out/batch-1'), 'Users/a/Work/sprite')
  assert.equal(resolve('/Users/a/Work/sprite/out/batch-2'), 'Users/a/Work/sprite')
  assert.equal(resolve('/Users/a/Work/blog'), 'Users/a/Work/blog')
})

test('홈 바로 아래 작업 공간(~/Work)으로는 묶지 않는다', () => {
  const resolve = buildProjectResolver(['/Users/a/Work', '/Users/a/Work/alpha', '/Users/a/Work/beta'])
  assert.notEqual(resolve('/Users/a/Work/alpha'), resolve('/Users/a/Work/beta'))
})

test('날짜 이름 폴더 아래는 한 프로젝트로 묶는다', () => {
  const resolve = buildProjectResolver(['/Users/a/Documents/Codex/2026-09-21/chat-1', '/Users/a/Documents/Codex/2026-09-22/chat-2'])
  assert.equal(resolve('/Users/a/Documents/Codex/2026-09-21/chat-1'), resolve('/Users/a/Documents/Codex/2026-09-22/chat-2'))
})

test('조상이 없으면 기존 규칙 그대로 (형제 프로젝트를 합치지 않는다)', () => {
  const resolve = buildProjectResolver(['C:\\Users\\a\\source\\repos\\foo', 'C:\\Users\\a\\source\\repos\\bar'])
  assert.equal(resolve('C:\\Users\\a\\source\\repos\\foo'), 'C:/Users/a/source/repos/foo')
  assert.notEqual(resolve('C:\\Users\\a\\source\\repos\\foo'), resolve('C:\\Users\\a\\source\\repos\\bar'))
})

// === 성격 축 ================================================================
console.log('\n[computePersonality — style/scope 입력]')

test('짧게 자주 말하면 탐험가, 길게 정리해 적게 말하면 설계자', () => {
  const terse = Array.from({ length: 6 }, () => session(Array.from({ length: 15 }, (_, i) => `이거 고쳐 ${i}`), '/Users/a/Work/x'))
  const planned = Array.from({ length: 6 }, (_, n) =>
    session([`목표와 제약을 먼저 정리한다 ${n}. ${'배경 설명과 원하는 결과, 건드리면 안 되는 파일을 차례로 적는다. '.repeat(4)}`], '/Users/a/Work/x'))
  assert.ok(personalityOf(terse).axes.style.value < 0.5, '짧고 잦은 프롬프트는 탐험가')
  assert.ok(personalityOf(planned).axes.style.value > 0.5, '길고 드문 프롬프트는 설계자')
})

test('AI 가 길게 답했다고 설계자 쪽으로 가지 않는다 (AI 분량은 입력이 아니다)', () => {
  const make = (out: number) => Array.from({ length: 6 }, () => session(Array.from({ length: 15 }, (_, i) => `이거 고쳐 ${i}`), '/Users/a/Work/x', out))
  assert.equal(personalityOf(make(10)).axes.style.value, personalityOf(make(100000)).axes.style.value)
})

test('자동화 세션이 섞여도 사람이 직접 몬 세션만으로 판정한다', () => {
  const human = Array.from({ length: 6 }, (_, n) => session(Array.from({ length: 12 }, (_, i) => `작업 ${n}-${i}`), `/Users/a/Work/p${n}`))
  const automated = Array.from({ length: 60 }, (_, i) => session([LONG_TEMPLATE(i)], '/Users/a/Work/pipeline'))
  const alone = personalityOf(human)
  const mixed = personalityOf([...human, ...automated])
  assert.equal(mixed.axes.style.value, alone.axes.style.value)
  assert.equal(mixed.measured?.humanSessions, 6)
  assert.equal(mixed.measured?.projects, 6, '자동화 파이프라인 폴더는 프로젝트 수에 들어가지 않는다')
})

test('measured 는 축에 들어간 측정값을 담는다', () => {
  const sessions = [
    session(['가나다라마', '가나다라마바사'], '/Users/a/Work/alpha'),
    session(['가나다'], '/Users/a/Work/alpha'),
    session(['가나다라마바사아자'], '/Users/a/Work/beta'),
  ]
  const m = personalityOf(sessions).measured
  assert.ok(m)
  assert.equal(m.humanSessions, 3)
  assert.equal(m.medianPromptChars, 6) // 길이 3,5,7,9 의 중앙값
  assert.equal(m.turnsPerSession, 4 / 3)
  assert.equal(m.projects, 2)
  assert.equal(m.topProjectShare, 2 / 3)
})

console.log(`\n=== ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
