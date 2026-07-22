#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * hooks-analytics 검증 스위트 (docs/goal/hooks-analytics.md D8)
 *
 * 실행: npx tsx tests/hook-events.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위:
 *  - cli/lib/hookExtract.mjs 수집기 — 실측 검증된 해저드 케이스를 정확한
 *    카운트로 단언 (동반 레코드 비집계, Stop 정합, denial 추출, mojibake)
 *  - src/parser.ts 배선 (parseJsonl / collectHookExecutions / buildHookStats)
 *  - cli/lib/hookScan.mjs — 매처 무예외, 비활성 플러그인 제외, UNC 거부
 *  - 센티널 누출 스위트 — 정적 HTML / /api/hooks 직렬화 / export
 *
 * 주의: 정적 HTML 섹션은 dist/ 빌드가 필요하다 (test:harness 체인은 build
 * 후 실행). 픽스처의 시크릿·센티널은 전부 형태만 유효한 더미다.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHookCollector, commandDigest, asciiSkeleton, HOOK_DENIAL_RE } from '../cli/lib/hookExtract.mjs'
import {
  scanHooks,
  compileHookMatcher,
  matchHookEntries,
  buildHookTelemetryRows,
  toPublicHookEntries,
  toServerHookEntries,
} from '../cli/lib/hookScan.mjs'
import { parseJsonl, collectHookExecutions, buildHookStats, computeStats } from '../src/parser.ts'
import { buildMarkdown, buildHtmlChat, buildHookSummaryLines } from '../src/lib/sessionExport.ts'
import type { Session, HookSummaryRow } from '../src/types.ts'

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

