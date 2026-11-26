#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * AI 협업 스타일 신호 어설션 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/style-signals.test.mts   (dist/ 필요 — `npm run build` 후)
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위:
 *  - cli/lib/styleSignals.mjs 단위 — 요청 경계(origin · uuid 재등장 · Codex 작업 이벤트), 에이전트 호출,
 *    최종 답 판정, 확인/추측, 질문으로 끝내기, 감정을 받아 주기, 자동 실행 세션 제외 (Claude · Codex)
 *  - 파서 배선 — parseJsonl · codexProvider.parse 가 styleSignals 를 붙인다
 *  - **src↔cli 정합** — 같은 픽스처에 대해 web 파서와 CLI 파서가 같은 styleSignals 를 낸다.
 *    npx 기본 경로(정적)는 cli/index.mjs 를 쓰므로 갈라지면 화면마다 글자가 달라진다.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createStyleSignalCollector, CUE_PROMPT_MAX_CHARS } from '../src/lib/styleSignals.ts'
import { parseJsonl } from '../src/parser.ts'
import { codexProvider } from '../src/providers/codex.ts'
import type { SessionStyleSignals } from '../src/types.ts'

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

// --- Claude 픽스처 헬퍼 -----------------------------------------------------
const SESSION_ID = '11111111-2222-3333-4444-555555555555'
let clock = Date.parse('2026-11-01T10:00:00.000Z')
const tick = () => new Date((clock += 1000)).toISOString()

type Extra = Record<string, unknown>
const user = (text: string, extra: Extra = {}) => ({
  type: 'user', sessionId: SESSION_ID, cwd: '/Users/alice/work/alpha', version: '2.1.300', timestamp: tick(),
  message: { role: 'user', content: text }, ...extra,
})
const say = (text: string) => ({
  type: 'assistant', sessionId: SESSION_ID, timestamp: tick(),
  message: { role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }] },
})
const use = (name: string) => ({
  type: 'assistant', sessionId: SESSION_ID, timestamp: tick(),
  message: { role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: `t${clock}`, name, input: {} }] },
})
const toolResult = () => ({
  type: 'user', sessionId: SESSION_ID, timestamp: tick(),
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] },
})

function collectClaude(lines: unknown[]): SessionStyleSignals | undefined {
  const collector = createStyleSignalCollector('claude')
  for (const line of lines) collector.collect(line)
  return collector.finalize()
}

const NO_CUES = { frustration: [0, 0], joy: [0, 0], thanks: [0, 0], correction: [0, 0], worry: [0, 0] }

// === Claude 수집기 ==========================================================
console.log('\n[styleSignals 수집기 — Claude]')

test('요청 하나에 답 하나 — 요청·답을 한 번씩 센다', () => {
  const s = collectClaude([user('목록을 정리해줘'), say('정리했습니다.')])
  assert.deepEqual(s, {
    turns: 1, agentTurns: 0, answers: 1, askEndings: 0, guessAnswers: 0, verifiedAnswers: 0,
    cuedTurns: 0, cuedReceived: 0, cues: NO_CUES,
  })
})

test('도구 결과·끼워 넣은 문구는 요청 경계가 아니다', () => {
  const s = collectClaude([
    user('파일을 읽어줘'), use('Read'), toolResult(),
    user('<task-notification>done</task-notification>'),
    user('[Request interrupted by user]'),
    say('읽었습니다.'),
  ])
  assert.equal(s?.turns, 1)
  assert.equal(s?.answers, 1)
})

test('origin 이 사람이 아닌 프롬프트(알림·플러그인)는 요청으로 세지 않는다', () => {
  const s = collectClaude([
    user('시작해줘', { origin: { kind: 'human' } }), say('시작했습니다.'),
    user('플러그인이 보낸 문장', { origin: { kind: 'plugin' } }), say('처리했습니다.'),
  ])
  assert.equal(s?.turns, 1)
})

test('사람이 아닌 프롬프트에 한 답이 앞 요청의 최종 답을 덮어쓰지 않는다', () => {
  const s = collectClaude([
    user('이거 고쳐줘', { origin: { kind: 'human' } }), say('고쳤습니다.'),
    user('<task-notification>빌드 끝</task-notification>', { origin: { kind: 'task-notification' } }),
    use('Agent'), toolResult(), say('어떻게 할까요?'),
  ])
  assert.equal(s?.turns, 1)
  assert.equal(s?.answers, 1)
  assert.equal(s?.askEndings, 0, '질문으로 끝난 건 알림에 한 답이다')
  assert.equal(s?.agentTurns, 0)
})

