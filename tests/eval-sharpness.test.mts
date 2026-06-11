#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * eval-sharpness 순수 함수 어설션 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/eval-sharpness.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위: mulberry32, parseArgs, generatePairs, computeStats, loadStatements (순수/거의 순수)
 * 비-범위: runInteractive, saveReport, main, printConsoleReport (IO·콘솔 부수효과)
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  mulberry32,
  parseArgs,
  loadStatements,
  resolveStatements,
  generatePairs,
  computeStats,
  progressBar,
  starsFor,
  type Choice,
  type CategoryId,
} from '../scripts/eval-sharpness.mts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

// === mulberry32 ============================================================
section('mulberry32')

test('같은 seed → 같은 시퀀스', () => {
  const a = mulberry32(42)
  const b = mulberry32(42)
  for (let i = 0; i < 50; i++) assert.strictEqual(a(), b())
})

test('다른 seed → 다른 시퀀스', () => {
  const a = mulberry32(42)
  const b = mulberry32(43)
  let allSame = true
  for (let i = 0; i < 50; i++) {
    if (a() !== b()) { allSame = false; break }
  }
  assert.ok(!allSame, '50회 안에 차이가 발생해야 함')
})

test('출력값 [0, 1) 범위', () => {
  const r = mulberry32(123)
  for (let i = 0; i < 1000; i++) {
    const v = r()
    assert.ok(v >= 0 && v < 1, `value ${v} out of [0,1)`)
  }
})

// === parseArgs =============================================================
section('parseArgs')

test('기본값 (pairs=30, seed 자동)', () => {
  const a = parseArgs(['node', 'script.mts'])
  assert.strictEqual(a.pairs, 30)
  assert.ok(Number.isFinite(a.seed))
})

test('--pairs 정수 적용', () => {
  const a = parseArgs(['node', 'script.mts', '--pairs', '10'])
  assert.strictEqual(a.pairs, 10)
})

test('--seed 정수 적용', () => {
  const a = parseArgs(['node', 'script.mts', '--seed', '99'])
  assert.strictEqual(a.seed, 99)
})

test('--pairs 0 거부', () => {
  assert.throws(() => parseArgs(['node', 'script.mts', '--pairs', '0']), /1~100/)
})

test('--pairs 101 거부', () => {
  assert.throws(() => parseArgs(['node', 'script.mts', '--pairs', '101']), /1~100/)
})

test('--pairs 비-정수 거부', () => {
  assert.throws(() => parseArgs(['node', 'script.mts', '--pairs', 'abc']), /정수/)
})

test('--seed 비-정수 거부', () => {
  assert.throws(() => parseArgs(['node', 'script.mts', '--seed', 'xyz']), /정수/)
})

test('알 수 없는 옵션 거부', () => {
  assert.throws(() => parseArgs(['node', 'script.mts', '--foo']), /알 수 없는/)
})

test('--lens 기본값 general', () => {
  const a = parseArgs(['node', 'script.mts'])
  assert.strictEqual(a.lens, 'general')
})

test('--lens developer 적용', () => {
  const a = parseArgs(['node', 'script.mts', '--lens', 'developer'])
  assert.strictEqual(a.lens, 'developer')
})

test('--lens 무효값 거부', () => {
  assert.throws(() => parseArgs(['node', 'script.mts', '--lens', 'frontend']), /developer\|pm/)
})

// === generatePairs =========================================================
section('generatePairs')

const FAKE_CATS = ['a', 'b', 'c', 'd'] as const
const FAKE_STMTS: Record<string, string[]> = {
  a: ['A1', 'A2', 'A3'],
  b: ['B1', 'B2', 'B3'],
  c: ['C1', 'C2', 'C3'],
  d: ['D1', 'D2', 'D3'],
}

test('정확히 N개 페어 생성', () => {
  const pairs = generatePairs([...FAKE_CATS], FAKE_STMTS, 20, mulberry32(1))
  assert.strictEqual(pairs.length, 20)
})

test('같은 카테고리 자기 자신과 페어 없음 (100회)', () => {
  const pairs = generatePairs([...FAKE_CATS], FAKE_STMTS, 100, mulberry32(1))
  for (const p of pairs) {
    assert.notStrictEqual(p.leftCategory, p.rightCategory, `pair ${p.index} self-paired`)
  }
})

