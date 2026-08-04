#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 모델 귀속 공유 모듈 + 두 파서 정합 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/model-attribution.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위 (docs/goal/model-attribution-per-message.md ②):
 *  - cli/lib/modelAttribution.mjs 단위 — 응답 단위 카운트, `<synthetic>` 배제,
 *    dominant 결정성, 블록 근사 폴백
 *  - src/parser.ts 배선 — 병합 이전 집계, 블록 내부 전환 보존(models[])
 *  - **src↔cli 정합** — 같은 픽스처에 대해 두 파서가 같은 modelResponses 를 낸다.
 *    파서가 두 벌이고 npx 기본 경로(정적)는 cli/index.mjs 를 쓰므로, 이 정합이
 *    깨지면 화면마다 다른 숫자가 나온다. tests/harness-cli.mjs 에는 모델 검증이 없다.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  createModelResponseCounter,
  isAggregatableModel,
  dominantModel,
  modelsByUsage,
  isMixedModel,
  approximateModelResponses,
  displayModel,
  displayModels,
  sumModelResponses,
  switchReasonCounts,
  SYNTHETIC_MODEL,
} from '../src/lib/modelAttribution.ts'
import { shortModelName } from '../src/lib/modelNames.ts'
import { parseJsonl, computeStats } from '../src/parser.ts'

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

// === 공유 모듈 단위 =========================================================
console.log('\n[modelAttribution — 술어]')

test('isAggregatableModel — 빈 값·비문자열·<synthetic> 배제', () => {
  assert.equal(isAggregatableModel('claude-opus-4-8'), true)
  assert.equal(isAggregatableModel(SYNTHETIC_MODEL), false)
  assert.equal(isAggregatableModel(''), false)
  assert.equal(isAggregatableModel(undefined), false)
  assert.equal(isAggregatableModel(null), false)
  assert.equal(isAggregatableModel(42), false)
})

console.log('\n[modelAttribution — 응답 단위 카운트]')

test('같은 requestId 의 추가 라인은 접힌다 (응답 1건 = 1표)', () => {
  const c = createModelResponseCounter()
  c.add('opus', 'r1') // thinking
  c.add('opus', 'r1') // text
  c.add('opus', 'r1') // tool_use
  c.add('opus', 'r2')
  assert.deepEqual(c.finalize(), { opus: 2 })
})

test('responseId 가 없으면 각각 1응답 (Codex response_item / 관용 폴백)', () => {
  const c = createModelResponseCounter()
  c.add('gpt-5.5', null)
  c.add('gpt-5.5', null)
  assert.deepEqual(c.finalize(), { 'gpt-5.5': 2 })
})

test('<synthetic> 는 집계되지 않는다 — 배지·차트 오염 차단', () => {
  const c = createModelResponseCounter()
  c.add('opus', 'r1')
  c.add(SYNTHETIC_MODEL, null)
  c.add(SYNTHETIC_MODEL, 'r9') // synthetic 42건 중 14건이 requestId 를 갖는다
  assert.deepEqual(c.finalize(), { opus: 1 })
})

test('한 requestId 에 두 모델이 걸리면 각각 1응답 (키는 responseId+model)', () => {
  const c = createModelResponseCounter()
  c.add('opus', 'r1')
  c.add('sonnet', 'r1')
  assert.deepEqual(c.finalize(), { opus: 1, sonnet: 1 })
})

test('아무것도 없으면 undefined — 필드 자체를 생략 (absent = no-data)', () => {
  assert.equal(createModelResponseCounter().finalize(), undefined)
  const onlySynthetic = createModelResponseCounter()
  onlySynthetic.add(SYNTHETIC_MODEL, null)
  assert.equal(onlySynthetic.finalize(), undefined)
})

test('finalize 는 응답 수 내림차순, 동수면 모델명 오름차순 (직렬화 결정성)', () => {
  const c = createModelResponseCounter()
  c.add('zeta', 'r1')
  c.add('alpha', 'r2')
  c.add('mid', 'r3')
  c.add('mid', 'r4')
  assert.deepEqual(Object.keys(c.finalize()!), ['mid', 'alpha', 'zeta'])
})

console.log('\n[modelAttribution — 파생]')

