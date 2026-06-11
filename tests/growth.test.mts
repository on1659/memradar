#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 성장 섹션 순수 함수 어설션 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/growth.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위: toMonthKey, stripMarkup, countWords, isStructured, buildGrowth
 * (docs/GROWTH-SECTION-SPEC.md)
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  toMonthKey,
  stripMarkup,
  countWords,
  isStructured,
  buildGrowth,
  CLI_TRUNCATION_MARKER,
} from '../src/parser.ts'
import type { ParsedMessage, Session, SessionSource } from '../src/types.ts'

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
function msg(role: 'user' | 'assistant', text: string, timestamp: string): ParsedMessage {
  return { role, text, timestamp, toolUses: [] }
}

function makeSession(source: SessionSource, messages: ParsedMessage[]): Session {
  return {
    id: `s-${Math.random().toString(36).slice(2)}`,
    fileName: 'fixture.jsonl',
    source,
    messages,
    startTime: messages[0]?.timestamp || '',
    endTime: messages[messages.length - 1]?.timestamp || '',
    totalTokens: { input: 0, output: 0 },
    messageCount: {
      user: messages.filter((m) => m.role === 'user').length,
      assistant: messages.filter((m) => m.role === 'assistant').length,
    },
  }
}

/** month 안에 user 메시지 n개를 (timestamp 분산해서) 가진 세션 생성 */
function monthSession(source: SessionSource, month: string, userTexts: string[]): Session {
  const messages: ParsedMessage[] = []
  userTexts.forEach((text, i) => {
    const day = String((i % 27) + 1).padStart(2, '0')
    messages.push(msg('user', text, `${month}-${day}T10:00:00.000Z`))
    messages.push(msg('assistant', '응답', `${month}-${day}T10:01:00.000Z`))
  })
  return makeSession(source, messages)
}

// === toMonthKey =============================================================
console.log('\n[toMonthKey]')

test('undefined → null', () => {
  assert.strictEqual(toMonthKey(undefined), null)
})

test('빈 문자열 → null', () => {
  assert.strictEqual(toMonthKey(''), null)
})

test('파싱 불가 문자열 → null', () => {
  assert.strictEqual(toMonthKey('not-a-date'), null)
})

test('ISO UTC → YYYY-MM', () => {
  assert.strictEqual(toMonthKey('2026-03-15T10:00:00.000Z'), '2026-03')
})

test('UTC 월 경계 — +09:00 2/1 새벽은 UTC 1월', () => {
  // 2026-02-01T08:30+09:00 = 2026-01-31T23:30Z → "2026-01" (dailyActivity 와 동일 축)
  assert.strictEqual(toMonthKey('2026-02-01T08:30:00+09:00'), '2026-01')
})

// === stripMarkup ============================================================
console.log('\n[stripMarkup]')

test('코드 펜스 제거', () => {
  const out = stripMarkup('앞 ```const x = 1\nconsole.log(x)``` 뒤')
  assert.ok(!out.includes('const'), '코드 펜스 내부가 남아 있음')
  assert.ok(out.includes('앞') && out.includes('뒤'))
})

test('인라인 코드 제거', () => {
  const out = stripMarkup('변수 `myVariable` 확인')
  assert.ok(!out.includes('myVariable'))
})

test('XML/HTML 태그 제거', () => {
  const out = stripMarkup('<command-name>/review</command-name> 질문')
  assert.ok(!out.includes('command-name'))
  assert.ok(out.includes('질문'))
})

test('URL 제거', () => {
  const out = stripMarkup('참고 https://example.com/path?q=1 해줘')
  assert.ok(!out.includes('example'))
})

test('CLI 잘림 마커 드리프트 가드 — cli/index.mjs 의 실제 마커 리터럴과 일치', () => {
  // parser.ts 의 CLI_TRUNCATION_MARKER 는 cli/index.mjs applyTextCap 리터럴의 사본 —
  // cli 쪽 문구가 바뀌면 stripMarkup 이 조용히 무력화되므로 소스 문자열로 가드
  const cliSource = readFileSync(new URL('../cli/index.mjs', import.meta.url), 'utf8')
  assert.ok(
    cliSource.includes(CLI_TRUNCATION_MARKER),
    'cli/index.mjs 에서 CLI_TRUNCATION_MARKER 리터럴을 찾지 못함 — 두 곳 동기화 필요'
  )
})

