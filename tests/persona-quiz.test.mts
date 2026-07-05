#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * persona-quiz 순수 함수 어설션 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/persona-quiz.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위: mulberry32, generateBalancedPairs, normalizeTopShare, computeCalibration,
 *       applyCalibration (모두 순수)
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  mulberry32,
  generateBalancedPairs,
  normalizeTopShare,
  computeCalibration,
  applyCalibration,
  applyCalibrationOverUniverse,
  MAX_CALIBRATION_WEIGHT,
  PERSONA_QUIZ_VERSION,
  type Answer,
  type CategoryId,
  type QuizState,
  type QuizRun,
  type Calibration,
} from '../src/lib/personaQuiz.ts'
import type { UsageCategory } from '../src/lib/usageProfile.ts'
import { PERSONA_STATEMENTS, resolveStatements } from '../src/data/personaStatements.ts'

// localStorage mock 설치 (storage 모듈 import 전에 window 를 준비).
// storage 모듈은 호출 시점에만 window.localStorage 를 읽으므로 정적 import 안전하나,
// 명시적으로 mock 을 globalThis 에 먼저 붙인다.
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  clear(): void {
    this.map.clear()
  }
  get size(): number {
    return this.map.size
  }
  has(key: string): boolean {
    return this.map.has(key)
  }
}

const memStorage = new MemoryStorage()
;(globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
  localStorage: memStorage,
}

const { loadPersonaQuiz, savePersonaQuiz, clearPersonaQuiz } = await import(
  '../src/lib/personaQuizStorage.ts'
)

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

function approx(actual: number, expected: number, eps = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `expected ${expected}, got ${actual} (Δ=${Math.abs(actual - expected)})`,
  )
}

// 9 카테고리 + 각 1개 진술 (텍스트 검증은 별도, 페어 구조만)
const NINE_CATS: CategoryId[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9']
const NINE_STMTS: Record<string, string[]> = {}
for (const c of NINE_CATS) NINE_STMTS[c] = [`${c}_s1`, `${c}_s2`]

// === mulberry32 ============================================================
section('mulberry32')

test('같은 seed → 같은 시퀀스', () => {
  const a = mulberry32(42)
  const b = mulberry32(42)
  for (let i = 0; i < 50; i++) assert.strictEqual(a(), b())
})

// === generateBalancedPairs =================================================
section('generateBalancedPairs')

test('정확히 9쌍 생성 (9 카테고리)', () => {
  const pairs = generateBalancedPairs(NINE_CATS, NINE_STMTS, 1)
  assert.strictEqual(pairs.length, 9)
})

test('각 카테고리 정확히 2회 등장 — 여러 시드', () => {
  for (const seed of [1, 7, 42, 123, 999, 2026, 31337, 0, 88888]) {
    const pairs = generateBalancedPairs(NINE_CATS, NINE_STMTS, seed)
    const counts: Record<string, number> = {}
    for (const c of NINE_CATS) counts[c] = 0
    for (const p of pairs) {
      counts[p.leftCategory]++
      counts[p.rightCategory]++
    }
    for (const c of NINE_CATS) {
      assert.strictEqual(counts[c], 2, `seed ${seed}: '${c}' appeared ${counts[c]} times (expected 2)`)
    }
  }
})

test('left≠right 보장 — 여러 시드', () => {
  for (const seed of [1, 7, 42, 123, 999, 2026, 31337, 0, 88888, 555]) {
    const pairs = generateBalancedPairs(NINE_CATS, NINE_STMTS, seed)
    for (const p of pairs) {
      assert.notStrictEqual(
        p.leftCategory,
        p.rightCategory,
        `seed ${seed}: pair ${p.index} self-paired (${p.leftCategory})`,
      )
    }
  }
})

test('같은 seed → 같은 페어 시퀀스 (재현성)', () => {
  const p1 = generateBalancedPairs(NINE_CATS, NINE_STMTS, 7)
  const p2 = generateBalancedPairs(NINE_CATS, NINE_STMTS, 7)
  assert.deepStrictEqual(p1, p2)
})

test('index 1..9 순서', () => {
  const pairs = generateBalancedPairs(NINE_CATS, NINE_STMTS, 1)
  assert.deepStrictEqual(pairs.map((p) => p.index), [1, 2, 3, 4, 5, 6, 7, 8, 9])
})

test('진술이 올바른 카테고리 풀에서 추출됨', () => {
  const pairs = generateBalancedPairs(NINE_CATS, NINE_STMTS, 42)
  for (const p of pairs) {
    assert.ok(NINE_STMTS[p.leftCategory]!.includes(p.leftStatement))
    assert.ok(NINE_STMTS[p.rightCategory]!.includes(p.rightStatement))
  }
})

test('짝수 N: N 쌍·각 카테고리 정확히 2회', () => {
  // 2N 슬롯 / 2 = N 쌍 (N=4 → 4쌍), 각 카테고리 정확히 2회.
  const cats = ['a', 'b', 'c', 'd']
  const stmts: Record<string, string[]> = { a: ['a'], b: ['b'], c: ['c'], d: ['d'] }
  for (const seed of [1, 2, 3, 50, 777]) {
    const pairs = generateBalancedPairs(cats, stmts, seed)
    assert.strictEqual(pairs.length, 4)
    const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 }
    for (const p of pairs) {
      counts[p.leftCategory]++
      counts[p.rightCategory]++
      assert.notStrictEqual(p.leftCategory, p.rightCategory)
    }
    for (const c of cats) assert.strictEqual(counts[c], 2)
  }
})