test('dominantModel — 최다 응답, 동수면 모델명 오름차순으로 결정적', () => {
  assert.equal(dominantModel({ a: 1, b: 5 }), 'b')
  assert.equal(dominantModel({ zeta: 3, alpha: 3 }), 'alpha')
  assert.equal(dominantModel(undefined), undefined)
  assert.equal(dominantModel({}), undefined)
})

test('modelsByUsage / isMixedModel', () => {
  assert.deepEqual(modelsByUsage({ a: 1, b: 5, c: 5 }), ['b', 'c', 'a'])
  assert.deepEqual(modelsByUsage(undefined), [])
  assert.equal(isMixedModel({ a: 1, b: 1 }), true)
  assert.equal(isMixedModel({ a: 9 }), false)
  assert.equal(isMixedModel(undefined), false)
})

test('approximateModelResponses — 블록 근사 폴백, models[] 우선, user·synthetic 제외', () => {
  assert.deepEqual(
    approximateModelResponses([
      { role: 'user', model: 'ghost' }, // user 는 절대 기여하지 않는다
      { role: 'assistant', model: 'opus' },
      { role: 'assistant', model: 'opus', models: ['opus', 'sonnet'] }, // 블록 내부 전환
      { role: 'assistant', model: SYNTHETIC_MODEL },
    ]),
    { opus: 2, sonnet: 1 }
  )
  assert.equal(approximateModelResponses(undefined), undefined)
})

console.log('\n[modelAttribution — 표시 규칙]')

test('displayModel — dominant 우선, <synthetic> 은 어느 경로로도 나오지 않는다', () => {
  assert.equal(displayModel({ model: 'first', modelResponses: { later: 9, first: 1 } }), 'later')
  // 실측 2세션: session.model 자체가 <synthetic> → 배지에 "Synthetic" 이 뜨던 경로
  assert.equal(displayModel({ model: SYNTHETIC_MODEL }), undefined)
  assert.equal(displayModel({ model: SYNTHETIC_MODEL, messages: [{ role: 'assistant', model: 'opus' }] }), 'opus')
  // modelResponses 부재 → 블록 근사 폴백 (서버 모드 파서 갱신 시차 · _truncated 세션)
  assert.equal(displayModel({ model: 'legacy', messages: [{ role: 'assistant', model: 'opus' }] }), 'opus')
  // 근사할 재료도 없으면 session.model 폴백
  assert.equal(displayModel({ model: 'legacy' }), 'legacy')
  assert.equal(displayModel({}), undefined)
  assert.equal(displayModel(undefined), undefined)
})

test('displayModels — 응답 수 내림차순 목록, 폴백 포함', () => {
  assert.deepEqual(displayModels({ modelResponses: { a: 1, b: 5 } }), ['b', 'a'])
  assert.deepEqual(displayModels({ model: 'legacy' }), ['legacy'])
  assert.deepEqual(displayModels({ model: SYNTHETIC_MODEL }), [])
  assert.deepEqual(displayModels(undefined), [])
})

test('shortModelName — 2세그먼트 Claude 5 계열이 소문자 원문으로 새지 않는다', () => {
  assert.equal(shortModelName('claude-fable-5'), 'Fable 5')
  assert.equal(shortModelName('claude-opus-5'), 'Opus 5')
  assert.equal(shortModelName('claude-sonnet-5'), 'Sonnet 5')
  // 3세그먼트 기존 동작 회귀 0
  assert.equal(shortModelName('claude-opus-4-8'), 'Opus 4.8')
  assert.equal(shortModelName('claude-haiku-4-5-20251001'), 'Haiku 4.5')
  // 비 Claude 프로바이더는 원문 유지
  assert.equal(shortModelName('gpt-5.5'), 'gpt-5.5')
})

// === src/parser.ts 배선 =====================================================
console.log('\n[src/parser.ts — 혼합 모델 픽스처]')

const fixtureDir = path.join(repoRoot, 'tests', 'fixtures', 'logs')
const epsilonPath = path.join(fixtureDir, 'sample-project', 'session-epsilon.jsonl')
const epsilon = parseJsonl(fs.readFileSync(epsilonPath, 'utf8'), 'session-epsilon.jsonl')!