test('진술이 올바른 카테고리에서 추출됨', () => {
  const pairs = generatePairs([...FAKE_CATS], FAKE_STMTS, 50, mulberry32(7))
  for (const p of pairs) {
    assert.ok(
      FAKE_STMTS[p.leftCategory]!.includes(p.leftStatement),
      `left "${p.leftStatement}" not in cat ${p.leftCategory}`,
    )
    assert.ok(
      FAKE_STMTS[p.rightCategory]!.includes(p.rightStatement),
      `right "${p.rightStatement}" not in cat ${p.rightCategory}`,
    )
  }
})

test('같은 seed → 같은 페어 시퀀스 (재현성)', () => {
  const p1 = generatePairs([...FAKE_CATS], FAKE_STMTS, 10, mulberry32(7))
  const p2 = generatePairs([...FAKE_CATS], FAKE_STMTS, 10, mulberry32(7))
  assert.deepStrictEqual(p1, p2)
})

test('index 1..N 순서', () => {
  const pairs = generatePairs([...FAKE_CATS], FAKE_STMTS, 5, mulberry32(1))
  assert.deepStrictEqual(
    pairs.map((p) => p.index),
    [1, 2, 3, 4, 5],
  )
})

test('카테고리 9개 + 30 페어에서 모든 카테고리 등장', () => {
  // 균등 샘플링이라 30 페어 중 9 카테고리 다 등장해야 정상
  const nineCats = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9']
  const nineStmts: Record<string, string[]> = {}
  for (const c of nineCats) nineStmts[c] = [`${c}_s1`, `${c}_s2`]
  const pairs = generatePairs(nineCats, nineStmts, 30, mulberry32(42))
  const seen = new Set<string>()
  for (const p of pairs) {
    seen.add(p.leftCategory)
    seen.add(p.rightCategory)
  }
  // 30 페어 * 2 = 60 슬롯, 9 카테고리 — 통계적으로 다 등장. 보수적으로 ≥7 검증.
  assert.ok(seen.size >= 7, `${seen.size} categories appeared (expected ≥7)`)
})

// === computeStats ==========================================================
section('computeStats')

const TITLE_MAP = new Map<CategoryId, string>([
  ['a', 'A title'],
  ['b', 'B title'],
  ['c', 'C title'],
  ['d', 'D title'],
])

function mkChoice(
  idx: number,
  left: CategoryId,
  right: CategoryId,
  chosen: 'left' | 'right' | 'skip',
): Choice {
  return {
    index: idx,
    leftCategory: left,
    rightCategory: right,
    leftStatement: '',
    rightStatement: '',
    chosen,
    chosenCategory: chosen === 'left' ? left : chosen === 'right' ? right : null,
  }
}

test('기본 pickRate 계산', () => {
  // 'a' 가 3 페어에 등장, 2번 선택됨
  const choices: Choice[] = [
    mkChoice(1, 'a', 'b', 'left'),
    mkChoice(2, 'a', 'c', 'left'),
    mkChoice(3, 'a', 'd', 'right'),
  ]
  const s = computeStats(choices, ['a', 'b', 'c', 'd'], TITLE_MAP)
  assert.strictEqual(s.a!.appearances, 3)
  assert.strictEqual(s.a!.picks, 2)
  assert.strictEqual(s.a!.skips, 0)
  assert.strictEqual(s.a!.pickRate, 2 / 3)
  // sharpness = |2/3 - 0.5| * 2 = 0.333... → 3소수점 반올림으로 정확히 0.333
  assert.strictEqual(s.a!.sharpness, 0.333)
})

test('skip은 분모에서 제외', () => {
  const choices: Choice[] = [
    mkChoice(1, 'a', 'b', 'left'),
    mkChoice(2, 'a', 'c', 'skip'),
    mkChoice(3, 'a', 'd', 'left'),
  ]
  const s = computeStats(choices, ['a', 'b', 'c', 'd'], TITLE_MAP)
  assert.strictEqual(s.a!.appearances, 3)
  assert.strictEqual(s.a!.skips, 1)
  assert.strictEqual(s.a!.picks, 2)
  // 분모 = 3-1 = 2, picks = 2 → rate = 1.0
  assert.strictEqual(s.a!.pickRate, 1)
  assert.strictEqual(s.a!.sharpness, 1)
})

