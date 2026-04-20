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
      negative: ['원인', '왜', '에러', '오류', '리뷰'],
    },
  },
  {
    id: 'debug',
    title: '버그 헌터',
    subtitle: 'AI 119 신고 전문',
    emoji: '🚨',
    color: 'var(--color-rose, #f472b6)',
    signals: {
      phraseStrong: ['에러 원인', '왜 안돼', '깨져', '고쳐줘', '수정해줘', '실패해'],
      tokenStrong: ['버그', 'error', '오류', 'fix', 'debug', 'broken', 'undefined', 'null'],
      tokenWeak: ['warning', 'fail', 'crash', '안됨'],
      negative: ['새 기능', '리팩터링', '문서'],
    },
  },
  {
    id: 'refactor',
    title: '리팩터링 전문가',
    subtitle: '못생긴 코드 참을 수 없는 자',
    emoji: '💅',
    color: 'var(--color-cyan, #22d3ee)',
    signals: {
      phraseStrong: ['리팩터링', '구조 정리', '코드 정리', '깔끔하게', '나눠줘'],
      tokenStrong: ['refactor', 'cleanup', 'simplify', 'extract', 'rename', 'restructure'],
      tokenWeak: ['정리', '개선', 'split'],
      negative: ['버그', '에러 원인', '새 기능'],
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
    },
  },
  {
    id: 'writing',
    title: 'AI 작가',
    subtitle: '글은 AI가 쓰고 이름은 내가 올리고',
    emoji: '✍️',
    color: 'var(--color-amber, #fbbf24)',
    signals: {
      phraseStrong: ['문서 작성', '정리해줘', '요약해줘', '번역해줘', 'readme 써줘'],
      tokenStrong: ['문서', 'readme', 'translate', 'summary', 'markdown', 'report'],
      tokenWeak: ['작성', 'blog'],
      negative: ['에러', '디버그', '테스트 실패'],
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
    },
  },
  {
    id: 'devops',
    title: '배포 마스터',
    subtitle: 'npm publish 중독자',
    emoji: '🚀',
    color: '#f97316',
    signals: {
      phraseStrong: ['배포해줘', '빌드 깨져', '환경 변수', 'ci 설정', 'github action'],
      tokenStrong: ['deploy', '배포', 'docker', 'vercel', 'env', 'pipeline', 'workflow'],
      tokenWeak: ['build', 'aws', 'npm'],
      negative: ['설명만', '리뷰', '문서'],
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

// 메시지 1건의 카테고리 점수. 3단 가중치 + 그룹 cap (§6-1, §8-3).
function scoreMessage(text: string, signals: CategorySignals): number {
  const phrase = Math.min(sumHits(text, signals.phraseStrong), 2)
  const strong = Math.min(sumHits(text, signals.tokenStrong), 4)
  const weak = Math.min(sumHits(text, signals.tokenWeak), 5)
  const neg = Math.min(sumHits(text, signals.negative), 3)
  const score = phrase * 4.0 + strong * 2.5 + weak * 1.0 - neg * 2.0
  return score > 0 ? score : 0
}

// --- Public API --------------------------------------------------------

export function analyzeUsageTopCategories(sessions: Session[], limit = 3): UsageCategoryScore[] {
  const scores: Record<string, number> = {}
  const sessionsHit: Record<string, Set<string>> = {}
  for (const cat of CATEGORY_DATA) {
    scores[cat.id] = 0
    sessionsHit[cat.id] = new Set()
  }

  for (const session of sessions) {
    for (const message of session.messages) {
      if (message.role !== 'user') continue
      const text = message.text.toLowerCase()
      for (const cat of CATEGORY_DATA) {
        const s = scoreMessage(text, cat.signals)
        if (s > 0) {
          scores[cat.id] += s
          sessionsHit[cat.id].add(session.id)
        }
      }
    }
  }

  return CATEGORY_DATA
    .map((cat) => {
      const display = toDisplay(cat)
      return {
        ...display,
        score: scores[cat.id],
        sessionCount: sessionsHit[cat.id].size,
      }
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function getUsageHeadline(category: UsageCategoryScore | null | undefined): string {
  if (!category) return '당신의 AI 활용 스타일은 아직 탐색 중이에요'
  return `가장 자주 보인 역할은 ${category.title} 쪽이에요`
}