test('사람이 친 요청 앞에 붙은 마크업은 걷어 내고 요청으로 센다', () => {
  const s = collectClaude([
    user('<system-reminder>규칙 안내</system-reminder>\n<pasted_content id="a1">긴 로그</pasted_content>\n아 짜증나 또 안 돼', { origin: { kind: 'human' } }),
    say('죄송합니다. 제가 놓쳤습니다.'),
    user('<command-message>review</command-message>', { origin: { kind: 'human' } }), say('검토했습니다.'),
  ])
  assert.equal(s?.turns, 2)
  assert.deepEqual(s?.cues.frustration, [1, 1], '감정은 마크업을 걷어 낸 사용자의 말에서 찾는다')
})

test('같은 uuid 가 다시 나온 줄은 한 번만 센다', () => {
  const ask = user('목록을 정리해줘', { uuid: 'u-1' })
  const answer = { ...say('정리했습니다.'), uuid: 'a-1' }
  const s = collectClaude([ask, answer, ask, answer, user('하나 더', { uuid: 'u-2' }), { ...say('했습니다.'), uuid: 'a-2' }])
  assert.equal(s?.turns, 2)
  assert.equal(s?.answers, 2)
})

test('답도 도구도 없던 요청은 세지 않는다', () => {
  const s = collectClaude([user('/clear'), user('안녕'), say('안녕하세요.')])
  assert.equal(s?.turns, 1)
})

test('E/I — 에이전트를 부른 요청을 센다 (요청당 한 번)', () => {
  const s = collectClaude([
    user('조사해줘'), use('Agent'), use('Agent'), toolResult(), say('조사했습니다.'),
    user('고쳐줘'), use('Edit'), toolResult(), say('고쳤습니다.'),
    user('나눠서 돌려줘'), use('Workflow'), toolResult(), say('돌렸습니다.'),
  ])
  assert.equal(s?.turns, 3)
  assert.equal(s?.agentTurns, 2)
})

test('최종 답 — 마지막 글 뒤에 도구를 또 썼으면 답으로 끝난 요청이 아니다', () => {
  const s = collectClaude([user('고쳐줘'), say('먼저 읽어 볼게요. 어떻게 할까요?'), use('Read'), toolResult()])
  assert.equal(s?.turns, 1)
  assert.equal(s?.answers, 0)
  assert.equal(s?.askEndings, 0)
})

test('최종 답 — 앱 관리용 호출은 답 뒤에 와도 답으로 끝난 것으로 본다', () => {
  const s = collectClaude([user('고쳐줘'), say('고쳤습니다.'), use('mcp__ccd_turn__wrap_up'), use('SendUserFile')])
  assert.equal(s?.answers, 1)
})

test('J/P — 질문·선택지로 끝난 답만 센다 (중간 말은 보지 않는다)', () => {
  const s = collectClaude([
    user('A를 해줘'), say('어느 쪽으로 할까요?'), use('Edit'), toolResult(), say('끝냈습니다.'),
    user('B를 해줘'), say('두 가지 방법이 있습니다. 어느 쪽으로 할까요?'),
  ])
  assert.equal(s?.answers, 2)
  assert.equal(s?.askEndings, 1)
})

test('S/N — 확인 표현과 추측 표현을 따로 센다', () => {
  const s = collectClaude([
    user('상태 알려줘'), say('테스트는 전부 통과했습니다.'),
    user('원인이 뭐야'), say('아마 캐시 문제인 것 같습니다.'),
    user('이름 바꿔줘'), say('바꿨습니다.'),
  ])
  assert.equal(s?.verifiedAnswers, 1)
  assert.equal(s?.guessAnswers, 1)
})

test('S/N — 부정·예정으로 쓴 확인 표현은 확인이 아니다', () => {
  const s = collectClaude([
    user('상태 알려줘'), say('아직 검증하지 않았습니다.'),
    user('그럼 지금은'), say('검증 전입니다. 곧 검증하겠습니다.'),
    user('영어로'), say('This is not yet verified, and the fix is unverified.'),
    user('다 됐어'), say('화면은 검증하지 않았지만 테스트는 전부 통과했습니다.'),
  ])
  assert.equal(s?.answers, 4)
  assert.equal(s?.verifiedAnswers, 1, '부정되지 않은 표현이 하나라도 있는 마지막 답만 센다')
})

