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
    style: { label: ['읽기형', '실행형'], value: 0.5 },
    scope: { label: ['깊이파', '넓이파'], value: 0.5 },
    rhythm: { label: ['마라토너', '스프린터'], value: 0.5 },
  }

  if (sessions.length === 0) {
    return { type: 'EWS', axes: defaultAxes, ...TYPE_DEFS.EWS }
  }

  const totalTools = Object.values(stats.toolsUsed).reduce((a, b) => a + b, 0) || 1
  const readTools = (stats.toolsUsed['Read'] || 0) + (stats.toolsUsed['Grep'] || 0) + (stats.toolsUsed['Glob'] || 0)
  const writeTools = (stats.toolsUsed['Write'] || 0) + (stats.toolsUsed['Edit'] || 0) + (stats.toolsUsed['Bash'] || 0)
  const readRatio = readTools / totalTools
  const writeRatio = writeTools / totalTools

  // Axis 1: Style — Reader vs Executor
  // 0 = pure reader, 1 = pure executor
  const styleRaw = writeRatio / (readRatio + writeRatio || 1)
  const styleValue = Math.max(0, Math.min(1, styleRaw))

  // Axis 2: Scope — Deep vs Wide
  const uniqueTools = Object.keys(stats.toolsUsed).length
  const uniqueProjects = new Set(sessions.map((s) => s.cwd).filter(Boolean)).size
  const modelVariety = Object.keys(stats.modelsUsed).length
  const diversityScore = (
    Math.min(uniqueTools / 10, 1) * 0.4 +
    Math.min(uniqueProjects / 5, 1) * 0.3 +
    Math.min(modelVariety / 4, 1) * 0.3
  )
  const scopeValue = Math.max(0, Math.min(1, diversityScore))

  // Axis 3: Rhythm — Marathon vs Sprint
  const durations = sessions
    .map((s) => new Date(s.endTime).getTime() - new Date(s.startTime).getTime())
    .filter((d) => d > 0 && d < 24 * 60 * 60 * 1000)
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
  const avgDurationMins = avgDuration / 60000
  // Short & frequent = sprint, Long & steady = marathon
  // >30min avg = marathon territory, <10min = sprint territory
  const marathonScore = Math.min(avgDurationMins / 30, 1)
  const rhythmValue = 1 - Math.max(0, Math.min(1, marathonScore)) // 0=marathon, 1=sprint

  const axes: Record<AxisKey, AxisScore> = {
    style: { label: ['읽기형', '실행형'], value: styleValue },
    scope: { label: ['깊이파', '넓이파'], value: scopeValue },
    rhythm: { label: ['마라토너', '스프린터'], value: rhythmValue },
  }

  // Derive type code
  const s = styleValue >= 0.5 ? 'E' : 'R'
  const d = scopeValue >= 0.5 ? 'W' : 'D'
  const r = rhythmValue >= 0.5 ? 'S' : 'M'
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
