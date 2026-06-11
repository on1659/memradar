/**
 * 페르소나 진단 — 순수 로직 (mulberry32 / 균등 페어 생성 / 보정 계산).
 *
 * scripts/eval-sharpness.mts 의 일부 순수 함수(mulberry32 등)를 복제했다.
 * 그 파일은 node:fs 등 Node 전용 top-level import 때문에 프론트 번들에서
 * import 할 수 없으므로, 파일/readline IO 함수는 복제하지 않고 순수 로직만 가져온다.
 *
 * 무변경 의존: src/lib/usageProfile.ts (USAGE_CATEGORIES, analyzeUsageTopCategories).
 */
import type { UsageCategory, UsageCategoryScore } from './usageProfile'

export type CategoryId = string
export type Side = 'left' | 'right' | 'skip'

/** 사용자 본인 직군(진술 어휘 렌즈). 측정 카테고리(9개)와 무관 — 표시 어휘만 바꾼다. */
export type JobLens = 'developer' | 'pm' | 'designer' | 'data' | 'general'

export interface Pair {
  index: number
  leftCategory: CategoryId
  rightCategory: CategoryId
  leftStatement: string
  rightStatement: string
}

export interface Answer {
  leftCategory: CategoryId
  rightCategory: CategoryId
  chosen: Side
}

export interface CategoryCalibration {
  pickRate: number
  sharpness: number
  weight: number
  /** 재정규화 후 최종 점유율 (합 = 1, auto 와 같은 단위). */
  finalScore: number
}

export type Calibration = Record<CategoryId, CategoryCalibration>

export interface CalibrationResult {
  calibration: Calibration
  /** 표시용 최종 분포 (합 = 1). */
  finalDistribution: Record<CategoryId, number>
}

export interface QuizState {
  version: number
  job: JobLens
  ts: string
  seed: number
  answers: Answer[]
  calibration: Calibration
  finalDistribution: Record<CategoryId, number>
}

export const PERSONA_QUIZ_VERSION = 2

/** 보정 가중치 상한 (설계 공식). */
export const MAX_CALIBRATION_WEIGHT = 0.6

// --- 시드 PRNG (mulberry32, eval-sharpness.mts 와 동일) --------------------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- 균등 페어 생성 -------------------------------------------------------
// 각 카테고리가 정확히 2회 등장하도록 풀(2*N 슬롯)을 셔플한 뒤,
// 인접 2개씩 묶어 페어를 만든다. 같은 카테고리가 한 페어에 들어가면
// 풀 뒤쪽의 서로 다른 슬롯과 교환해 left≠right 를 보장한다.
function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = arr[i]!
    arr[i] = arr[j]!
    arr[j] = tmp
  }
}

/**
 * 9 카테고리 각각 정확히 2회 등장하는 균등 페어 9쌍을 결정적으로 생성한다.
 * 같은 카테고리가 한 페어에 들어가지 않도록(left≠right) 보장한다.
 *
 * @param categoryIds 카테고리 id 목록 (N개)
 * @param statements  카테고리별 진술 풀 (각 ≥ 1개)
 * @param seed        결정적 시드
 * @returns N개 페어 (각 카테고리 정확히 2회 등장)
 */
export function generateBalancedPairs(
  categoryIds: ReadonlyArray<CategoryId>,
  statements: Readonly<Record<CategoryId, string[]>>,
  seed: number,
): Pair[] {
  const n = categoryIds.length
  if (n < 2) {
    throw new Error('균등 페어 생성에는 카테고리가 2개 이상 필요')
  }

  const rand = mulberry32(seed)

  // 각 카테고리 2개씩 담은 풀 (총 2N 슬롯) → 셔플
  const pool: CategoryId[] = []
  for (const id of categoryIds) {
    pool.push(id, id)
  }
  shuffleInPlace(pool, rand)

  // 인접 2개씩 묶기. (a,b) 가 같은 카테고리면 b 를 풀 뒤쪽의 서로 다른
  // 카테고리 슬롯과 교환. 각 카테고리는 정확히 2개뿐이라, 짝수 슬롯에
  // 항상 교환 가능한 상대가 존재한다(종료 보장).
  for (let i = 0; i < pool.length; i += 2) {
    if (pool[i] === pool[i + 1]) {
      let swapped = false
      for (let j = i + 2; j < pool.length; j++) {
        // j 슬롯이 현재 페어의 두 슬롯과 모두 다르고,
        // 교환 후 j 의 페어 파트너와도 충돌하지 않으면 교환.
        const jPartnerIdx = j % 2 === 0 ? j + 1 : j - 1
        const jPartner = jPartnerIdx < pool.length ? pool[jPartnerIdx] : undefined
        if (pool[j] !== pool[i] && jPartner !== pool[i + 1]) {
          const tmp = pool[i + 1]!
          pool[i + 1] = pool[j]!
          pool[j] = tmp
          swapped = true
          break
        }
      }
      if (!swapped) {
        // N>=2 이고 각 카테고리 2개뿐인 균등 풀에서는 도달 불가하지만,
        // 방어적으로: 앞쪽 슬롯과 교환 재시도.
        for (let j = 0; j < i; j++) {
          const jPartnerIdx = j % 2 === 0 ? j + 1 : j - 1
          const jPartner = pool[jPartnerIdx]
          if (pool[j] !== pool[i] && jPartner !== pool[i + 1]) {
            const tmp = pool[i + 1]!
            pool[i + 1] = pool[j]!
            pool[j] = tmp
            swapped = true
            break
          }
        }
        if (!swapped) {
          throw new Error('균등 페어 생성 실패: left≠right 보장 불가')
        }
      }
    }
  }

  const pairs: Pair[] = []
  for (let i = 0; i < pool.length; i += 2) {
    const leftCat = pool[i]!
    const rightCat = pool[i + 1]!
    const leftPool = statements[leftCat]
    const rightPool = statements[rightCat]
    if (!leftPool || leftPool.length === 0) {
      throw new Error(`카테고리 '${leftCat}' 진술 없음`)
    }
    if (!rightPool || rightPool.length === 0) {
      throw new Error(`카테고리 '${rightCat}' 진술 없음`)
    }
    const leftStmt = leftPool[Math.floor(rand() * leftPool.length)]!
    const rightStmt = rightPool[Math.floor(rand() * rightPool.length)]!
    pairs.push({
      index: i / 2 + 1,
      leftCategory: leftCat,
      rightCategory: rightCat,
      leftStatement: leftStmt,
      rightStatement: rightStmt,
    })
  }
  return pairs
}