test('인용·코드 안의 말은 판정하지 않는다', () => {
  const s = collectClaude([
    user('문구 정리해줘'), say('"할까요?" 문구를 삭제했습니다.'),
    user('플래그 지워줘'), say('`verified` 플래그를 지웠습니다.\n\n```ts\n// probably unused — should I keep it?\n```'),
    user('"wrong password" 라고 떠'), say('원인은 만료된 토큰입니다.'),
  ])
  assert.equal(s?.answers, 3)
  assert.equal(s?.askEndings, 0)
  assert.equal(s?.verifiedAnswers, 0)
  assert.equal(s?.guessAnswers, 0)
  assert.equal(s?.cuedTurns, 0, '사용자가 옮겨 적은 오류 문구는 지적이 아니다')
})

test('T/F — 이모지만으로는 받아 준 게 아니다', () => {
  const s = collectClaude([user('아 짜증나 또 안 돼'), say('📊 원인은 정렬 순서입니다.')])
  assert.equal(s?.cuedTurns, 1)
  assert.equal(s?.cuedReceived, 0)
})

test('T/F — 감정이 드러난 요청에서 답 첫머리가 받아 주는지 본다', () => {
  const s = collectClaude([
    user('아 짜증나 또 안 돼'), say('죄송합니다. 제가 놓쳤습니다.'), use('Edit'), toolResult(), say('고쳤습니다.'),
    user('이거 틀렸어 다시 해'), say('원인은 정렬 순서입니다.'),
    user('버튼 색 바꿔줘'), say('죄송합니다, 바꿨습니다.'),
  ])
  assert.equal(s?.cuedTurns, 2, '세 번째 요청은 감정 신호가 없다')
  assert.equal(s?.cuedReceived, 1)
  assert.deepEqual(s?.cues.frustration, [1, 1])
  assert.deepEqual(s?.cues.correction, [2, 1], '"또 안 돼" 는 지적에도 걸린다 — 상황은 겹칠 수 있다')
})

test('T/F — 받아 주는 말이 답 뒤쪽에만 있으면 받아 준 게 아니다', () => {
  const s = collectClaude([user('아 답답해'), say(`원인은 설정 파일입니다. ${'설명 '.repeat(80)} 죄송합니다.`)])
  assert.equal(s?.cuedTurns, 1)
  assert.equal(s?.cuedReceived, 0)
})

test('T/F — 긴 프롬프트의 우연한 일치는 세지 않는다', () => {
  const s = collectClaude([user(`로그 붙여 넣음 ${'x'.repeat(CUE_PROMPT_MAX_CHARS)} 짜증`), say('죄송합니다.')])
  assert.equal(s?.cuedTurns, 0)
})

test('스크립트가 돌린 세션(sdk-cli)은 신호를 내지 않는다', () => {
  const s = collectClaude([user('You are generating one sprite.', { entrypoint: 'sdk-cli' }), say('Done.')])
  assert.equal(s, undefined)
})

test('AI 가 답한 요청이 없으면 undefined', () => {
  assert.equal(collectClaude([user('/clear')]), undefined)
})

// === Codex 수집기 ===========================================================
console.log('\n[styleSignals 수집기 — Codex]')

const meta = (source: unknown) => ({ type: 'session_meta', payload: { id: 'codex-1', cwd: '/Users/alice/work/beta', cli_version: '0.160.0', source } })
const cUser = (text: string) => ({ type: 'response_item', timestamp: tick(), payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } })
const cSay = (text: string, phase?: string) => ({ type: 'response_item', timestamp: tick(), payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }], ...(phase ? { phase } : {}) } })
const cEvent = (type: string) => ({ type: 'event_msg', timestamp: tick(), payload: { type, turn_id: 't' } })
const cCall = (name: string, type = 'function_call') => ({ type: 'response_item', timestamp: tick(), payload: { type, name } })

function collectCodex(records: unknown[]): SessionStyleSignals | undefined {
  const collector = createStyleSignalCollector('codex')
  for (const record of records) collector.collect(record)
  return collector.finalize()
}