// === generateBalancedPairs — exclude (unseen-first) ========================
section('generateBalancedPairs exclude (unseen-first)')

// exclude 파라미터 도입 전(v2 구현)에 캡처한 골든 출력 — 4번째 인자 미전달 시
// 기존 호출 결과가 바이트 단위로 동일해야 한다(regression 0).
const GOLDEN_SEED_7 = JSON.parse(
  '[{"index":1,"leftCategory":"c1","rightCategory":"c2","leftStatement":"c1_s2","rightStatement":"c2_s1"},{"index":2,"leftCategory":"c5","rightCategory":"c9","leftStatement":"c5_s2","rightStatement":"c9_s1"},{"index":3,"leftCategory":"c7","rightCategory":"c3","leftStatement":"c7_s2","rightStatement":"c3_s1"},{"index":4,"leftCategory":"c9","rightCategory":"c8","leftStatement":"c9_s1","rightStatement":"c8_s1"},{"index":5,"leftCategory":"c4","rightCategory":"c6","leftStatement":"c4_s1","rightStatement":"c6_s2"},{"index":6,"leftCategory":"c2","rightCategory":"c7","leftStatement":"c2_s2","rightStatement":"c7_s1"},{"index":7,"leftCategory":"c3","rightCategory":"c4","leftStatement":"c3_s2","rightStatement":"c4_s2"},{"index":8,"leftCategory":"c6","rightCategory":"c8","leftStatement":"c6_s2","rightStatement":"c8_s2"},{"index":9,"leftCategory":"c1","rightCategory":"c5","leftStatement":"c1_s2","rightStatement":"c5_s2"}]',
)
const GOLDEN_SEED_42 = JSON.parse(
  '[{"index":1,"leftCategory":"c6","rightCategory":"c8","leftStatement":"c6_s2","rightStatement":"c8_s1"},{"index":2,"leftCategory":"c3","rightCategory":"c1","leftStatement":"c3_s1","rightStatement":"c1_s2"},{"index":3,"leftCategory":"c9","rightCategory":"c5","leftStatement":"c9_s1","rightStatement":"c5_s2"},{"index":4,"leftCategory":"c8","rightCategory":"c1","leftStatement":"c8_s1","rightStatement":"c1_s1"},{"index":5,"leftCategory":"c3","rightCategory":"c5","leftStatement":"c3_s1","rightStatement":"c5_s1"},{"index":6,"leftCategory":"c7","rightCategory":"c2","leftStatement":"c7_s2","rightStatement":"c2_s2"},{"index":7,"leftCategory":"c4","rightCategory":"c2","leftStatement":"c4_s1","rightStatement":"c2_s1"},{"index":8,"leftCategory":"c9","rightCategory":"c7","leftStatement":"c9_s2","rightStatement":"c7_s1"},{"index":9,"leftCategory":"c4","rightCategory":"c6","leftStatement":"c4_s2","rightStatement":"c6_s1"}]',
)

test('exclude 미전달 → v2 구현 골든 출력과 동일 (regression 0)', () => {
  assert.deepStrictEqual(generateBalancedPairs(NINE_CATS, NINE_STMTS, 7), GOLDEN_SEED_7)
  assert.deepStrictEqual(generateBalancedPairs(NINE_CATS, NINE_STMTS, 42), GOLDEN_SEED_42)
})

test('exclude 빈 집합/무관 텍스트 → 미전달과 동일 출력', () => {
  for (const seed of [1, 7, 42, 999, 31337]) {
    const base = generateBalancedPairs(NINE_CATS, NINE_STMTS, seed)
    assert.deepStrictEqual(
      generateBalancedPairs(NINE_CATS, NINE_STMTS, seed, new Set<string>()),
      base,
      `seed ${seed}: 빈 exclude 는 미전달과 동일해야 함`,
    )
    assert.deepStrictEqual(
      generateBalancedPairs(NINE_CATS, NINE_STMTS, seed, new Set(['풀에_없는_진술'])),
      base,
      `seed ${seed}: 무관 텍스트 exclude 는 미전달과 동일해야 함`,
    )
  }
})

test('제외 진술은 출제되지 않음 (부분집합 샘플링) — 여러 시드', () => {
  // 각 카테고리 풀 2개 중 _s1 을 전부 제외 → 모든 진술이 _s2 여야 한다.
  const exclude = new Set(NINE_CATS.map((c) => `${c}_s1`))
  for (const seed of [1, 7, 42, 123, 999, 2026, 31337, 0, 88888]) {
    const pairs = generateBalancedPairs(NINE_CATS, NINE_STMTS, seed, exclude)
    for (const p of pairs) {
      assert.ok(!exclude.has(p.leftStatement), `seed ${seed}: 제외 진술 출제 (${p.leftStatement})`)
      assert.ok(!exclude.has(p.rightStatement), `seed ${seed}: 제외 진술 출제 (${p.rightStatement})`)
      assert.ok(p.leftStatement.endsWith('_s2'))
      assert.ok(p.rightStatement.endsWith('_s2'))
    }
  }
})

test('풀 소진 시 전체 풀 폴백 (에러 없음)', () => {
  // 모든 진술을 제외 → 부분집합이 빔 → 전체 풀에서 뽑는다(unseen-first 폴백).
  const excludeAll = new Set<string>()
  for (const c of NINE_CATS) for (const s of NINE_STMTS[c]!) excludeAll.add(s)
  for (const seed of [1, 7, 42, 999]) {
    const pairs = generateBalancedPairs(NINE_CATS, NINE_STMTS, seed, excludeAll)
    assert.strictEqual(pairs.length, 9)
    for (const p of pairs) {
      assert.ok(NINE_STMTS[p.leftCategory]!.includes(p.leftStatement))
      assert.ok(NINE_STMTS[p.rightCategory]!.includes(p.rightStatement))
    }
  }
})