// --- 자동 점수 top-share 정규화 -------------------------------------------
/**
 * raw 가중합 점수를 top-share 정규화한다: auto[X] = score[X] / Σscore.
 * Σ=0 가드: 모든 카테고리 균등(1/N) 반환.
 */
export function normalizeTopShare(
  scores: Readonly<Record<CategoryId, number>>,
  categoryIds: ReadonlyArray<CategoryId>,
): Record<CategoryId, number> {
  let sum = 0
  for (const id of categoryIds) sum += scores[id] ?? 0
  const out: Record<CategoryId, number> = {}
  if (sum <= 0) {
    const even = categoryIds.length > 0 ? 1 / categoryIds.length : 0
    for (const id of categoryIds) out[id] = even
    return out
  }
  for (const id of categoryIds) out[id] = (scores[id] ?? 0) / sum
  return out
}

// --- 보정 계산 ------------------------------------------------------------
/**
 * 자동 분류(raw 점수) + 자기응답 검사 → 보정 분포.
 *
 * 공식 (설계 문서):
 *   auto[X]      = score[X] / Σscore            (top-share)
 *   pickRate[X]  = picks[X] / appearances[X]    (skip 은 등장엔 포함, pick 아님)
 *   sharpness[X] = |pickRate - 0.5| * 2
 *   weight[X]    = min(sharpness, 0.6)
 *   final[X]     = appearances>=2
 *                    ? auto*(1-weight) + pickRate*weight
 *                    : auto
 *
 * final 은 합=1 로 재정규화해 반환(auto 와 같은 단위, 표시 일관성).
 * calibration[X].finalScore 에는 **재정규화 후** 값을 담는다(일관성).
 *
 * 주의: skip 처리 — eval-sharpness 의 computeStats 는 분모에서 skip 을 제외하지만,
 * 본 보정은 설계 문서 정의("appearances 는 skip 포함, pick 은 아님")를 따라
 * pickRate 분모를 appearances(2회 등장 전체)로 둔다. 모든 카테고리가 정확히
 * 2회 등장하므로 appearances 는 항상 2.
 */
