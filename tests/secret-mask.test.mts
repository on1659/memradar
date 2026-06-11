#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * secretMask 순수 함수 어설션 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/secret-mask.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위: cli/lib/secretMask.mjs 의 maskSecrets (web/CLI 공용 단일 소스)
 *       + 표시/직렬화 표면의 마스킹 적용 (src/lib/sessionExport.ts summarizeToolCall)
 *
 * 주의: 모든 시크릿 샘플은 형태만 유효한 더미다. 이 파일은 git 에 커밋되므로
 * 실제 키처럼 보이는 고엔트로피 값을 절대 넣지 마라.
 * (AWS 만 공식 문서의 예시 키 AKIAIOSFODNN7EXAMPLE 사용)
 */
import assert from 'node:assert/strict'
import { maskSecrets } from '../cli/lib/secretMask.mjs'
import { summarizeToolCall } from '../src/lib/sessionExport.ts'
import type { ToolCall } from '../src/types.ts'

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

/** hits 의 kind 목록 (정렬) */
function kinds(text: string): string[] {
  return maskSecrets(text)
    .hits.map((h) => h.kind)
    .sort()
}

// --- 더미 시크릿 (형태만 유효) ---------------------------------------------
const DUMMY = {
  anthropic: 'sk-ant-' + 'a'.repeat(20),
  openai: 'sk-' + 'a'.repeat(24),
  githubGhp: 'ghp_' + '0'.repeat(36),
  githubPat: 'github_pat_' + '0'.repeat(24),
  aws: 'AKIAIOSFODNN7EXAMPLE', // AWS 공식 문서 예시 키
  slack: 'xoxb-' + '0'.repeat(10) + '-' + 'a'.repeat(8),
  google: 'AIza' + '0'.repeat(35),
  npm: 'npm_' + 'a'.repeat(36),
  gitlab: 'glpat-' + 'a'.repeat(20),
  jwt: 'eyJ' + 'a'.repeat(10) + '.' + 'b'.repeat(10) + '.' + 'c'.repeat(6),
  // bearer 는 오탐 가드로 숫자 1개 이상을 요구 — 숫자 포함 + 비-hex(z) 더미
  bearerOpaque: 'a1z'.repeat(8),
  pem: '-----BEGIN PRIVATE KEY-----\naaaabbbb\nccccdddd\n-----END PRIVATE KEY-----',
  pemRsa: '-----BEGIN RSA PRIVATE KEY-----\nzzzzyyyy\n-----END RSA PRIVATE KEY-----',
}

// === 양성 — kind 별 마스킹 ==================================================
section('양성 — kind 별 마스킹')

test('anthropic-key: sk-ant- 접두는 openai 가 아니라 anthropic 으로 분류', () => {
  const r = maskSecrets(`key is ${DUMMY.anthropic} here`)
  assert.equal(r.masked, 'key is [REDACTED:anthropic-key] here')
  assert.deepEqual(kinds(`key is ${DUMMY.anthropic} here`), ['anthropic-key'])
})

test('openai-key', () => {
  const r = maskSecrets(`use ${DUMMY.openai} for auth`)
  assert.equal(r.masked, 'use [REDACTED:openai-key] for auth')
  assert.deepEqual(r.hits, [{ kind: 'openai-key' }])
})

test('github-token: ghp_ 계열', () => {
  assert.deepEqual(kinds(`push with ${DUMMY.githubGhp}`), ['github-token'])
  assert.ok(!maskSecrets(`push with ${DUMMY.githubGhp}`).masked.includes(DUMMY.githubGhp))
})

test('github-token: github_pat_ 계열', () => {
  assert.deepEqual(kinds(`pat: ${DUMMY.githubPat}`), ['github-token'])
})

test('aws-access-key', () => {
  const r = maskSecrets(`aws key ${DUMMY.aws} leaked`)
  assert.equal(r.masked, 'aws key [REDACTED:aws-access-key] leaked')
})

test('slack-token', () => {
  assert.deepEqual(kinds(`bot ${DUMMY.slack} ok`), ['slack-token'])
})

test('google-api-key', () => {
  assert.deepEqual(kinds(`maps ${DUMMY.google} ok`), ['google-api-key'])
})

test('npm-token', () => {
  assert.deepEqual(kinds(`publish ${DUMMY.npm} ok`), ['npm-token'])
})

test('gitlab-token', () => {
  assert.deepEqual(kinds(`ci ${DUMMY.gitlab} ok`), ['gitlab-token'])
})

test('private-key: PEM 멀티라인 블록 통째로', () => {
  const text = `before\n${DUMMY.pem}\nafter`
  const r = maskSecrets(text)
  assert.equal(r.masked, 'before\n[REDACTED:private-key]\nafter')
  assert.deepEqual(r.hits, [{ kind: 'private-key' }])
})

