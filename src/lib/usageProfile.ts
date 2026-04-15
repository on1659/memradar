import type { Session } from '../types'

export interface UsageCategory {
  id: string
  title: string
  subtitle: string
  emoji: string
  keywords: string[]
}

export interface UsageCategoryScore extends UsageCategory {
  score: number
}

const USAGE_CATEGORIES: UsageCategory[] = [
  {
    id: 'feature',
    title: '만능 빌더',
    subtitle: '기능을 붙이고 형태를 만드는 타입',
    emoji: '🛠️',
    keywords: ['만들', '추가', '구현', '개발', 'implement', 'create', 'build', 'add', 'feature', '기능', '페이지', 'component', '컴포넌트', 'api', 'endpoint', 'route'],
  },
  {
    id: 'debug',
    title: '버그 해결사',
    subtitle: '문제가 보이면 바로 붙잡는 타입',
    emoji: '🚑',
    keywords: ['버그', 'bug', 'fix', '수정', '고쳐', '에러', 'error', '오류', '안됨', '작동', 'broken', 'crash', 'fail', 'issue', 'debug', 'warning', 'undefined', 'null'],
  },
  {
    id: 'refactor',
    title: '리팩터 메이커',
    subtitle: '코드를 다듬고 구조를 정리하는 타입',
    emoji: '🧹',
    keywords: ['리팩터', 'refactor', '정리', 'cleanup', 'clean up', '개선', 'improve', 'optimize', '최적화', 'simplify', 'restructure', '구조', 'rename', 'extract', 'split'],
  },
  {
    id: 'review',
    title: '코드 감정관',
    subtitle: '읽고 분석하고 설명하는 데 강한 타입',
    emoji: '🧐',
    keywords: ['리뷰', 'review', '분석', 'analyze', '확인', 'check', '설명', 'explain', '이해', 'understand', '왜', 'why', 'how', 'what', 'read'],
  },
  {
    id: 'writing',
    title: '문서 메이커',
    subtitle: '글과 문서를 정리해 주는 타입',
    emoji: '✍️',
    keywords: ['문서', 'doc', 'readme', '작성', 'write', '글', 'text', 'blog', 'markdown', '번역', 'translate', '요약', 'summary', 'summarize', 'report', 'email'],
  },
  {
    id: 'design',
    title: 'UI 디렉터',
    subtitle: '디테일과 레이아웃에 민감한 타입',
    emoji: '🎨',
    keywords: ['디자인', 'design', 'ui', 'ux', 'style', 'css', 'tailwind', '레이아웃', 'layout', 'responsive', '색상', 'color', '테마', 'theme', 'animation', 'font'],
  },
  {
    id: 'devops',
    title: '배포 오퍼레이터',
    subtitle: '빌드와 배포를 끝까지 챙기는 타입',
    emoji: '🚀',
    keywords: ['배포', 'deploy', 'ci', 'cd', 'docker', 'build', '빌드', 'npm', 'publish', 'package', 'vercel', 'aws', 'server', 'config', 'env', 'pipeline', 'github', 'action'],
  },
  {
    id: 'data',
    title: '데이터 탐험가',
    subtitle: '데이터 흐름과 구조를 읽는 타입',
    emoji: '🧭',
    keywords: ['데이터', 'data', 'database', 'db', 'sql', 'query', '쿼리', 'csv', 'json', 'parse', 'schema', 'migration', 'model', 'fetch'],
  },
  {
    id: 'test',
    title: '테스트 드라이버',
    subtitle: '통과할 때까지 검증하는 타입',
    emoji: '✅',
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
  if (!category) return '당신의 클로드는 아직 탐색 중이에요'
  return `당신의 클로드는 ${category.title}형`
}
