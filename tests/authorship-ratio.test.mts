#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 나 vs AI 글 비중 순수 함수 어설션 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/authorship-ratio.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위: buildAuthorshipRatio — 역할별 단어 수 비율, 0분모 가드, 분수 0~1 raw,
 * stripMarkup 적용(마크다운/코드펜스 기호 제외), assistant 외 role 무시.
 */
import assert from 'node:assert/strict'
import { buildAuthorshipRatio } from '../src/lib/authorshipRatio.ts'
import type { ParsedMessage, Session } from '../src/types.ts'

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
function msg(role: ParsedMessage['role'], text: string): ParsedMessage {
  return { role, text, timestamp: '2026-06-01T10:00:00Z', toolUses: [] }
}

function makeSession(messages: ParsedMessage[]): Session {
  return {
    id: `s-${Math.random().toString(36).slice(2)}`,
    fileName: 'fixture.jsonl',
    source: 'claude',
    messages,
    startTime: '2026-06-01T10:00:00Z',
    endTime: '2026-06-01T11:00:00Z',
    totalTokens: { input: 0, output: 0 },
    messageCount: {
      user: messages.filter((m) => m.role === 'user').length,
      assistant: messages.filter((m) => m.role === 'assistant').length,
    },
  }
}

// === buildAuthorshipRatio ===================================================
console.log('\n[buildAuthorshipRatio]')

test('빈 세션 — share 0 (0분모 가드)', () => {
  const r = buildAuthorshipRatio([])
  assert.strictEqual(r.userShare, 0)
  assert.strictEqual(r.aiShare, 0)
  assert.strictEqual(r.userWords, 0)
  assert.strictEqual(r.aiWords, 0)
})

test('역할별 단어 수 — user 2단어 vs assistant 6단어, 분수 0~1 raw', () => {
  const s = makeSession([
    msg('user', '이거 고쳐줘'),               // 2 단어
    msg('assistant', '네 이렇게 고치면 동작합니다 다시 확인'), // 6 단어
  ])
  const r = buildAuthorshipRatio([s])
  assert.strictEqual(r.userWords, 2)
  assert.strictEqual(r.aiWords, 6)
  assert.ok(Math.abs(r.userShare - 2 / 8) < 1e-9, `userShare=${r.userShare}`)
  assert.ok(Math.abs(r.aiShare - 6 / 8) < 1e-9, `aiShare=${r.aiShare}`)
  assert.ok(r.userShare >= 0 && r.userShare <= 1, '분수 0~1 — % 변환은 UI')
})

test('share 합 1 (합 > 0)', () => {
  const s = makeSession([msg('user', 'a b c'), msg('assistant', 'd e')])
  const r = buildAuthorshipRatio([s])
  assert.ok(Math.abs(r.userShare + r.aiShare - 1) < 1e-9)
})

test('stripMarkup — 코드펜스/마크다운 기호는 단어로 안 셈', () => {
  // stripMarkup 후 단어만: assistant 의 ``` 헤딩 기호는 제외
  const plain = buildAuthorshipRatio([makeSession([msg('assistant', 'hello world')])])
  const marked = buildAuthorshipRatio([makeSession([msg('assistant', '## hello world')])])
  assert.strictEqual(plain.aiWords, marked.aiWords, '마크다운 기호가 단어 수를 바꾸면 안 됨')
})

test('assistant 외 비-대화 role 무시 (user/assistant 만 집계)', () => {
  const s = makeSession([
    msg('user', 'one two'),
    { role: 'system' as ParsedMessage['role'], text: 'ignore me please', timestamp: '2026-06-01T10:00:00Z', toolUses: [] },
    msg('assistant', 'three'),
  ])
  const r = buildAuthorshipRatio([s])
  assert.strictEqual(r.userWords, 2)
  assert.strictEqual(r.aiWords, 1)
})

test('여러 세션 합산', () => {
  const r = buildAuthorshipRatio([
    makeSession([msg('user', 'a b'), msg('assistant', 'c')]),
    makeSession([msg('user', 'd'), msg('assistant', 'e f g')]),
  ])
  assert.strictEqual(r.userWords, 3) // a b + d
  assert.strictEqual(r.aiWords, 4)   // c + e f g
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
