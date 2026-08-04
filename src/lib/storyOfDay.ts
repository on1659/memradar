import type { Session } from '../types'
import { countWords, extractSkillNames, isStructured, matchRetryMarker, stripMarkup, toLocalDayKey } from '../parser'
import { detectLanguageNames } from './languageProfile'
import { isAggregatableModel } from './modelAttribution'
import { extractProject } from './personality'

/**
 * 그날 이야기 (Story of the Day) — 토큰 최대인 날이 아니라 **서사 점수 최대인 날** 선정.
 *
 * React 없는 순수 함수 (codingRhythm.ts 패턴). LLM/네트워크 호출 없음.
 * 문자열 카피는 리턴하지 않는다 — 날짜·수치·항 id(dominantTerm)만 리턴하고,
 * ko/en 카피는 UI(Dashboard.tsx)에서 분기한다.
 *
 * 일(day) 경계는 로컬 날짜(toLocalDayKey) — stats.dailyTokens 의 UTC dayKey 는
 * KST 00~09시 활동이 전날로 귀속되므로 재사용하지 않고 여기서 재집계한다
 * (설계 문서 공통 데이터 정책 1·2항).
 *
 * 서사 점수 = 항별 0~1 정규화 후 가중합 (구조 확정, 가중치 수치는 잠정값):
 *   ① 토큰 이상치 — 그날 토큰 / 본인 일평균(활동일 기준), cap 후 정규화
 *   ② 세션 밀도 — 그날 세션 수 + 첫~마지막 메시지 시간 범위
 *   ③ 재질문 회복 — 그날 follow-up 전반부 vs 후반부 retry율 하락폭
 *   ④ 작업 다양성 — 그날 사용 스킬·언어 종수
 * 결측 항은 제외하고 남은 가중치를 재정규화한다 (renormalizeTermWeights).
 * source-aware: 스킬은 <command-name> 기반이라 Claude 전용 — Claude 세션 없는 날은
 * ④의 스킬 서브항을 빼고 언어만 본다 (buildGrowth proxy C 제외 패턴).
 */

// ── 임계값/가중치 (모두 잠정값 — 실측 보정 전, docs/AI-ROLE-SCORING-REDESIGN.md §2 원칙) ──
/** 잠정값 — 실측 보정 전. codingRhythm 의 MIN_ACTIVE_DAYS_FOR_RHYTHM 과 독립 선언 (카드별 보정 분리) */
export const MIN_ACTIVE_DAYS_FOR_STORY = 7
export const MIN_USER_MESSAGES_PER_DAY = 10     // 잠정값 — 실측 보정 전 (후보일 최소 user 메시지 수)
export const MIN_FOLLOWUPS_FOR_RETRY_TERM = 10  // 잠정값 — 실측 보정 전 (③ 산입 최소 follow-up 수)
export const TOKEN_ANOMALY_CAP = 5              // 잠정값 — 실측 보정 전 (① 일평균 대비 배수 cap)
export const SESSION_COUNT_NORMALIZER = 6       // 잠정값 — 실측 보정 전 (② 세션 수 정규화 분모)
export const SPAN_HOURS_NORMALIZER = 12         // 잠정값 — 실측 보정 전 (② 시간 범위 정규화 분모, 시간)
export const RETRY_DROP_NORMALIZER = 0.3        // 잠정값 — 실측 보정 전 (③ retry율 하락폭 정규화 분모, 0~1)
export const SKILL_COUNT_NORMALIZER = 5         // 잠정값 — 실측 보정 전 (④ 스킬 종수 정규화 분모)
export const LANGUAGE_COUNT_NORMALIZER = 5      // 잠정값 — 실측 보정 전 (④ 언어 종수 정규화 분모)

export type StoryTermId = 'tokenAnomaly' | 'sessionDensity' | 'retryRecovery' | 'variety'

/** dominantTerm 동률 시 우선순위 — 배열 앞쪽이 이긴다 (결정적 출력) */
export const STORY_TERM_ORDER: StoryTermId[] = ['tokenAnomaly', 'sessionDensity', 'retryRecovery', 'variety']

