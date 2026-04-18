import type { Session, Stats } from '../types'

// --- 3-axis system ---
// Axis 1: Work Style  — Reader (R) vs Executor (E)
// Axis 2: Scope       — Deep (D) vs Wide (W)
// Axis 3: Rhythm      — Marathon (M) vs Sprint (S)

export type AxisKey = 'style' | 'scope' | 'rhythm'
export type TypeCode = 'RDM' | 'RDS' | 'RWM' | 'RWS' | 'EDM' | 'EDS' | 'EWM' | 'EWS'

export interface AxisScore {
  label: [string, string] // [left label, right label]
  value: number           // 0..1, <0.5 = left, >=0.5 = right
}

export interface PersonalityResult {
  type: TypeCode
  title: string
  subtitle: string
  description: string
  emoji: string
  shareQuote: string
  strengths: string
  caution: string
  axes: Record<AxisKey, AxisScore>
}

interface TypeDef {
  title: string
  subtitle: string
  emoji: string
  description: string
  shareQuote: string
  strengths: string
  caution: string
}

/** Sigmoid normalization: maps value to 0~1 range centered at midpoint */
function sigmoid(x: number, midpoint: number, steepness: number): number {
  if (!Number.isFinite(x)) return 0.5
  return 1 / (1 + Math.exp(-steepness * (x - midpoint)))
}

/** Extract project root from cwd by finding the deepest git-like boundary */
function extractProject(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  // On Windows: C:/Users/alice/source/repos/foo → need at least 5-6 depth
  // On Unix: /home/alice/projects/foo → need 4 depth
  // Use min(parts.length, 6) to cover both cases without collapsing siblings
  return parts.slice(0, Math.min(parts.length, 6)).join('/')
}

/** Compute median of a numeric array */
function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const TYPE_DEFS: Record<TypeCode, TypeDef> = {
  RDM: {
    title: '심해 잠수부',
    subtitle: 'Deep Diver',
    emoji: '🤿',
    description: '코드의 깊은 곳까지 잠수해서 진짜 원인을 찾아내는 타입. 한번 파고들면 끝을 봅니다.',
    shareQuote: '나는 AI랑 코딩할 때 심해 잠수부 타입이래',
    strengths: '근본 원인 추적, 아키텍처 이해',
    caution: '시작이 느릴 수 있어요',
  },
  RDS: {
    title: '코드 감별사',
    subtitle: 'Code Appraiser',
    emoji: '🔎',
    description: '빠르게 코드를 읽고 핵심을 짚어내는 타입. 리뷰의 신이라 불립니다.',
    shareQuote: '나는 AI랑 코딩할 때 코드 감별사 타입이래',
    strengths: '코드 리뷰, 빠른 판단력',
    caution: '직접 만드는 건 미룰 수 있어요',
  },
  RWM: {
    title: '도서관 사서',
    subtitle: 'Librarian',
    emoji: '📚',
    description: '넓은 범위를 꼼꼼히 살피며 전체 그림을 그리는 타입. 놓치는 게 없습니다.',
    shareQuote: '나는 AI랑 코딩할 때 도서관 사서 타입이래',
    strengths: '전체 파악, 문서화, 기술 조사',
    caution: '완벽주의에 빠질 수 있어요',
  },
  RWS: {
    title: '트렌드 헌터',
    subtitle: 'Trend Hunter',
    emoji: '🏄',
    description: '새로운 기술을 빠르게 훑어보고 적용하는 타입. 항상 최신을 쫓습니다.',
    shareQuote: '나는 AI랑 코딩할 때 트렌드 헌터 타입이래',
    strengths: '최신 기술 도입, PoC',
    caution: '깊이가 부족할 수 있어요',
  },
  EDM: {
    title: '장인 대장장이',
    subtitle: 'Master Smith',
    emoji: '⚒️',
    description: '한 프로젝트에 몰두해서 완성도 높은 결과물을 만드는 타입. 묵묵한 장인입니다.',
    shareQuote: '나는 AI랑 코딩할 때 장인 대장장이 타입이래',
    strengths: '높은 완성도, 깊은 전문성',
    caution: '다른 방법을 놓칠 수 있어요',
  },
  EDS: {
    title: '번개 해결사',
    subtitle: 'Lightning Fixer',
    emoji: '⚡',
    description: '문제가 보이면 바로 뚝딱 해치우는 타입. 생산성 괴물이라 불립니다.',
    shareQuote: '나는 AI랑 코딩할 때 번개 해결사 타입이래',
    strengths: '빠른 실행력, 문제 해결',
    caution: '기술 부채에 주의하세요',
  },
  EWM: {
    title: '만능 빌더',
    subtitle: 'All-round Builder',
    emoji: '🏗️',
    description: '이것도 만들고 저것도 만드는 끝없는 에너지. 풀스택의 화신입니다.',
    shareQuote: '나는 AI랑 코딩할 때 만능 빌더 타입이래',
    strengths: '풀스택 능력, 멀티태스킹',
    caution: '체력 관리가 필요해요',
  },
  EWS: {
    title: '카오스 크리에이터',
    subtitle: 'Chaos Creator',
    emoji: '🌪️',
    description: '동시다발 실험! 정신없지만 결국 뭔가 나오는 타입. 해커톤의 왕입니다.',
    shareQuote: '나는 AI랑 코딩할 때 카오스 크리에이터 타입이래',
    strengths: '아이디어 폭발, 빠른 프로토타이핑',
    caution: '마무리를 놓치지 마세요',
  },
}