test('일부 카테고리만 소진 → 해당 카테고리만 전체 풀 폴백', () => {
  // c1 만 풀 전체 제외, 나머지는 _s1 제외 → c1 은 아무 진술, 나머지는 _s2 만.
  const exclude = new Set<string>(['c1_s1', 'c1_s2'])
  for (const c of NINE_CATS) if (c !== 'c1') exclude.add(`${c}_s1`)
  for (const seed of [1, 7, 42, 999]) {
    const pairs = generateBalancedPairs(NINE_CATS, NINE_STMTS, seed, exclude)
    for (const p of pairs) {
      for (const [cat, stmt] of [
        [p.leftCategory, p.leftStatement],
        [p.rightCategory, p.rightStatement],
      ] as const) {
        if (cat === 'c1') {
          assert.ok(NINE_STMTS.c1!.includes(stmt), `seed ${seed}: c1 폴백 실패 (${stmt})`)
        } else {
          assert.ok(stmt.endsWith('_s2'), `seed ${seed}: '${cat}' 제외 진술 출제 (${stmt})`)
        }
      }
    }
  }
})

test('exclude 전달 시에도 불변조건 유지 — 2회 등장/left≠right/시드 결정성', () => {
  const exclude = new Set(NINE_CATS.map((c) => `${c}_s1`))
  for (const seed of [1, 7, 42, 123, 999, 2026, 31337]) {
    const pairs = generateBalancedPairs(NINE_CATS, NINE_STMTS, seed, exclude)
    const counts: Record<string, number> = {}
    for (const c of NINE_CATS) counts[c] = 0
    for (const p of pairs) {
      counts[p.leftCategory]++
      counts[p.rightCategory]++
      assert.notStrictEqual(p.leftCategory, p.rightCategory, `seed ${seed}: self-pair`)
    }
    for (const c of NINE_CATS) assert.strictEqual(counts[c], 2, `seed ${seed}: '${c}' 등장 ${counts[c]}회`)
    // 같은 입력(seed + exclude) → 같은 출력.
    assert.deepStrictEqual(
      generateBalancedPairs(NINE_CATS, NINE_STMTS, seed, new Set(exclude)),
      pairs,
      `seed ${seed}: exclude 포함 결정성 위반`,
    )
  }
})

// === normalizeTopShare =====================================================
section('normalizeTopShare')

test('top-share = score / Σscore', () => {
  const out = normalizeTopShare({ a: 1, b: 3 }, ['a', 'b'])
  approx(out.a!, 0.25)
  approx(out.b!, 0.75)
})

test('Σ=0 → 균등 분포', () => {
  const out = normalizeTopShare({ a: 0, b: 0, c: 0 }, ['a', 'b', 'c'])
  approx(out.a!, 1 / 3)
  approx(out.b!, 1 / 3)
  approx(out.c!, 1 / 3)
})

test('합 = 1', () => {
  const out = normalizeTopShare({ a: 2, b: 5, c: 3 }, ['a', 'b', 'c'])
  approx(out.a! + out.b! + out.c!, 1)
})

// === computeCalibration ====================================================
section('computeCalibration')

test('appearances<2 → auto 유지 (미등장 카테고리)', () => {
  // 'a','b' 만 검사에 등장(각 2회), 'c' 는 검사에 0회 등장
  const answers: Answer[] = [
    { leftCategory: 'a', rightCategory: 'b', chosen: 'left' },
    { leftCategory: 'a', rightCategory: 'b', chosen: 'left' },
  ]
  const raw = { a: 1, b: 1, c: 2 } // auto: a=0.25, b=0.25, c=0.5
  const cats = ['a', 'b', 'c']
  const { calibration, finalDistribution } = computeCalibration(answers, raw, cats)
  // a: pickRate=1, sharpness=1, weight=0.6 → rawFinal = 0.25*0.4 + 1*0.6 = 0.7
  // b: pickRate=0, sharpness=1, weight=0.6 → rawFinal = 0.25*0.4 + 0    = 0.1
  // c: appearances=0(<2) → final = auto = 0.5
  // rawFinal 합 = 0.7 + 0.1 + 0.5 = 1.3 → 재정규화
  approx(calibration.c!.pickRate, 0)
  approx(calibration.c!.weight, 0)
  approx(finalDistribution.c!, 0.5 / 1.3)
  approx(finalDistribution.a!, 0.7 / 1.3)
  approx(finalDistribution.b!, 0.1 / 1.3)
})

test('알려진 입력 → 기대 final (weight 적용)', () => {
  // a vs b 2회: a 2번 선택 → a pickRate=1, b pickRate=0
  const answers: Answer[] = [
    { leftCategory: 'a', rightCategory: 'b', chosen: 'left' },
    { leftCategory: 'a', rightCategory: 'b', chosen: 'left' },
  ]
  const raw = { a: 1, b: 1 } // auto: a=0.5, b=0.5
  const cats = ['a', 'b']
  const { calibration } = computeCalibration(answers, raw, cats)
  // a: pickRate=1, sharpness=1, weight=min(1,0.6)=0.6
  //    rawFinal = 0.5*(1-0.6) + 1*0.6 = 0.2 + 0.6 = 0.8
  // b: pickRate=0, sharpness=1, weight=0.6
  //    rawFinal = 0.5*0.4 + 0*0.6 = 0.2
  // 합 = 1.0 → 재정규화 무변화
  approx(calibration.a!.pickRate, 1)
  approx(calibration.a!.sharpness, 1)
  approx(calibration.a!.weight, MAX_CALIBRATION_WEIGHT)
  approx(calibration.a!.finalScore, 0.8)
  approx(calibration.b!.finalScore, 0.2)
})

