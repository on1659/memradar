import type { Session } from '../types'

export interface UsageCategory {
  id: string
  title: string
  subtitle: string
  emoji: string
  color: string
}

export interface UsageCategoryScore extends UsageCategory {
  score: number
  sessionCount: number
}

interface CategorySignals {
  phraseStrong: string[]
  tokenStrong: string[]
  tokenWeak: string[]
  negative: string[]
  /** Tool alias keys (§4-1). 매칭은 TOOL_ALIAS 통해 정규화된 이름으로만. */
  toolHints: string[]
}

interface CategoryData extends UsageCategory {
  signals: CategorySignals
}

// 가중치/cap/삭제된 키워드 근거: docs/AI-ROLE-SCORING-REDESIGN.md §6, §7, §8.
// Phase 1 초기값이며 실측 후 조정 대상.
const CATEGORY_DATA: CategoryData[] = [
  {
    id: 'feature',
    title: '풀스택 기획자',
    subtitle: '기능 뚝딱 제조기',
    emoji: '🏭',
    color: 'var(--color-accent, #7c6ff7)',
    signals: {
      phraseStrong: ['구현해줘', '만들어줘', '추가해줘', '새 페이지', '새 기능', 'api 연결'],
      tokenStrong: ['구현', '추가', 'feature', 'component', 'endpoint', 'route'],
      tokenWeak: ['페이지', '기능', 'create'],
      negative: ['에러 원인', '오류', '리뷰'],
      toolHints: ['edit', 'write'],
    },
  },
  {
    id: 'debug',
    title: '버그 헌터',
    subtitle: 'AI 119 신고 전문',
    emoji: '🚨',
    color: 'var(--color-rose, #f472b6)',
    signals: {
      phraseStrong: ['에러 원인', '왜 안돼', '깨져', '실패해', '무한 루프', '렌더링 안', '재현', 'stack trace'],
      tokenStrong: ['버그', 'error', '오류', 'debug', 'broken', 'undefined', 'null', 'exception', 'traceback'],
      tokenWeak: ['warning', 'fail', 'crash', '안됨', 'stacktrace'],
      negative: ['새 기능', '리팩터링', '문서 작성', '중복 제거'],
      toolHints: ['shell', 'read', 'search', 'edit'],
    },
  },
  {
    id: 'refactor',
    title: '리팩터링 전문가',
    subtitle: '못생긴 코드 참을 수 없는 자',
    emoji: '💅',
    color: 'var(--color-cyan, #22d3ee)',
    signals: {
      phraseStrong: ['리팩터링', '구조 정리', '코드 정리', '깔끔하게', '나눠줘', '중복 제거', '쪼개줘', '공통화', '분리해줘', '중복 코드'],
      tokenStrong: ['refactor', 'cleanup', 'simplify', 'extract', 'rename', 'restructure', '중복', '분리'],
      tokenWeak: ['정리', '개선', 'split', '통합', '구조'],
      negative: ['버그', '에러 원인', '새 기능', '고쳐줘', '수정해줘'],
      toolHints: ['edit'],
    },
  },
  {
    id: 'review',
    title: '코드 분석가',
    subtitle: '"이거 왜 이렇게 짰어?" 전문가',
    emoji: '🧐',
    color: 'var(--color-green, #34d399)',
    signals: {
      phraseStrong: ['리뷰해줘', '설명해줘', '분석해줘', '어떻게 동작', '왜 이렇게'],
      tokenStrong: ['review', '분석', '설명', '이해', '확인'],
      tokenWeak: ['analyze'],
      negative: ['구현', '추가', '고쳐', '배포'],
      toolHints: ['read', 'search'],
    },
  },
  {
    id: 'writing',
    title: 'AI 작가',
    subtitle: '글은 AI가 쓰고 이름은 내가 올리고',
    emoji: '✍️',
    color: 'var(--color-amber, #fbbf24)',
    signals: {
      phraseStrong: ['문서 작성', '요약해줘', '번역해줘', 'readme 써줘', '문서로 남겨', '가이드 써', '설명 적어', '릴리스 노트', '문서 정리'],
      tokenStrong: ['문서', 'readme', 'translate', 'summary', 'markdown', 'report', 'changelog', 'docs'],
      tokenWeak: ['작성', 'blog', '가이드'],
      negative: ['에러 원인', '디버그', '테스트 실패', '버그'],
      toolHints: ['write', 'edit'],
    },
  },
  {
    id: 'design',
    title: '아트 디렉터',
    subtitle: '"여기 1px 옮겨" 장인',
    emoji: '🎨',
    color: '#a78bfa',
    signals: {
      phraseStrong: [
        '디자인 바꿔줘',
        'ui 손봐줘',
        '스타일 수정',
        '레이아웃 바꿔줘',
        '반응형',
        '로고 만들어',
        '이미지 생성',
        '무드보드',
        '색감 바꿔',
      ],
      tokenStrong: ['디자인', 'ui', 'ux', 'css', 'layout', 'responsive', 'theme', '브랜딩', '로고', '무드', 'palette'],
      tokenWeak: ['color', 'font', 'spacing', 'style', '이미지', '그래픽', '일러스트'],
      negative: ['빌드', '배포', '테스트 실패'],
      toolHints: ['edit', 'write', 'image_gen'],
    },
  },
  {
    id: 'devops',
    title: '배포 마스터',
    subtitle: 'npm publish 중독자',
    emoji: '🚀',
    color: '#f97316',
    signals: {
      phraseStrong: ['배포해줘', '빌드 깨져', '환경 변수', 'ci 설정', 'github action', '배포 실패', '파이프라인', '컨테이너 띄워'],
      tokenStrong: ['deploy', '배포', 'docker', 'vercel', 'env', 'pipeline', 'workflow', 'kubernetes', 'helm'],
      tokenWeak: ['build', 'aws', 'npm', 'k8s'],
      negative: ['설명만', '리뷰', '문서 작성'],
      toolHints: ['shell', 'edit', 'write'],
    },
  },
  {
    id: 'data',
    title: '데이터 엔지니어',
    subtitle: 'JSON을 금으로 바꾸는 자',
    emoji: '🧙',
    color: '#06b6d4',
    signals: {
      phraseStrong: ['데이터 변환', '쿼리 짜줘', 'json 파싱', 'schema 바꿔줘', 'migration'],
      tokenStrong: ['data', 'database', 'sql', 'query', 'json', 'csv', 'schema'],
      tokenWeak: ['db', 'parse', 'migration'],
      negative: ['디자인', '폰트', '레이아웃'],
      toolHints: ['read', 'edit', 'shell'],
    },
  },
  {
    id: 'test',
    title: 'QA 엔지니어',
    subtitle: '통과할 때까지 테스트하는 집착러',
    emoji: '🧪',
    color: '#22c55e',
    signals: {
      phraseStrong: ['테스트 추가', '테스트 작성', 'e2e 짜줘', 'spec 만들어줘', '재현 케이스'],
      tokenStrong: ['test', 'spec', 'jest', 'playwright', 'e2e', 'unit', 'coverage'],
      tokenWeak: ['mock', 'assert', 'expect'],
      negative: ['배포', '디자인만', '문서'],
      toolHints: ['shell', 'edit', 'write'],
    },
  },
]