export function computeCalibration(
  answers: ReadonlyArray<Answer>,
  rawScores: Readonly<Record<CategoryId, number>>,
  categoryIds: ReadonlyArray<CategoryId>,
): CalibrationResult {
  const auto = normalizeTopShare(rawScores, categoryIds)

  // 등장/선택 집계
  const appearances: Record<CategoryId, number> = {}
  const picks: Record<CategoryId, number> = {}
  for (const id of categoryIds) {
    appearances[id] = 0
    picks[id] = 0
  }
  for (const a of answers) {
    if (appearances[a.leftCategory] !== undefined) appearances[a.leftCategory]++
    if (appearances[a.rightCategory] !== undefined) appearances[a.rightCategory]++
    if (a.chosen === 'left' && picks[a.leftCategory] !== undefined) picks[a.leftCategory]++
    else if (a.chosen === 'right' && picks[a.rightCategory] !== undefined) picks[a.rightCategory]++
    // skip 은 등장(appearances)에 이미 포함, pick 은 아님.
  }

  // final (재정규화 전)
  const rawFinal: Record<CategoryId, number> = {}
  const pickRateMap: Record<CategoryId, number> = {}
  const sharpnessMap: Record<CategoryId, number> = {}
  const weightMap: Record<CategoryId, number> = {}
  for (const id of categoryIds) {
    const app = appearances[id]
    if (app >= 2) {
      const pickRate = picks[id] / app
      const sharpness = Math.abs(pickRate - 0.5) * 2
      const weight = Math.min(sharpness, MAX_CALIBRATION_WEIGHT)
      pickRateMap[id] = pickRate
      sharpnessMap[id] = sharpness
      weightMap[id] = weight
      rawFinal[id] = auto[id]! * (1 - weight) + pickRate * weight
    } else {
      // appearances<2: 보정 미적용. final=auto, calibration 지표는 0 으로 보고
      // (가짜 weight 가 저장되지 않도록).
      pickRateMap[id] = 0
      sharpnessMap[id] = 0
      weightMap[id] = 0
      rawFinal[id] = auto[id]!
    }
  }

  // final 재정규화 (합 = 1)
  let finalSum = 0
  for (const id of categoryIds) finalSum += rawFinal[id]!
  const finalDistribution: Record<CategoryId, number> = {}
  for (const id of categoryIds) {
    finalDistribution[id] = finalSum > 0 ? rawFinal[id]! / finalSum : auto[id]!
  }

  const calibration: Calibration = {}
  for (const id of categoryIds) {
    calibration[id] = {
      pickRate: pickRateMap[id]!,
      sharpness: sharpnessMap[id]!,
      weight: weightMap[id]!,
      finalScore: finalDistribution[id]!, // 재정규화 후
    }
  }

  return { calibration, finalDistribution }
}

// --- 공용 보정 적용 유틸 (Dashboard + Wrapped 공통) -----------------------
/**
 * 자동 분류 결과(top 카테고리 점수 목록) + 저장된 보정 → 표시용 카테고리 목록.
 *
 * 보정이 없으면(quiz null) 자동 분류 그대로 반환(regression 0).
 * 보정이 있으면 각 카테고리 score 를 finalDistribution 에 비례해 재배분하되,
 * 합계(원 점수 총합)는 보존해 기존 시각화(막대/비율) 단위와 호환되게 한다.
 *
 * 정렬은 보정 후 점수 기준으로 다시 매긴다.
 */
export function applyCalibration(
  categories: UsageCategoryScore[],
  finalDistribution: Readonly<Record<CategoryId, number>> | null | undefined,
): UsageCategoryScore[] {
  if (!finalDistribution || categories.length === 0) return categories

  const originalTotal = categories.reduce((sum, c) => sum + c.score, 0)
  if (originalTotal <= 0) return categories

  // 현재 표시 중인 카테고리들의 보정 분포 합(부분집합일 수 있음) 으로 정규화해
  // 총합(originalTotal)을 보존한다.
  let shareSum = 0
  for (const c of categories) shareSum += finalDistribution[c.id] ?? 0
  if (shareSum <= 0) return categories

  return categories
    .map((c) => {
      const share = (finalDistribution[c.id] ?? 0) / shareSum
      return { ...c, score: share * originalTotal }
    })
    .sort((a, b) => b.score - a.score)
}

/**
 * 보정을 **전체 카테고리 우주(universe)** 에 적용한 뒤 표시용 목록을 만든다.
 *
 * analyzeUsageTopCategories 는 auto 점수>0 만 남기고 top-N 으로 잘라 돌려주므로,
 * 그 결과에 바로 applyCalibration 을 걸면 보정으로 끌어올려진(auto 하위/0) 카테고리가
 * 순위에 진입할 수 없다. 이 함수는 잘린 auto 목록을 universe(전체 카테고리)로 0-패딩한 뒤
 * 보정을 적용해, finalDistribution 의 전체 분포가 순위에 반영되게 한다.
 *
 * 보정이 없으면 입력(auto)을 그대로 반환 → 호출부가 slice 만 하면 됨 (regression 0).
 * 정렬·점수 단위 보존은 applyCalibration 의 기존 계약을 그대로 따른다.
 */
export function applyCalibrationOverUniverse(
  auto: UsageCategoryScore[],
  finalDistribution: Readonly<Record<CategoryId, number>> | null | undefined,
  universe: ReadonlyArray<UsageCategory>,
): UsageCategoryScore[] {
  if (!finalDistribution) return auto
  const byId = new Map(auto.map((c) => [c.id, c]))
  const full: UsageCategoryScore[] = universe.map(
    (cat) => byId.get(cat.id) ?? { ...cat, score: 0, sessionCount: 0 },
  )

  // auto 신호가 전혀 없는 경우(undecided 등): applyCalibration 은 originalTotal<=0 으로
  // 전 카테고리 score 0(유령 분포)을 돌려준다. 이때는 검사 응답 분포(finalDistribution,
  // 0~1 합1)를 그대로 표시 점수로 승격해 "검사 응답만으로 구성한 페르소나"를 보여준다.
  const autoTotal = full.reduce((sum, c) => sum + c.score, 0)
  if (autoTotal <= 0) {
    return full
      .map((c) => ({ ...c, score: finalDistribution[c.id] ?? 0 }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
  }

  return applyCalibration(full, finalDistribution)
}
