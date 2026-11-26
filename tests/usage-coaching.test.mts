#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 사용 습관 신호 수집기 + 코칭 룰 + 두 파서 정합 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/usage-coaching.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위:
 *  - cli/lib/usageSignals.mjs 단위 — 요청 단위 중복 제거, 쉬었다 이어간 캐시 재작성 판정
 *    (모델 전환·압축은 제외), 가벼운 턴 판정, 큰 컨텍스트 카운트
 *  - src/parser.ts 배선 — usage 를 requestId 당 한 번만 합산 (라인마다 반복되는 값의 중복 계상 방지)
 *  - **src↔cli 정합** — 같은 픽스처에 대해 두 파서가 같은 usageSignals·토큰 합을 낸다.
 *    npx 기본 경로(정적)는 cli/index.mjs 를 쓰므로 갈라지면 화면마다 숫자가 달라진다.
 *  - src/lib/usageCoaching.ts — 각 룰 발화/비발화 경계, 상호배타, 우선순위, Codex 제외
 *  - src/lib/tokenPricing.ts — 모델명 → 단가 매칭 (구체 버전 우선)
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createUsageSignalCollector, LARGE_CONTEXT_TOKENS } from '../src/lib/usageSignals.ts'
import {
  buildUsageCoaching,
  sumUsageSignals,
  isTopTierModel,
  IDLE_REBUILD_MIN_COUNT,
  IDLE_REBUILD_MIN_SHARE,
  CACHE_CONTINUITY_MAX_SHARE,
  MIN_REQUESTS,
  LARGE_CONTEXT_MIN_SHARE,
  LIGHT_MIN_TOP_TIER_TURNS,
  LIGHT_TIP_MIN_SHARE,
  LIGHT_PRAISE_MAX_SHARE,
} from '../src/lib/usageCoaching.ts'
import { getClaudePrice } from '../src/lib/tokenPricing.ts'
import { parseJsonl } from '../src/parser.ts'
import type { SessionUsageSignals, SessionSource } from '../src/types.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')

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
const OPUS = 'claude-opus-5-5'
const SONNET = 'claude-sonnet-5-5'
const SESSION_ID = 'usage-signals-fixture'

interface Usage {
  input: number
  cacheWrite: number
  cacheRead: number
  output: number
}

function userLine(text: string, timestamp: string) {
  return { type: 'user', sessionId: SESSION_ID, timestamp, message: { role: 'user', content: text } }
}

function toolResultLine(timestamp: string) {
  return {
    type: 'user',
    sessionId: SESSION_ID,
    timestamp,
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }] },
  }
}

function assistantLine(
  requestId: string,
  model: string,
  timestamp: string,
  usage: Usage,
  block: { text?: string; tool?: string }
) {
  const content = block.tool
    ? [{ type: 'tool_use', id: 'toolu_1', name: block.tool, input: {} }]
    : [{ type: 'text', text: block.text ?? '응답' }]
  return {
    type: 'assistant',
    sessionId: SESSION_ID,
    requestId,
    timestamp,
    message: {
      role: 'assistant',
      model,
      content,
      usage: {
        input_tokens: usage.input,
        cache_creation_input_tokens: usage.cacheWrite,
        cache_read_input_tokens: usage.cacheRead,
        output_tokens: usage.output,
      },
    },
  }
}

const A: Usage = { input: 10, cacheWrite: 20000, cacheRead: 0, output: 1500 }
const B: Usage = { input: 5, cacheWrite: 1000, cacheRead: 20000, output: 200 }
const C: Usage = { input: 5, cacheWrite: 21500, cacheRead: 0, output: 100 }
const D: Usage = { input: 5, cacheWrite: 21700, cacheRead: 0, output: 50 }
const E: Usage = { input: 5, cacheWrite: 500, cacheRead: 300, output: 3000 }

/**
 * 턴 1 (Opus): 응답 A 가 text + Edit 두 라인으로 쪼개짐(같은 usage 반복) → 도구 결과 → 응답 B
 * 턴 2 (Opus, 2시간 뒤): 응답 C — 캐시를 하나도 못 읽고 전부 다시 씀 = 쉬었다 이어간 재작성.
 *   이어서 끼어든 알림(`<` 시작, 턴 경계 아님) 뒤 Sonnet 응답 D — 모델 전환이라 재작성으로 안 셈.
 * 턴 3 (Sonnet, 2시간 뒤): 응답 E — 컨텍스트가 확 줄어든 압축 직후라 재작성으로 안 셈.
 */