test('private-key: RSA 변형 헤더도 매칭', () => {
  assert.deepEqual(kinds(DUMMY.pemRsa), ['private-key'])
})

test('jwt: 3세그먼트', () => {
  const r = maskSecrets(`jwt ${DUMMY.jwt} end`)
  assert.equal(r.masked, 'jwt [REDACTED:jwt] end')
})

test('bearer-token: 불투명 토큰 — Bearer 단어는 보존, 토큰만 치환', () => {
  const r = maskSecrets(`Authorization: Bearer ${DUMMY.bearerOpaque}`)
  assert.equal(r.masked, 'Authorization: Bearer [REDACTED:bearer-token]')
})

test('Bearer <jwt> 는 jwt 로 분류 (bearer 는 잔여만)', () => {
  assert.deepEqual(kinds(`Authorization: Bearer ${DUMMY.jwt}`), ['jwt'])
})

test('credential 휴리스틱: = 할당, 값만 치환', () => {
  const r = maskSecrets('client_secret=n0t-a-real-secret-value')
  assert.equal(r.masked, 'client_secret=[REDACTED:credential]')
  assert.deepEqual(r.hits, [{ kind: 'credential' }])
})

test('credential 휴리스틱: 따옴표 값', () => {
  const r = maskSecrets('password: "supersecretvalue123"')
  assert.equal(r.masked, 'password: "[REDACTED:credential]"')
})

test('credential 휴리스틱: MY_API_KEY= 처럼 접두 붙은 키워드도 값 치환', () => {
  const r = maskSecrets('MY_API_KEY=abcdefgh-12345678-xyz')
  assert.equal(r.masked, 'MY_API_KEY=[REDACTED:credential]')
})

test('credential 휴리스틱: JSON 따옴표 키 — api_key', () => {
  const r = maskSecrets('{"api_key": "abcdefghij1234567890xyz"}')
  assert.equal(r.masked, '{"api_key": "[REDACTED:credential]"}')
  assert.deepEqual(r.hits, [{ kind: 'credential' }])
})

test('credential 휴리스틱: JSON 따옴표 키 — client_secret', () => {
  const r = maskSecrets('{"client_secret": "n0t-a-real-secret-value"}')
  assert.equal(r.masked, '{"client_secret": "[REDACTED:credential]"}')
})

// === 음성 — 오탐 가드 =======================================================
section('음성 — 오탐 가드')

function assertUntouched(text: string): void {
  const r = maskSecrets(text)
  assert.equal(r.masked, text)
  assert.equal(r.hits.length, 0)
}

test('UUID 는 마스킹 금지 (claude --resume 의존)', () => {
  assertUntouched('claude --resume 123e4567-e89b-12d3-a456-426614174000')
})

test('UUID 가 credential 값 위치여도 마스킹 금지', () => {
  assertUntouched('token: 123e4567-e89b-12d3-a456-426614174000')
})

test('40-hex 커밋 SHA 마스킹 금지', () => {
  assertUntouched('commit a3f5b2c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4')
  assertUntouched('secret=a3f5b2c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4')
})

test('64-hex digest 마스킹 금지', () => {
  assertUntouched('token: ' + 'ab12'.repeat(16))
})

test('한국어 산문', () => {
  assertUntouched('오늘 세션에서 토큰 사용량을 줄였다. 비밀번호와 시크릿 관리 정책을 검토했다.')
})

test('영어 산문', () => {
  assertUntouched('The secret to a good password policy is rotation and length.')
  assertUntouched('Bearer of the ring carried it for twenty days straight.')
})

test('hex 색상 코드', () => {
  assertUntouched('color: #aabbcc and #d6dfee')
})

test('코드의 환경변수 참조 (process.env.*)', () => {
  assertUntouched('token = process.env.MY_TOKEN')
})

test('환경변수 이름 플레이스홀더', () => {
  assertUntouched('API_KEY=YOUR_API_KEY')
  assertUntouched('client_secret=PROD_CLIENT_SECRET_V2')
})

test('your/xxx/example 플레이스홀더', () => {
  assertUntouched('api_key: your-api-key-goes-here-123')
  assertUntouched('apikey=xxxxxxxxxxxxxxxxxxxx')
  assertUntouched('access_key=example_value_1234567')
})

test('${...} 플레이스홀더', () => {
  assertUntouched('secret: ${DATABASE_PASSWORD}')
})

test('짧은 값 (16자 미만)', () => {
  assertUntouched('token: abc12345')
  assertUntouched('password=hunter2')
})

test('JSON 숫자 값 — 키워드 부분일치(max_tokens)는 마스킹 금지', () => {
  assertUntouched('"max_tokens": 4096')
})

test('bearer 오탐 가드: 하이픈 산문 (숫자 없는 토큰)', () => {
  assertUntouched('Bearer authentication-mechanism is described in the docs.')
})