test('skip 은 등장(분모)에 포함되되 pick 아님', () => {
  // a vs b: 1번 a 선택, 1번 skip → a appearances=2, picks=1 → pickRate=0.5
  const answers: Answer[] = [
    { leftCategory: 'a', rightCategory: 'b', chosen: 'left' },
    { leftCategory: 'a', rightCategory: 'b', chosen: 'skip' },
  ]
  const raw = { a: 1, b: 1 }
  const cats = ['a', 'b']
  const { calibration } = computeCalibration(answers, raw, cats)
  // a: appearances=2, picks=1 → pickRate=0.5, sharpness=0, weight=0 → final=auto=0.5
  // b: appearances=2, picks=0 → pickRate=0, sharpness=1, weight=0.6
  //    rawFinal_b = 0.5*0.4 + 0*0.6 = 0.2
  //    rawFinal_a = 0.5 (weight 0)
  //    합 = 0.7 → 재정규화: a=0.5/0.7, b=0.2/0.7
  approx(calibration.a!.pickRate, 0.5)
  approx(calibration.a!.weight, 0)
  approx(calibration.b!.pickRate, 0)
  approx(calibration.b!.finalScore, 0.2 / 0.7)
  approx(calibration.a!.finalScore, 0.5 / 0.7)
})

test('finalDistribution 합 = 1 (재정규화)', () => {
  const answers: Answer[] = [
    { leftCategory: 'a', rightCategory: 'b', chosen: 'left' },
    { leftCategory: 'a', rightCategory: 'c', chosen: 'right' },
    { leftCategory: 'b', rightCategory: 'c', chosen: 'left' },
    { leftCategory: 'b', rightCategory: 'a', chosen: 'skip' },
    { leftCategory: 'c', rightCategory: 'a', chosen: 'left' },
    { leftCategory: 'c', rightCategory: 'b', chosen: 'right' },
  ]
  const raw = { a: 3, b: 2, c: 5 }
  const cats = ['a', 'b', 'c']
  const { finalDistribution } = computeCalibration(answers, raw, cats)
  const sum = cats.reduce((s, c) => s + finalDistribution[c]!, 0)
  approx(sum, 1)
})

test('calibration.finalScore == finalDistribution (재정규화 후 일관)', () => {
  const answers: Answer[] = [
    { leftCategory: 'a', rightCategory: 'b', chosen: 'left' },
    { leftCategory: 'a', rightCategory: 'b', chosen: 'right' },
  ]
  const raw = { a: 4, b: 1 }
  const cats = ['a', 'b']
  const { calibration, finalDistribution } = computeCalibration(answers, raw, cats)
  for (const c of cats) {
    approx(calibration[c]!.finalScore, finalDistribution[c]!)
  }
})

test('2-run 병합 answers → appearances 4 반영 (정밀 진단 pickRate 분모)', () => {
  // run1: a vs b 2회 — a 선택 1 + skip 1 → run1 단독이면 pickRate_a = 1/2 = 0.5 (weight 0)
  const run1: Answer[] = [
    { leftCategory: 'a', rightCategory: 'b', chosen: 'left' },
    { leftCategory: 'a', rightCategory: 'b', chosen: 'skip' },
  ]
  // run2: a vs b 2회 — a 선택 2
  const run2: Answer[] = [
    { leftCategory: 'a', rightCategory: 'b', chosen: 'left' },
    { leftCategory: 'a', rightCategory: 'b', chosen: 'left' },
  ]
  const raw = { a: 1, b: 1 } // auto: a=0.5, b=0.5
  const cats = ['a', 'b']

  // run1 단독 — 대조군: pickRate_a = 0.5, weight 0.
  const solo = computeCalibration(run1, raw, cats)
  approx(solo.calibration.a!.pickRate, 0.5)
  approx(solo.calibration.a!.weight, 0)

  // 병합(정밀 진단): a appearances=4, picks=3 → pickRate=0.75 (분모가 2→4 로 증가)
  const merged = computeCalibration([...run1, ...run2], raw, cats)
  approx(merged.calibration.a!.pickRate, 0.75)
  approx(merged.calibration.a!.sharpness, 0.5)
  approx(merged.calibration.a!.weight, 0.5)
  // b: appearances=4, picks=0 → pickRate=0, sharpness=1, weight=min(1, 0.6)
  approx(merged.calibration.b!.pickRate, 0)
  approx(merged.calibration.b!.weight, MAX_CALIBRATION_WEIGHT)
  // final: a = 0.5*0.5 + 0.75*0.5 = 0.625, b = 0.5*0.4 + 0 = 0.2 → 합 0.825 재정규화
  approx(merged.finalDistribution.a!, 0.625 / 0.825)
  approx(merged.finalDistribution.b!, 0.2 / 0.825)
})

// === applyCalibration ======================================================
section('applyCalibration')

function mkCat(id: string, score: number) {
  return {
    id,
    title: id.toUpperCase(),
    subtitle: '',
    emoji: '',
    color: '#000',
    score,
    sessionCount: 1,
  }
}