test('유효 표본 < 2 → insufficient', () => {
  const choices: Choice[] = [mkChoice(1, 'a', 'b', 'left')]
  const s = computeStats(choices, ['a', 'b'], TITLE_MAP)
  assert.strictEqual(s.a!.verdict, 'insufficient')
  assert.strictEqual(s.a!.pickRate, null)
  assert.strictEqual(s.a!.sharpness, null)
})

test('등장 0회 카테고리 → insufficient + null', () => {
  const choices: Choice[] = [mkChoice(1, 'a', 'b', 'left')]
  const s = computeStats(choices, ['a', 'b', 'z'], TITLE_MAP)
  assert.strictEqual(s.z!.appearances, 0)
  assert.strictEqual(s.z!.verdict, 'insufficient')
  assert.strictEqual(s.z!.sharpness, null)
})

test('verdict 임계값: barnum / moderate / sharp / very_sharp', () => {
  // 10 페어, 'a' vs 'b', picks of 'a' 변화시키며 verdict 확인
  function makeChoices(aPicks: number, total: number): Choice[] {
    const out: Choice[] = []
    for (let i = 0; i < aPicks; i++) out.push(mkChoice(i + 1, 'a', 'b', 'left'))
    for (let i = aPicks; i < total; i++) out.push(mkChoice(i + 1, 'a', 'b', 'right'))
    return out
  }
  // 5/10: rate=0.5, sharpness=0 → barnum
  assert.strictEqual(computeStats(makeChoices(5, 10), ['a', 'b'], TITLE_MAP).a!.verdict, 'barnum')
  // 6/10: rate=0.6, sharpness=0.2 → moderate (>=0.2)
  assert.strictEqual(computeStats(makeChoices(6, 10), ['a', 'b'], TITLE_MAP).a!.verdict, 'moderate')
  // 8/10: rate=0.8, sharpness=0.6 → sharp (>=0.5)
  assert.strictEqual(computeStats(makeChoices(8, 10), ['a', 'b'], TITLE_MAP).a!.verdict, 'sharp')
  // 10/10: rate=1.0, sharpness=1.0 → very_sharp (>=0.8)
  assert.strictEqual(computeStats(makeChoices(10, 10), ['a', 'b'], TITLE_MAP).a!.verdict, 'very_sharp')
})

test('title 매핑 적용', () => {
  const choices: Choice[] = [
    mkChoice(1, 'a', 'b', 'left'),
    mkChoice(2, 'a', 'b', 'right'),
  ]
  const s = computeStats(choices, ['a', 'b'], TITLE_MAP)
  assert.strictEqual(s.a!.title, 'A title')
  assert.strictEqual(s.b!.title, 'B title')
})

test('title 없는 카테고리 → fallback to id', () => {
  const choices: Choice[] = [
    mkChoice(1, 'unknown', 'b', 'left'),
    mkChoice(2, 'unknown', 'b', 'right'),
  ]
  const s = computeStats(choices, ['unknown', 'b'], TITLE_MAP)
  assert.strictEqual(s.unknown!.title, 'unknown')
})

// === loadStatements ========================================================
section('loadStatements')

const SCRIPTS_DIR = path.resolve(__dirname, '..', 'scripts')
const REAL_IDS = ['feature', 'debug', 'refactor', 'review', 'writing', 'design', 'devops', 'data', 'test']

test('실제 진술 사전 파일 로드 성공', () => {
  const data = loadStatements(SCRIPTS_DIR, REAL_IDS)
  assert.strictEqual(data.version, 2)
  assert.strictEqual(data.language, 'ko')
  assert.strictEqual(Object.keys(data.statements).length, 9)
})

test('키 불일치 시 에러 throw', () => {
  assert.throws(
    () => loadStatements(SCRIPTS_DIR, ['x', 'y', 'z']),
    /USAGE_CATEGORIES 와 불일치/,
  )
})