export function computePersonality(sessions: Session[], stats: Stats): PersonalityResult {
  const defaultAxes: Record<AxisKey, AxisScore> = {
    style: { label: ['탐험가', '설계자'], value: 0.5 },
    scope: { label: ['한우물', '유목민'], value: 0.5 },
    rhythm: { label: ['스프린터', '마라토너'], value: 0.5 },
  }

  if (sessions.length === 0 || stats.totalMessages < 3) {
    return { type: 'EWS', axes: defaultAxes, ...TYPE_DEFS.EWS }
  }

  // Sort sessions chronologically (app/CLI may pass them in arbitrary order)
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  )

  // ═══ Axis 1: Conversation Style — 설계자(A) vs 탐험가(E) ═══
  // Measures user's conversation pattern, NOT AI tool usage

  const userMessages = sorted.flatMap((s) =>
    s.messages.filter((m) => m.role === 'user'),
  )
  const avgMsgLen = userMessages.length > 0
    ? userMessages.reduce((sum, m) => sum + m.text.length, 0) / userMessages.length
    : 100

  const turnsPerSession = sorted.length > 0
    ? sorted.reduce((sum, s) => sum + s.messageCount.user, 0) / sorted.length
    : 8

  const tokenRatio = stats.totalTokens.input > 0
    ? stats.totalTokens.output / stats.totalTokens.input
    : 5

  const styleValue =
    sigmoid(avgMsgLen, 100, 0.02) * 0.4 +          // longer msg → Architect
    (1 - sigmoid(turnsPerSession, 8, 0.2)) * 0.3 +  // fewer turns → Architect
    sigmoid(tokenRatio, 5, 0.3) * 0.3               // higher AI output → Architect

  // ═══ Axis 2: Work Scope — 한우물(D) vs 유목민(W) ═══
  // Measures project diversity from cwd, NOT tool diversity

  const projectIds = sorted
    .map((s) => (s.cwd ? extractProject(s.cwd) : ''))
    .filter(Boolean)
  const uniqueProjects = new Set(projectIds)

  const firstTime = new Date(sorted[0].startTime).getTime()
  const lastTime = new Date(sorted[sorted.length - 1].endTime).getTime()
  const activeWeeks = Math.max((lastTime - firstTime) / (7 * 24 * 3600000), 1)
  const projectsPerWeek = uniqueProjects.size / activeWeeks

  let switchCount = 0
  for (let i = 1; i < projectIds.length; i++) {
    if (projectIds[i] !== projectIds[i - 1]) switchCount++
  }
  const switchRate = projectIds.length > 1
    ? switchCount / (projectIds.length - 1)
    : 0

  const projectCounts: Record<string, number> = {}
  for (const pid of projectIds) projectCounts[pid] = (projectCounts[pid] || 0) + 1
  const topProjectShare = projectIds.length > 0
    ? Math.max(...Object.values(projectCounts)) / projectIds.length
    : 1

  const scopeValue =
    sigmoid(projectsPerWeek, 2.5, 0.8) * 0.4 +      // more projects → Wide
    sigmoid(switchRate, 0.3, 5) * 0.4 +              // more switching → Wide
    (1 - sigmoid(topProjectShare, 0.6, 5)) * 0.2     // less concentrated → Wide

  // ═══ Axis 3: Work Rhythm — 마라토너(M) vs 스프린터(S) ═══
  // Measures session duration patterns + time concentration

  const durations = sorted
    .map((s) => (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000)
    .filter((d) => d > 0 && d < 1440)
  const medianDuration = median(durations)

  // Shannon entropy of hourly activity distribution
  const hours = stats.hourlyActivity
  const totalActivity = hours.reduce((a, b) => a + b, 0)
  let hourlyEntropy = 0
  if (totalActivity > 0) {
    for (const h of hours) {
      if (h > 0) {
        const p = h / totalActivity
        hourlyEntropy -= p * Math.log2(p)
      }
    }
  }
  const concentration = totalActivity > 0
    ? 1 - (hourlyEntropy / Math.log2(24))
    : 0.5

  // Session type ratio: Quick(<20min) vs Deep(>=60min)
  const quickCount = durations.filter((d) => d < 20).length
  const deepCount = durations.filter((d) => d >= 60).length
  const sessionTypeScore = (quickCount + deepCount) > 0
    ? deepCount / (quickCount + deepCount)
    : 0.5

  const rhythmValue =
    sigmoid(medianDuration, 45, 0.06) * 0.4 +       // longer median → Marathon
    sigmoid(concentration, 0.5, 4) * 0.3 +           // more concentrated → Marathon
    sigmoid(sessionTypeScore, 0.5, 4) * 0.3          // more Deep sessions → Marathon

  // ═══ Derive type code ═══
  const axes: Record<AxisKey, AxisScore> = {
    style: { label: ['탐험가', '설계자'], value: styleValue },
    scope: { label: ['한우물', '유목민'], value: scopeValue },
    rhythm: { label: ['스프린터', '마라토너'], value: rhythmValue },
  }

  // TypeCode mapping (strings unchanged for backward compat)
  // E = Architect(설계자), R = Explorer(탐험가)
  const s = styleValue >= 0.5 ? 'E' : 'R'
  const d = scopeValue >= 0.5 ? 'W' : 'D'
  const r = rhythmValue >= 0.5 ? 'M' : 'S'
  const type = `${s}${d}${r}` as TypeCode

  return { type, axes, ...TYPE_DEFS[type] }
}

export function getCodingTimeLabel(stats: Stats): { label: string; emoji: string } {
  const hours = stats.hourlyActivity
  const peak = hours.indexOf(Math.max(...hours))

  if (peak >= 2 && peak < 6) return { label: 'Night Owl', emoji: '🦉' }
  if (peak >= 6 && peak < 10) return { label: 'Early Bird', emoji: '🐦' }
  if (peak >= 10 && peak < 14) return { label: 'Morning Warrior', emoji: '☀️' }
  if (peak >= 14 && peak < 18) return { label: 'Afternoon Warrior', emoji: '⚔️' }
  if (peak >= 18 && peak < 22) return { label: 'Evening Coder', emoji: '🌆' }
  return { label: 'Moonlight Coder', emoji: '🌙' }
}

export function getModelLabel(model: string): string {
  if (model.includes('opus')) return '깊이를 추구하는 사색가'
  if (model.includes('sonnet')) return '효율과 균형의 달인'
  if (model.includes('haiku')) return '속도를 사랑하는 스프린터'
  return '다재다능한 코더'
}
