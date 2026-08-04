#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 검색 레코드·필터·facet 어설션 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/search.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 이 파일이 생긴 이유 (docs/goal/model-attribution-per-message.md ⑥):
 * 검색은 그동안 harness 커버리지가 0 이었고, 그 사이에 모델 필터가 조용히 틀려 있었다 —
 * `buildSearchRecords` 가 role 무관하게 `msg.model || session.model` 을 박아서
 * **그 모델이 답한 적 없는 내 프롬프트**가 모델 필터 결과로 나왔다. facet 쪽도
 * `session.model` 을 선택지에 넣어 한 번도 답하지 않은 모델이 필터 옵션으로 떴다.
 */
import assert from 'node:assert/strict'
import { buildSearchRecords, extractFacets, search } from '../src/lib/search.ts'
import type { ParsedMessage, Session } from '../src/types.ts'

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
function msg(role: 'user' | 'assistant', text: string, model?: string, models?: string[]): ParsedMessage {
  return {
    role,
    text,
    timestamp: '2026-06-01T10:00:00Z',
    toolUses: [],
    ...(model ? { model } : {}),
    ...(models ? { models } : {}),
  }
}

function session(messages: ParsedMessage[], overrides?: Partial<Session>): Session {
  return {
    id: 's1',
    fileName: 'fixture.jsonl',
    source: 'claude',
    messages,
    startTime: messages[0]?.timestamp || '',
    endTime: messages[messages.length - 1]?.timestamp || '',
    totalTokens: { input: 0, output: 0 },
    messageCount: {
      user: messages.filter((m) => m.role === 'user').length,
      assistant: messages.filter((m) => m.role === 'assistant').length,
    },
    ...overrides,
  }
}

// === buildSearchRecords =====================================================
console.log('\n[buildSearchRecords — 모델 태깅]')

test('user 레코드에는 모델이 붙지 않는다 (실데이터에 user model 은 존재하지 않는다)', () => {
  const s = session([msg('user', '내 질문'), msg('assistant', '답변', 'opus')], { model: 'sonnet' })
  const [userRec, asstRec] = buildSearchRecords([s])
  assert.equal(userRec.model, undefined, 'user 레코드에 세션 모델이 새어 들어갔다')
  assert.equal(asstRec.model, 'opus')
})

test('assistant 레코드는 per-message 우선, 없으면 세션 폴백', () => {
  const s = session([msg('assistant', 'A', 'opus'), msg('assistant', 'B')], { model: 'sonnet' })
  const [a, b] = buildSearchRecords([s])
  assert.equal(a.model, 'opus')
  assert.equal(b.model, 'sonnet')
})

test('<synthetic> 대표 블록은 synthetic 으로 태깅되지 않는다 (검색 결과 라벨 노출 차단)', () => {
  // synthetic-first 병합 블록: ParsedMessage.model 이 '<synthetic>' 으로 남는 유일한 경로.
  // SearchResults 메타 라인이 record.model 을 raw 렌더하므로 태깅 단계에서 걸러야 한다.
  const s = session([msg('assistant', '한도 안내', '<synthetic>')], { model: 'opus' })
  const [rec] = buildSearchRecords([s])
  assert.equal(rec.model, 'opus', 'synthetic 은 세션 폴백으로 대체되어야 한다')

  const bare = session([msg('assistant', '한도 안내', '<synthetic>')], { model: '<synthetic>' })
  assert.equal(buildSearchRecords([bare])[0].model, undefined, '폴백도 synthetic 이면 미태깅')
})

test('messageIndex 는 계약이다 — 레코드 순서가 session.messages 인덱스와 일치', () => {
  const s = session([msg('user', 'q'), msg('assistant', 'a', 'opus'), msg('user', 'q2')])
  const recs = buildSearchRecords([s])
  assert.deepEqual(recs.map((r) => r.messageIndex), [0, 1, 2])
})

// === 모델 필터 ==============================================================
console.log('\n[search — 모델 필터]')

const filterFixture = session(
  [msg('user', '이 버그 고쳐줘'), msg('assistant', '고쳤습니다', 'opus')],
  { model: 'sonnet' }
)
const filterMap = new Map([[filterFixture.id, filterFixture]])

test('모델 필터가 그 모델이 답한 적 없는 내 프롬프트를 반환하지 않는다', () => {
  const recs = buildSearchRecords([filterFixture])
  const hits = search(recs, filterMap, { query: '', model: 'sonnet' })
  assert.equal(hits.length, 0, "세션 폴백 'sonnet' 으로 태깅된 user 프롬프트가 새어 나왔다")
})

test('모델 필터는 실제로 답한 모델의 응답을 반환한다', () => {
  const recs = buildSearchRecords([filterFixture])
  const hits = search(recs, filterMap, { query: '', model: 'opus' })
  assert.equal(hits.length, 1)
  assert.equal(hits[0].record.role, 'assistant')
})

test('모델 필터 없이는 user·assistant 둘 다 나온다 (과잉 필터 회귀 가드)', () => {
  const recs = buildSearchRecords([filterFixture])
  assert.equal(search(recs, filterMap, { query: '' }).length, 2)
})

// === facet ==================================================================
console.log('\n[extractFacets — 모델 선택지]')

test('한 번도 답하지 않은 세션 모델은 선택지에 뜨지 않는다 (Codex last-wins 유령)', () => {
  // Codex 는 마지막 turn_context 가 마지막 응답 이후 도착할 수 있어 실측 1세션이 이 상태다
  const s = session([msg('assistant', 'A', 'gpt-5.2-codex')], { source: 'codex', model: 'gpt-5.1-codex-mini' })
  assert.deepEqual(extractFacets([s]).models, ['gpt-5.2-codex'])
})

test('<synthetic> 은 선택지에 뜨지 않는다', () => {
  const s = session([msg('assistant', 'A', 'opus'), msg('assistant', '한도 도달', '<synthetic>')])
  assert.deepEqual(extractFacets([s]).models, ['opus'])
})

test('user 메시지는 선택지에 기여하지 않는다', () => {
  const s = session([msg('user', 'q'), msg('assistant', 'a', 'opus')], { model: 'sonnet' })
  assert.deepEqual(extractFacets([s]).models, ['opus'])
})

test('병합 블록 안에 갇힌 전환도 선택지에 포함된다 (대표 모델만으로는 누락)', () => {
  const s = session([msg('assistant', 'A', 'opus', ['opus', 'fable'])])
  assert.deepEqual(extractFacets([s]).models, ['fable', 'opus'])
})

test('tools/cwds facet 은 무변경 (모델 축 수정이 다른 facet 을 건드리지 않는다)', () => {
  const withTool: ParsedMessage = { ...msg('assistant', 'a', 'opus'), toolUses: ['Read', 'Edit'] }
  const userWithTool: ParsedMessage = { ...msg('user', 'q'), toolUses: ['Bash'] }
  const s = session([userWithTool, withTool], { cwd: 'D:/Work/vibe/promptale' })
  const f = extractFacets([s])
  assert.deepEqual(f.tools, ['Bash', 'Edit', 'Read'])
  assert.deepEqual(f.cwds, ['D:/Work/vibe/promptale'])
})

// --- 결과 ------------------------------------------------------------------
console.log(`\n=== ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