test('CLI 잘림 마커 제거 — 마커 단어가 집계에 안 들어감', () => {
  const text = '버그 수정 요청\n\n' + CLI_TRUNCATION_MARKER
  const out = stripMarkup(text)
  assert.ok(!out.includes('잘림'))
  assert.ok(!out.includes('클릭'))
  assert.strictEqual(countWords(text), 3) // 버그, 수정, 요청
})

// === countWords =============================================================
console.log('\n[countWords]')

test('한/영 혼합 단어 수', () => {
  assert.strictEqual(countWords('버그 수정 fix the bug'), 5)
})

test('빈 문자열 → 0', () => {
  assert.strictEqual(countWords(''), 0)
})

test('코드만 있는 메시지 → 0', () => {
  assert.strictEqual(countWords('```npm install foo```'), 0)
})

// === isStructured ===========================================================
console.log('\n[isStructured]')

test('불릿 한 줄짜리 → false (마커 1종)', () => {
  assert.strictEqual(isStructured('- 버튼 색만 바꿔줘'), false)
})

test('불릿 + 번호 → true (마커 2종)', () => {
  assert.strictEqual(isStructured('- 첫 항목\n1. 순서 항목'), true)
})

test('헤딩 + 역할 지정 → true', () => {
  assert.strictEqual(isStructured('# 작업 지시\n당신은 리뷰어다'), true)
})

test('평문 → false', () => {
  assert.strictEqual(isStructured('그냥 버그 좀 고쳐줘 빨리'), false)
})

test('서두 500자 밖의 마커는 무시', () => {
  const filler = '가'.repeat(600)
  assert.strictEqual(isStructured(`${filler}\n- 항목\n1. 번호`), false)
})

// === buildGrowth ============================================================
console.log('\n[buildGrowth]')

const WORDS_40 = 'apple '.repeat(40).trim()
const WORDS_10 = 'apple '.repeat(10).trim()

test('저샘플 월 제외 — user 메시지 5개 미만 월은 빠짐', () => {
  const s4 = monthSession('claude', '2026-01', Array(4).fill(WORDS_10))
  const s5 = monthSession('claude', '2026-02', Array(5).fill(WORDS_10))
  const growth = buildGrowth([s4, s5])
  assert.deepStrictEqual(growth.monthlyComplexity.map((m) => m.month), ['2026-02'])
  assert.deepStrictEqual(growth.skillCurve.map((m) => m.month), ['2026-02'])
  assert.strictEqual(growth.monthlyComplexity[0].count, 5)
})

test('avgWords 계산', () => {
  const s = monthSession('claude', '2026-03', Array(5).fill(WORDS_10))
  const growth = buildGrowth([s])
  assert.strictEqual(growth.monthlyComplexity[0].avgWords, 10)
})

test('세션 경계 prevRole 리셋 — 다음 세션 첫 user 는 follow-up 아님', () => {
  const s1 = makeSession('claude', [
    msg('user', '질문', '2026-01-01T10:00:00.000Z'),
    msg('assistant', '응답', '2026-01-01T10:01:00.000Z'),
  ])
  const s2 = makeSession('claude', [
    msg('user', '다시 해줘', '2026-01-02T10:00:00.000Z'),
    msg('assistant', '응답', '2026-01-02T10:01:00.000Z'),
  ])
  const growth = buildGrowth([s1, s2])
  assert.strictEqual(growth.retryStats.totalFollowups, 0)
  assert.strictEqual(growth.retryStats.retryCount, 0)
})

test('assistant→user 전이만 follow-up 으로 집계 + 정정 마커 매칭', () => {
  const s = makeSession('claude', [
    msg('user', '질문', '2026-01-01T10:00:00.000Z'),
    msg('assistant', '응답', '2026-01-01T10:01:00.000Z'),
    msg('user', '다시 해줘', '2026-01-01T10:02:00.000Z'),
    msg('assistant', '응답', '2026-01-01T10:03:00.000Z'),
    msg('user', '고마워 잘했어', '2026-01-01T10:04:00.000Z'),
  ])
  const growth = buildGrowth([s])
  assert.strictEqual(growth.retryStats.totalFollowups, 2)
  assert.strictEqual(growth.retryStats.retryCount, 1)
  assert.deepStrictEqual(growth.retryStats.topMarkers, [['다시', 1]])
})