/** 잠정값 — 실측 보정 전 (W2 착지 후 실데이터 캘리브레이션, goal Open Questions) */
export const STORY_TERM_WEIGHTS: Record<StoryTermId, number> = {
  tokenAnomaly: 0.3,
  sessionDensity: 0.25,
  retryRecovery: 0.25,
  variety: 0.2,
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

const HOUR_MS = 3_600_000

// ── per-day 집계 (buildDailyCollab) ──────────────────────────────────────────

export interface DailyFollowUp {
  /** epoch ms — 시간순 정렬 보존 */
  ts: number
  /** matchRetryMarker 매칭 여부 */
  isRetry: boolean
}

export interface DailyCollab {
  /** 로컬 날짜 키 "YYYY-MM-DD" */
  dayKey: string
  userMessageCount: number
  /** isStructured 매칭 user 메시지 수 — 지문 카드(W3) structured-shift 신호 재료 (가산 필드) */
  structuredCount: number
  /** 그날 메시지가 1건이라도 있는 세션 수 */
  sessionCount: number
  /** input + output + cachedInput — computeStats 의 msgTokenTotal 공식과 동일 */
  tokens: number
  /** 그날 첫/마지막 메시지 epoch ms (역할 무관) */
  firstTs: number
  lastTs: number
  /** assistant 직후 user 메시지 (세션 경계 리셋) — ts 오름차순 정렬 */
  followUps: DailyFollowUp[]
  /** Claude 세션 user 메시지의 <command-name> 스킬 (source-aware) */
  skills: Set<string>
  /** 코드 펜스 id + 파일 확장자 기반 언어 (역할 무관) */
  languages: Set<string>
  /** 그날 메시지 중 Claude 세션 출신 존재 여부 — ④ 스킬 서브항 산입 조건 */
  hasClaudeSession: boolean
  /** user 메시지 단어 수 합 — countWords(stripMarkup(text)), authorshipRatio.ts 와 동일 호출식 (지문 ⑥⑦ 재료, 가산 필드) */
  userWords: number
  /** assistant 메시지 단어 수 합 — 산식 동일 (지문 ⑥ 재료, 가산 필드) */
  aiWords: number
  /** 그날 사용 모델 — per-message model, 없으면 session.model 폴백, 둘 다 없으면 미기록 (지문 ⑨ 재료, 가산 필드) */
  models: Set<string>
  /** 그날 세션의 프로젝트 키 — sessionProjectKey 규칙, 세션당 1회 계산 (지문 ⑧ 재료, 가산 필드) */
  projects: Set<string>
}

/**
 * 세션 → 프로젝트 키 (세션당 1회 계산 — 지문 ⑧ 이 전체 세션 분포에도 같은 규칙을 쓰도록 export).
 *   ① cwd 있으면 extractProject(cwd) (personality.ts 와 동일 규칙 — 프로젝트 키 단일 소스)
 *   ② cwd 없고 Claude 세션 + filePath 있으면 부모 디렉터리명 (~/.claude/projects/{slug}/x.jsonl 구조,
 *      cli/index.mjs handleSessions 의 project slug 와 동일 축 — 경로 구분자 양쪽 처리, node:path 미사용)
 *   ③ Codex 는 filePath 폴백 금지 (날짜 디렉터리라 프로젝트 정보가 아님 — cli/index.mjs 'codex' 상수와 동일 판단)
 *   ④ 둘 다 없으면 null — 해당 세션은 프로젝트 집계에 기여하지 않음
 */
export function sessionProjectKey(session: Session): string | null {
  if (session.cwd) return extractProject(session.cwd)
  if (session.source === 'claude' && session.filePath) {
    const parts = session.filePath.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length >= 2) return parts[parts.length - 2]
  }
  return null
}

/**
 * 세션 배열 → 로컬 일 키별 협업 집계.
 * offsetMinutes: 테스트가 머신 타임존에 의존하지 않게 하는 주입구 (예: KST = 540) — toLocalDayKey 와 동일 축.
 * 빈 문자열/파싱 불가 timestamp 메시지는 일 귀속 불가라 집계에서 제외한다 (collectUserTimestamps 가드 패턴).
 */