test('보정 null → 입력 그대로 (regression 0)', () => {
  const cats = [mkCat('a', 10), mkCat('b', 5)]
  const out = applyCalibration(cats, null)
  assert.strictEqual(out, cats)
})

test('보정 적용 시 총합 보존', () => {
  const cats = [mkCat('a', 6), mkCat('b', 4)] // total 10
  const final = { a: 0.2, b: 0.8 }
  const out = applyCalibration(cats, final)
  const total = out.reduce((s, c) => s + c.score, 0)
  approx(total, 10)
})

test('보정 후 재정렬 (b 가 a 를 추월)', () => {
  const cats = [mkCat('a', 6), mkCat('b', 4)]
  const final = { a: 0.2, b: 0.8 }
  const out = applyCalibration(cats, final)
  assert.strictEqual(out[0]!.id, 'b')
  approx(out[0]!.score, 8)
  approx(out[1]!.score, 2)
})

test('부분집합 분포 정규화 (표시 카테고리 외 무시)', () => {
  // 표시 a,b 만, final 에는 c 도 존재 → a,b 의 share 합으로 정규화
  const cats = [mkCat('a', 6), mkCat('b', 4)] // total 10
  const final = { a: 0.25, b: 0.25, c: 0.5 }
  const out = applyCalibration(cats, final)
  // a,b share 동일 → 각 5
  const byId = new Map(out.map((c) => [c.id, c.score]))
  approx(byId.get('a')!, 5)
  approx(byId.get('b')!, 5)
  approx(out.reduce((s, c) => s + c.score, 0), 10)
})

// === applyCalibrationOverUniverse ==========================================
// CRITICAL-1 회귀 방지: 보정을 top-N 절단 전 "전체 카테고리 우주"에 적용해야
// auto 하위/0 카테고리도 보정으로 순위에 진입할 수 있다.
section('applyCalibrationOverUniverse')

function mkUniverseCat(id: string): UsageCategory {
  return { id, title: id.toUpperCase(), subtitle: '', emoji: '', color: '#000' }
}

// 9개 카테고리 우주 (자동 분류 전체 카테고리 수와 동일한 규모)
const UNIVERSE: UsageCategory[] = [
  'feature',
  'debug',
  'refactor',
  'review',
  'writing',
  'design',
  'devops',
  'data',
  'test',
].map(mkUniverseCat)

test('보정 null → auto 그대로 반환 (regression 0)', () => {
  const auto = [mkCat('feature', 10), mkCat('debug', 5)]
  const out = applyCalibrationOverUniverse(auto, null, UNIVERSE)
  assert.strictEqual(out, auto)
})

test('auto 하위/미포함 카테고리가 보정으로 top 진입 (CRITICAL-1)', () => {
  // auto 에는 feature/debug 만 (큰 점수), refactor 는 auto 목록에 없음(절단됨).
  // 그러나 finalDistribution 은 refactor 에 가장 큰 share → refactor 가 1위여야 한다.
  const auto = [mkCat('feature', 100), mkCat('debug', 80)]
  const final: Record<string, number> = {
    feature: 0.1,
    debug: 0.1,
    refactor: 0.6, // auto 목록엔 없지만 universe 패딩으로 진입 가능해야
    review: 0.05,
    writing: 0.05,
    design: 0.03,
    devops: 0.02,
    data: 0.03,
    test: 0.02,
  }
  const out = applyCalibrationOverUniverse(auto, final, UNIVERSE)
  assert.strictEqual(out[0]!.id, 'refactor', 'refactor 가 보정으로 1위에 진입해야 함')
})

test('패딩된 auto=0 카테고리 포함 — 결과 길이 == universe 길이', () => {
  const auto = [mkCat('feature', 100), mkCat('debug', 80)]
  const final: Record<string, number> = {}
  for (const cat of UNIVERSE) final[cat.id] = 1 / UNIVERSE.length // 균등
  const out = applyCalibrationOverUniverse(auto, final, UNIVERSE)
  assert.strictEqual(out.length, UNIVERSE.length)
  const ids = new Set(out.map((c) => c.id))
  for (const cat of UNIVERSE) {
    assert.ok(ids.has(cat.id), `universe 카테고리 '${cat.id}' 누락`)
  }
})

// WARNING 회귀 방지: auto 신호가 전혀 없는(undecided) 사용자는 analyzeUsageTopCategories
// 가 [] 를 반환 → universe 0-패딩 → applyCalibration 의 originalTotal<=0 early-return 으로
// 전 카테고리 score 0(유령 분포)이 되어 Dashboard/Wrapped 가 0% 막대를 그렸다.
// 이제 auto 가 비면 검사 응답 분포(finalDistribution)를 표시 점수로 승격해야 한다.
test('auto 빈 배열 + finalDistribution → 검사 응답 분포로 승격', () => {
  const final: Record<string, number> = {
    feature: 0.4,
    debug: 0.25,
    refactor: 0.2,
    review: 0.1,
    writing: 0.05,
    design: 0,
    devops: 0,
    data: 0,
    test: 0,
  }
  const out = applyCalibrationOverUniverse([], final, UNIVERSE)

  // (a) 빈 배열이 아니어야 한다 (유령 분포 회귀 방지)
  assert.ok(out.length > 0, 'auto 가 비어도 검사 응답 기반 분포가 표시되어야 함')

  // (b) 모든 score>0 (share 0 카테고리는 제외)
  for (const c of out) {
    assert.ok(c.score > 0, `'${c.id}' score 가 0 (유령 분포)`)
  }
  assert.strictEqual(out.length, 5, 'share>0 인 5개만 남아야 함')

  // (c) finalDistribution share 내림차순 정렬 — 1위가 share 최대 id 와 일치
  assert.strictEqual(out[0]!.id, 'feature', 'share 최대(feature)가 1위여야 함')
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i - 1]!.score >= out[i]!.score, 'share 내림차순 정렬이어야 함')
  }

  // (d) score 값이 finalDistribution share 와 정확히 일치
  for (const c of out) {
    approx(c.score, final[c.id]!)
  }
})

