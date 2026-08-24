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

// npm 다운로드 집계 전역은 항상 방출된다. 이 실행은 MEMRADAR_SKIP_UPDATE_CHECK=1
// 이므로 조회를 건너뛰고 null 이어야 한다 — 테스트가 네트워크에 의존하지 않는
// 근거이자, 게이팅이 풀려 테스트가 몰래 api.npmjs.org 를 부르기 시작하면 실패한다.
assert.match(html, /window\.__MEMRADAR_NPM__=null;/, 'npm stats must be null when the update check is skipped')

// 전역 주입 순서 계약: __MEMRADAR_HOOKS__ 가 </script> 직전 **마지막** 전역이어야
// 한다. tests/hook-events.test.mts 가 `window.__MEMRADAR_HOOKS__=` ~ `;</script>`
// 를 리터럴로 잘라 JSON.parse 하므로, 새 전역을 HOOKS 뒤에 붙이면 그 테스트가
// 엉뚱한 구간을 파싱해 깨진다. 새 전역은 반드시 HOOKS 앞에 끼워 넣을 것.
//
// 정규식으로 두면 lazy 매칭이 뒤에 붙은 전역까지 삼켜 조용히 통과하므로,
// hook-events.test.mts 와 **같은 방식으로 잘라 JSON.parse 까지** 해본다.
{
  const marker = 'window.__MEMRADAR_HOOKS__='
  const start = html.indexOf(marker)
  assert.ok(start >= 0, '__MEMRADAR_HOOKS__ marker is missing')
  const end = html.indexOf(';</script>', start + marker.length)
  assert.ok(end > start, '__MEMRADAR_HOOKS__ must be followed by ;</script>')
  const sliced = html.slice(start + marker.length, end)
  assert.doesNotMatch(
    sliced,
    /window\.__MEMRADAR_/,
    '__MEMRADAR_HOOKS__ must stay the LAST injected global — insert new globals before it (hook-events.test.mts slices on it)'
  )
  assert.doesNotThrow(() => JSON.parse(sliced), '__MEMRADAR_HOOKS__ slice must be valid JSON')
}

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
// --no-update-check 는 registry 조회뿐 아니라 npm 다운로드 집계 조회도 함께 끈다
// (두 호출 모두 npm 을 향하므로 스위치를 하나로 유지한다 — README Privacy 참조).
assert.match(flagHtml, /window\.__MEMRADAR_NPM__=null;/, '--no-update-check must also suppress the npm download-count fetch')

console.log('CLI harness checks passed.')