function toDisplay({ id, title, subtitle, emoji, color }: CategoryData): UsageCategory {
  return { id, title, subtitle, emoji, color }
}

export const USAGE_CATEGORIES: UsageCategory[] = CATEGORY_DATA.map(toDisplay)

// --- Scoring engine ----------------------------------------------------

function isAsciiOnly(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) return false
  }
  return true
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 영문 순수 토큰은 단어 경계 매칭, 한글/혼합은 substring. §8-2 참고.
function countMatches(text: string, keyword: string): number {
  if (!keyword) return 0
  if (isAsciiOnly(keyword)) {
    const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'g')
    const hits = text.match(pattern)
    return hits ? hits.length : 0
  }
  let count = 0
  let idx = 0
  while (idx <= text.length) {
    const hit = text.indexOf(keyword, idx)
    if (hit === -1) break
    count++
    idx = hit + keyword.length
  }
  return count
}

function sumHits(text: string, keywords: string[]): number {
  let total = 0
  for (const k of keywords) total += countMatches(text, k)
  return total
}

// 메시지 1건의 카테고리 점수 (텍스트만). 3단 가중치 + 그룹 cap (§6-1, §8-3).
function scoreMessageText(text: string, signals: CategorySignals): number {
  const phrase = Math.min(sumHits(text, signals.phraseStrong), 2)
  const strong = Math.min(sumHits(text, signals.tokenStrong), 4)
  const weak = Math.min(sumHits(text, signals.tokenWeak), 5)
  const neg = Math.min(sumHits(text, signals.negative), 3)
  const score = phrase * 4.0 + strong * 2.5 + weak * 1.0 - neg * 2.0
  return score > 0 ? score : 0
}