test('auto 전부 0 패딩만 들어온 경우도 동일하게 승격', () => {
  // auto 목록에 카테고리는 있으나 모두 score 0 (autoTotal<=0 동일 경로)
  const auto = [mkCat('feature', 0), mkCat('debug', 0)]
  const final: Record<string, number> = {
    feature: 0.3,
    debug: 0.5,
    refactor: 0.2,
    review: 0,
    writing: 0,
    design: 0,
    devops: 0,
    data: 0,
    test: 0,
  }
  const out = applyCalibrationOverUniverse(auto, final, UNIVERSE)
  assert.strictEqual(out.length, 3, 'share>0 인 3개만 남아야 함')
  assert.strictEqual(out[0]!.id, 'debug', 'share 최대(debug)가 1위여야 함')
  for (const c of out) {
    assert.ok(c.score > 0)
    approx(c.score, final[c.id]!)
  }
})

// === 진술 사전 동기화 가드 ==================================================
// src/data/personaStatements.ts(프론트 번들용 복제본)가 원본
// scripts/eval-sharpness-statements.json 과 어긋나면 실패시킨다.
// 두 소스 중 한쪽만 수정되는 조용한 드리프트를 CI 단계에서 차단.
section('진술 사전 동기화 (복제본 ↔ 원본 JSON)')

test('personaStatements.ts == scripts/eval-sharpness-statements.json (verbatim)', () => {
  const jsonPath = fileURLToPath(new URL('../scripts/eval-sharpness-statements.json', import.meta.url))
  const origin = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
    version: number
    language: string
    statements: Record<string, string[]>
    lenses?: Record<string, Record<string, string[]>>
  }
  assert.strictEqual(PERSONA_STATEMENTS.version, origin.version, 'version 불일치')
  assert.strictEqual(PERSONA_STATEMENTS.version, 2, 'version 기대값 2')
  assert.strictEqual(PERSONA_STATEMENTS.language, origin.language, 'language 불일치')
  assert.deepStrictEqual(
    Object.keys(PERSONA_STATEMENTS.statements).sort(),
    Object.keys(origin.statements).sort(),
    '카테고리 키 집합 불일치',
  )
  for (const cat of Object.keys(origin.statements)) {
    assert.deepStrictEqual(
      PERSONA_STATEMENTS.statements[cat],
      origin.statements[cat],
      `'${cat}' 진술 배열이 원본과 다름`,
    )
  }

  // lenses 한쪽만 있으면 실패.
  assert.strictEqual(
    Boolean(PERSONA_STATEMENTS.lenses),
    Boolean(origin.lenses),
    'lenses 존재 여부 불일치 (한쪽만 있음)',
  )
  if (origin.lenses && PERSONA_STATEMENTS.lenses) {
    assert.deepStrictEqual(
      Object.keys(PERSONA_STATEMENTS.lenses).sort(),
      Object.keys(origin.lenses).sort(),
      '렌즈 키 집합 불일치',
    )
    for (const lensKey of Object.keys(origin.lenses)) {
      const tsLens = PERSONA_STATEMENTS.lenses[lensKey]!
      const jsonLens = origin.lenses[lensKey]!
      assert.deepStrictEqual(
        Object.keys(tsLens).sort(),
        Object.keys(jsonLens).sort(),
        `렌즈 '${lensKey}' 카테고리 키 집합 불일치`,
      )
      for (const cat of Object.keys(jsonLens)) {
        assert.deepStrictEqual(
          tsLens[cat],
          jsonLens[cat],
          `렌즈 '${lensKey}' 카테고리 '${cat}' 진술 배열이 원본과 다름`,
        )
      }
    }
  }
})

// === resolveStatements (직군 렌즈 폴백) ====================================
section('resolveStatements (직군 렌즈)')

test('general → statements 와 동일 참조', () => {
  const out = resolveStatements(PERSONA_STATEMENTS, 'general')
  assert.strictEqual(out, PERSONA_STATEMENTS.statements)
})

test('developer → 렌즈 카테고리는 렌즈값, 누락은 general 폴백', () => {
  const file = {
    version: 2,
    language: 'ko',
    statements: { feature: ['g1', 'g2'], debug: ['g3', 'g4'] },
    lenses: { developer: { feature: ['d1', 'd2'] } },
  }
  const out = resolveStatements(file, 'developer')
  assert.deepStrictEqual(out.feature, ['d1', 'd2'], 'developer 렌즈 카테고리는 렌즈값')
  assert.deepStrictEqual(out.debug, ['g3', 'g4'], '렌즈에 없는 카테고리는 general 폴백')
})

test('실제 사전 developer 렌즈 — 모든 9 카테고리 채워짐', () => {
  const out = resolveStatements(PERSONA_STATEMENTS, 'developer')
  for (const cat of Object.keys(PERSONA_STATEMENTS.statements)) {
    assert.ok(Array.isArray(out[cat]) && out[cat]!.length >= 2, `'${cat}' 채워져야 함`)
  }
})