const FIXTURE_LINES = [
  userLine('첫 작업을 부탁해', '2026-11-01T10:00:00.000Z'),
  assistantLine('req_A', OPUS, '2026-11-01T10:00:05.000Z', A, { text: '고칠게요' }),
  assistantLine('req_A', OPUS, '2026-11-01T10:00:06.000Z', A, { tool: 'Edit' }),
  toolResultLine('2026-11-01T10:00:07.000Z'),
  assistantLine('req_B', OPUS, '2026-11-01T10:00:20.000Z', B, { text: '끝났어요' }),
  userLine('간단한 질문 하나', '2026-11-01T12:00:00.000Z'),
  assistantLine('req_C', OPUS, '2026-11-01T12:00:05.000Z', C, { text: '네' }),
  userLine('<task-notification>백그라운드 작업 완료</task-notification>', '2026-11-01T12:00:20.000Z'),
  assistantLine('req_D', SONNET, '2026-11-01T12:00:30.000Z', D, { text: '확인했어요' }),
  {
    type: 'assistant',
    sessionId: SESSION_ID,
    timestamp: '2026-11-01T12:00:40.000Z',
    message: {
      role: 'assistant',
      model: '<synthetic>',
      content: [{ type: 'text', text: 'limit' }],
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  },
  userLine('큰 작업 시작', '2026-11-01T14:00:00.000Z'),
  assistantLine('req_E', SONNET, '2026-11-01T14:00:05.000Z', E, { text: '긴 답변' }),
]
const FIXTURE_TEXT = FIXTURE_LINES.map((line) => JSON.stringify(line)).join('\n')

const EXPECTED_SIGNALS: SessionUsageSignals = {
  requests: 5,
  contextTokens: 20010 + 21005 + 21505 + 21705 + 805,
  peakContextTokens: 21705,
  largeContextRequests: 0,
  cacheWriteTokens: 64700,
  byModel: {
    [OPUS]: { turns: 2, lightTurns: 1, idleRebuilds: 1, idleRebuildTokens: 21500 },
    [SONNET]: { turns: 1, lightTurns: 0, idleRebuilds: 0, idleRebuildTokens: 0 },
  },
}

function collect(lines: unknown[]): SessionUsageSignals | undefined {
  const collector = createUsageSignalCollector()
  for (const line of lines) collector.collect(line)
  return collector.finalize()
}

function session(usageSignals: SessionUsageSignals | undefined, source: SessionSource = 'claude') {
  return { source, usageSignals }
}

function signals(over: Partial<SessionUsageSignals> = {}): SessionUsageSignals {
  return {
    requests: 0,
    contextTokens: 0,
    peakContextTokens: 0,
    largeContextRequests: 0,
    cacheWriteTokens: 0,
    byModel: {},
    ...over,
  }
}

// === 수집기 단위 ============================================================
console.log('\n[usageSignals 수집기]')

test('픽스처 전체 — 요청·컨텍스트·재작성·가벼운 턴 집계', () => {
  assert.deepEqual(collect(FIXTURE_LINES), EXPECTED_SIGNALS)
})

test('usage 가 있는 응답이 없으면 undefined (absent = no-data)', () => {
  assert.equal(collect([userLine('안녕', '2026-11-01T10:00:00.000Z')]), undefined)
})

test('같은 requestId 의 추가 라인은 요청으로 다시 세지 않는다', () => {
  const out = collect([
    userLine('작업', '2026-11-01T10:00:00.000Z'),
    assistantLine('req_1', OPUS, '2026-11-01T10:00:01.000Z', A, { text: 'a' }),
    assistantLine('req_1', OPUS, '2026-11-01T10:00:02.000Z', A, { tool: 'Read' }),
    assistantLine('req_1', OPUS, '2026-11-01T10:00:03.000Z', A, { tool: 'Read' }),
  ])
  assert.equal(out?.requests, 1)
  assert.equal(out?.cacheWriteTokens, A.cacheWrite)
})

test('쉬지 않고 이어간 요청은 캐시를 못 읽어도 재작성으로 세지 않는다', () => {
  const out = collect([
    userLine('작업', '2026-11-01T10:00:00.000Z'),
    assistantLine('req_1', OPUS, '2026-11-01T10:00:05.000Z', A, { text: 'a' }),
    assistantLine('req_2', OPUS, '2026-11-01T10:01:00.000Z', C, { text: 'b' }),
  ])
  assert.equal(out?.byModel[OPUS].idleRebuilds, 0)
})

test('쉬었다 이어가도 캐시를 제대로 읽었으면 재작성이 아니다', () => {
  const out = collect([
    userLine('작업', '2026-11-01T10:00:00.000Z'),
    assistantLine('req_1', OPUS, '2026-11-01T10:00:05.000Z', A, { text: 'a' }),
    userLine('이어서', '2026-11-01T10:30:00.000Z'),
    assistantLine('req_2', OPUS, '2026-11-01T10:30:05.000Z', B, { text: 'b' }),
  ])
  assert.equal(out?.byModel[OPUS].idleRebuilds, 0)
})

test('도구 없이 짧게 답한 턴만 가벼운 턴 — 파일을 고쳤으면 아니다', () => {
  const short: Usage = { input: 1, cacheWrite: 0, cacheRead: 0, output: 100 }
  const out = collect([
    userLine('질문', '2026-11-01T10:00:00.000Z'),
    assistantLine('req_1', OPUS, '2026-11-01T10:00:01.000Z', short, { text: '답' }),
    userLine('고쳐줘', '2026-11-01T10:01:00.000Z'),
    assistantLine('req_2', OPUS, '2026-11-01T10:01:01.000Z', short, { tool: 'Write' }),
  ])
  assert.deepEqual(out?.byModel[OPUS], { turns: 2, lightTurns: 1, idleRebuilds: 0, idleRebuildTokens: 0 })
})

test('응답이 없던 턴(슬래시 명령·중단)은 턴으로 세지 않는다', () => {
  const short: Usage = { input: 1, cacheWrite: 0, cacheRead: 0, output: 100 }
  const out = collect([
    userLine('[Request interrupted by user]', '2026-11-01T10:00:00.000Z'),
    userLine('질문', '2026-11-01T10:00:10.000Z'),
    assistantLine('req_1', OPUS, '2026-11-01T10:00:11.000Z', short, { text: '답' }),
  ])
  assert.equal(out?.byModel[OPUS].turns, 1)
})

test('컨텍스트가 기준을 넘는 요청을 큰 컨텍스트로 센다', () => {
  const big: Usage = { input: 10, cacheWrite: 0, cacheRead: LARGE_CONTEXT_TOKENS, output: 10 }
  const small: Usage = { input: 10, cacheWrite: 0, cacheRead: 1000, output: 10 }
  const out = collect([
    userLine('작업', '2026-11-01T10:00:00.000Z'),
    assistantLine('req_1', OPUS, '2026-11-01T10:00:01.000Z', big, { text: 'a' }),
    assistantLine('req_2', OPUS, '2026-11-01T10:00:02.000Z', small, { text: 'b' }),
  ])
  assert.equal(out?.largeContextRequests, 1)
  assert.equal(out?.peakContextTokens, LARGE_CONTEXT_TOKENS + 10)
})

// === src/parser.ts 배선 =====================================================
console.log('\n[src/parser.ts 배선]')

const parsed = parseJsonl(FIXTURE_TEXT, 'usage-signals-fixture.jsonl')

test('parseJsonl 이 usageSignals 를 붙인다', () => {
  assert.deepEqual(parsed?.usageSignals, EXPECTED_SIGNALS)
})

test('토큰 합산은 requestId 당 한 번 — 쪼개진 라인의 반복 usage 를 중복 계상하지 않는다', () => {
  assert.equal(parsed?.totalTokens.output, 1500 + 200 + 100 + 50 + 3000)
  assert.equal(parsed?.totalTokens.cachedInput, 20000 + 300)
  assert.equal(parsed?.totalTokens.cacheWriteInput, 64700)
})

// === 코칭 룰 ================================================================
console.log('\n[buildUsageCoaching 룰]')

/** 요청 수만 채운 기본 세션 — 비율 룰의 표본 게이트 통과용 */
function base(over: Partial<SessionUsageSignals> = {}) {
  return session(signals({ requests: MIN_REQUESTS, contextTokens: MIN_REQUESTS * 1000, peakContextTokens: 1000, ...over }))
}

const ids = (sessions: ReturnType<typeof session>[]) => buildUsageCoaching(sessions).map((i) => i.id)

test('신호가 없으면 빈 배열', () => {
  assert.deepEqual(buildUsageCoaching([]), [])
  assert.deepEqual(buildUsageCoaching([session(undefined)]), [])
})

test('Codex 세션의 신호는 무시한다', () => {
  const s = session(signals({ requests: MIN_REQUESTS, cacheWriteTokens: 1000 }), 'codex')
  assert.deepEqual(buildUsageCoaching([s]), [])
  assert.equal(sumUsageSignals([s]).sessions, 0)
})

test('idle-cache-rebuild — 횟수·비중 둘 다 넘어야 발화, evidence 에 실측 수치', () => {
  const tokens = 1_000_000
  const fire = base({
    cacheWriteTokens: tokens / IDLE_REBUILD_MIN_SHARE,
    byModel: { [OPUS]: { turns: 0, lightTurns: 0, idleRebuilds: IDLE_REBUILD_MIN_COUNT, idleRebuildTokens: tokens } },
  })
  const insight = buildUsageCoaching([fire]).find((i) => i.id === 'idle-cache-rebuild')
  assert.ok(insight, '경계값에서 발화해야 한다')
  assert.equal(insight.kind, 'tip')
  assert.equal(insight.evidence.count, IDLE_REBUILD_MIN_COUNT)
  assert.equal(insight.evidence.tokens, tokens)
  // Opus 5.5: 캐시 쓰기 $5 − 읽기 $0.2 = 100만 토큰당 $4.8
  assert.ok(Math.abs(insight.evidence.extraUsd - 4.8) < 1e-9, `extraUsd=${insight.evidence.extraUsd}`)

  const tooFew = base({
    cacheWriteTokens: tokens,
    byModel: { [OPUS]: { turns: 0, lightTurns: 0, idleRebuilds: IDLE_REBUILD_MIN_COUNT - 1, idleRebuildTokens: tokens } },
  })
  assert.equal(ids([tooFew]).includes('idle-cache-rebuild'), false)

  const lowShare = base({
    cacheWriteTokens: (tokens / IDLE_REBUILD_MIN_SHARE) * 2,
    byModel: { [OPUS]: { turns: 0, lightTurns: 0, idleRebuilds: 50, idleRebuildTokens: tokens } },
  })
  assert.equal(ids([lowShare]).includes('idle-cache-rebuild'), false)
})

test('cache-continuity(칭찬) 와 idle-cache-rebuild 는 동시에 발화하지 않는다', () => {
  for (const share of [0, CACHE_CONTINUITY_MAX_SHARE, 0.1, IDLE_REBUILD_MIN_SHARE, 0.6]) {
    const s = base({
      cacheWriteTokens: 1_000_000,
      byModel: { [OPUS]: { turns: 0, lightTurns: 0, idleRebuilds: 20, idleRebuildTokens: 1_000_000 * share } },
    })
    const got = ids([s])
    assert.equal(
      got.includes('idle-cache-rebuild') && got.includes('cache-continuity'),
      false,
      `share=${share} 에서 두 룰이 함께 발화`
    )
  }
  const praise = base({ cacheWriteTokens: 1_000_000 })
  assert.deepEqual(ids([praise]), ['cache-continuity'])
})

test('large-context — 표본·비중 경계', () => {
  const fire = base({ largeContextRequests: MIN_REQUESTS * LARGE_CONTEXT_MIN_SHARE })
  assert.ok(ids([fire]).includes('large-context'))
  const few = session(signals({ requests: MIN_REQUESTS - 1, largeContextRequests: MIN_REQUESTS - 1 }))
  assert.equal(ids([few]).includes('large-context'), false)
  const low = base({ largeContextRequests: MIN_REQUESTS * LARGE_CONTEXT_MIN_SHARE - 1 })
  assert.equal(ids([low]).includes('large-context'), false)
})

test('top-tier-light-turns — 최상위 모델 턴만 본다, 칭찬 룰과 배타', () => {
  const turns = LIGHT_MIN_TOP_TIER_TURNS
  const tip = base({
    byModel: { [OPUS]: { turns, lightTurns: Math.ceil(turns * LIGHT_TIP_MIN_SHARE), idleRebuilds: 0, idleRebuildTokens: 0 } },
  })
  assert.ok(ids([tip]).includes('top-tier-light-turns'))
  assert.equal(ids([tip]).includes('right-sized-model'), false)

  const praise = base({
    byModel: { [OPUS]: { turns, lightTurns: Math.floor(turns * LIGHT_PRAISE_MAX_SHARE), idleRebuilds: 0, idleRebuildTokens: 0 } },
  })
  assert.ok(ids([praise]).includes('right-sized-model'))
  assert.equal(ids([praise]).includes('top-tier-light-turns'), false)

  // 가벼운 모델로 가벼운 일을 한 건 낭비가 아니다
  const sonnetOnly = base({
    byModel: { [SONNET]: { turns: 100, lightTurns: 100, idleRebuilds: 0, idleRebuildTokens: 0 } },
  })
  assert.equal(ids([sonnetOnly]).includes('top-tier-light-turns'), false)
  assert.equal(ids([sonnetOnly]).includes('right-sized-model'), false)
})

test('우선순위 — tip 먼저, praise 나중', () => {
  const s = base({
    largeContextRequests: MIN_REQUESTS,
    cacheWriteTokens: 1_000_000,
    byModel: { [OPUS]: { turns: 100, lightTurns: 0, idleRebuilds: 20, idleRebuildTokens: 500_000 } },
  })
  assert.deepEqual(ids([s]), ['idle-cache-rebuild', 'large-context', 'right-sized-model'])
})

test('isTopTierModel', () => {
  assert.equal(isTopTierModel('claude-fable-5-2'), true)
  assert.equal(isTopTierModel('claude-opus-5-5'), true)
  assert.equal(isTopTierModel('claude-sonnet-5-5'), false)
  assert.equal(isTopTierModel('claude-haiku-5-5'), false)
})

// === 가격표 =================================================================
console.log('\n[tokenPricing — 모델명 매칭]')

test('구체적인 버전이 먼저 매칭된다', () => {
  assert.equal(getClaudePrice('claude-fable-5-2').input, 8)
  assert.equal(getClaudePrice('claude-fable-5-1').input, 10)
  assert.equal(getClaudePrice('claude-opus-5-5').input, 4)
  assert.equal(getClaudePrice('claude-opus-5').input, 5)
  assert.equal(getClaudePrice('claude-opus-4-6').input, 5)
  assert.equal(getClaudePrice('claude-opus-4-5-20250414').input, 5)
  assert.equal(getClaudePrice('claude-opus-4-1-20250805').input, 15)
  assert.equal(getClaudePrice('claude-3-opus-20240229').input, 15)
  assert.equal(getClaudePrice('claude-sonnet-5-5').cacheRead, 0.1)
  assert.equal(getClaudePrice('claude-sonnet-5').input, 2)
  assert.equal(getClaudePrice('claude-sonnet-4-5-20250414').input, 3)
  assert.equal(getClaudePrice('claude-haiku-5-5').input, 0.1)
  assert.equal(getClaudePrice('claude-haiku-4-5-20251001').input, 1)
  assert.equal(getClaudePrice('claude-3-5-haiku-20241022').input, 0.8)
  assert.equal(getClaudePrice('claude-3-haiku-20240307').input, 0.25)
})

// === src ↔ cli 정합 =========================================================
console.log('\n[src ↔ cli 파서 정합]')

const distIndex = path.join(repoRoot, 'dist', 'index.html')
if (!fs.existsSync(distIndex)) {
  console.log('  ! dist/ 없음 — `npm run build` 후 실행할 것 (test:harness 는 build 이후에 이 테스트를 돈다)')
  failed++
} else {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memradar-usage-signals-'))
  fs.mkdirSync(path.join(fixtureDir, 'project'))
  fs.writeFileSync(path.join(fixtureDir, 'project', `${SESSION_ID}.jsonl`), FIXTURE_TEXT)
  const outPath = path.join(fixtureDir, 'out.html')

  try {
    execFileSync(process.execPath, [path.join(repoRoot, 'cli', 'index.mjs'), '--static'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        MEMRADAR_PROJECTS_DIR: fixtureDir,
        MEMRADAR_OUTPUT_HTML: outPath,
        MEMRADAR_NO_OPEN: '1',
        MEMRADAR_SKIP_UPDATE_CHECK: '1',
      },
      stdio: ['ignore', 'pipe', 'inherit'],
      encoding: 'utf8',
      timeout: 120000,
    })
    const html = fs.readFileSync(outPath, 'utf8')

    test('cli/index.mjs 가 src/parser.ts 와 동일한 usageSignals 를 방출한다', () => {
      const serialized = JSON.stringify(EXPECTED_SIGNALS)
      assert.ok(html.includes(`"usageSignals":${serialized}`), '정적 임베드의 usageSignals 가 다르다 — 두 파서가 갈라졌다')
    })

    test('cli/index.mjs 도 토큰을 requestId 당 한 번만, 캐시 읽기·쓰기를 나눠 합산한다', () => {
      assert.ok(
        html.includes('"output":4850,"cachedInput":20300,"cacheWriteInput":64700'),
        '정적 임베드의 토큰 합이 src/parser.ts 와 다르다'
      )
    })

    test('정적 임베드에 requestId 가 직렬화되지 않는다 (식별자 반출 금지)', () => {
      assert.equal(html.includes('req_A'), false)
      assert.equal(html.includes('"requestId"'), false)
    })
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true })
  }
}

// --- 결과 ------------------------------------------------------------------
console.log(`\n=== ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