export function buildDailyCollab(
  sessions: Session[],
  opts?: { offsetMinutes?: number }
): Map<string, DailyCollab> {
  const offsetMinutes = opts?.offsetMinutes
  const days = new Map<string, DailyCollab>()

  const getOrCreate = (key: string): DailyCollab => {
    let day = days.get(key)
    if (!day) {
      day = {
        dayKey: key,
        userMessageCount: 0,
        structuredCount: 0,
        sessionCount: 0,
        tokens: 0,
        firstTs: Number.POSITIVE_INFINITY,
        lastTs: Number.NEGATIVE_INFINITY,
        followUps: [],
        skills: new Set(),
        languages: new Set(),
        hasClaudeSession: false,
        userWords: 0,
        aiWords: 0,
        models: new Set(),
        projects: new Set(),
      }
      days.set(key, day)
    }
    return day
  }

  for (const session of sessions) {
    const sessionDays = new Set<string>()
    // 프로젝트 키는 세션당 1회 계산 — 세션 꼬리 루프에서 그날들에 add (sessionCount 와 동일 귀속 축)
    const projectKey = sessionProjectKey(session)
    // 세션 경계 안전성 — 이전 세션이 assistant 로 끝나도 다음 세션 첫 user 가 follow-up 으로 오인되지 않게 (buildGrowth 패턴)
    let prevRole: 'user' | 'assistant' | null = null

    for (const msg of session.messages) {
      let dayKey: string | null = null
      let ts = Number.NaN
      if (msg.timestamp) {
        const d = new Date(msg.timestamp)
        if (!Number.isNaN(d.getTime())) {
          ts = d.getTime()
          dayKey = toLocalDayKey(d, offsetMinutes)
        }
      }

      if (dayKey !== null) {
        const day = getOrCreate(dayKey)
        sessionDays.add(dayKey)
        if (ts < day.firstTs) day.firstTs = ts
        if (ts > day.lastTs) day.lastTs = ts
        if (msg.tokens) {
          day.tokens += msg.tokens.input + msg.tokens.output + (msg.tokens.cachedInput || 0)
        }
        if (session.source === 'claude') day.hasClaudeSession = true
        for (const name of detectLanguageNames(msg.text)) day.languages.add(name)
        // assistant 응답만 모델 축에 기여한다. 원본 JSONL 의 user 라인에는 message.model 이
        // 없어(실측 0건) 이 폴백이 user 메시지마다 세션 모델을 주입했고, 그 결과
        // collabFingerprint ⑨ 의 분자(day.models.size >= 2)가 부풀려져 있었다.
        // per-message 우선 + 세션 폴백은 유지하고 role 게이트만 더한다 — 위 주석의
        // "둘 다 없으면 미기록(분모 오염 방지)" 의도는 그대로다.
        if (msg.role === 'assistant') {
          const model = msg.model ?? session.model
          if (isAggregatableModel(model)) day.models.add(model)
        }

        if (msg.role === 'user') {
          day.userMessageCount++
          // authorshipRatio.ts 와 동일 호출식 — 카드 간 단어 수 산식 정합 (지문 ⑥⑦ 재료)
          day.userWords += countWords(stripMarkup(msg.text))
          if (isStructured(msg.text)) day.structuredCount++
          if (session.source === 'claude') {
            // <command-name> 태그는 Claude 세션에만 존재 — 스킬은 Claude 전용 (buildGrowth proxy C 패턴)
            for (const name of extractSkillNames(msg.text)) day.skills.add(name)
          }
          if (prevRole === 'assistant') {
            day.followUps.push({ ts, isRetry: matchRetryMarker(msg.text) !== null })
          }
        } else if (msg.role === 'assistant') {
          day.aiWords += countWords(stripMarkup(msg.text))
        }
      }

      prevRole = msg.role
    }

    for (const key of sessionDays) {
      const day = getOrCreate(key)
      day.sessionCount++
      if (projectKey !== null) day.projects.add(projectKey)
    }
  }

  // 세션 간 교차 시간대 대비 — ③의 전/후반 분할은 일 단위 시간순이 전제
  for (const day of days.values()) {
    day.followUps.sort((a, b) => a.ts - b.ts)
  }

  return days
}

// ── 서사 점수 (scoreStoryDays) ───────────────────────────────────────────────