test('bearer 오탐 가드: 플레이스홀더 토큰', () => {
  assertUntouched('Authorization: Bearer YOUR_ACCESS_TOKEN_HERE_OK')
})

test('경로 값은 마스킹 금지 (시크릿 위치 참조이지 값이 아님)', () => {
  assertUntouched('secret: /run/secrets/x.txt')
})

// === 멱등성 =================================================================
section('멱등성')

test('이중 적용해도 결과 동일 + 2차 hits 0', () => {
  const text = [
    `aws ${DUMMY.aws}`,
    `openai ${DUMMY.openai}`,
    'client_secret=n0t-a-real-secret-value',
    DUMMY.pem,
    `Authorization: Bearer ${DUMMY.bearerOpaque}`,
  ].join('\n')
  const once = maskSecrets(text)
  const twice = maskSecrets(once.masked)
  assert.equal(twice.masked, once.masked)
  assert.equal(twice.hits.length, 0)
})

test('[REDACTED:kind] 토큰 자체는 재매칭되지 않음', () => {
  assertUntouched('[REDACTED:aws-access-key] [REDACTED:jwt] [REDACTED:credential]')
  // kind 에 token 이 포함된 토큰도 credential 키워드에 안 걸린다
  assertUntouched('[REDACTED:github-token] [REDACTED:bearer-token] [REDACTED:slack-token]')
})

test('JSON 따옴표 키의 마스킹 결과도 재매칭되지 않음', () => {
  assertUntouched('{"token": "[REDACTED:credential]"}')
})

test('Bearer 단어가 보존된 마스킹 결과도 재매칭되지 않음', () => {
  assertUntouched('Authorization: Bearer [REDACTED:bearer-token]')
})

// === 복합 ===================================================================
section('복합')

test('한 텍스트에 시크릿 2종 — hits kind 검증', () => {
  const text = `deploy with ${DUMMY.aws} and ${DUMMY.githubGhp}`
  const r = maskSecrets(text)
  assert.deepEqual(
    r.hits.map((h) => h.kind).sort(),
    ['aws-access-key', 'github-token'],
  )
  assert.ok(r.masked.includes('[REDACTED:aws-access-key]'))
  assert.ok(r.masked.includes('[REDACTED:github-token]'))
  assert.ok(!r.masked.includes(DUMMY.aws))
  assert.ok(!r.masked.includes(DUMMY.githubGhp))
})

test('같은 kind 다발 — hit 이 발생 건수만큼 쌓임', () => {
  const r = maskSecrets(`${DUMMY.openai} then sk-${'b'.repeat(24)}`)
  assert.equal(r.hits.length, 2)
  assert.ok(r.hits.every((h) => h.kind === 'openai-key'))
})

test('PEM + 산문 혼합 — 주변 텍스트는 보존', () => {
  const text = `배포 로그입니다.\n${DUMMY.pemRsa}\n以上입니다.`
  const r = maskSecrets(text)
  assert.equal(r.masked, '배포 로그입니다.\n[REDACTED:private-key]\n以上입니다.')
})

// === detailed 옵트인 모드 ===================================================
section('detailed 옵트인 모드')

test('기본 모드(opts 미지정)는 여전히 {kind} 만 — 회귀 가드', () => {
  const r = maskSecrets(`aws ${DUMMY.aws} ok`)
  assert.deepEqual(r.hits, [{ kind: 'aws-access-key' }])
  // hit 객체에 value/index/length 키가 아예 없어야 한다 (하위호환).
  assert.deepEqual(Object.keys(r.hits[0]!), ['kind'])
})

test('기본 모드: opts.detailed = false 도 {kind} 만', () => {
  const r = maskSecrets(`aws ${DUMMY.aws} ok`, { detailed: false })
  assert.deepEqual(r.hits, [{ kind: 'aws-access-key' }])
  assert.deepEqual(Object.keys(r.hits[0]!), ['kind'])
})

test('기본 모드: 빈 opts 객체도 {kind} 만', () => {
  const r = maskSecrets(`aws ${DUMMY.aws} ok`, {})
  assert.deepEqual(r.hits, [{ kind: 'aws-access-key' }])
})

test('detailed: value/index/length 정확 (단일 패턴 매치)', () => {
  const text = `aws ${DUMMY.aws} ok`
  const r = maskSecrets(text, { detailed: true })
  assert.equal(r.hits.length, 1)
  const h = r.hits[0]!
  assert.equal(h.kind, 'aws-access-key')
  assert.equal(h.value, DUMMY.aws)
  assert.equal(h.index, text.indexOf(DUMMY.aws))
  assert.equal(h.length, DUMMY.aws.length)
  // index/length 가 원문에서 정확히 value 를 가리키는지 검증.
  assert.equal(text.slice(h.index!, h.index! + h.length!), DUMMY.aws)
})

