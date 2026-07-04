import type { RawMessage, ParsedMessage, Session, Stats, ContentBlock, TokenUsage, ToolCall, ToolResult } from './types'

export interface ParseOptions {
  includeToolDetails?: boolean
}

function extractText(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!)
    .join('\n')
}

function extractToolUses(content: string | ContentBlock[]): string[] {
  if (typeof content === 'string' || !Array.isArray(content)) return []
  return content
    .filter((b) => b.type === 'tool_use' && b.name)
    .map((b) => b.name!)
}

function extractToolCalls(content: string | ContentBlock[]): ToolCall[] {
  if (typeof content === 'string' || !Array.isArray(content)) return []
  return content
    .filter((b) => b.type === 'tool_use' && b.id && b.name)
    .map((b) => ({
      id: b.id!,
      name: b.name!,
      input: (b.input || {}) as Record<string, unknown>,
    }))
}

function extractToolResults(content: string | ContentBlock[]): Array<{ id: string; result: ToolResult }> {
  if (typeof content === 'string' || !Array.isArray(content)) return []
  return content
    .filter((b) => b.type === 'tool_result' && b.tool_use_id)
    .map((b) => {
      let resultContent = ''
      if (typeof b.content === 'string') {
        resultContent = b.content
      } else if (Array.isArray(b.content)) {
        resultContent = b.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text!)
          .join('\n')
      }
      return {
        id: b.tool_use_id!,
        result: { content: resultContent, isError: !!b.is_error },
      }
    })
}

