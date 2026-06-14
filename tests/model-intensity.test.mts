#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 모델별 사용 강도 순수 함수 어설션 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/model-intensity.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위: buildModelIntensity — 모델 그룹화, 세션당 평균 턴/토큰, 0분모/빈입력 가드, 정렬·상위 N.
 */
import assert from 'node:assert/strict'
import { buildModelIntensity } from '../src/lib/modelIntensity.ts'
import type { ParsedMessage, Session, TokenUsage } from '../src/types.ts'

// --- 미니 테스트 러너 -----------------------------------------------------
let passed = 0
let failed = 0
const failures: { name: string; err: unknown }[] = []

function test(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    failures.push({ name, err: e })
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  ✗ ${name}\n    ${msg}`)
  }
}

// --- 픽스처 헬퍼 -----------------------------------------------------------
function userMsg(): ParsedMessage {
  return { role: 'user', text: 'x', timestamp: '2026-06-01T00:00:00Z', toolUses: [] }
}
function asstMsg(): ParsedMessage {
  return { role: 'assistant', text: 'y', timestamp: '2026-06-01T00:00:00Z', toolUses: [] }
}

/** model + userTurns + 토큰(input/output/cachedInput)을 가진 세션 */
function session(model: string | undefined, userTurns: number, tokens: TokenUsage): Session {
  const messages: ParsedMessage[] = []
  for (let i = 0; i < userTurns; i++) {
    messages.push(userMsg())
    messages.push(asstMsg())
  }
  return {
    id: `s-${Math.random().toString(36).slice(2)}`,
    fileName: 'fixture.jsonl',
    source: 'claude',
    model,
    messages,
    startTime: '2026-06-01T00:00:00Z',
    endTime: '2026-06-01T01:00:00Z',
    totalTokens: tokens,
    messageCount: { user: userTurns, assistant: userTurns },
  }
}

// === buildModelIntensity ====================================================
console.log('\n[buildModelIntensity]')

test('빈입력 — 빈 배열', () => {
  assert.deepStrictEqual(buildModelIntensity([]), [])
})

test('model 미상(빈/undefined) 세션은 제외', () => {
  const out = buildModelIntensity([
    session(undefined, 3, { input: 10, output: 20 }),
    session('', 5, { input: 10, output: 20 }),
  ])
  assert.deepStrictEqual(out, [])
})

test('세션당 평균 턴/토큰 — 토큰 공식 input+output+cachedInput', () => {
  const out = buildModelIntensity([
    session('claude-sonnet', 4, { input: 100, output: 200, cachedInput: 50 }),
    session('claude-sonnet', 6, { input: 100, output: 100, cachedInput: 0 }),
  ])
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].model, 'claude-sonnet')
  assert.strictEqual(out[0].sessionCount, 2)
  assert.strictEqual(out[0].avgUserTurns, 5) // (4+6)/2
  // 세션1 토큰 350, 세션2 토큰 200 → 평균 275
  assert.strictEqual(out[0].avgTokens, 275)
})

test('여러 모델 그룹화 + 세션 수 내림차순 정렬', () => {
  const out = buildModelIntensity([
    session('model-a', 2, { input: 10, output: 10 }),
    session('model-b', 2, { input: 10, output: 10 }),
    session('model-b', 2, { input: 10, output: 10 }),
    session('model-b', 2, { input: 10, output: 10 }),
  ])
  assert.strictEqual(out.length, 2)
  assert.strictEqual(out[0].model, 'model-b') // 세션 3개
  assert.strictEqual(out[0].sessionCount, 3)
  assert.strictEqual(out[1].model, 'model-a')
})

test('상위 N(기본 5) 제한', () => {
  const sessions = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((m) =>
    session(m, 1, { input: 1, output: 1 })
  )
  const out = buildModelIntensity(sessions)
  assert.strictEqual(out.length, 5)
})

test('messageCount.user 우선 — 메시지 카운트보다 messageCount 사용', () => {
  // messageCount.user=10 인데 실제 user 메시지는 0 → 평균 턴은 10 (messageCount 우선)
  const s = session('m', 0, { input: 1, output: 1 })
  s.messageCount = { user: 10, assistant: 0 }
  const out = buildModelIntensity([s])
  assert.strictEqual(out[0].avgUserTurns, 10)
})

// === 결과 보고 =============================================================
console.log(`\n=== ${passed} passed, ${failed} failed ===`)
if (failed > 0) {
  console.log('\n실패 상세:')
  for (const f of failures) {
    console.log(`  ✗ ${f.name}`)
    console.log(`    ${f.err instanceof Error ? f.err.stack ?? f.err.message : String(f.err)}`)
  }
  process.exit(1)
}
