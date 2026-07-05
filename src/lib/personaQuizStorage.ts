/**
 * 페르소나 진단 결과 localStorage 영속 (외부 전송 0).
 *
 * 완료된 검사만 저장한다(사양: 미완료 이탈 시 다음 방문 처음부터).
 * JSON.parse 실패 / 스키마 version 불일치 시 방어적으로 null 반환.
 *
 * v2: `job`(직군 렌즈) 필드 추가, STORAGE_KEY bump.
 * v3: 정밀 진단 — 단일 run(seed/answers) 을 `runs: QuizRun[]` 로 누적,
 *     `seenStatements`(출제된 진술 텍스트) 추가, STORAGE_KEY bump.
 * 구버전 페이로드는 read-through 마이그레이션 (v2 → runs[0] 래핑,
 * v1 → job='general' 주입 후 동일 래핑) + write-through 저장 + 구키 제거.
 */
import {
  PERSONA_QUIZ_VERSION,
  type QuizState,
  type QuizRun,
  type Answer,
  type Calibration,
  type JobLens,
} from './personaQuiz'

const STORAGE_KEY = 'memradar.personaQuiz.v3'
const LEGACY_KEY_V2 = 'memradar.personaQuiz.v2'
const LEGACY_KEY_V1 = 'memradar.personaQuiz.v1'

const VALID_JOBS = new Set<JobLens>(['developer', 'pm', 'designer', 'data', 'general'])

function isJob(v: unknown): v is JobLens {
  return typeof v === 'string' && VALID_JOBS.has(v as JobLens)
}

function isAnswer(v: unknown): v is Answer {
  if (typeof v !== 'object' || v === null) return false
  const a = v as Record<string, unknown>
  return (
    typeof a.leftCategory === 'string' &&
    typeof a.rightCategory === 'string' &&
    (a.chosen === 'left' || a.chosen === 'right' || a.chosen === 'skip')
  )
}

function isQuizRun(v: unknown): v is QuizRun {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r.seed === 'number' &&
    typeof r.ts === 'string' &&
    Array.isArray(r.answers) &&
    r.answers.every(isAnswer)
  )
}

function isCalibration(v: unknown): v is Calibration {
  if (typeof v !== 'object' || v === null) return false
  for (const entry of Object.values(v as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) return false
    const e = entry as Record<string, unknown>
    if (
      typeof e.pickRate !== 'number' ||
      typeof e.sharpness !== 'number' ||
      typeof e.weight !== 'number' ||
      typeof e.finalScore !== 'number'
    ) {
      return false
    }
  }
  return true
}

function isFinalDistribution(v: unknown): v is Record<string, number> {
  if (typeof v !== 'object' || v === null) return false
  return Object.values(v as Record<string, unknown>).every((n) => typeof n === 'number')
}

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

/** v1/v2 페이로드에 공통인 단일 run 코어 (마이그레이션 시 runs[0] 으로 래핑). */
interface LegacyCore {
  ts: string
  seed: number
  answers: Answer[]
  calibration: Calibration
  finalDistribution: Record<string, number>
}

/** raw 문자열을 v1 페이로드로 검증한다(job 없음이 정상). 통과 시 코어 필드 반환, 실패 시 null. */
function parseV1(raw: string): LegacyCore | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const p = parsed as Record<string, unknown>
  if (p.version !== 1) return null
  if (typeof p.ts !== 'string') return null
  if (typeof p.seed !== 'number') return null
  if (!Array.isArray(p.answers) || !p.answers.every(isAnswer)) return null
  if (!isCalibration(p.calibration)) return null
  if (!isFinalDistribution(p.finalDistribution)) return null
  return {
    ts: p.ts,
    seed: p.seed,
    answers: p.answers as Answer[],
    calibration: p.calibration,
    finalDistribution: p.finalDistribution,
  }
}

/** raw 문자열을 v2 페이로드로 검증한다(job 유효 필수). 통과 시 코어+job 반환, 실패 시 null. */
function parseV2(raw: string): (LegacyCore & { job: JobLens }) | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const p = parsed as Record<string, unknown>
  if (p.version !== 2) return null
  if (!isJob(p.job)) return null
  if (typeof p.ts !== 'string') return null
  if (typeof p.seed !== 'number') return null
  if (!Array.isArray(p.answers) || !p.answers.every(isAnswer)) return null
  if (!isCalibration(p.calibration)) return null
  if (!isFinalDistribution(p.finalDistribution)) return null
  return {
    job: p.job,
    ts: p.ts,
    seed: p.seed,
    answers: p.answers as Answer[],
    calibration: p.calibration,
    finalDistribution: p.finalDistribution,
  }
}

