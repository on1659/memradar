// 모델 귀속(src↔cli 파서 정합) assert 는 이 파일이 아니라 tests/model-attribution.test.mts 에
// 있다 — 같은 정적 산출물을 생성해 modelResponses/models[] 동일성을 검증하며 test:harness 에
// 등록되어 매 실행마다 돈다 (docs/goal/model-attribution-per-message.md ②).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const cliPath = path.join(repoRoot, 'cli', 'index.mjs')
const fixtureDir = path.join(__dirname, 'fixtures', 'logs')
const outPath = path.join(os.tmpdir(), 'memradar-harness.html')

if (fs.existsSync(outPath)) {
  fs.rmSync(outPath, { force: true })
}

const stdout = execFileSync(process.execPath, [cliPath, '--static'], {
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

assert.match(stdout, /이 HTML 파일에는 세션 대화 전문이 포함/, 'Privacy warning is missing from static-mode output')
assert.ok(fs.existsSync(outPath), 'CLI harness did not create an HTML file')

const html = fs.readFileSync(outPath, 'utf8')
assert.match(html, /<title>Memradar<\/title>/, 'HTML title is missing')
assert.match(html, /window\.__MEMRADAR_SESSIONS__=/, 'Embedded session payload is missing')
assert.match(html, /Strict harness smoke test for dashboard flows/, 'Fixture content was not embedded')
assert.match(html, /Budget search fix for session filtering and browser history/, 'Second fixture session was not embedded')

// 시크릿 마스킹 (session-delta 픽스처): 더미 시크릿 원문이 정적 HTML 에 없고
// [REDACTED:kind] 토큰으로 치환됐는지 양방향 검증. 위의 일반 문장 임베드 assert
// 두 줄은 오탐(과한 마스킹) 회귀 가드이므로 함께 유지한다.
assert.doesNotMatch(html, /AKIAIOSFODNN7EXAMPLE/, 'AWS dummy key must be masked out of the static HTML')
assert.doesNotMatch(html, /sk-aaaaaaaaaaaaaaaaaaaaaaaa/, 'OpenAI dummy key must be masked out of the static HTML')
assert.doesNotMatch(html, /ghp_0{36}/, 'GitHub dummy token must be masked out of the static HTML')
assert.match(html, /\[REDACTED:aws-access-key\]/, 'aws-access-key redaction token is missing')
assert.match(html, /\[REDACTED:openai-key\]/, 'openai-key redaction token is missing')
assert.match(html, /\[REDACTED:github-token\]/, 'github-token redaction token is missing')
assert.match(html, /Credential rotation drill with dummy secrets only/, 'Masked fixture must keep its non-secret prose embedded')

assert.doesNotMatch(html, /<script[^>]+src="[^"]*assets\//i, 'CLI output should inline the JavaScript bundle')
assert.doesNotMatch(html, /<link[^>]+href="[^"]*assets\/[^"]+\.css"/i, 'CLI output should inline the CSS bundle')
assert.ok(html.length > 10000, `Generated HTML is unexpectedly small: ${html.length} bytes`)

// --no-update-check 플래그 단독 경로: MEMRADAR_SKIP_UPDATE_CHECK 환경 변수 없이
// 플래그만으로 업데이트 확인이 꺼진 채 정상 종료(exit 0 + HTML 산출)하는지 검증.
const flagOutPath = path.join(os.tmpdir(), 'memradar-harness-no-update-check.html')

if (fs.existsSync(flagOutPath)) {
  fs.rmSync(flagOutPath, { force: true })
}

const envWithoutSkipVar = { ...process.env }
delete envWithoutSkipVar.MEMRADAR_SKIP_UPDATE_CHECK

const flagStdout = execFileSync(process.execPath, [cliPath, '--static', '--no-update-check'], {
  cwd: repoRoot,
  env: {
    ...envWithoutSkipVar,
    MEMRADAR_PROJECTS_DIR: fixtureDir,
    MEMRADAR_OUTPUT_HTML: flagOutPath,
    MEMRADAR_NO_OPEN: '1',
  },
  stdio: ['ignore', 'pipe', 'inherit'],
  encoding: 'utf8',
  timeout: 120000,
})

// 플래그 파싱이 회귀하면 자동 업데이트 child가 산출물을 대신 만들어 아래
// 존재/title assert가 거짓 통과한다. handleUpdate의 감지 문구 부재로 차단.
assert.doesNotMatch(flagStdout, /새 버전 감지/, '--no-update-check did not suppress the update check')
assert.ok(fs.existsSync(flagOutPath), '--no-update-check run did not create an HTML file')
const flagHtml = fs.readFileSync(flagOutPath, 'utf8')
assert.match(flagHtml, /<title>Memradar<\/title>/, '--no-update-check run produced unexpected HTML')

console.log('CLI harness checks passed.')