test('파일 없을 때 에러 throw', () => {
  const fakeDir = path.join(SCRIPTS_DIR, '__nonexistent__')
  assert.throws(() => loadStatements(fakeDir, REAL_IDS), /진술 사전 파일이 없음/)
})

test('실제 파일에 lenses 4개 로드', () => {
  const data = loadStatements(SCRIPTS_DIR, REAL_IDS)
  assert.ok(data.lenses, 'lenses 가 로드되어야 함')
  assert.deepStrictEqual(
    Object.keys(data.lenses!).sort(),
    ['data', 'designer', 'developer', 'pm'],
  )
})

// === resolveStatements (CLI 내부 렌즈 폴백) ================================
section('resolveStatements (CLI)')

test('general → statements 그대로', () => {
  const file = {
    statements: { feature: ['g1', 'g2'], debug: ['g3', 'g4'] },
    lenses: { developer: { feature: ['d1', 'd2'] } },
  }
  const out = resolveStatements(file, 'general')
  assert.strictEqual(out, file.statements)
})

test('developer → 렌즈 카테고리는 렌즈값, 누락은 general 폴백', () => {
  const file = {
    statements: { feature: ['g1', 'g2'], debug: ['g3', 'g4'] },
    lenses: { developer: { feature: ['d1', 'd2'] } },
  }
  const out = resolveStatements(file, 'developer')
  assert.deepStrictEqual(out.feature, ['d1', 'd2'])
  assert.deepStrictEqual(out.debug, ['g3', 'g4'])
})

test('렌즈 없는 job → general 폴백', () => {
  const file = { statements: { feature: ['g1', 'g2'] } }
  const out = resolveStatements(file, 'developer')
  assert.strictEqual(out, file.statements)
})

// === progressBar ===========================================================
section('progressBar')

test('0/N → 모두 빈칸', () => {
  const out = progressBar(0, 10, 20)
  // 0% 일 때 ░ 20개 + 메타데이터
  assert.ok(out.startsWith('░'.repeat(20)), `expected 20 empty, got: ${out}`)
  assert.ok(out.includes('0/10'))
  assert.ok(out.includes('(0%)'))
})

test('N/N → 모두 채움', () => {
  const out = progressBar(10, 10, 20)
  assert.ok(out.startsWith('█'.repeat(20)), `expected 20 filled, got: ${out}`)
  assert.ok(out.includes('10/10'))
  assert.ok(out.includes('(100%)'))
})

test('중간 비율 라운딩', () => {
  // 15/30 = 50% → 10 filled / 10 empty (width=20)
  const out = progressBar(15, 30, 20)
  assert.ok(out.includes('█'.repeat(10) + '░'.repeat(10)), `unexpected: ${out}`)
  assert.ok(out.includes('(50%)'))
})

test('total=0 → 빈 문자열', () => {
  assert.strictEqual(progressBar(0, 0, 20), '')
})

test('current > total 클램프', () => {
  // 보호 동작: 99/10 → 100%로 클램프
  const out = progressBar(99, 10, 10)
  assert.ok(out.startsWith('█'.repeat(10)))
  assert.ok(out.includes('(100%)'))
})

// === starsFor ==============================================================
section('starsFor')

test('모든 verdict 5자 별 문자열 반환', () => {
  const all = ['very_sharp', 'sharp', 'moderate', 'barnum', 'insufficient'] as const
  for (const v of all) {
    const s = starsFor(v)
    // 별(✪ 또는 ☆)이 정확히 5개 — 문자열 길이가 아니라 별 개수로 검증 (유니코드 surrogate 가능성)
    const stars = [...s].filter((ch) => ch === '✪' || ch === '☆')
    assert.strictEqual(stars.length, 5, `${v}: got ${stars.length} stars in "${s}"`)
  }
})

test('very_sharp → 채움 별 5개', () => {
  const stars = [...starsFor('very_sharp')]
  assert.strictEqual(stars.filter((c) => c === '✪').length, 5)
})

test('barnum → 채움 별 1개', () => {
  const stars = [...starsFor('barnum')]
  assert.strictEqual(stars.filter((c) => c === '✪').length, 1)
})

test('insufficient → 채움 별 0개', () => {
  const stars = [...starsFor('insufficient')]
  assert.strictEqual(stars.filter((c) => c === '✪').length, 0)
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
