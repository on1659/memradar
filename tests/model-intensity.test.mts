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

test('여러 모델 그룹화 — 평균 토큰 동률이면 세션 수 내림차순', () => {
  const out = buildModelIntensity([
    session('model-a', 2, { input: 10, output: 10 }),
    session('model-b', 2, { input: 10, output: 10 }),
    session('model-b', 2, { input: 10, output: 10 }),
    session('model-b', 2, { input: 10, output: 10 }),
  ])
  assert.strictEqual(out.length, 2)
  assert.strictEqual(out[0].model, 'model-b') // avgTokens 동률(20) → 세션 3개가 앞
  assert.strictEqual(out[0].sessionCount, 3)
  assert.strictEqual(out[1].model, 'model-a')
})

test('표시 정렬은 막대 축(평균 토큰) 내림차순 — 세션 수가 많아도 막대가 짧으면 아래로', () => {
  // 선별(상위 N)은 세션 수 기준이지만, 표시는 막대 길이 축을 따른다.
  // 정렬을 세션 수 우선으로 되돌리는 뮤턴트는 여기서 즉시 깨진다.
  const out = buildModelIntensity([
    session('many-short', 2, { input: 10, output: 10 }),   // 3세션, 평균 20토큰
    session('many-short', 2, { input: 10, output: 10 }),
    session('many-short', 2, { input: 10, output: 10 }),
    session('few-long', 2, { input: 500, output: 500 }),   // 1세션, 평균 1000토큰
  ])
  assert.deepStrictEqual(out.map((m) => m.model), ['few-long', 'many-short'])
})

test('선별은 세션 수 우선 — limit 초과 시 1세션짜리 특이 평균이 자리를 뺏지 않는다', () => {
  // 5칸 정원: 세션 2개짜리 모델 5종 + 세션 1개·거대 평균 1종 → 후자는 선별 탈락.
  const sessions = ['a', 'b', 'c', 'd', 'e'].flatMap((m) => [
    session(`model-${m}`, 1, { input: 50, output: 50 }),
    session(`model-${m}`, 1, { input: 50, output: 50 }),
  ])
  sessions.push(session('model-outlier', 1, { input: 99999, output: 99999 }))
  const out = buildModelIntensity(sessions)
  assert.strictEqual(out.length, 5)
  assert.strictEqual(out.some((m) => m.model === 'model-outlier'), false)
})

test('그룹 키는 dominant — session.model(first-wins)과 다르면 dominant 쪽으로 묶인다', () => {
  // 구분력 확보: session.model='first' 인데 응답 다수는 'dominant' 인 세션.
  // 그룹 키를 session.model 로 되돌리는 뮤턴트는 이 테스트에서 즉시 깨진다.
  const s = session('claude-first', 4, { input: 100, output: 100 })
  s.modelResponses = { 'claude-dominant': 9, 'claude-first': 1 }
  const out = buildModelIntensity([s])
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].model, 'claude-dominant')
  assert.strictEqual(out[0].sessionCount, 1) // 혼합 세션도 주 사용 모델 한 곳에만 계상
})

test('session.model 이 <synthetic> 인 세션 — modelResponses 있으면 실모델로, 없으면 제외', () => {
  // 실측 2세션: 중단 안내가 첫 라인이라 first-wins 가 <synthetic> 이 된 경우
  const rescued = session('<synthetic>', 2, { input: 10, output: 10 })
  rescued.modelResponses = { 'claude-real': 5 }
  const dropped = session('<synthetic>', 2, { input: 10, output: 10 })
  const out = buildModelIntensity([rescued, dropped])
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].model, 'claude-real')
  assert.strictEqual(out[0].sessionCount, 1) // synthetic-only 세션은 그룹 자체가 없다
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