export function parseJsonl(text: string, fileName: string, options: ParseOptions = {}): Session | null {
  const lines = text.trim().split('\n')
  const rawMessages: ParsedMessage[] = []
  let sessionId = ''
  let cwd = ''
  let version = ''
  let model = ''
  const includeToolDetails = !!options.includeToolDetails
  const toolCallById = new Map<string, ToolCall>()

  for (const line of lines) {
    try {
      const raw: RawMessage = JSON.parse(line)

      if (raw.type === 'file-history-snapshot') continue
      if (raw.isMeta) continue
      if (raw.isSidechain) continue
      if (!raw.message?.role) continue

      const text = extractText(raw.message.content)
      const toolUses = extractToolUses(raw.message.content)
      let toolCalls: ToolCall[] | undefined
      if (includeToolDetails) {
        toolCalls = extractToolCalls(raw.message.content)
        for (const tc of toolCalls) toolCallById.set(tc.id, tc)
        for (const r of extractToolResults(raw.message.content)) {
          const tc = toolCallById.get(r.id)
          if (tc) tc.result = r.result
        }
      }
      if (!text.trim() && toolUses.length === 0 && (!toolCalls || toolCalls.length === 0)) continue

      if (!sessionId && raw.sessionId) sessionId = raw.sessionId
      if (!cwd && raw.cwd) cwd = raw.cwd
      if (!version && raw.version) version = raw.version
      if (!model && raw.message.model) model = raw.message.model

      const usage = raw.message.usage
      rawMessages.push({
        role: raw.message.role,
        text,
        timestamp: raw.timestamp || '',
        model: raw.message.model,
        tokens: usage
          ? {
              input: usage.input_tokens || 0,
              output: usage.output_tokens || 0,
              cachedInput: usage.cache_read_input_tokens || 0,
              cacheWriteInput: usage.cache_creation_input_tokens || 0,
            }
          : undefined,
        toolUses,
        toolCalls: includeToolDetails && toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      })
    } catch {
      // skip malformed lines
    }
  }

  if (rawMessages.length === 0) return null

  const messages: ParsedMessage[] = []
  for (const msg of rawMessages) {
    const prev = messages[messages.length - 1]
    if (prev && prev.role === msg.role) {
      prev.text += '\n\n' + msg.text
      prev.timestamp = prev.timestamp || msg.timestamp
      if (msg.tokens) {
        if (prev.tokens) {
          prev.tokens.input += msg.tokens.input
          prev.tokens.output += msg.tokens.output
          prev.tokens.cachedInput = (prev.tokens.cachedInput || 0) + (msg.tokens.cachedInput || 0)
          prev.tokens.cacheWriteInput = (prev.tokens.cacheWriteInput || 0) + (msg.tokens.cacheWriteInput || 0)
        } else {
          prev.tokens = { ...msg.tokens }
        }
      }
      prev.toolUses = [...prev.toolUses, ...msg.toolUses]
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        prev.toolCalls = [...(prev.toolCalls || []), ...msg.toolCalls]
      }
      if (!prev.model && msg.model) prev.model = msg.model
    } else {
      messages.push({
        ...msg,
        tokens: msg.tokens ? { ...msg.tokens } : undefined,
        toolUses: [...msg.toolUses],
        toolCalls: msg.toolCalls ? [...msg.toolCalls] : undefined,
      })
    }
  }

  // Estimate user message tokens from adjacent assistant input deltas
  // assistant.tokens.input = entire context up to that point (input + cacheRead + cacheWrite)
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role !== 'user' || msg.tokens) continue
    const nextAst = messages.slice(i + 1).find(m => m.role === 'assistant' && m.tokens)
    const prevAst = messages.slice(0, i).reverse().find(m => m.role === 'assistant' && m.tokens)
    if (!nextAst?.tokens) continue
    const nextTotal = nextAst.tokens.input + (nextAst.tokens.cachedInput || 0) + (nextAst.tokens.cacheWriteInput || 0)
    const prevTotal = prevAst
      ? prevAst.tokens!.input + (prevAst.tokens!.cachedInput || 0) + (prevAst.tokens!.cacheWriteInput || 0) + prevAst.tokens!.output
      : 0
    const estimated = nextTotal - prevTotal
    if (estimated > 0) msg.tokens = { input: estimated, output: 0, cachedInput: 0, cacheWriteInput: 0 }
  }

  const totalTokens = messages.reduce(
    (acc, m) => ({
      input: acc.input + (m.tokens?.input || 0),
      output: acc.output + (m.tokens?.output || 0),
      cachedInput: (acc.cachedInput || 0) + (m.tokens?.cachedInput || 0),
      cacheWriteInput: (acc.cacheWriteInput || 0) + (m.tokens?.cacheWriteInput || 0),
    }),
    { input: 0, output: 0, cachedInput: 0, cacheWriteInput: 0 } satisfies TokenUsage
  )

  return {
    id: sessionId || fileName,
    fileName,
    source: 'claude',
    messages,
    startTime: messages[0]?.timestamp || '',
    endTime: messages[messages.length - 1]?.timestamp || '',
    cwd,
    version,
    model,
    totalTokens,
    messageCount: {
      user: messages.filter((m) => m.role === 'user').length,
      assistant: messages.filter((m) => m.role === 'assistant').length,
    },
  }
}

const STOP_WORDS = new Set([
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'because', 'but', 'and', 'or', 'if', 'while', 'that', 'this',
  'these', 'those', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you',
  'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
  'what', 'which', 'who', 'whom', 'up', 'about', 'also', 'like',
  'let', 'use', 'using', 'make', 'new', 'file', 'code', 'run', 'set',
  // Korean common particles/endings
  '이', '그', '저', '것', '수', '등', '때', '더', '안', '좀', '잘',
  '이런', '그런', '저런', '하는', '하고', '해서', '하면', '해도',
  '있는', '없는', '되는', '하는데', '인데', '건데', '거야', '거임',
  '으로', '에서', '까지', '부터', '처럼', '만큼', '대로', '마다',
  '하다', '있다', '없다', '되다', '보다', '같다', '나다', '주다',
  '말고', '말이', '거기', '여기', '어디', '이거', '그거', '저거',
  '근데', '그리고', '그래서', '하지만', '그런데', '그러면', '아니면',
])