test('긴 마커 우선 — "그게 아니라"가 "아니"로 흡수되지 않음', () => {
  const s = makeSession('claude', [
    msg('user', '질문', '2026-01-01T10:00:00.000Z'),
    msg('assistant', '응답', '2026-01-01T10:01:00.000Z'),
    msg('user', '그게 아니라 이쪽을 고쳐줘', '2026-01-01T10:02:00.000Z'),
  ])
  const growth = buildGrowth([s])
  assert.deepStrictEqual(growth.retryStats.topMarkers, [['그게 아니라', 1]])
})

test('retryRate 0~1 범위', () => {
  const s = makeSession('claude', [
    msg('user', '질문', '2026-01-01T10:00:00.000Z'),
    msg('assistant', '응답', '2026-01-01T10:01:00.000Z'),
    msg('user', '아니 그거 말고', '2026-01-01T10:02:00.000Z'),
  ])
  const growth = buildGrowth([s])
  assert.ok(growth.retryStats.retryRate >= 0 && growth.retryStats.retryRate <= 1)
  assert.strictEqual(growth.retryStats.retryRate, 1)
})

test('follow-up 0건이면 retryRate 0 (0 나누기 없음)', () => {
  const s = makeSession('claude', [msg('user', '질문', '2026-01-01T10:00:00.000Z')])
  const growth = buildGrowth([s])
  assert.strictEqual(growth.retryStats.retryRate, 0)
})

test('source-aware 평균 — Codex-only 월은 (A+B)/2 로 비붕괴', () => {
  // 40단어 평문 × 5: A=0, B=40/80=0.5 → score 0.25 (C 포함 /3 이면 0.1667)
  const s = monthSession('codex', '2026-04', Array(5).fill(WORDS_40))
  const growth = buildGrowth([s])
  const entry = growth.skillCurve[0]
  assert.strictEqual(entry.hasClaudeSession, false)
  assert.strictEqual(entry.uniqueSkills, 0)
  assert.ok(Math.abs(entry.score - 0.25) < 1e-9, `score=${entry.score}`)
})

test('Claude 월 — uniqueSkills 집계 (빌트인 제외) + score (A+B+C)/3', () => {
  const texts = [
    `<command-name>/myskill</command-name> ${WORDS_40}`,
    `<command-name>/clear</command-name> ${WORDS_40}`, // 빌트인 → 제외
    WORDS_40,
    WORDS_40,
    WORDS_40,
  ]
  const s = monthSession('claude', '2026-05', texts)
  const growth = buildGrowth([s])
  const entry = growth.skillCurve[0]
  assert.strictEqual(entry.hasClaudeSession, true)
  assert.strictEqual(entry.uniqueSkills, 1)
  // 태그 제거 후 "/myskill", "/clear" 토큰이 1단어씩 남음 → avgWords = (41+41+40+40+40)/5 = 40.4
  const expectedB = 40.4 / 80
  const expectedScore = (0 + expectedB + 1 / 10) / 3 // A=0, C=1/10
  assert.ok(Math.abs(entry.avgWords - 40.4) < 1e-9, `avgWords=${entry.avgWords}`)
  assert.ok(Math.abs(entry.score - expectedScore) < 1e-9, `score=${entry.score}`)
})

test('skillCurve score 0~1 범위 + 월 오름차순 정렬', () => {
  const s1 = monthSession('claude', '2026-02', Array(5).fill(WORDS_10))
  const s2 = monthSession('claude', '2026-01', Array(5).fill(WORDS_40))
  const growth = buildGrowth([s1, s2])
  assert.deepStrictEqual(growth.skillCurve.map((m) => m.month), ['2026-01', '2026-02'])
  for (const entry of growth.skillCurve) {
    assert.ok(entry.score >= 0 && entry.score <= 1, `score=${entry.score}`)
  }
})

test('타임스탬프 없는 메시지는 월 버킷에서 제외 (크래시 없음)', () => {
  const s = makeSession('claude', [msg('user', '질문', '')])
  const growth = buildGrowth([s])
  assert.deepStrictEqual(growth.monthlyComplexity, [])
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