// 픽스처 구성: opus 응답 3건 + sonnet 응답 4건(r2 는 2라인) + <synthetic> 1라인.
// 병합 결과 assistant 블록 4개 — 그중 1개가 블록 내부에 opus→sonnet 전환을 담는다.
// 의도적 설계: **first(opus) ≠ dominant(sonnet)**, 블록 1위(opus 3:2)도 동수 없이 strict —
// first→dominant 회귀와 단위 혼동 회귀를 각각 단독으로 잡을 수 있는 구분력 확보.
const EXPECTED_RESPONSES = { 'claude-sonnet-4': 4, 'claude-opus-4-1': 3 }

test('modelResponses — 응답 단위 집계, <synthetic> 제외', () => {
  assert.deepEqual(epsilon.modelResponses, EXPECTED_RESPONSES)
  assert.equal(Object.keys(epsilon.modelResponses!).includes(SYNTHETIC_MODEL), false)
})

test('Session.model 은 의미 동결 — first-wins 이며 dominant 와 다르다 (가격 폴백·export 계약)', () => {
  // first=opus, dominant=sonnet — 값이 갈리므로 first→dominant 재정의 회귀가 즉시 잡힌다.
  // 명세가 이 동결의 근거로 든 실측: 재정의 시 가격 폴백이 $3/$15 → $15/$75 로 플립.
  assert.equal(epsilon.model, 'claude-opus-4-1')
  assert.notEqual(epsilon.model, dominantModel(epsilon.modelResponses))
})

test('병합 블록 안의 모델 전환이 models[] 로 보존된다 (<synthetic> 은 미포함)', () => {
  const blocks = epsilon.messages.filter((m) => m.role === 'assistant')
  assert.equal(blocks.length, 4)
  const mixed = blocks.filter((b) => b.models)
  assert.equal(mixed.length, 1, '전환을 담은 블록은 1개여야 한다')
  assert.deepEqual(mixed[0].models, ['claude-opus-4-1', 'claude-sonnet-4'])
  // 2종 미만 블록은 필드 자체가 없다 (직렬화 크기)
  assert.equal(blocks.filter((b) => !b.models).length, 3)
})

test('응답 단위와 블록 단위는 서로 다른 1위를 낸다 — 단위 선택이 결과를 바꾼다', () => {
  // 블록 근사 기준: opus 3 (단독 2 + 혼합블록 1) vs sonnet 2 — 동수 아님, tie-break 무관
  const byBlock = approximateModelResponses(epsilon.messages)!
  assert.deepEqual(byBlock, { 'claude-opus-4-1': 3, 'claude-sonnet-4': 2 })
  assert.equal(dominantModel(byBlock), 'claude-opus-4-1')
  // 응답 기준: sonnet 4 vs opus 3 → sonnet
  assert.equal(dominantModel(epsilon.modelResponses), 'claude-sonnet-4')
})

test('<synthetic> 메시지는 트랜스크립트에 그대로 남는다 (전환 인과 설명)', () => {
  const kept = epsilon.messages.some((m) => m.text.includes('hit your usage limit'))
  assert.equal(kept, true, 'synthetic 본문은 모델 축에서만 빠지고 렌더는 유지되어야 한다')
})

console.log('\n[modelAttribution — 전환 사유 분류]')

test('switchReasonCounts — 한도/컨텍스트 안내를 분류 id 로만 방출 (원문 미노출)', () => {
  const counts = switchReasonCounts([
    { role: 'assistant', text: "You've hit your session limit · resets 4:20am (Asia/Seoul)" },
    { role: 'assistant', text: "You've reached your Fable 5 limit. Run /usage-credits" },
    { role: 'assistant', text: 'Prompt is too long' },
  ])
  assert.equal(counts['usage-limit'], 2)
  assert.equal(counts['context-overflow'], 1)
})

test('switchReasonCounts — user 메시지와 일반 응답은 사유가 아니다', () => {
  assert.deepEqual(switchReasonCounts([{ role: 'user', text: "You've hit your session limit" }]), {})
  assert.deepEqual(switchReasonCounts([{ role: 'assistant', text: 'No response requested.' }]), {})
  assert.deepEqual(switchReasonCounts(undefined), {})
})

