import type { Session, Stats } from '../types'

export type PersonalityType = 'architect' | 'speedrunner' | 'explorer' | 'nightsage'

export interface PersonalityResult {
  type: PersonalityType
  title: string
  subtitle: string
  description: string
  emoji: string
  scores: Record<PersonalityType, number>
}

const PERSONALITIES: Record<PersonalityType, { title: string; subtitle: string; description: string; emoji: string }> = {
  architect: {
    title: 'The Architect',
    subtitle: '설계자',
    description: '코드를 읽고 이해한 후에 움직이는 타입. 신중하고 깊이 있는 접근을 선호합니다.',
    emoji: '🏗️',
  },
  speedrunner: {
    title: 'The Speed Runner',
    subtitle: '스피드 러너',
    description: '빠르게 시도하고, 빠르게 반복하는 타입. 효율적인 실행력이 강점입니다.',
    emoji: '⚡',
  },
  explorer: {
    title: 'The Explorer',
    subtitle: '탐험가',
    description: '새로운 것을 시도하고 배우는 것을 즐기는 타입. 다양한 도구와 모델을 활용합니다.',
    emoji: '🌍',
  },
  nightsage: {
    title: 'The Night Sage',
    subtitle: '밤의 현자',
    description: '고요한 밤에 깊이 있는 작업을 하는 타입. 집중력과 끈기가 돋보입니다.',
    emoji: '🌙',
  },
}

export function computePersonality(sessions: Session[], stats: Stats): PersonalityResult {
  if (sessions.length === 0) {
    return { type: 'explorer', scores: { architect: 0, speedrunner: 0, explorer: 0, nightsage: 0 }, ...PERSONALITIES.explorer }
  }

  const totalMessages = stats.totalMessages || 1
  const avgMsgsPerSession = totalMessages / sessions.length

  // Tool ratios
  const totalTools = Object.values(stats.toolsUsed).reduce((a, b) => a + b, 0) || 1
  const readRatio = ((stats.toolsUsed['Read'] || 0) + (stats.toolsUsed['Grep'] || 0) + (stats.toolsUsed['Glob'] || 0)) / totalTools
  const writeRatio = ((stats.toolsUsed['Write'] || 0) + (stats.toolsUsed['Edit'] || 0) + (stats.toolsUsed['Bash'] || 0)) / totalTools

  // Session durations
  const durations = sessions
    .map((s) => new Date(s.endTime).getTime() - new Date(s.startTime).getTime())
    .filter((d) => d > 0 && d < 24 * 60 * 60 * 1000)
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
  const maxDuration = Math.max(...durations, 1)

  // Night ratio (22:00 - 05:00)
  const nightHours = stats.hourlyActivity.slice(0, 6).reduce((a, b) => a + b, 0) + stats.hourlyActivity.slice(22).reduce((a, b) => a + b, 0)
  const nightRatio = nightHours / totalMessages

  // Unique tools & projects
  const uniqueTools = Object.keys(stats.toolsUsed).length
  const uniqueProjects = new Set(sessions.map((s) => s.cwd).filter(Boolean)).size
  const modelVariety = Object.keys(stats.modelsUsed).length

  // Normalize
  const norm = (v: number, max: number) => Math.min(v / (max || 1), 1)

  const architect = readRatio * 0.4 + norm(avgMsgsPerSession, 50) * 0.3 + (1 - writeRatio) * 0.3
  const speedrunner = norm(sessions.length, 200) * 0.4 + writeRatio * 0.3 + (1 - norm(avgDuration, maxDuration)) * 0.3
  const explorer = norm(uniqueTools, 15) * 0.4 + norm(uniqueProjects, 10) * 0.3 + norm(modelVariety, 5) * 0.3
  const nightsage = nightRatio * 0.4 + norm(avgDuration, maxDuration) * 0.3 + norm(stats.totalTokens.input + stats.totalTokens.output, 5_000_000) * 0.3

  const scores = { architect, speedrunner, explorer, nightsage }
  const type = (Object.entries(scores) as [PersonalityType, number][]).sort((a, b) => b[1] - a[1])[0][0]

  return { type, scores, ...PERSONALITIES[type] }
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