function section(title: string): void {
  console.log(`\n--- ${title} ---`)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const fixturePath = path.join(__dirname, 'fixtures', 'logs', 'sample-project', 'session-hooks.jsonl')
const fixtureText = fs.readFileSync(fixturePath, 'utf-8')

const totalOf = (row: { counts: HookSummaryRow['counts'] }) =>
  row.counts.success + row.counts.denied + row.counts.blockingError + row.counts.nonBlockingError +
  row.counts.cancelled + row.counts.timedOut + row.counts.summaryOnly

// === commandDigest / asciiSkeleton =========================================
section('commandDigest / asciiSkeleton')

const nodeDigest8 = (s: string) => createHash('sha256').update(s, 'utf-8').digest('hex').slice(0, 8)

test('sha256 순수 구현이 node:crypto 와 일치 (ASCII)', () => {
  assert.equal(commandDigest('abc'), nodeDigest8('abc'))
  assert.equal(commandDigest('node stop-hook.js'), nodeDigest8('node stop-hook.js'))
})

test('sha256 순수 구현이 node:crypto 와 일치 (UTF-8 한글 + 멀티블록)', () => {
  assert.equal(commandDigest('node "C:\\hooks\\stop-체크.js"'), nodeDigest8('node "C:\\hooks\\stop-체크.js"'))
  const long = 'x'.repeat(200) + '긴 명령어 문자열'
  assert.equal(commandDigest(long), nodeDigest8(long))
})

test('빈/비문자열 command 는 unknown', () => {
  assert.equal(commandDigest(''), 'unknown')
  assert.equal(commandDigest(undefined as unknown as string), 'unknown')
})

test('asciiSkeleton — 비ASCII 런 제거, ASCII 는 불변', () => {
  assert.equal(asciiSkeleton('node "C:\\hooks\\stop-체크.js"'), 'node "C:\\hooks\\stop-.js"')
  assert.equal(asciiSkeleton('node "C:\\hooks\\check-��.js"'), 'node "C:\\hooks\\check-.js"')
  assert.equal(asciiSkeleton('node plain.js'), 'node plain.js')
})

// === 픽스처 파싱 — 해저드 케이스 정확 카운트 ===============================
section('수집기 — 해저드 케이스 (session-hooks.jsonl)')

const session = parseJsonl(fixtureText, 'session-hooks.jsonl')
assert.ok(session, 'fixture session must parse')
const rows = session!.hookSummary?.rows ?? []
const findRow = (hookName: string, commandKey: string) =>
  rows.find((r) => r.hookName === hookName && r.commandKey === commandKey)

test('hookSummary 존재 + 행 수 정확 (13행)', () => {
  assert.ok(session!.hookSummary)
  assert.equal(rows.length, 13)
})

test('D2: success+system_message 쌍 → 실행 1회 (동반 레코드 비집계)', () => {
  const cmd = 'node hook-a.js HOOKSENTINELCMD7f3a --webhook https://hooks.slack.com/services/T0SENTINEL/B0SENTINEL/hooksentinelwebhook42'
  const row = findRow('PostToolUse:Edit', commandDigest(cmd))
  assert.ok(row, 'PostToolUse:Edit row missing')
  assert.deepEqual(row!.counts, { success: 1, denied: 0, blockingError: 0, nonBlockingError: 0, cancelled: 0, timedOut: 0, summaryOnly: 0 })
  assert.equal(row!.hasSystemMessage, true)
  assert.equal(row!.durationMsSum, 120)
  assert.equal(row!.durationMsCount, 1)
})

test('D2: success+additional_context → 실행 1회 + additionalContextCount 1', () => {
  const row = findRow('PostToolUse:Write', commandDigest('node hook-ctx.js'))
  assert.ok(row)
  assert.equal(totalOf(row!), 1)
  assert.equal(row!.counts.success, 1)
  assert.equal(row!.additionalContextCount, 1)
})

test('D3: duplicate-command stop_hook_summary + attachment → durationMs 우선 귀속, 이중 집계 없음', () => {
  const row = findRow('Stop', commandDigest('node stop-hook.js'))
  assert.ok(row)
  // attachment(250ms)가 durationMs 로 두 번째 hookInfos 를 소비 → 첫 번째(100ms)만 summaryOnly
  assert.equal(row!.counts.success, 1)
  assert.equal(row!.counts.summaryOnly, 1)
  assert.equal(row!.durationMsSum, 350)
  assert.equal(row!.durationMsCount, 2)
  assert.equal(row!.encodingDamaged, undefined)
})

test('D3: mojibake hookInfos (attachment 없음) → summaryOnly + 스켈레톤 commandKey + encodingDamaged', () => {
  const skel = asciiSkeleton('node "C:\\hooks\\stop-체크.js"')
  const row = findRow('Stop', commandDigest(skel))
  assert.ok(row, 'mojibake summaryOnly row missing')
  assert.equal(row!.counts.summaryOnly, 1)
  assert.equal(totalOf(row!), 1)
  assert.equal(row!.durationMsSum, 77)
  assert.equal(row!.encodingDamaged, true)
})

test('D3: mojibake attachment ↔ 정상 hookInfos → 스켈레톤 3차 귀속, summaryOnly 미발생', () => {
  const row = findRow('Stop', commandDigest('node "C:\\hooks\\check-��.js"'))
  assert.ok(row)
  assert.deepEqual(row!.counts, { success: 1, denied: 0, blockingError: 0, nonBlockingError: 0, cancelled: 0, timedOut: 0, summaryOnly: 0 })
  assert.equal(row!.durationMsSum, 88)
})

test('D10: denial tool_result → denied 1 + hookName/command 추출', () => {
  const cmd = 'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/check-triage.sh"'
  const row = findRow('PreToolUse:Edit', commandDigest(cmd))
  assert.ok(row, 'denial row missing')
  assert.equal(row!.counts.denied, 1)
  assert.equal(totalOf(row!), 1)
  assert.equal(row!.hookEvent, 'PreToolUse')
})

test('D10: 산문 사본(텍스트 블록)은 집계되지 않음', () => {
  // 산문 메시지의 동일 문자열이 집계됐다면 denied 가 2가 됐을 것
  const denialRows = rows.filter((r) => r.counts.denied > 0)
  const deniedTotal = denialRows.reduce((acc, r) => acc + r.counts.denied, 0)
  assert.equal(deniedTotal, 2) // tu-denial-1 + tu-denial-2 (tu-denial-3 은 attachment 로 dedup)
})

test('D10: `]:` 포함 command 도 정확 추출 (denial 정규식 고정)', () => {
  const row = findRow('PreToolUse:Bash', commandDigest('bash guard]:v2.sh'))
  assert.ok(row, ']: command row missing')
  assert.equal(row!.counts.denied, 1)
})

test('D3/D10: denial 과 hook_blocking_error 공유 toolUseID → 1회만 (attachment 우선)', () => {
  const row = findRow('PreToolUse:Write', commandDigest('bash dedup-hook.sh'))
  assert.ok(row)
  assert.deepEqual(row!.counts, { success: 0, denied: 0, blockingError: 1, nonBlockingError: 0, cancelled: 0, timedOut: 0, summaryOnly: 0 })
})

test('D2: 다중 command 그룹 → 행 2개, duration 병합 없음', () => {
  const rowA = findRow('SessionStart', commandDigest('node multi-a.js'))
  const rowB = findRow('SessionStart', commandDigest('node multi-b.js'))
  assert.ok(rowA && rowB)
  assert.equal(rowA!.counts.success, 1)
  assert.equal(rowB!.counts.success, 1)
  assert.equal(rowA!.durationMsSum, 10)
  assert.equal(rowB!.durationMsSum, 20)
})

test('D2: 다중 command 그룹의 command 없는 동반 레코드 → (hookName, unknown) 행, 실행 0', () => {
  const row = findRow('SessionStart', 'unknown')
  assert.ok(row, 'unknown companion row missing')
  assert.equal(totalOf(row!), 0)
  assert.equal(row!.hasSystemMessage, true)
})

test('교차심문: timedOut 은 cancelled 와 구분 집계', () => {
  const row = findRow('PreToolUse:Read', commandDigest('node slow.js'))
  assert.ok(row)
  assert.equal(row!.counts.cancelled, 1)
  assert.equal(row!.counts.timedOut, 1)
  assert.equal(row!.durationMsSum, 8300)
  assert.equal(row!.durationMsCount, 2)
})

test('non_blocking_error 집계', () => {
  const row = findRow('PostToolUse:Bash', commandDigest('node warn.js'))
  assert.ok(row)
  assert.equal(row!.counts.nonBlockingError, 1)
})

test('malformed 레코드 fail-soft — hookInfos 문자열/attachment null/깨진 JSON 무시', () => {
  // 위 13행 정확 카운트가 이미 증거 — 추가로 수집기 직접 호출로 무예외 확인
  const collector = createHookCollector()
  collector.collect({ type: 'system', subtype: 'stop_hook_summary', hookInfos: 'garbage' })
  collector.collect({ type: 'attachment', attachment: null })
  collector.collect({ type: 'attachment', attachment: { type: 'hook_success', hookName: 42, command: 99 } })
  collector.collect(null)
  collector.collect('string')
  const { summary } = collector.finalize()
  // hookName/command 가 숫자인 레코드는 (unknown) 폴백으로 1건 집계될 수 있으나 throw 는 절대 금지.
  assert.ok(summary === undefined || Array.isArray(summary.rows))
})

test('구조적 프라이버시 — summary 직렬화에 command/stdout/stderr/content 키 부재', () => {
  const json = JSON.stringify(session!.hookSummary)
  assert.ok(!json.includes('"command"'))
  assert.ok(!json.includes('"stdout"'))
  assert.ok(!json.includes('"stderr"'))
  assert.ok(!json.includes('"content"'))
  assert.ok(!json.includes('HOOKSENTINEL'))
})

// === buildHookStats / computeStats =========================================
section('buildHookStats / computeStats')

test('buildHookStats — 코퍼스 합계 정확', () => {
  const stats = buildHookStats([session!])
  assert.equal(stats.hasHookData, true)
  assert.equal(stats.totalObserved, 14) // 성공6+거부2+차단1+실패1+취소1+시간초과1+요약만2
  assert.equal(stats.deniedTotal, 2)
  assert.equal(stats.failureTotal, 2) // blockingError 1 + nonBlockingError 1
  assert.equal(stats.sessionsWithHooks, 1)
  assert.equal(stats.eligibleSessions, 1)
  assert.equal(stats.uniqueHooks, 9)
  assert.equal(stats.byHook.length, 13)
})

test('buildHookStats — avgDurationMs 는 durationMsCount 0 이면 null', () => {
  const stats = buildHookStats([session!])
  const denied = stats.byHook.find((r) => r.hookName === 'PreToolUse:Edit')
  assert.ok(denied)
  assert.equal(denied!.avgDurationMs, null)
  const stop = stats.byHook.find((r) => r.hookName === 'Stop' && r.commandKey === commandDigest('node stop-hook.js'))
  assert.equal(stop!.avgDurationMs, 175) // 350 / 2
})

test('D9: Codex 세션은 eligible 에서 제외, hookSummary 부재 관용', () => {
  const codex = { ...session!, id: 'codex-1', source: 'codex' as const }
  const bare = { ...session!, id: 'bare-1' }
  delete (bare as Partial<Session>).hookSummary
  const stats = buildHookStats([codex, bare])
  assert.equal(stats.eligibleSessions, 1) // bare(claude)만
  assert.equal(stats.sessionsWithHooks, 0)
  assert.equal(stats.hasHookData, false)
  assert.equal(stats.totalObserved, 0)
})

test('computeStats — hooks 포함, topSkills 제거', () => {
  const stats = computeStats([session!])
  assert.ok(stats.hooks)
  assert.equal(stats.hooks.totalObserved, 14)
  assert.ok(!('topSkills' in stats))
})

// === collectHookExecutions (tier-2) ========================================
section('collectHookExecutions — tier-2 상세')

test('실행 상세 12건 (터미널 10 + denial 2), summaryOnly 는 상세 제외', () => {
  const executions = collectHookExecutions(fixtureText)
  assert.equal(executions.length, 12)
  assert.ok(executions.every((e) => ['success', 'denied', 'blocking_error', 'non_blocking_error', 'cancelled'].includes(e.outcome)))
})

test('상세에는 stdout/additionalContext 페이로드 포함 (서버 전용 tier)', () => {
  const executions = collectHookExecutions(fixtureText)
  const pair = executions.find((e) => e.toolUseID === 'tu-pair-1')
  assert.ok(pair)
  assert.equal(pair!.stdout, 'HOOKSENTINELSTDOUT9c2e ok')
  const ctx = executions.find((e) => e.toolUseID === 'tu-ctx-1')
  assert.deepEqual(ctx!.additionalContext, ['<ide_diagnostics>fixture diag</ide_diagnostics>'])
})

test('denial 상세 — outcome denied + command 원문', () => {
  const executions = collectHookExecutions(fixtureText)
  const denial = executions.find((e) => e.toolUseID === 'tu-denial-1')
  assert.ok(denial)
  assert.equal(denial!.outcome, 'denied')
  assert.equal(denial!.command, 'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/check-triage.sh"')
})

test('timedOut 상세 플래그', () => {
  const executions = collectHookExecutions(fixtureText)
  const timeout = executions.find((e) => e.toolUseID === 'tu-timeout-1')
  assert.equal(timeout!.outcome, 'cancelled')
  assert.equal(timeout!.timedOut, true)
  const cancel = executions.find((e) => e.toolUseID === 'tu-cancel-1')
  assert.equal(cancel!.timedOut, undefined)
})

test('타임스탬프 오름차순 정렬', () => {
  const executions = collectHookExecutions(fixtureText)
  for (let i = 1; i < executions.length; i++) {
    assert.ok(executions[i - 1].timestamp <= executions[i].timestamp)
  }
})

// === denial 정규식 고정 (D10) ==============================================
section('HOOK_DENIAL_RE 고정')

test('기본 형태 매치 + 그룹 추출', () => {
  const m = HOOK_DENIAL_RE.exec('PreToolUse:Edit hook error: [bash check.sh]: 차단')
  assert.ok(m)
  assert.equal(m![1], 'PreToolUse:Edit')
  assert.equal(m![2], 'bash check.sh')
})

test('매처 없는 이벤트 (Stop hook error) 매치', () => {
  const m = HOOK_DENIAL_RE.exec('Stop hook error: [node stop.js]: 사유')
  assert.ok(m)
  assert.equal(m![1], 'Stop')
})

test('문자열 중간에서 시작하면 비매치 (^ 앵커)', () => {
  assert.equal(HOOK_DENIAL_RE.exec('오류: PreToolUse:Edit hook error: [x]: y'), null)
})

// === hookScan — 매처/게이트/플러그인 =======================================
section('hookScan — 매처 컴파일 (무예외)')

test("'*' / '' / null 은 전체 매치", () => {
  assert.equal(compileHookMatcher('*')('Edit'), true)
  assert.equal(compileHookMatcher('')(''), true)
  assert.equal(compileHookMatcher(null)('anything'), true)
})

test('정상 정규식은 full-string 매치', () => {
  const m = compileHookMatcher('Edit|Write')
  assert.equal(m('Edit'), true)
  assert.equal(m('Write'), true)
  assert.equal(m('EditX'), false)
  assert.equal(m(''), false)
})

test('잘못된 정규식은 throw 없이 리터럴 동등 폴백', () => {
  let m: (s: string) => boolean
  assert.doesNotThrow(() => { m = compileHookMatcher('([') })
  assert.equal(m!('(['), true)
  assert.equal(m!('Edit'), false)
})

section('hookScan — scanHooks 게이트/플러그인')

const scanTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memradar-hookscan-'))
const scanHome = path.join(scanTmp, 'home')
const scanProject = path.join(scanTmp, 'proj')
const pluginAlphaDir = path.join(scanTmp, 'plugins', 'alpha')
const pluginBkitDir = path.join(scanTmp, 'plugins', 'bkitlike')

fs.mkdirSync(path.join(scanHome, '.claude', 'plugins'), { recursive: true })
fs.mkdirSync(path.join(scanProject, '.claude'), { recursive: true })
fs.mkdirSync(path.join(pluginAlphaDir, 'hooks'), { recursive: true })
fs.mkdirSync(path.join(pluginBkitDir, 'hooks'), { recursive: true })

const FAKE_ENV_SECRET = 'super-secret-env-value-123456'
fs.writeFileSync(path.join(scanHome, '.claude', 'settings.json'), JSON.stringify({
  env: { SECRET: FAKE_ENV_SECRET },
  hooks: {
    SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'node user-hook.js' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'curl -H "Authorization: Bearer abc123def456ghi789jkl012mno" https://hooks.slack.com/services/T00000001/B00000001/faketesttoken1234567890' }] }],
  },
  enabledPlugins: { 'alpha@mkt': true, 'bkitlike@mkt': false },
}))
fs.writeFileSync(path.join(scanHome, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({
  plugins: {
    'alpha@mkt': [{ installPath: pluginAlphaDir }],
    'bkitlike@mkt': [{ installPath: pluginBkitDir }],
  },
}))
fs.writeFileSync(path.join(pluginAlphaDir, 'hooks', 'hooks.json'), JSON.stringify({
  hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/stop.js"' }] }] },
}))
fs.writeFileSync(path.join(pluginBkitDir, 'hooks', 'hooks.json'), JSON.stringify({
  hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node bkit-disabled.js' }] }] },
}))
fs.writeFileSync(path.join(scanProject, '.claude', 'settings.json'), JSON.stringify({
  hooks: {
    PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/check.sh"' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'node "C:\\hooks\\stop-체크.js"' }] }],
  },
}))

const scanResult = scanHooks({ homeDir: scanHome, projectRoot: scanProject, managedPaths: [] })

test('사용자/프로젝트/활성 플러그인 엔트리 수집', () => {
  const sources = scanResult.entries.map((e) => e.source)
  assert.ok(sources.includes('user'))
  assert.ok(sources.includes('project'))
  assert.ok(sources.includes('plugin'))
})

test('비활성 플러그인(bkit 함정) 제외', () => {
  assert.ok(!scanResult.entries.some((e) => e.command.includes('bkit-disabled')))
  assert.ok(scanResult.entries.some((e) => e.source === 'plugin' && e.command.includes('${CLAUDE_PLUGIN_ROOT}')))
})

test('플러그인 command 는 CLAUDE_PLUGIN_ROOT 확장 다이제스트 후보 포함', () => {
  const pluginEntry = scanResult.entries.find((e) => e.source === 'plugin')
  assert.ok(pluginEntry)
  const expanded = `node "${pluginAlphaDir}/stop.js"`
  assert.ok(pluginEntry!.commandKeys.includes(commandDigest(expanded)))
})

test('env 등 hooks 외 설정 키는 어디에도 실리지 않음', () => {
  const serialized = JSON.stringify(scanResult) + JSON.stringify(toServerHookEntries(matchHookEntries(scanResult.entries, [], scanProject)))
  assert.ok(!serialized.includes(FAKE_ENV_SECRET))
})

test('UNC 경로 거부 — throw 없이 {filePath, errorCode} 보고', () => {
  let result: ReturnType<typeof scanHooks>
  assert.doesNotThrow(() => {
    result = scanHooks({ homeDir: scanHome, projectRoot: scanProject, managedPaths: ['\\\\evil\\share\\managed-settings.json'] })
  })
  const uncError = result!.errors.find((e) => e.errorCode === 'UNC_REJECTED')
  assert.ok(uncError)
  assert.deepEqual(Object.keys(uncError!).sort(), ['errorCode', 'filePath'])
})

test('1MB 캡 초과 파일 거부', () => {
  const bigProject = path.join(scanTmp, 'bigproj')
  fs.mkdirSync(path.join(bigProject, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(bigProject, '.claude', 'settings.json'), `{"hooks":{},"pad":"${'x'.repeat(1024 * 1024 + 10)}"}`)
  const result = scanHooks({ homeDir: scanHome, projectRoot: bigProject, managedPaths: [] })
  assert.ok(result.errors.some((e) => e.errorCode === 'SIZE_CAP'))
})

section('hookScan — 텔레메트리 매칭')

const telemetry = buildHookTelemetryRows([{ ...session!, cwd: scanProject }])
const matched = matchHookEntries(scanResult.entries, telemetry, scanProject)

test('event 수준 매치 → confidence event', () => {
  // 프로젝트 PreToolUse matcher 'Edit|Write' — 픽스처 PreToolUse:Edit(denial) 텔레메트리와 이벤트 수준 일치
  const entry = matched.find((e) => e.event === 'PreToolUse' && e.matcher === 'Edit|Write')
  assert.ok(entry)
  assert.equal(entry!.observed, true)
  assert.equal(entry!.confidence, 'event')
})

test('D8: mojibake config command → 스켈레톤 다이제스트로 관측 처리 (unobserved 오탐 금지)', () => {
  const entry = matched.find((e) => e.command === 'node "C:\\hooks\\stop-체크.js"')
  assert.ok(entry)
  assert.equal(entry!.observed, true)
  assert.equal(entry!.confidence, 'command')
})

test('commandKey 일치 → confidence command (event 매치보다 우선)', () => {
  const entries = [{
    event: 'Stop', matcher: null, command: 'node stop-hook.js', source: 'user' as const,
    sourceLabel: '사용자 설정', filePath: 'x', scope: 'global' as const,
    commandKeys: [commandDigest('node stop-hook.js')],
  }]
  const m = matchHookEntries(entries, telemetry, scanProject)
  assert.equal(m[0].observed, true)
  assert.equal(m[0].confidence, 'command')
})

test('프로젝트 스코프 — cwd 불일치 텔레메트리는 매칭 제외', () => {
  const otherCwd = buildHookTelemetryRows([{ ...session!, cwd: 'D:\\somewhere\\else' }])
  const m = matchHookEntries(scanResult.entries.filter((e) => e.scope === 'project'), otherCwd, scanProject)
  assert.ok(m.every((e) => !e.observed))
})

test('미관측 엔트리 — observed false, confidence null', () => {
  const m = matchHookEntries(scanResult.entries, [], scanProject)
  assert.ok(m.every((e) => e.observed === false && e.confidence === null))
})

section('hookScan — 표면 직렬화')

test('정적 공개 형태 — command/filePath/timeout 키 부재', () => {
  const publicEntries = toPublicHookEntries(matched)
  assert.ok(publicEntries.length > 0)
  for (const e of publicEntries) {
    assert.deepEqual(Object.keys(e).sort(), ['commandKey', 'confidence', 'event', 'matcher', 'observed', 'sourceLabel'])
  }
})

test('서버 형태 — command 는 maskSecrets 적용본 (Bearer/웹훅 마스킹)', () => {
  const serverEntries = toServerHookEntries(matched)
  const curlEntry = serverEntries.find((e) => e.command.includes('curl'))
  assert.ok(curlEntry, 'curl entry missing')
  assert.ok(!curlEntry!.command.includes('abc123def456ghi789jkl012mno'))
  assert.ok(!curlEntry!.command.includes('faketesttoken1234567890'))
  assert.ok(curlEntry!.command.includes('[REDACTED:'))
})

// === export — 페이로드-프리 요약 라인 ======================================
section('export — 훅 요약 라인')

test('buildHookSummaryLines — 집계 라인만, hookSummary 부재 시 빈 배열', () => {
  const lines = buildHookSummaryLines(session!)
  assert.ok(lines.length > 0)
  assert.ok(lines.some((l) => l.includes('PostToolUse:Edit')))
  const noHooks = { ...session!, id: 'nh' }
  delete (noHooks as Partial<Session>).hookSummary
  assert.deepEqual(buildHookSummaryLines(noHooks), [])
})

test('markdown/HTML export 에 훅 섹션 존재 + 센티널 부재', () => {
  const md = buildMarkdown(session!, session!.messages)
  assert.ok(md.includes('## 훅 실행 기록'))
  assert.ok(!md.includes('HOOKSENTINEL'))
  assert.ok(!md.includes('hooksentinelwebhook42'))
  const html = buildHtmlChat(session!, session!.messages)
  assert.ok(html.includes('훅 실행 기록'))
  assert.ok(!html.includes('HOOKSENTINEL'))
})

// === 센티널 누출 — 정적 HTML (CLI 통합) ====================================
section('센티널 누출 — 정적 HTML')

const staticOut = path.join(os.tmpdir(), 'memradar-hook-sentinel.html')
if (fs.existsSync(staticOut)) fs.rmSync(staticOut, { force: true })

execFileSync(process.execPath, [path.join(repoRoot, 'cli', 'index.mjs'), '--static'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    MEMRADAR_PROJECTS_DIR: path.join(__dirname, 'fixtures', 'logs'),
    MEMRADAR_OUTPUT_HTML: staticOut,
    MEMRADAR_NO_OPEN: '1',
    MEMRADAR_SKIP_UPDATE_CHECK: '1',
  },
  stdio: ['ignore', 'pipe', 'inherit'],
  encoding: 'utf8',
  timeout: 120000,
})
const staticHtml = fs.readFileSync(staticOut, 'utf8')

test('훅 command/stdout/stderr 센티널이 정적 HTML 에 전무', () => {
  assert.ok(!staticHtml.includes('HOOKSENTINELCMD7f3a'))
  assert.ok(!staticHtml.includes('HOOKSENTINELSTDOUT9c2e'))
  assert.ok(!staticHtml.includes('HOOKSENTINELSTDERR5d4c'))
  assert.ok(!staticHtml.includes('hooksentinelwebhook42'))
})

function extractEmbedded(html: string, marker: string, endMarker: string): string {
  const start = html.indexOf(marker)
  assert.ok(start >= 0, `${marker} missing`)
  const end = html.indexOf(endMarker, start + marker.length)
  assert.ok(end > start, `${endMarker} missing after ${marker}`)
  return html.slice(start + marker.length, end)
}

test('임베드 세션의 hookSummary 존재 + 페이로드 키 부재 (CLI 파서 패리티)', () => {
  const sessionsJson = extractEmbedded(staticHtml, 'window.__MEMRADAR_SESSIONS__=', ';window.__MEMRADAR_SKILLS__=')
  const embedded = JSON.parse(sessionsJson) as Session[]
  const hookSession = embedded.find((s) => s.id === 'session-hooks')
  assert.ok(hookSession, 'session-hooks not embedded')
  assert.ok(hookSession!.hookSummary, 'embedded hookSummary missing')
  assert.equal(hookSession!.hookSummary!.rows.length, 13) // src 파서와 동일 행 수 (mjs/TS 경계 계약)
  const json = JSON.stringify(hookSession!.hookSummary)
  assert.ok(!json.includes('"command"'))
  assert.ok(!json.includes('"stdout"'))
  assert.ok(!json.includes('"stderr"'))
  assert.ok(!json.includes('"content"'))
})

test('__MEMRADAR_HOOKS__ 임베드 — command 원문/filePath 부재', () => {
  const hooksJson = extractEmbedded(staticHtml, 'window.__MEMRADAR_HOOKS__=', ';</script>')
  const entries = JSON.parse(hooksJson) as Array<Record<string, unknown>>
  assert.ok(Array.isArray(entries))
  for (const e of entries) {
    assert.ok(!('command' in e))
    assert.ok(!('filePath' in e))
    assert.ok(!('timeout' in e))
  }
})

// === 결과 보고 =============================================================
try {
  fs.rmSync(scanTmp, { recursive: true, force: true })
} catch { /* cleanup best-effort */ }

console.log(`\n=== ${passed} passed, ${failed} failed ===`)
if (failed > 0) {
  console.log('\n실패 상세:')
  for (const f of failures) {
    console.log(`  • ${f.name}`)
    console.log(`    ${f.err instanceof Error ? f.err.stack ?? f.err.message : String(f.err)}`)
  }
  process.exit(1)
}
