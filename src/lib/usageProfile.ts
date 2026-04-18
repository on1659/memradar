import type { Session } from '../types'

export interface UsageCategory {
  id: string
  title: string
  subtitle: string
  emoji: string
  keywords: string[]
  color: string
}

export interface UsageCategoryScore extends UsageCategory {
  score: number
}

export const USAGE_CATEGORIES: UsageCategory[] = [
  {
    id: 'feature',
    title: '풀스택 기획자',
    subtitle: '기능 뚝딱 제조기',
    emoji: '🏭',
    color: 'var(--color-accent, #7c6ff7)',
    keywords: ['만들', '추가', '구현', '개발', 'implement', 'create', 'build', 'add', 'feature', '기능', '페이지', 'component', '컴포넌트', 'api', 'endpoint', 'route'],
  },
  {
    id: 'debug',
    title: '버그 헌터',
    subtitle: 'AI 119 신고 전문',
    emoji: '🚨',
    color: 'var(--color-rose, #f472b6)',
    keywords: ['버그', 'bug', 'fix', '수정', '고쳐', '에러', 'error', '오류', '안됨', '작동', 'broken', 'crash', 'fail', 'issue', 'debug', 'warning', 'undefined', 'null'],
  },
  {
    id: 'refactor',
    title: '코드 성형외과',
    subtitle: '못생긴 코드 참을 수 없는 자',
    emoji: '💅',
    color: 'var(--color-cyan, #22d3ee)',
    keywords: ['리팩터', 'refactor', '정리', 'cleanup', 'clean up', '개선', 'improve', 'optimize', '최적화', 'simplify', 'restructure', '구조', 'rename', 'extract', 'split'],
  },
  {
    id: 'review',
    title: '코드 감정사',
    subtitle: '"이거 왜 이렇게 짰어?" 전문가',
    emoji: '🧐',
    color: 'var(--color-green, #34d399)',
    keywords: ['리뷰', 'review', '분석', 'analyze', '확인', 'check', '설명', 'explain', '이해', 'understand', '왜', 'why', 'how', 'what', 'read'],
  },
  {
    id: 'writing',
    title: 'AI 고스트라이터',
    subtitle: '글은 AI가 쓰고 이름은 내가 올리고',
    emoji: '✍️',
    color: 'var(--color-amber, #fbbf24)',
    keywords: ['문서', 'doc', 'readme', '작성', 'write', '글', 'text', 'blog', 'markdown', '번역', 'translate', '요약', 'summary', 'summarize', 'report', 'email'],
  },
  {
    id: 'design',
    title: 'AI 아트 디렉터',
    subtitle: '"여기 1px 옮겨" 장인',
    emoji: '🎨',
    color: '#a78bfa',
    keywords: ['디자인', 'design', 'ui', 'ux', 'style', 'css', 'tailwind', '레이아웃', 'layout', 'responsive', '색상', 'color', '테마', 'theme', 'animation', 'font'],
  },
  {
    id: 'devops',
    title: '배포 마스터',
    subtitle: 'npm publish 중독자',
    emoji: '🚀',
    color: '#f97316',
    keywords: ['배포', 'deploy', 'ci', 'cd', 'docker', 'build', '빌드', 'npm', 'publish', 'package', 'vercel', 'aws', 'server', 'config', 'env', 'pipeline', 'github', 'action'],
  },
  {
    id: 'data',
    title: '데이터 연금술사',
    subtitle: 'JSON을 금으로 바꾸는 자',
    emoji: '🧙',
    color: '#06b6d4',
    keywords: ['데이터', 'data', 'database', 'db', 'sql', 'query', '쿼리', 'csv', 'json', 'parse', 'schema', 'migration', 'model', 'fetch'],
  },
  {
    id: 'test',
    title: '품질 감독관',
    subtitle: '통과할 때까지 테스트하는 집착러',
    emoji: '🧪',
    color: '#22c55e',
    keywords: ['테스트', 'test', 'spec', 'jest', 'playwright', 'e2e', 'unit', 'mock', 'assert', 'expect', 'coverage'],
  },
]

export function analyzeUsageTopCategories(sessions: Session[], limit = 3): UsageCategoryScore[] {
  const scores: Record<string, number> = {}
  for (const category of USAGE_CATEGORIES) scores[category.id] = 0

  for (const session of sessions) {
    for (const message of session.messages) {
      if (message.role !== 'user') continue
      const text = message.text.toLowerCase()

      for (const category of USAGE_CATEGORIES) {
        for (const keyword of category.keywords) {
          if (text.includes(keyword)) {
            scores[category.id]++
            break
          }
        }
      }
    }
  }

  return USAGE_CATEGORIES
    .map((category) => ({ ...category, score: scores[category.id] }))
    .filter((category) => category.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function getUsageHeadline(category: UsageCategoryScore | null | undefined): string {
  if (!category) return '당신의 AI 활용 스타일은 아직 탐색 중이에요'
  if (category.id === 'feature') return '아이디어를 기능으로 연결하는 빌더형'
  return `당신의 AI 활용 스타일은 ${category.title}형`
}