const CODEX_RECORDS = [
  meta('vscode'),
  cUser('# AGENTS.md instructions for /Users/alice/work/beta\n\n<INSTRUCTIONS>규칙</INSTRUCTIONS>'),
  cUser('<environment_context>\n  <cwd>/Users/alice/work/beta</cwd>\n</environment_context>'),
  cUser('# Files mentioned by the user:\n\n## a.png\n\n## My request for Codex:\n이미지 넣어줘'),
  cSay('넣어 보겠습니다.'), cCall('exec', 'custom_tool_call'), cSay('넣었습니다.'),
  cUser('세 가지를 나눠서 조사해줘'),
  cCall('spawn_agent'), cCall('wait_agent'), cSay('조사 결과를 확인했습니다.'),
]
const CODEX_EXPECTED: SessionStyleSignals = {
  turns: 2, agentTurns: 1, answers: 2, askEndings: 0, guessAnswers: 0, verifiedAnswers: 1,
  cuedTurns: 0, cuedReceived: 0, cues: NO_CUES as SessionStyleSignals['cues'],
}

test('설정 문구는 요청이 아니고, IDE 가 감싼 요청은 알맹이만 본다', () => {
  assert.deepEqual(collectCodex(CODEX_RECORDS), CODEX_EXPECTED)
})

test('custom_tool_call 도 도구로 본다 — 그 뒤에 글이 없으면 답으로 끝난 게 아니다', () => {
  const s = collectCodex([meta('vscode'), cUser('고쳐줘'), cSay('고칠게요.'), cCall('exec', 'custom_tool_call')])
  assert.equal(s?.turns, 1)
  assert.equal(s?.answers, 0)
})

test('작업 이벤트가 있으면 작업 하나가 요청 하나다 — 도중에 보낸 말은 같은 요청', () => {
  const s = collectCodex([
    meta('vscode'),
    cEvent('task_started'),
    cUser('<environment_context>\n  <cwd>/Users/alice/work/beta</cwd>\n</environment_context>'),
    cUser('세 가지를 조사해줘'),
    cSay('조사를 시작합니다.', 'commentary'), cCall('spawn_agent'),
    cUser('하나는 빼도 돼'),
    cSay('두 가지만 봅니다.', 'commentary'), cCall('exec', 'custom_tool_call'),
    cSay('조사 결과를 확인했습니다.', 'final_answer'),
    cEvent('task_complete'),
  ])
  assert.equal(s?.turns, 1)
  assert.equal(s?.agentTurns, 1)
  assert.equal(s?.answers, 1)
  assert.equal(s?.verifiedAnswers, 1)
})

test('중간 진행 글(commentary)로 끝난 작업은 최종 답이 없다', () => {
  const s = collectCodex([
    meta('vscode'),
    cEvent('task_started'), cUser('고쳐줘'), cSay('어느 쪽으로 할까요?', 'commentary'), cEvent('turn_aborted'),
  ])
  assert.equal(s?.turns, 1)
  assert.equal(s?.answers, 0)
  assert.equal(s?.askEndings, 0)
})

test('사람이 보낸 말 없이 돈 작업은 세지 않는다', () => {
  const s = collectCodex([
    meta('vscode'),
    cEvent('task_started'), cUser('고쳐줘'), cSay('고쳤습니다.', 'final_answer'), cEvent('task_complete'),
    cEvent('task_started'), cCall('send_message'), cSay('에이전트 결과를 정리할까요?', 'final_answer'), cEvent('task_complete'),
  ])
  assert.equal(s?.turns, 1)
  assert.equal(s?.agentTurns, 0)
  assert.equal(s?.askEndings, 0)
})

test('앱이 감싼 요청과 질문에 고른 답도 사람의 요청이다', () => {
  const s = collectCodex([
    meta('vscode'),
    cEvent('task_started'),
    cUser('<in-app-browser-context source="ambient">탭 정보</in-app-browser-context>\n\n아 짜증나 또 안 돼'),
    cSay('죄송합니다. 어느 쪽으로 고칠까요?', 'final_answer'), cEvent('task_complete'),
    cEvent('task_started'),
    cUser('<send_user_message_question_reply>첫 번째</send_user_message_question_reply>'),
    cSay('고쳤습니다.', 'final_answer'), cEvent('task_complete'),
  ])
  assert.equal(s?.turns, 2)
  assert.equal(s?.answers, 2)
  assert.deepEqual(s?.cues.frustration, [1, 1])
})

test('스크립트가 돌린 세션(exec)과 에이전트가 띄운 세션은 신호를 내지 않는다', () => {
  assert.equal(collectCodex([meta('exec'), cUser('do it'), cSay('done')]), undefined)
  assert.equal(collectCodex([meta({ subagent: { thread_spawn: { parent_thread_id: 'p' } } }), cUser('do it'), cSay('done')]), undefined)
})