test('switchReasonCounts — 긴 본문은 오분류하지 않는다 (한도를 "논의"하는 응답 방어)', () => {
  const essay = 'When you hit your rate limit the API returns 429. ' + 'x'.repeat(300)
  assert.deepEqual(switchReasonCounts([{ role: 'assistant', text: essay }]), {})
})

test('switchReasonCounts — 병합 후에도 동작한다 (model 이 아니라 본문으로 판정)', () => {
  // <synthetic> 라인은 앞 블록에 병합되며 자기 model 값을 잃는다. 본문은 남는다.
  assert.equal(epsilon.messages.some((m) => m.model === SYNTHETIC_MODEL), false, '병합 후 synthetic model 은 남지 않는다')
  assert.equal(switchReasonCounts(epsilon.messages)['usage-limit'], 1)
})

// === computeStats 집계 단위 =================================================
console.log('\n[computeStats — 응답 단위 집계]')

test('Stats.modelResponses — 세션당 1표가 아니라 응답 수 합산', () => {
  const stats = computeStats([epsilon])
  assert.deepEqual(stats.modelResponses, EXPECTED_RESPONSES)
  // 회귀 가드: 세션당 1표 방식이었다면 첫 모델 하나만 1로 잡혔다
  assert.notDeepEqual(stats.modelResponses, { 'claude-sonnet-4': 1 })
})

test('혼합 세션은 쓴 모델 전부에 기여한다 — 이전에는 첫 모델만 계상됐다', () => {
  const stats = computeStats([epsilon])
  assert.equal(Object.keys(stats.modelResponses).length, 2)
  assert.ok(stats.modelResponses['claude-opus-4-1'] > 0, '두 번째 모델의 응답이 사라지면 안 된다')
})

test('여러 세션에 걸쳐 합산된다 (코퍼스 랭킹)', () => {
  const stats = computeStats([epsilon, epsilon])
  assert.deepEqual(stats.modelResponses, { 'claude-sonnet-4': 8, 'claude-opus-4-1': 6 })
})

test('sumModelResponses 는 computeStats 와 같은 값을 낸다 (카드 간 드리프트 방지)', () => {
  assert.deepEqual(sumModelResponses([epsilon]), computeStats([epsilon]).modelResponses)
})

// === src ↔ cli 정합 =========================================================
console.log('\n[src ↔ cli 파서 정합]')

const distIndex = path.join(repoRoot, 'dist', 'index.html')
if (!fs.existsSync(distIndex)) {
  console.log('  ! dist/ 없음 — `npm run build` 후 실행할 것 (test:harness 는 build 이후에 이 테스트를 돈다)')
  failed++
} else {
  const outPath = path.join(os.tmpdir(), 'memradar-model-attribution.html')
  if (fs.existsSync(outPath)) fs.rmSync(outPath, { force: true })

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

  test('cli/index.mjs 가 src/parser.ts 와 동일한 modelResponses 를 방출한다', () => {
    const serialized = JSON.stringify(EXPECTED_RESPONSES)
    assert.ok(
      html.includes(`"modelResponses":${serialized}`),
      `정적 임베드에 ${serialized} 가 없다 — 두 파서가 갈라졌다`
    )
  })

  test('cli/index.mjs 도 블록 내부 전환을 models[] 로 보존한다', () => {
    assert.ok(
      html.includes('"models":["claude-opus-4-1","claude-sonnet-4"]'),
      '정적 임베드에 블록 내부 전환 models[] 가 없다'
    )
  })

  test('정적 임베드에 <synthetic> 이 모델 집계값으로 실리지 않는다', () => {
    assert.equal(
      /"modelResponses":\{[^}]*synthetic/.test(html),
      false,
      'modelResponses 에 synthetic 이 새어 들어갔다'
    )
  })

  test('정적 임베드에 requestId 가 직렬화되지 않는다 (식별자 반출 금지)', () => {
    assert.equal(html.includes('req_eps_001'), false, 'requestId 는 집계 키로만 쓰고 방출 금지')
    assert.equal(html.includes('"requestId"'), false)
  })
}

// --- 결과 ------------------------------------------------------------------
console.log(`\n=== ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