export const BUILTIN_COMMANDS = new Set([
  'exit', 'clear', 'help', 'model', 'fast', 'login', 'logout',
  'compact', 'resume', 'continue', 'config', 'status', 'cost',
  'doctor', 'init', 'memory', 'bug', 'release-notes', 'terminal-setup',
  'ide', 'mcp', 'vim', 'hooks', 'permissions', 'agents', 'add-dir',
  'upgrade', 'migrate-installer', 'todos', 'share', 'usage',
  'allowed-tools', 'pr-comments', 'review', 'think', 'output-style',
  'export', 'import', 'feedback',
])

// ── 성장 섹션 (docs/GROWTH-SECTION-SPEC.md) ───────────────────────────────

/** cli/index.mjs applyTextCap 이 덧붙이는 잘림 마커 — 단어 집계 오염 방지를 위해 stripMarkup 에서 제거 */
export const CLI_TRUNCATION_MARKER = '…[잘림 — 세션 클릭 시 전체 보기]'

/** 월별 버킷 키 — UTC ISO 기준 (기존 dailyActivity 의 toISOString().slice(0,10) 규칙과 동일 축) */
export function toMonthKey(ts: string | undefined): string | null {
  if (!ts) return null
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 7)   // "YYYY-MM"
}

/** 일별 버킷 키 — UTC ISO 기준 (toMonthKey 와 동일 축). dailyActivity·activeDays 집계 공용 */
export function toDayKey(ts: string | undefined): string | null {
  if (!ts) return null
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)  // "YYYY-MM-DD"
}

/**
 * 일(day) 버킷 키 — 로컬 날짜 기준 "YYYY-MM-DD".
 *
 * 신규 per-day 집계(코딩 리듬 카드 등)가 쓰는 축. 기존 dayKey(UTC toISOString)는
 * KST 사용자의 00~09시 활동이 전날로 귀속되므로, 신규 일 단위 경로는 이 키를 쓴다.
 * 월 버킷(toMonthKey)은 성장 섹션 소관이라 UTC 축 유지 — 일/월 기준 차이는 UI 각주로 명시.
 *
 * offsetMinutes: 테스트가 머신 타임존에 의존하지 않게 하는 주입구 (예: KST = 540).
 * 지정 시 해당 오프셋만큼 시프트한 시각의 UTC getter 로 키를 만들고,
 * 미지정 시 머신 로컬 시간대(getFullYear/getMonth/getDate) 기준.
 */