// === 파서 배선 ==============================================================
console.log('\n[파서 배선]')

const CLAUDE_LINES = [
  user('조사해줘', { entrypoint: 'claude-desktop', origin: { kind: 'human' } }),
  use('Agent'), toolResult(), say('확인했습니다. 원인은 캐시입니다.'),
  user('아 짜증나 또 안 돼'), say('죄송합니다. 어느 쪽으로 고칠까요?'),
]
const CLAUDE_TEXT = CLAUDE_LINES.map((line) => JSON.stringify(line)).join('\n')
const CLAUDE_EXPECTED: SessionStyleSignals = {
  turns: 2, agentTurns: 1, answers: 2, askEndings: 1, guessAnswers: 0, verifiedAnswers: 1,
  cuedTurns: 1, cuedReceived: 1,
  cues: { frustration: [1, 1], joy: [0, 0], thanks: [0, 0], correction: [1, 1], worry: [0, 0] },
}
const CODEX_TEXT = CODEX_RECORDS.map((record) => JSON.stringify(record)).join('\n')

test('parseJsonl 이 styleSignals 를 붙인다', () => {
  assert.deepEqual(parseJsonl(CLAUDE_TEXT, `${SESSION_ID}.jsonl`)?.styleSignals, CLAUDE_EXPECTED)
})

test('codexProvider.parse 가 styleSignals 를 붙인다', () => {
  assert.deepEqual(codexProvider.parse(CODEX_TEXT, 'rollout-codex-1.jsonl')?.styleSignals, CODEX_EXPECTED)
})

test('자동 실행 세션은 필드 자체가 없다', () => {
  const automated = [user('generate', { entrypoint: 'sdk-cli' }), say('done')].map((l) => JSON.stringify(l)).join('\n')
  const parsed = parseJsonl(automated, 'auto.jsonl')
  assert.ok(parsed)
  assert.equal('styleSignals' in parsed, false)
})

// === src ↔ cli 정합 =========================================================
console.log('\n[src ↔ cli 파서 정합]')

const distIndex = path.join(repoRoot, 'dist', 'index.html')
if (!fs.existsSync(distIndex)) {
  console.log('  ! dist/ 없음 — `npm run build` 후 실행할 것 (test:harness 는 build 이후에 이 테스트를 돈다)')
  failed++
} else {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memradar-style-signals-'))
  const claudeDir = path.join(fixtureDir, 'claude')
  const codexDir = path.join(fixtureDir, 'codex')
  fs.mkdirSync(path.join(claudeDir, 'project'), { recursive: true })
  fs.mkdirSync(codexDir)
  fs.writeFileSync(path.join(claudeDir, 'project', `${SESSION_ID}.jsonl`), CLAUDE_TEXT)
  fs.writeFileSync(path.join(codexDir, 'rollout-codex-1.jsonl'), CODEX_TEXT)
  const outPath = path.join(fixtureDir, 'out.html')

  try {
    execFileSync(process.execPath, [path.join(repoRoot, 'cli', 'index.mjs'), '--static'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        MEMRADAR_PROJECTS_DIR: claudeDir,
        MEMRADAR_CODEX_DIR: codexDir,
        MEMRADAR_OUTPUT_HTML: outPath,
        MEMRADAR_NO_OPEN: '1',
        MEMRADAR_SKIP_UPDATE_CHECK: '1',
      },
      stdio: ['ignore', 'pipe', 'inherit'],
      encoding: 'utf8',
      timeout: 120000,
    })
    const html = fs.readFileSync(outPath, 'utf8')

    test('cli/index.mjs 가 Claude 세션에 src/parser.ts 와 동일한 styleSignals 를 방출한다', () => {
      assert.ok(html.includes(`"styleSignals":${JSON.stringify(CLAUDE_EXPECTED)}`), '정적 임베드의 Claude styleSignals 가 다르다 — 두 파서가 갈라졌다')
    })

    test('cli/index.mjs 가 Codex 세션에 src/providers/codex.ts 와 동일한 styleSignals 를 방출한다', () => {
      assert.ok(html.includes(`"styleSignals":${JSON.stringify(CODEX_EXPECTED)}`), '정적 임베드의 Codex styleSignals 가 다르다 — 두 파서가 갈라졌다')
    })
  } catch (e) {
    failed++
    console.log(`  ✗ CLI 실행 실패\n    ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true })
  }
}

// --- 결과 ------------------------------------------------------------------
console.log(`\n=== ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
