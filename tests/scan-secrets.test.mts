#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scan-secrets 분류기 테스트 — 순수 함수만 (classify, shannonEntropy).
 * main()/파일워킹은 실로그 의존이라 테스트하지 않는다 (읽기 전용·로컬).
 *
 * 실행: npx tsx tests/scan-secrets.test.mts
 */
import assert from 'node:assert/strict'
import { classify, shannonEntropy, dedupe, type ScanEntry } from '../scripts/scan-secrets.mts'

let passed = 0
let failed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed++
    console.log(`  ✗ ${name}`)
    console.log(`    ${err instanceof Error ? err.message : err}`)
  }
}
function section(title: string) {
  console.log(`\n--- ${title} ---`)
}

const NON_FIXTURE = '/home/user/.claude/projects/slug/abc.jsonl'

section('shannonEntropy')
test('반복문자는 저엔트로피', () => {
  assert.ok(shannonEntropy('aaaaaaaaaaaaaaaaaaaa') < 1)
})
test('고다양성 토큰은 고엔트로피', () => {
  assert.ok(shannonEntropy('Sz73y13oi8FdiUNp0me1AQC2RJQLWz09NUBq') > 4)
})
test('빈 문자열은 0', () => {
  assert.equal(shannonEntropy(''), 0)
})

section('classify — dummy')
test('픽스처 경로는 dummy', () => {
  const r = classify('Sz73y13oi8FdiUNp0me1AQC2RJQLWz09NUBq', '/repo/tests/fixtures/logs/x.jsonl')
  assert.equal(r.classification, 'dummy')
  assert.equal(r.reason, 'fixtures-path')
})
test('EXAMPLE 접미는 dummy (AWS 예시 키)', () => {
  const r = classify('AKIAIOSFODNN7EXAMPLE', NON_FIXTURE)
  assert.equal(r.classification, 'dummy')
  assert.equal(r.reason, 'example-suffix')
})
test('반복문자(sk-aaaa…)는 dummy (저엔트로피)', () => {
  const r = classify('sk-aaaaaaaaaaaaaaaaaaaaaaaa', NON_FIXTURE)
  assert.equal(r.classification, 'dummy')
})
test('ghp_xxxx… 는 dummy', () => {
  const r = classify('ghp_xxxxxxxxxxxxxxxxxxxx', NON_FIXTURE)
  assert.equal(r.classification, 'dummy')
})
test('your-token 플레이스홀더는 dummy', () => {
  const r = classify('your_api_key_goes_here_1234', NON_FIXTURE)
  assert.equal(r.classification, 'dummy')
  assert.equal(r.reason, 'placeholder-word')
})

section('classify — real')
test('고엔트로피 npm 토큰은 real', () => {
  // 합성 고엔트로피 더미(실제 키 아님) — 분류 로직 검증용
  const r = classify('Sz73y13oi8FdiUNp0me1AQC2RJQLWz09NUBq', NON_FIXTURE)
  assert.equal(r.classification, 'real')
  assert.equal(r.reason, 'high-entropy')
})

section('dedupe + confidence')
function entry(over: Partial<ScanEntry>): ScanEntry {
  return {
    project: 'p', sessionFile: '~/.claude/projects/p/a.jsonl', lineNo: 1,
    kind: 'npm-token', length: 40, fingerprint: 'abc12345',
    classification: 'real', reason: 'high-entropy', ...over,
  }
}
test('같은 (kind,fingerprint)는 1개 finding으로 합쳐지고 발생 위치 누적', () => {
  const out = dedupe([
    entry({ sessionFile: 'x', lineNo: 1 }),
    entry({ sessionFile: 'x', lineNo: 1 }), // 동일 위치 → 중복 제거
    entry({ sessionFile: 'y', lineNo: 9 }),
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].occurrenceCount, 3)
  assert.equal(out[0].occurrences.length, 2) // (x:1) 중복 제거, (y:9)
})
test('npm-token 은 high-confidence', () => {
  assert.equal(dedupe([entry({ kind: 'npm-token' })])[0].confidence, 'high')
})
test('credential/bearer 는 low-confidence', () => {
  assert.equal(dedupe([entry({ kind: 'credential' })])[0].confidence, 'low')
  assert.equal(dedupe([entry({ kind: 'bearer-token' })])[0].confidence, 'low')
})

console.log(`\n=== ${passed} passed, ${failed} failed ===`)
if (failed > 0) process.exit(1)