export interface StoryTermResult {
  /** 0~1 정규화 값 — % 변환은 UI에서 (lessons/_common.md L-5) */
  value: number
  /** 결측 항 제외 후 재정규화된 실제 적용 가중치 (남은 항 합 = 1) */
  weight: number
  /** weight × value — dominantTerm 판정 기준 */
  contribution: number
}

export interface StoryReceipts {
  tokens: number
  /** 활동일 기준 본인 일평균 토큰 */
  dayAvgTokens: number
  sessionCount: number
  spanHours: number
  /** 0~1 raw — % 변환은 UI에서. ③ 결측이면 null */
  retryRateFirst: number | null
  retryRateSecond: number | null
  /** ③의 분모 n — 영수증에 n= 표기 필수 */
  followUpCount: number
  skillCount: number
  languageCount: number
  userMessageCount: number
  hasClaudeSession: boolean
}

export interface StoryOfDay {
  dayKey: string
  /** 0~1 가중합 */
  score: number
  /** 기여(weight×value) 최대 항 — 카피 분기용. 동률이면 STORY_TERM_ORDER 앞쪽 */
  dominantTerm: StoryTermId
  /** 결측 항은 키 자체가 없음 — UI는 해당 행 생략 */
  terms: Partial<Record<StoryTermId, StoryTermResult>>
  receipts: StoryReceipts
}

export interface StoryDaysResult {
  /** 일 키 수 — "이야기 모으는 중" 빈상태 분기용 */
  activeDayCount: number
  /** user 메시지 ≥ MIN_USER_MESSAGES_PER_DAY 인 후보일 수 — "후보 0" 빈상태 분기용 */
  candidateCount: number
  /** 활동일/후보 가드 미달 시 null */
  best: StoryOfDay | null
}

/**
 * 결측 항 제외 후 남은 가중치 합이 1이 되도록 재정규화.
 * 예: ③ 결측이면 {0.3, 0.25, 0.2} → {0.4, 0.333…, 0.266…}.
 * 단위 테스트 가능하게 scoreStoryDays 에서 분리.
 */
export function renormalizeTermWeights(
  presentTerms: StoryTermId[],
  weights: Record<StoryTermId, number> = STORY_TERM_WEIGHTS
): Partial<Record<StoryTermId, number>> {
  const out: Partial<Record<StoryTermId, number>> = {}
  const total = presentTerms.reduce((sum, id) => sum + weights[id], 0)
  if (total <= 0) return out
  for (const id of presentTerms) out[id] = weights[id] / total
  return out
}