test('렌즈 없는(미지의) job → general 폴백', () => {
  const file = {
    version: 2,
    language: 'ko',
    statements: { feature: ['g1', 'g2'] },
  }
  const out = resolveStatements(file, 'developer')
  assert.strictEqual(out, file.statements)
})

// === 저장 마이그레이션 (personaQuizStorage) ================================
section('저장 v3 스키마 + v2/v1 → v3 마이그레이션')

const STORAGE_KEY_V3 = 'memradar.personaQuiz.v3'
const LEGACY_KEY_V2 = 'memradar.personaQuiz.v2'
const LEGACY_KEY_V1 = 'memradar.personaQuiz.v1'

function sampleCalibration(): Calibration {
  return {
    feature: { pickRate: 0.5, sharpness: 0, weight: 0, finalScore: 0.4 },
    debug: { pickRate: 1, sharpness: 1, weight: 0.6, finalScore: 0.6 },
  }
}

function sampleFinalDistribution(): Record<CategoryId, number> {
  return { feature: 0.4, debug: 0.6 }
}

function sampleV2Payload() {
  return {
    version: 2,
    job: 'designer',
    ts: '2026-06-04T00:00:00.000Z',
    seed: 12345,
    answers: [{ leftCategory: 'feature', rightCategory: 'debug', chosen: 'left' }],
    calibration: sampleCalibration(),
    finalDistribution: sampleFinalDistribution(),
  }
}

function sampleV3State(): QuizState {
  const runs: QuizRun[] = [
    {
      seed: 111,
      ts: '2026-06-04T00:00:00.000Z',
      answers: [{ leftCategory: 'feature', rightCategory: 'debug', chosen: 'left' }],
    },
    {
      seed: 222,
      ts: '2026-07-01T00:00:00.000Z',
      answers: [{ leftCategory: 'debug', rightCategory: 'feature', chosen: 'skip' }],
    },
  ]
  return {
    version: PERSONA_QUIZ_VERSION,
    job: 'designer',
    ts: '2026-07-01T00:00:00.000Z',
    runs,
    seenStatements: ['진술 A', '진술 B'],
    calibration: sampleCalibration(),
    finalDistribution: sampleFinalDistribution(),
  }
}

test('v3 라운드트립 (runs/seenStatements 포함)', () => {
  memStorage.clear()
  const state = sampleV3State()
  savePersonaQuiz(state)
  const loaded = loadPersonaQuiz()
  assert.ok(loaded, 'v3 로드 성공')
  assert.deepStrictEqual(loaded, state)
})

test('v2 페이로드 → v3 마이그레이션 (runs[0] 래핑, seenStatements=[])', () => {
  memStorage.clear()
  const v2 = sampleV2Payload()
  memStorage.setItem(LEGACY_KEY_V2, JSON.stringify(v2))
  const loaded = loadPersonaQuiz()
  assert.ok(loaded, 'v2 → 마이그레이션 로드 성공')
  assert.strictEqual(loaded!.version, PERSONA_QUIZ_VERSION, 'version 3 으로 승격')
  assert.strictEqual(loaded!.job, 'designer', 'job 보존')
  assert.strictEqual(loaded!.ts, v2.ts, 'ts 보존')
  assert.deepStrictEqual(
    loaded!.runs,
    [{ seed: v2.seed, ts: v2.ts, answers: v2.answers }],
    '단일 run 이 runs[0] 으로 래핑되어야 함',
  )
  assert.deepStrictEqual(loaded!.seenStatements, [], 'seenStatements 는 빈 배열로 시작')
  assert.deepStrictEqual(loaded!.calibration, v2.calibration, 'calibration 보존')
  assert.deepStrictEqual(loaded!.finalDistribution, v2.finalDistribution, 'finalDistribution 보존')
})

test('v2 마이그레이션 후 write-through 로 v3 키 생성·v2 키 제거', () => {
  memStorage.clear()
  memStorage.setItem(LEGACY_KEY_V2, JSON.stringify(sampleV2Payload()))
  loadPersonaQuiz()
  assert.ok(memStorage.has(STORAGE_KEY_V3), 'v3 키가 write-through 로 생성되어야 함')
  assert.ok(!memStorage.has(LEGACY_KEY_V2), 'LEGACY v2 키는 제거되어야 함')
  // write-through 이후 재로드도 동일 상태 (v3 경로).
  const reloaded = loadPersonaQuiz()
  assert.ok(reloaded)
  assert.strictEqual(reloaded!.version, PERSONA_QUIZ_VERSION)
  assert.strictEqual(reloaded!.runs.length, 1)
})

test('v1 → v3 체인 (job=general 주입 + runs[0] 래핑 + v1 키 제거)', () => {
  memStorage.clear()
  const v1 = {
    version: 1,
    ts: '2026-05-01T00:00:00.000Z',
    seed: 777,
    answers: [{ leftCategory: 'feature', rightCategory: 'debug', chosen: 'right' }],
    calibration: sampleCalibration(),
    finalDistribution: sampleFinalDistribution(),
  }
  memStorage.setItem(LEGACY_KEY_V1, JSON.stringify(v1))
  const loaded = loadPersonaQuiz()
  assert.ok(loaded, 'v1 → 마이그레이션 로드 성공')
  assert.strictEqual(loaded!.version, PERSONA_QUIZ_VERSION, 'version 3 으로 승격')
  assert.strictEqual(loaded!.job, 'general', 'job=general 주입')
  assert.deepStrictEqual(
    loaded!.runs,
    [{ seed: v1.seed, ts: v1.ts, answers: v1.answers }],
    'v1 단일 run 이 runs[0] 으로 래핑되어야 함',
  )
  assert.deepStrictEqual(loaded!.seenStatements, [])
  assert.deepStrictEqual(loaded!.finalDistribution, v1.finalDistribution, 'finalDistribution 보존')
  assert.ok(memStorage.has(STORAGE_KEY_V3), 'v3 키 write-through 생성')
  assert.ok(!memStorage.has(LEGACY_KEY_V1), 'LEGACY v1 키 제거')
})