/** raw 문자열을 v3 페이로드로 검증한다(runs/seenStatements 필수). 통과 시 QuizState 반환, 실패 시 null. */
function parseV3(raw: string): QuizState | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const p = parsed as Record<string, unknown>
  if (p.version !== PERSONA_QUIZ_VERSION) return null
  if (!isJob(p.job)) return null
  if (typeof p.ts !== 'string') return null
  // 완료 run 이 하나도 없는 저장 상태는 의미상 무효 (refine intro "0회 · 0문항" 방지).
  if (!Array.isArray(p.runs) || p.runs.length === 0 || !p.runs.every(isQuizRun)) return null
  if (!Array.isArray(p.seenStatements) || !p.seenStatements.every((s) => typeof s === 'string')) {
    return null
  }
  if (!isCalibration(p.calibration)) return null
  if (!isFinalDistribution(p.finalDistribution)) return null
  return {
    version: PERSONA_QUIZ_VERSION,
    job: p.job,
    ts: p.ts,
    runs: (p.runs as QuizRun[]).map((r) => ({ seed: r.seed, ts: r.ts, answers: r.answers })),
    seenStatements: p.seenStatements as string[],
    calibration: p.calibration,
    finalDistribution: p.finalDistribution,
  }
}

/**
 * v1/v2 단일 run 코어 → v3 QuizState 래핑.
 * seenStatements 는 빈 배열로 시작한다(과거 출제 진술은 알 수 없음 — 사양상 허용).
 */
function migrateLegacy(core: LegacyCore, job: JobLens): QuizState {
  return {
    version: PERSONA_QUIZ_VERSION,
    job,
    ts: core.ts,
    runs: [{ seed: core.seed, ts: core.ts, answers: core.answers }],
    seenStatements: [],
    calibration: core.calibration,
    finalDistribution: core.finalDistribution,
  }
}

export function loadPersonaQuiz(): QuizState | null {
  const storage = getStorage()
  if (!storage) return null

  // 1) v3 우선.
  let rawV3: string | null
  try {
    rawV3 = storage.getItem(STORAGE_KEY)
  } catch {
    rawV3 = null
  }
  if (rawV3) {
    const v3 = parseV3(rawV3)
    if (v3) return v3
    // v3 키가 존재하나 무효(스키마 엄격) → 마이그레이션 시도 없이 null 대신 구버전 폴백으로 진행.
  }

  // 2) v2 read-through 마이그레이션 (runs[0] 래핑).
  let rawV2: string | null
  try {
    rawV2 = storage.getItem(LEGACY_KEY_V2)
  } catch {
    rawV2 = null
  }
  if (rawV2) {
    const core = parseV2(rawV2)
    if (core) {
      const migrated = migrateLegacy(core, core.job)
      // write-through: v3 키 생성 후 구키 제거(실패 무시 — 보정은 부가 기능, regression 0).
      savePersonaQuiz(migrated)
      try {
        storage.removeItem(LEGACY_KEY_V2)
      } catch {
        // ignore
      }
      return migrated
    }
  }

  // 3) v1 read-through 마이그레이션 (job='general' 주입 후 동일 래핑).
  let rawV1: string | null
  try {
    rawV1 = storage.getItem(LEGACY_KEY_V1)
  } catch {
    rawV1 = null
  }
  if (rawV1) {
    const core = parseV1(rawV1)
    if (core) {
      const migrated = migrateLegacy(core, 'general')
      savePersonaQuiz(migrated)
      try {
        storage.removeItem(LEGACY_KEY_V1)
      } catch {
        // ignore
      }
      return migrated
    }
  }

  // 4) 모두 없거나 무효.
  return null
}

export function savePersonaQuiz(state: QuizState): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage 가득 참 등 — 조용히 무시 (보정은 부가 기능).
  }
}

export function clearPersonaQuiz(): void {
  const storage = getStorage()
  if (!storage) return
  for (const key of [STORAGE_KEY, LEGACY_KEY_V2, LEGACY_KEY_V1]) {
    try {
      storage.removeItem(key)
    } catch {
      // ignore
    }
  }
}