function scoreDay(
  day: DailyCollab,
  dayAvgTokens: number,
  weights: Record<StoryTermId, number>
): StoryOfDay {
  // ① 토큰 이상치 — 그날 토큰 / 본인 일평균, TOKEN_ANOMALY_CAP 으로 cap 후 0~1.
  //    일평균 0 가드: 전 기간 토큰 0이면 비교 기준이 없으므로 항 결측.
  let tokenAnomalyValue: number | null = null
  if (dayAvgTokens > 0) {
    tokenAnomalyValue = clamp01(day.tokens / dayAvgTokens / TOKEN_ANOMALY_CAP)
  }

  // ② 세션 밀도 — 세션 수·시간 범위 서브항을 각각 0~1 정규화 후 두 서브항 평균으로 결합.
  const spanHours = day.lastTs > day.firstTs ? (day.lastTs - day.firstTs) / HOUR_MS : 0
  const sessionDensityValue =
    (clamp01(day.sessionCount / SESSION_COUNT_NORMALIZER) + clamp01(spanHours / SPAN_HOURS_NORMALIZER)) / 2

  // ③ 재질문 회복 — follow-up ≥ MIN_FOLLOWUPS_FOR_RETRY_TERM 일 때만 산입 (미달 시 결측).
  //    건수 기준 분할: 시간순 앞 ⌈n/2⌉ vs 나머지. 하락폭(전반−후반)만 보고 음수(악화)는 0 클램프.
  let retryRateFirst: number | null = null
  let retryRateSecond: number | null = null
  let retryRecoveryValue: number | null = null
  const followUpCount = day.followUps.length
  if (followUpCount >= MIN_FOLLOWUPS_FOR_RETRY_TERM) {
    const firstLen = Math.ceil(followUpCount / 2)
    const secondLen = followUpCount - firstLen
    if (secondLen > 0) {  // 분모 0 가드 (가드 상수 ≥ 2 면 항상 충족하지만 방어적으로 유지)
      const firstRetries = day.followUps.slice(0, firstLen).filter((f) => f.isRetry).length
      const secondRetries = day.followUps.slice(firstLen).filter((f) => f.isRetry).length
      retryRateFirst = firstRetries / firstLen
      retryRateSecond = secondRetries / secondLen
      retryRecoveryValue = clamp01(Math.max(0, retryRateFirst - retryRateSecond) / RETRY_DROP_NORMALIZER)
    }
  }

  // ④ 작업 다양성 — 스킬·언어 종수 서브항 평균. source-aware: Claude 세션 없는 날은
  //    스킬 서브항 제외(언어만) — Codex-heavy 사용자가 체계적으로 불리해지지 않게.
  const langSub = clamp01(day.languages.size / LANGUAGE_COUNT_NORMALIZER)
  const varietyValue = day.hasClaudeSession
    ? (clamp01(day.skills.size / SKILL_COUNT_NORMALIZER) + langSub) / 2
    : langSub

  const values: Record<StoryTermId, number | null> = {
    tokenAnomaly: tokenAnomalyValue,
    sessionDensity: sessionDensityValue,
    retryRecovery: retryRecoveryValue,
    variety: varietyValue,
  }

  const presentTerms = STORY_TERM_ORDER.filter((id) => values[id] !== null)
  const normalizedWeights = renormalizeTermWeights(presentTerms, weights)

  const terms: Partial<Record<StoryTermId, StoryTermResult>> = {}
  let score = 0
  let dominantTerm: StoryTermId = presentTerms[0] ?? STORY_TERM_ORDER[0]
  let dominantContribution = Number.NEGATIVE_INFINITY
  for (const id of presentTerms) {
    const value = values[id]!
    const weight = normalizedWeights[id] ?? 0
    const contribution = weight * value
    terms[id] = { value, weight, contribution }
    score += contribution
    // 동률이면 STORY_TERM_ORDER 순회 순서상 앞 항이 유지된다 (strict >)
    if (contribution > dominantContribution) {
      dominantContribution = contribution
      dominantTerm = id
    }
  }

  return {
    dayKey: day.dayKey,
    score,
    dominantTerm,
    terms,
    receipts: {
      tokens: day.tokens,
      dayAvgTokens,
      sessionCount: day.sessionCount,
      spanHours,
      retryRateFirst,
      retryRateSecond,
      followUpCount,
      skillCount: day.skills.size,
      languageCount: day.languages.size,
      userMessageCount: day.userMessageCount,
      hasClaudeSession: day.hasClaudeSession,
    },
  }
}

/**
 * 일별 집계 → 후보별 서사 점수 + 최고일.
 * 가드: 활동일 < MIN_ACTIVE_DAYS_FOR_STORY 또는 후보 0건이면 best = null (빈상태 — 원인은
 * activeDayCount/candidateCount 로 UI가 분기).
 * 동점이면 빠른 날짜가 이긴다 (결정적 출력 — 후보를 dayKey 오름차순으로 순회하고 strict > 만 교체).
 */
export function scoreStoryDays(
  dailyMap: Map<string, DailyCollab>,
  opts?: { weights?: Record<StoryTermId, number> }
): StoryDaysResult {
  const weights = opts?.weights ?? STORY_TERM_WEIGHTS
  const activeDayCount = dailyMap.size

  let totalTokens = 0
  for (const day of dailyMap.values()) totalTokens += day.tokens
  const dayAvgTokens = activeDayCount > 0 ? totalTokens / activeDayCount : 0

  const candidates = [...dailyMap.values()]
    .filter((day) => day.userMessageCount >= MIN_USER_MESSAGES_PER_DAY)
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey))
  const candidateCount = candidates.length

  if (activeDayCount < MIN_ACTIVE_DAYS_FOR_STORY || candidateCount === 0) {
    return { activeDayCount, candidateCount, best: null }
  }

  let best: StoryOfDay | null = null
  for (const day of candidates) {
    const story = scoreDay(day, dayAvgTokens, weights)
    if (best === null || story.score > best.score) best = story
  }

  return { activeDayCount, candidateCount, best }
}