// --- Tool alias / 보조 가산 (Phase 2, §4-1, §6-2) ----------------------

// provider 별 tool 이름 편차 흡수. 카테고리 toolHints 는 alias 키만 참조.
const TOOL_ALIAS: Record<string, string[]> = {
  edit: ['edit', 'multiedit', 'apply_patch', 'str_replace', 'str_replace_editor'],
  write: ['write', 'create_file'],
  read: ['read', 'view_file', 'view_image'],
  search: ['grep', 'glob', 'ripgrep'],
  shell: ['bash', 'exec_command', 'shell'],
  image_gen: ['image_gen', 'generate_image'],
}

function normalizeToolName(rawName: string): string | null {
  const lower = rawName.toLowerCase()
  for (const alias in TOOL_ALIAS) {
    if (TOOL_ALIAS[alias].includes(lower)) return alias
  }
  return null
}

// 메시지 그룹 toolUse 점수. 하나의 그룹 내 매칭 수에 cap 3. 가중치 1.5.
function scoreGroupTools(toolUses: string[], hints: string[]): number {
  if (hints.length === 0 || toolUses.length === 0) return 0
  let hits = 0
  for (const tool of toolUses) {
    const alias = normalizeToolName(tool)
    if (alias && hints.includes(alias)) hits++
  }
  const capped = Math.min(hits, 3)
  return capped * 1.5
}

// --- Raw analysis (internal) -------------------------------------------

interface RawAnalysis {
  scores: Record<string, number>
  sessionsHit: Record<string, Set<string>>
  matchedByCategory: Record<string, number>
  totalUserMessages: number
  matchedMessages: number
}

function computeRawAnalysis(sessions: Session[]): RawAnalysis {
  const scores: Record<string, number> = {}
  const sessionsHit: Record<string, Set<string>> = {}
  const matchedByCategory: Record<string, number> = {}
  for (const cat of CATEGORY_DATA) {
    scores[cat.id] = 0
    sessionsHit[cat.id] = new Set()
    matchedByCategory[cat.id] = 0
  }

  let totalUserMessages = 0
  let matchedMessages = 0

  for (const session of sessions) {
    const msgs = session.messages
    for (let i = 0; i < msgs.length; i++) {
      const message = msgs[i]
      if (message.role !== 'user') continue
      totalUserMessages++

      // §5 메시지 그룹: user message 이후 첫 assistant message 의 toolUses.
      let groupTools: string[] = []
      for (let j = i + 1; j < msgs.length; j++) {
        if (msgs[j].role === 'assistant') {
          groupTools = msgs[j].toolUses
          break
        }
      }

      const text = message.text.toLowerCase()
      let matchedAny = false
      for (const cat of CATEGORY_DATA) {
        const textScore = scoreMessageText(text, cat.signals)
        const toolBonus = scoreGroupTools(groupTools, cat.signals.toolHints)
        const s = textScore + toolBonus
        if (s > 0) {
          scores[cat.id] += s
          sessionsHit[cat.id].add(session.id)
          matchedByCategory[cat.id]++
          matchedAny = true
        }
      }
      if (matchedAny) matchedMessages++
    }
  }

  return { scores, sessionsHit, matchedByCategory, totalUserMessages, matchedMessages }
}