export function toLocalDayKey(date: Date, offsetMinutes?: number): string {
  if (offsetMinutes !== undefined) {
    const shifted = new Date(date.getTime() + offsetMinutes * 60_000)
    const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
    const d = String(shifted.getUTCDate()).padStart(2, '0')
    return `${shifted.getUTCFullYear()}-${m}-${d}`
  }
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

/** 코드/태그/URL/잘림 마커 오염 제거 — 그대로 split 하면 로그 붙여넣은 달이 "성장"으로 오인됨 */
export function stripMarkup(text: string): string {
  return text
    .split(CLI_TRUNCATION_MARKER).join(' ')  // 서버 모드 4000자 캡 마커
    .replace(/```[\s\S]*?```/g, ' ')    // 코드 펜스
    .replace(/`[^`]*`/g, ' ')            // 인라인 코드
    .replace(/<[^>]+>/g, ' ')            // XML/HTML 태그
    .replace(/https?:\/\/\S+/g, ' ')     // URL
}

export function countWords(text: string): number {
  const m = stripMarkup(text).match(/[a-z가-힣]+/gi)
  return m ? m.length : 0
}

/** proxy A — 서로 다른 구조 마커 2종 이상일 때만 structured (불릿 한 줄짜리 오탐 방지) */
export function isStructured(text: string): boolean {
  const head = stripMarkup(text).slice(0, 500)
  const markers = [
    /(^|\n)\s*#{1,3}\s/.test(head),              // 헤딩
    /(^|\n)\s*[-*]\s+\S/.test(head),             // 불릿
    /(^|\n)\s*\d+\.\s+\S/.test(head),            // 번호
    /(^|\n)\s*(역할|role|당신은|you are)/i.test(head),  // 역할 지정
  ]
  return markers.filter(Boolean).length >= 2     // 2종 이상 섞였을 때만
}

/**
 * 정정 마커 2계층 사전 (스펙 impl-note #6 — 2026-07 라벨 실측 보정).
 *
 * 구 설계(flat includes)는 라벨 157건 기준 정밀도 41% — "보다시피"의 '다시',
 * 질문형 "~된거 아니지?"의 '아니', 신규 요청 "수정해줘"의 '수정'이 전부 오탐이었다.
 *
 * - Tier A: head 가 마커로 **시작**할 때만 매치 (문두 정정 — 정밀도 최상 구간).
 *   '수정'은 문두에서도 정밀도 18% 실측이라 사전에서 완전 제거.
 * - Tier B: 문중 허용하되 가드 정규식으로 비정정 용법을 제외하는 패턴
 *   (matchPlanMarker 의 컴파일 정규식 + 가드 스타일).
 */
const RETRY_TIER_A = [
  '그게 아니라', '그거 말고', '아 잠깐', '잠깐만', '틀렸', '아니', '다시',
  'no wait', 'actually',
]

// 긴 마커 우선 매칭 — "그게 아니라"가 "아니"로 흡수되지 않게 (표시 마커 정확성)
const RETRY_TIER_A_BY_LENGTH = [...RETRY_TIER_A].sort((a, b) => b.length - a.length)

// Tier B 가드 — head(30자) 전체에 대해 판정한다.
// 공백은 전부 \s* — stripMarkup 이 인라인 코드/태그를 공백으로 치환해 다중 연속 공백이 구조적으로 생긴다.
const PROHIBITIVE_MALGO_RE = /지\s*말고/    // 금지형 "…지 말고/…지말고" ("묻지 말고 진행해") — 정정 아님
const ADDITIVE_MALGO_RE = /말고도/          // 첨가형 "X 말고도 Y" — 정정 아님
const ANIRA_CORRECTION_RE = /[가게이]\s*아니라/  // "X가/게/이 아니라 Y" — 내용 정정 ('아니고' 변형은 라벨상 비정정 우세라 미포함)
const PPUNMAN_ANIRA_RE = /뿐만이?\s*아니라/ // 첨가형 "뿐만(이) 아니라" — 정정 아님 ("뿐만이 아니라"는 '이 아니라'로 본체에 걸리므로 가드 필수)

/**
 * 정정 마커 매칭 — stripMarkup → trim → lower → head 30자.
 * Tier A(문두) 우선, 미스 시 Tier B(문중 가드 패턴) 순서로 판정.
 * 리턴 문자열은 RETRY_MARKERS 의 표시용 마커명과 일치 (GrowthRetry pill 에 그대로 노출).
 */
export function matchRetryMarker(text: string): string | null {
  const head = stripMarkup(text).trim().toLowerCase().slice(0, 30)
  for (const marker of RETRY_TIER_A_BY_LENGTH) {
    if (head.startsWith(marker)) return marker
  }
  if (head.includes('말고') && !PROHIBITIVE_MALGO_RE.test(head) && !ADDITIVE_MALGO_RE.test(head)) return '말고'
  if (ANIRA_CORRECTION_RE.test(head) && !PPUNMAN_ANIRA_RE.test(head)) return '아니라'
  return null
}

/**
 * 표시용 flat 마커명 리스트 — matchRetryMarker 가 리턴할 수 있는 문자열의 전체 집합.
 * analyze-coaching.mts 가 카운트 초기화·출력 순회에 사용. 티어 구조는 위 내부 상수 참조.
 */
export const RETRY_MARKERS = [...RETRY_TIER_A, '말고', '아니라']

/**
 * 계획 요청 마커 사전 (W3 카드 3 — 지문 신호 plan-after-correction) — 전부 잠정값.
 *
 * RETRY_MARKERS 와 달리 **구(phrase) 단위만** 수록한다 — "계획"·"방향"·"plan" 같은
 * 단일 일반어는 보고/설명 문장("이 계획이 맞는지", "explain the plan")에 흔해 변별력이 없다.
 * 변별력 미달로 판정되면 신호 자체를 드롭한다 (goal Open Questions — 카드는 viable 신호 ≥ 2 로 성립).
 */
export const PLAN_MARKERS = [ // 잠정값 — 실측 보정 전
  '계획부터', '계획 세워', '계획을 먼저', '계획 먼저',
  '어떻게 할지', '어떻게 접근', '방향부터', '방향 잡', '설계부터', '진행하기 전에',
  'plan first', 'make a plan', "let's plan", 'before you start', 'step by step', 'approach first',
]

/** 잠정값 — 계획 요청은 메시지 끝에 자주 와서 RETRY(head 30)보다 넓게 스캔한다 */
export const PLAN_MARKER_SCAN_CHARS = 200

// 영어 마커는 단어 경계 검사 — includes 만 쓰면 "floorplan first" 류가 "plan first" 로 오탐.
// 한국어 마커는 조사·어미 결합("방향 잡고"·"계획부터요")을 허용해야 하므로 includes 유지.
// 마커 간 포함 관계가 없어 RETRY 의 길이 내림차순 정렬은 불필요 — 사전 순서가 리턴 우선순위.
const PLAN_MARKERS_COMPILED: { marker: string; re: RegExp | null }[] = PLAN_MARKERS.map((marker) => ({
  marker,
  re: /^[a-z' ]+$/.test(marker)
    ? new RegExp(`(?:^|[^a-z])${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z]|$)`)
    : null,
}))

/** stripMarkup → trim → lower → head PLAN_MARKER_SCAN_CHARS 에서 매칭 마커 리턴 (matchRetryMarker 패턴) */
export function matchPlanMarker(text: string): string | null {
  const head = stripMarkup(text).trim().toLowerCase().slice(0, PLAN_MARKER_SCAN_CHARS)
  for (const { marker, re } of PLAN_MARKERS_COMPILED) {
    if (re ? re.test(head) : head.includes(marker)) return marker
  }
  return null
}

const MIN_MONTH_SAMPLES = 5          // 유효 월 최소 user 메시지 수 — 저샘플 월 제외 (스펙 §유효 버킷)
// export: GrowthCoaching 상세뷰가 improving 의 A/B/C 분해를 buildGrowth 와 동일 분모/클램프로
// 재현하기 위해 import (하드코딩 방지 — _common.md L-10 congruence). 값·계산 로직 불변.
export const AVG_WORDS_NORMALIZER = 80      // proxy B 정규화 분모 (스펙 §카드 3)
export const UNIQUE_SKILLS_NORMALIZER = 10  // proxy C 정규화 분모 (스펙 §카드 3)

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

const SKILL_COMMAND_RE = /<command-name>\/([^<\s]+)<\/command-name>/g

/**
 * <command-name>/skill</command-name> 태그에서 빌트인 제외 스킬 이름 추출.
 * 등장 순서·중복 보존 — Set 수집(buildGrowth)·횟수 집계(computeStats)·per-day 집계(storyOfDay)가 공유.
 * raw text 기준 (stripMarkup 전) — 태그 자체가 매칭 대상이므로.
 */
export function extractSkillNames(text: string): string[] {
  const out: string[] = []
  for (const match of text.matchAll(SKILL_COMMAND_RE)) {
    const name = match[1]
    if (BUILTIN_COMMANDS.has(name)) continue
    out.push(name)
  }
  return out
}

export function buildGrowth(sessions: Session[]): Stats['growth'] {
  interface MonthBucket {
    totalWords: number
    count: number
    structuredCount: number
    skills: Set<string>
    hasClaudeSession: boolean
    days: Set<string>          // distinct UTC 일 키 — activeDays (부분 달 eligibility 판정용)
  }
  const buckets = new Map<string, MonthBucket>()
  let totalFollowups = 0
  let retryCount = 0
  const markerCounts: Record<string, number> = {}

  for (const session of sessions) {
    // 세션 경계 안전성 — 이전 세션이 assistant 로 끝나도 다음 세션 첫 user 가 follow-up 으로 오인되지 않게
    let prevRole: 'user' | 'assistant' | null = null

    for (const msg of session.messages) {
      if (msg.role === 'user') {
        const month = toMonthKey(msg.timestamp)
        if (month) {
          let bucket = buckets.get(month)
          if (!bucket) {
            bucket = { totalWords: 0, count: 0, structuredCount: 0, skills: new Set(), hasClaudeSession: false, days: new Set() }
            buckets.set(month, bucket)
          }
          bucket.totalWords += countWords(msg.text)
          bucket.count++
          const day = toDayKey(msg.timestamp)
          if (day) bucket.days.add(day)
          if (isStructured(msg.text)) bucket.structuredCount++
          if (session.source === 'claude') {
            bucket.hasClaudeSession = true
            // <command-name> 태그는 Claude 세션에만 존재 — proxy C 는 Claude 전용 (raw text 기준, stripMarkup 전)
            for (const name of extractSkillNames(msg.text)) bucket.skills.add(name)
          }
        }

        if (prevRole === 'assistant') {
          totalFollowups++
          const marker = matchRetryMarker(msg.text)
          if (marker) {
            retryCount++
            markerCounts[marker] = (markerCounts[marker] || 0) + 1
          }
        }
      }
      prevRole = msg.role
    }
  }

  const validMonths = [...buckets.entries()]
    .filter(([, bucket]) => bucket.count >= MIN_MONTH_SAMPLES)
    .sort((a, b) => a[0].localeCompare(b[0]))

  const monthlyComplexity = validMonths.map(([month, bucket]) => ({
    month,
    avgWords: bucket.totalWords / bucket.count,
    count: bucket.count,
  }))

  const skillCurve = validMonths.map(([month, bucket]) => {
    const avgWords = bucket.totalWords / bucket.count
    const structured = bucket.structuredCount / bucket.count        // proxy A (0~1)
    const normalizedB = clamp01(avgWords / AVG_WORDS_NORMALIZER)    // proxy B
    const normalizedC = clamp01(bucket.skills.size / UNIQUE_SKILLS_NORMALIZER)  // proxy C
    // source-aware 평균 — Codex-only 월은 C 제외 (곡선 0 붕괴 방지)
    const score = bucket.hasClaudeSession
      ? (structured + normalizedB + normalizedC) / 3
      : (structured + normalizedB) / 2
    return {
      month,
      score,
      structured,
      avgWords,
      uniqueSkills: bucket.skills.size,
      hasClaudeSession: bucket.hasClaudeSession,
      count: bucket.count,
      activeDays: bucket.days.size,
    }
  })

  const topMarkers = Object.entries(markerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3) as [string, number][]

  return {
    monthlyComplexity,
    skillCurve,
    retryStats: {
      totalFollowups,
      retryCount,
      retryRate: totalFollowups > 0 ? retryCount / totalFollowups : 0,
      topMarkers,
    },
  }
}

export function computeStats(sessions: Session[]): Stats {
  const hourlyActivity = new Array(24).fill(0)
  const dailyActivity: Record<string, number> = {}
  const dailyTokens: Record<string, number> = {}
  const modelsUsed: Record<string, number> = {}
  const toolsUsed: Record<string, number> = {}
  const userWordCount: Record<string, number> = {}
  const assistantWordCount: Record<string, number> = {}
  const skillCount: Record<string, number> = {}
  let totalMessages = 0

  for (const session of sessions) {
    if (session.model) {
      modelsUsed[session.model] = (modelsUsed[session.model] || 0) + 1
    }

    for (const msg of session.messages) {
      totalMessages++

      const dayKey = toDayKey(msg.timestamp)
      if (msg.timestamp && dayKey) {
        const date = new Date(msg.timestamp)
        hourlyActivity[date.getHours()]++
        dailyActivity[dayKey] = (dailyActivity[dayKey] || 0) + 1
        if (msg.tokens) {
          const msgTokenTotal = msg.tokens.input + msg.tokens.output + (msg.tokens.cachedInput || 0)
          dailyTokens[dayKey] = (dailyTokens[dayKey] || 0) + msgTokenTotal
        }
      }

      for (const tool of msg.toolUses) {
        toolsUsed[tool] = (toolsUsed[tool] || 0) + 1
      }

      const wc = msg.role === 'user' ? userWordCount : assistantWordCount
      const words = msg.text.toLowerCase().match(/[a-z가-힣]+/g) || []
      for (const w of words) {
        if (w.length < 2 || STOP_WORDS.has(w)) continue
        wc[w] = (wc[w] || 0) + 1
      }

      if (msg.role === 'user') {
        for (const name of extractSkillNames(msg.text)) {
          skillCount[name] = (skillCount[name] || 0) + 1
        }
      }
    }
  }

  const toTop30 = (wc: Record<string, number>) =>
    Object.entries(wc).sort((a, b) => b[1] - a[1]).slice(0, 30)

  const allWordCount: Record<string, number> = {}
  for (const [w, c] of Object.entries(userWordCount)) allWordCount[w] = (allWordCount[w] || 0) + c
  for (const [w, c] of Object.entries(assistantWordCount)) allWordCount[w] = (allWordCount[w] || 0) + c

  const topWords = toTop30(allWordCount)
  const topWordsUser = toTop30(userWordCount)
  const topWordsAssistant = toTop30(assistantWordCount)

  const topSkills = Object.entries(skillCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  const SESSION_BUCKETS: [string, number, number][] = [
    ['1-5턴', 1, 5],
    ['6-20턴', 6, 20],
    ['21-50턴', 21, 50],
    ['51턴+', 51, Infinity],
  ]
  const sessionLengthCount: Record<string, number> = {}
  for (const session of sessions) {
    const n = session.messages.filter((m) => m.role === 'user').length
    const bucket = SESSION_BUCKETS.find(([, lo, hi]) => n >= lo && n <= hi)
    if (bucket) sessionLengthCount[bucket[0]] = (sessionLengthCount[bucket[0]] || 0) + 1
  }
  const sessionLengthDist = SESSION_BUCKETS
    .map(([label]) => [label, sessionLengthCount[label] || 0] as [string, number])
    .filter(([, v]) => v > 0)

  const totalTokens = sessions.reduce(
    (acc, s) => ({
      input: acc.input + s.totalTokens.input,
      output: acc.output + s.totalTokens.output,
      cachedInput: (acc.cachedInput || 0) + (s.totalTokens.cachedInput || 0),
      cacheWriteInput: (acc.cacheWriteInput || 0) + (s.totalTokens.cacheWriteInput || 0),
    }),
    { input: 0, output: 0, cachedInput: 0, cacheWriteInput: 0 } satisfies TokenUsage
  )

  const busiestDay = Object.entries(dailyActivity).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  const busiestTokenDay = Object.entries(dailyTokens).sort((a, b) => b[1] - a[1])[0]?.[0] || ''

  const longestSession = sessions.reduce<Session | null>((longest, s) => {
    if (!longest) return s
    return s.messages.length > longest.messages.length ? s : longest
  }, null)

  return {
    totalSessions: sessions.length,
    totalMessages,
    totalTokens,
    avgMessagesPerSession: sessions.length > 0 ? Math.round(totalMessages / sessions.length) : 0,
    modelsUsed,
    toolsUsed,
    hourlyActivity,
    dailyActivity,
    topWords,
    topWordsUser,
    topWordsAssistant,
    topSkills,
    sessionLengthDist,
    longestSession,
    busiestDay,
    dailyTokens,
    busiestTokenDay,
    growth: buildGrowth(sessions),
  }
}