test('v3·v2·v1 모두 부재 → null', () => {
  memStorage.clear()
  assert.strictEqual(loadPersonaQuiz(), null)
})

test('손상/미지 페이로드 → null (방어 파서)', () => {
  const base = sampleV3State()

  // JSON 깨짐
  memStorage.clear()
  memStorage.setItem(STORAGE_KEY_V3, '{not json')
  assert.strictEqual(loadPersonaQuiz(), null, 'JSON 깨짐은 null')

  // 미지 버전
  memStorage.clear()
  memStorage.setItem(STORAGE_KEY_V3, JSON.stringify({ ...base, version: 99 }))
  assert.strictEqual(loadPersonaQuiz(), null, '미지 버전은 null')

  // runs 가 배열이 아님
  memStorage.clear()
  memStorage.setItem(STORAGE_KEY_V3, JSON.stringify({ ...base, runs: 'nope' }))
  assert.strictEqual(loadPersonaQuiz(), null, 'runs 비배열은 null')

  // runs 원소 무효 (seed 가 문자열)
  memStorage.clear()
  memStorage.setItem(
    STORAGE_KEY_V3,
    JSON.stringify({ ...base, runs: [{ seed: 'x', ts: 't', answers: [] }] }),
  )
  assert.strictEqual(loadPersonaQuiz(), null, 'run.seed 문자열은 null')

  // runs 원소 무효 (answers 원소 무효)
  memStorage.clear()
  memStorage.setItem(
    STORAGE_KEY_V3,
    JSON.stringify({ ...base, runs: [{ seed: 1, ts: 't', answers: [{ chosen: 'nope' }] }] }),
  )
  assert.strictEqual(loadPersonaQuiz(), null, '무효 answer 는 null')

  // seenStatements 원소 무효 (숫자 혼입)
  memStorage.clear()
  memStorage.setItem(STORAGE_KEY_V3, JSON.stringify({ ...base, seenStatements: ['ok', 5] }))
  assert.strictEqual(loadPersonaQuiz(), null, 'seenStatements 비문자열 혼입은 null')

  // job 무효
  memStorage.clear()
  memStorage.setItem(STORAGE_KEY_V3, JSON.stringify({ ...base, job: 'frontend' }))
  assert.strictEqual(loadPersonaQuiz(), null, '무효 job 은 null')
})

test('runs 빈 배열 → null (완료 run 없는 상태는 의미상 무효)', () => {
  // 리뷰 지적: runs:[] 가 유효로 통과하면 refine intro 가 "지금까지 0회 · 0문항"으로 렌더된다.
  memStorage.clear()
  memStorage.setItem(STORAGE_KEY_V3, JSON.stringify({ ...sampleV3State(), runs: [] }))
  assert.strictEqual(loadPersonaQuiz(), null, 'runs 빈 배열은 null')
})

test('v3 무효 + v2 유효 → v2 마이그레이션 폴백', () => {
  memStorage.clear()
  memStorage.setItem(STORAGE_KEY_V3, JSON.stringify({ version: 3, job: 'bogus' }))
  memStorage.setItem(LEGACY_KEY_V2, JSON.stringify(sampleV2Payload()))
  const loaded = loadPersonaQuiz()
  assert.ok(loaded, 'v3 무효면 v2 폴백')
  assert.strictEqual(loaded!.version, PERSONA_QUIZ_VERSION)
  assert.strictEqual(loaded!.job, 'designer')
  assert.strictEqual(loaded!.runs.length, 1)
})

test('v3 무효 + v2 무효 + v1 유효 → v1 마이그레이션 폴백', () => {
  memStorage.clear()
  memStorage.setItem(STORAGE_KEY_V3, JSON.stringify({ version: 3 }))
  memStorage.setItem(LEGACY_KEY_V2, JSON.stringify({ version: 2, job: 'bogus' }))
  const v1 = {
    version: 1,
    ts: '2026-05-01T00:00:00.000Z',
    seed: 5,
    answers: [],
    calibration: sampleCalibration(),
    finalDistribution: sampleFinalDistribution(),
  }
  memStorage.setItem(LEGACY_KEY_V1, JSON.stringify(v1))
  const loaded = loadPersonaQuiz()
  assert.ok(loaded, 'v3/v2 무효면 v1 폴백')
  assert.strictEqual(loaded!.job, 'general')
  assert.strictEqual(loaded!.runs.length, 1)
})

test('clearPersonaQuiz 는 v3·v2·v1 키 전부 제거', () => {
  memStorage.clear()
  memStorage.setItem(STORAGE_KEY_V3, JSON.stringify(sampleV3State()))
  memStorage.setItem(LEGACY_KEY_V2, JSON.stringify({ version: 2, job: 'general' }))
  memStorage.setItem(LEGACY_KEY_V1, JSON.stringify({ version: 1 }))
  clearPersonaQuiz()
  assert.ok(!memStorage.has(STORAGE_KEY_V3), 'v3 제거')
  assert.ok(!memStorage.has(LEGACY_KEY_V2), 'v2 제거')
  assert.ok(!memStorage.has(LEGACY_KEY_V1), 'v1 제거')
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
