#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * cleanClaudeText 순수 함수 어설션 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/clean-claude-text.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위: command 클러스터 언랩(args 우선 → name 폴백, 순서 무관, 다중 공백 collapse),
 * turn_aborted interrupted 감지 유지, 기존 시스템 태그 strip 회귀 방지, 일반 메시지 무변형.
 *
 * 배경: 스킬 첫 문장 세션의 messages[0].text 는 <command-*> 클러스터 하나뿐이라,
 * 예전처럼 통째로 strip 하면 빈 문자열 → 대시보드에서 "(빈 세션)" 오표시.
 * command-args 는 사용자가 실제 타이핑한 요청이므로 보존해야 한다.
 */
import assert from 'node:assert/strict'
import { cleanClaudeText } from '../src/lib/cleanClaudeText.ts'

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

// === command 클러스터 언랩 ==================================================
console.log('\n[command 클러스터 언랩]')

test('① args 있는 command → args 내용 반환 (name/message 는 버림)', () => {
  const raw =
    '<command-name>/goal</command-name> <command-message>goal</command-message> <command-args>docs/x.md 해줘</command-args>'
  const { text, interrupted } = cleanClaudeText(raw)
  assert.strictEqual(text, 'docs/x.md 해줘')
  assert.strictEqual(interrupted, false)
})

test('② 태그 순서 message/name/args 여도 동일 — autogoal 케이스', () => {
  const raw =
    '<command-message>autogoal</command-message> <command-name>/autogoal</command-name> <command-args>이거 검증해봐</command-args>'
  assert.strictEqual(cleanClaudeText(raw).text, '이거 검증해봐')
})

test('③ args 비어있음 → command-name(/goal) 폴백', () => {
  const raw =
    '<command-name>/goal</command-name> <command-message>goal</command-message> <command-args></command-args>'
  assert.strictEqual(cleanClaudeText(raw).text, '/goal')
})

test('③-b args 공백만 → name 폴백 (trim 후 빈값 취급)', () => {
  const raw = '<command-name>/ship</command-name> <command-args>   </command-args>'
  assert.strictEqual(cleanClaudeText(raw).text, '/ship')
})

test('④ 여러 공백/여러 줄로 구분된 클러스터도 정상 collapse', () => {
  const raw =
    '<command-name>/goal</command-name>\n\n<command-message>goal</command-message>\n\n   <command-args>여러 줄\n요청 본문</command-args>'
  // 태그 사이 다중 개행·공백은 흡수, args 내부 개행은 사용자 입력이라 보존
  assert.strictEqual(cleanClaudeText(raw).text, '여러 줄\n요청 본문')
})

test('④-b 언더스코어 변형 <command_args> 도 언랩 (태그 표기 견고성)', () => {
  const raw = '<command_name>/goal</command_name> <command_args>언더스코어 요청</command_args>'
  assert.strictEqual(cleanClaudeText(raw).text, '언더스코어 요청')
})

test('⑨ args 내부 시스템 태그는 언랩 후 strip 단계에서 제거 (unwrap FIRST → strip AFTER 계약)', () => {
  const raw =
    '<command-name>/goal</command-name> <command-args>이거 <system-reminder>노이즈</system-reminder> 고쳐줘</command-args>'
  const { text } = cleanClaudeText(raw)
  assert.ok(!text.includes('노이즈'), '중첩 시스템 태그 내용 제거')
  assert.ok(text.includes('이거') && text.includes('고쳐줘'), 'args 실텍스트 보존')
})

// === turn_aborted interrupted 감지 유지 (불변조건) =========================
console.log('\n[turn_aborted interrupted 감지]')

test('⑤ turn_aborted 포함 → interrupted=true + 텍스트 정리', () => {
  const raw =
    '<command-name>/goal</command-name> <command-args>실제 요청 텍스트</command-args>\n<turn_aborted>The user has aborted the request.</turn_aborted>'
  const { text, interrupted } = cleanClaudeText(raw)
  assert.strictEqual(interrupted, true, 'turn_aborted 감지 유지되어야 함')
  assert.strictEqual(text, '실제 요청 텍스트')
  assert.ok(!text.includes('turn_aborted'), 'turn_aborted 블록은 제거되어야 함')
  assert.ok(!text.includes('aborted the request'), 'turn_aborted 내용도 제거되어야 함')
})

test('⑤-b turn_aborted 없으면 interrupted=false', () => {
  assert.strictEqual(cleanClaudeText('그냥 텍스트').interrupted, false)
})

// === 기존 시스템 태그 strip 회귀 방지 ======================================
console.log('\n[기존 시스템 태그 strip 회귀 방지]')

test('⑥ system-reminder 여전히 제거', () => {
  const raw = '<system-reminder>주기적 리마인더 노이즈</system-reminder>남은 실제 텍스트'
  const { text } = cleanClaudeText(raw)
  assert.strictEqual(text, '남은 실제 텍스트')
  assert.ok(!text.includes('리마인더'))
})

test('⑥-b ide_selection 여전히 제거', () => {
  const raw = '<ide_selection>const x = 1</ide_selection>이 코드 고쳐줘'
  assert.strictEqual(cleanClaudeText(raw).text, '이 코드 고쳐줘')
})

test('⑥-c 브래킷 어노테이션 + 이미지 어노테이션 여전히 제거', () => {
  const raw = '[read src/index.ts] [Image #1] 이 파일 봐줘'
  assert.strictEqual(cleanClaudeText(raw).text, '이 파일 봐줘')
})

// === command + 후속 텍스트 / 일반 메시지 ===================================
console.log('\n[command + 후속 텍스트 · 일반 메시지]')

test('⑦ command 뒤 일반 후속 텍스트 보존 (구분 공백 유지)', () => {
  const raw =
    '<command-name>/goal</command-name> <command-args>foo 요청</command-args>\n추가로 이것도 봐줘'
  const { text } = cleanClaudeText(raw)
  assert.strictEqual(text, 'foo 요청 추가로 이것도 봐줘')
  assert.ok(text.includes('추가로 이것도 봐줘'), '후속 텍스트가 보존되어야 함')
})

test('⑧ command 아닌 순수 일반 메시지는 변형 없이 통과', () => {
  const raw = '함수를 리팩터링해줘.\n타입도 정리하고 테스트도 추가해줘.'
  const { text, interrupted } = cleanClaudeText(raw)
  assert.strictEqual(text, raw)
  assert.strictEqual(interrupted, false)
})

test('⑧-b 각괄호가 있어도 툴 어노테이션이 아니면 보존', () => {
  const raw = '이 배열 [1, 2, 3] 을 정렬해줘'
  assert.strictEqual(cleanClaudeText(raw).text, raw)
})

test('⑧-c 빈 문자열 입력 — 크래시 없이 빈 결과', () => {
  const { text, interrupted } = cleanClaudeText('')
  assert.strictEqual(text, '')
  assert.strictEqual(interrupted, false)
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