function buildRankedScores(raw: RawAnalysis, limit: number): UsageCategoryScore[] {
  return CATEGORY_DATA
    .map((cat) => {
      const display = toDisplay(cat)
      return {
        ...display,
        score: raw.scores[cat.id],
        sessionCount: raw.sessionsHit[cat.id].size,
      }
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// --- Public API --------------------------------------------------------

// §11 undecided 임계. 초기값, 실측 후 조정.
const UNDECIDED_MIN_MESSAGES = 4
const UNDECIDED_MIN_MATCHED = 2

function isUndecided(raw: RawAnalysis): boolean {
  if (raw.totalUserMessages < UNDECIDED_MIN_MESSAGES) return true
  if (raw.matchedMessages < UNDECIDED_MIN_MATCHED) return true
  return false
}

export function analyzeUsageTopCategories(sessions: Session[], limit = 3): UsageCategoryScore[] {
  const raw = computeRawAnalysis(sessions)
  if (isUndecided(raw)) return []
  return buildRankedScores(raw, limit)
}

export function getUsageHeadline(category: UsageCategoryScore | null | undefined): string {
  if (!category) return '당신의 AI 활용 스타일은 아직 탐색 중이에요'
  return `가장 자주 보인 역할은 ${category.title} 쪽이에요`
}

// --- Phase 3: mixed role / confidence (experimental) -------------------
// ⚠️ 이 아래의 모든 수치 상수는 **Phase 3 tentative** 이며, 실측 데이터 분포를
// 보기 전까지는 의미 있는 값이 아니다 (docs/AI-ROLE-SCORING-REDESIGN.md §2-2, §15).
// 본 함수는 UI 에 아직 연결되지 않은 상태로 export 만 되어 있으며, 혼합형/confidence
// UX 도입 결정 시점에 값 튜닝과 UI 연동을 함께 진행한다.

// §9 혼합형 threshold
const MIXED_TOP_SHARE_MAX = 0.42
const MIXED_GAP_RATIO_MAX = 0.18

// §10 confidence sigmoid params: f(x) = 1/(1+e^(-slope*(x-midpoint)))
const CONF_COVERAGE = { midpoint: 0.25, slope: 10, weight: 0.35 }
const CONF_TOP_SHARE = { midpoint: 0.38, slope: 12, weight: 0.35 }
const CONF_GAP_RATIO = { midpoint: 0.18, slope: 12, weight: 0.2 }
const CONF_SUPPORT = { midpoint: 6, slope: 0.8, weight: 0.1 }

// §10-3 confidence label cutoffs
const CONFIDENCE_LOW_BAR = 0.45
const CONFIDENCE_MEDIUM_BAR = 0.7

export type UsageConfidence = 'low' | 'medium' | 'high'

export interface UsageRoleAnalysis {
  categories: UsageCategoryScore[]
  undecided: boolean
  mixedRole: boolean
  confidence: UsageConfidence
  totalMessages: number
  matchedMessages: number
}

function sigmoid(x: number, midpoint: number, slope: number): number {
  return 1 / (1 + Math.exp(-slope * (x - midpoint)))
}

function computeMixedRole(categories: UsageCategoryScore[]): boolean {
  if (categories.length < 2) return false
  const [top, second] = categories
  const scoreSum = categories.reduce((sum, c) => sum + c.score, 0)
  if (scoreSum <= 0 || top.score <= 0) return false
  const topShare = top.score / scoreSum
  const gapRatio = (top.score - second.score) / Math.max(top.score, 1)
  return topShare < MIXED_TOP_SHARE_MAX && gapRatio < MIXED_GAP_RATIO_MAX
}

function computeConfidence(raw: RawAnalysis, categories: UsageCategoryScore[]): UsageConfidence {
  if (categories.length === 0) return 'low'
  const top = categories[0]
  const second = categories[1]
  const scoreSum = categories.reduce((sum, c) => sum + c.score, 0)

  const matchedCoverage = raw.totalUserMessages > 0 ? raw.matchedMessages / raw.totalUserMessages : 0
  const topShare = scoreSum > 0 ? top.score / scoreSum : 0
  const gapRatio = second ? (top.score - second.score) / Math.max(top.score, 1) : 1
  const supportMessages = raw.matchedByCategory[top.id] ?? 0

  const index =
    sigmoid(matchedCoverage, CONF_COVERAGE.midpoint, CONF_COVERAGE.slope) * CONF_COVERAGE.weight +
    sigmoid(topShare, CONF_TOP_SHARE.midpoint, CONF_TOP_SHARE.slope) * CONF_TOP_SHARE.weight +
    sigmoid(gapRatio, CONF_GAP_RATIO.midpoint, CONF_GAP_RATIO.slope) * CONF_GAP_RATIO.weight +
    sigmoid(supportMessages, CONF_SUPPORT.midpoint, CONF_SUPPORT.slope) * CONF_SUPPORT.weight

  if (index < CONFIDENCE_LOW_BAR) return 'low'
  if (index < CONFIDENCE_MEDIUM_BAR) return 'medium'
  return 'high'
}

/**
 * Phase 3 통합 분석. 상위 카테고리 외에 혼합형 여부, confidence label, undecided 상태,
 * 카운터를 함께 반환한다. UI 연결 전 단계라 기존 `analyzeUsageTopCategories` 와 병행 존재.
 */
export function analyzeUsageRoles(sessions: Session[], limit = 3): UsageRoleAnalysis {
  const raw = computeRawAnalysis(sessions)
  const undecided = isUndecided(raw)
  const categories = undecided ? [] : buildRankedScores(raw, limit)
  return {
    categories,
    undecided,
    mixedRole: computeMixedRole(categories),
    confidence: computeConfidence(raw, categories),
    totalMessages: raw.totalUserMessages,
    matchedMessages: raw.matchedMessages,
  }
}