test('detailed: masked 결과는 기본 모드와 동일 (치환은 변하지 않음)', () => {
  const text = `aws ${DUMMY.aws} ok`
  assert.equal(maskSecrets(text, { detailed: true }).masked, maskSecrets(text).masked)
})

test('detailed: bearer 는 전체 매치가 아니라 token 만 value 로', () => {
  const text = `Authorization: Bearer ${DUMMY.bearerOpaque}`
  const r = maskSecrets(text, { detailed: true })
  assert.equal(r.hits.length, 1)
  const h = r.hits[0]!
  assert.equal(h.kind, 'bearer-token')
  // value 는 `Bearer ` 접두를 포함하지 않고 token 부분만.
  assert.equal(h.value, DUMMY.bearerOpaque)
  assert.equal(text.slice(h.index!, h.index! + h.length!), DUMMY.bearerOpaque)
})

test('detailed: credential 은 키워드/구분자가 아니라 값만 value 로', () => {
  const text = 'client_secret=n0t-a-real-secret-value'
  const r = maskSecrets(text, { detailed: true })
  assert.equal(r.hits.length, 1)
  const h = r.hits[0]!
  assert.equal(h.kind, 'credential')
  assert.equal(h.value, 'n0t-a-real-secret-value')
  assert.equal(text.slice(h.index!, h.index! + h.length!), 'n0t-a-real-secret-value')
})

test('detailed: 멱등성·hits 개수 기본 모드와 동일', () => {
  const text = [
    `aws ${DUMMY.aws}`,
    `openai ${DUMMY.openai}`,
    'client_secret=n0t-a-real-secret-value',
    DUMMY.pem,
    `Authorization: Bearer ${DUMMY.bearerOpaque}`,
  ].join('\n')
  const baseHits = maskSecrets(text).hits.length
  const detailedOnce = maskSecrets(text, { detailed: true })
  // 같은 입력에서 hits 개수는 모드와 무관하게 동일해야 한다.
  assert.equal(detailedOnce.hits.length, baseHits)
  // 멱등: 마스킹 결과를 다시 detailed 로 돌리면 hits 0.
  const detailedTwice = maskSecrets(detailedOnce.masked, { detailed: true })
  assert.equal(detailedTwice.masked, detailedOnce.masked)
  assert.equal(detailedTwice.hits.length, 0)
})

test('detailed: 같은 kind 다발 — 각 hit 의 index 가 서로 다른 위치를 가리킴', () => {
  const text = `${DUMMY.openai} then sk-${'b'.repeat(24)}`
  const r = maskSecrets(text, { detailed: true })
  assert.equal(r.hits.length, 2)
  assert.ok(r.hits.every((h) => h.kind === 'openai-key'))
  // 두 hit 의 index 는 달라야 하고, 각각 원문 토큰을 정확히 가리켜야 한다.
  assert.notEqual(r.hits[0]!.index, r.hits[1]!.index)
  for (const h of r.hits) {
    assert.equal(text.slice(h.index!, h.index! + h.length!), h.value)
  }
})

// === 표면 — 도구 호출 summary ==============================================
section('표면 — 도구 호출 summary (sessionExport)')

test('Grep/Glob summary: pattern·glob 의 시크릿 마스킹 (Bash 와 동일 규칙)', () => {
  const call: ToolCall = {
    id: 't1',
    name: 'Grep',
    input: { pattern: DUMMY.anthropic, glob: `*${DUMMY.openai}*` },
  }
  const s = summarizeToolCall(call)
  assert.ok(!s.includes(DUMMY.anthropic))
  assert.ok(!s.includes(DUMMY.openai))
  assert.equal(s, '[REDACTED:anthropic-key] (*[REDACTED:openai-key]*)')
})

// === 입력 불변 / 순수성 =====================================================
section('입력 불변 / 순수성')

test('같은 입력 → 같은 결과 (결정적)', () => {
  const text = `aws ${DUMMY.aws} / token: abc12345`
  assert.deepEqual(maskSecrets(text), maskSecrets(text))
})

test('히트 없으면 masked 는 입력과 동일', () => {
  const text = '평범한 대화 내용입니다.'
  assert.equal(maskSecrets(text).masked, text)
})

test('빈 문자열', () => {
  assert.deepEqual(maskSecrets(''), { masked: '', hits: [] })
})

// === 결과 보고 =============================================================
console.log(`\n=== ${passed} passed, ${failed} failed ===`)
if (failed > 0) {
  console.log('\n실패 상세:')
  for (const f of failures) {
    console.log(`  • ${f.name}`)
    console.log(`    ${f.err instanceof Error ? f.err.stack ?? f.err.message : String(f.err)}`)
  }
  process.exit(1)
}
