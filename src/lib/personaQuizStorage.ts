/**
 * 페르소나 진단 결과 localStorage 영속 (외부 전송 0).
 *
 * 완료된 검사만 저장한다(사양: 미완료 이탈 시 다음 방문 처음부터).
 * JSON.parse 실패 / 스키마 version 불일치 시 방어적으로 null 반환.
 *
 * v2: `job`(직군 렌즈) 필드 추가, STORAGE_KEY bump.
 * v1 페이로드는 read-through 마이그레이션으로 job='general' 주입 후 v2 키에 write-through.
 */
import {
  PERSONA_QUIZ_VERSION,
  type QuizState,
  type Answer,
  type Calibration,
  type JobLens,
} from './personaQuiz'

const STORAGE_KEY = 'memradar.personaQuiz.v2'
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

/** raw 문자열을 v1 페이로드로 검증한다(job 없음이 정상). 통과 시 코어 필드 반환, 실패 시 null. */
function parseV1(raw: string): Omit<QuizState, 'version' | 'job'> | null {
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

/** raw 문자열을 v2 페이로드로 검증한다(job 유효 필수). 통과 시 QuizState 반환, 실패 시 null. */
function parseV2(raw: string): QuizState | null {
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
  if (typeof p.seed !== 'number') return null
  if (!Array.isArray(p.answers) || !p.answers.every(isAnswer)) return null
  if (!isCalibration(p.calibration)) return null
  if (!isFinalDistribution(p.finalDistribution)) return null
  return {
    version: PERSONA_QUIZ_VERSION,
    job: p.job,
    ts: p.ts,
    seed: p.seed,
    answers: p.answers as Answer[],
    calibration: p.calibration,
    finalDistribution: p.finalDistribution,
  }
}

export function loadPersonaQuiz(): QuizState | null {
  const storage = getStorage()
  if (!storage) return null

  // 1) v2 우선.
  let rawV2: string | null
  try {
    rawV2 = storage.getItem(STORAGE_KEY)
  } catch {
    rawV2 = null
  }
  if (rawV2) {
    const v2 = parseV2(rawV2)
    if (v2) return v2
    // v2 키가 존재하나 무효(스키마 엄격) → 마이그레이션 시도 없이 null 대신 v1 폴백으로 진행.
  }

  // 2) v1 read-through 마이그레이션 (job='general' 주입).
  let rawV1: string | null
  try {
    rawV1 = storage.getItem(LEGACY_KEY_V1)
  } catch {
    rawV1 = null
  }
  if (rawV1) {
    const core = parseV1(rawV1)
    if (core) {
      const migrated: QuizState = {
        version: PERSONA_QUIZ_VERSION,
        job: 'general',
        ...core,
      }
      // write-through: v2 키 생성 후 LEGACY 제거(실패 무시 — 보정은 부가 기능, regression 0).
      savePersonaQuiz(migrated)
      try {
        storage.removeItem(LEGACY_KEY_V1)
      } catch {
        // ignore
      }
      return migrated
    }
  }

  // 3) 둘 다 없거나 무효.
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
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  try {
    storage.removeItem(LEGACY_KEY_V1)
  } catch {
    // ignore
  }
}
