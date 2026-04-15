import { useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { Session } from '../types'
import { computeStats } from '../parser'
import { computePersonality } from '../lib/personality'
import type { PersonalityResult, TypeCode, AxisKey } from '../lib/personality'

interface Props {
  sessions: Session[]
  onBack: () => void
}

const ALL_TYPES: TypeCode[] = ['RDM', 'RDS', 'RWM', 'RWS', 'EDM', 'EDS', 'EWM', 'EWS']

const AXIS_LABELS: Record<string, [string, string]> = {
  R: ['읽기형', 'Reader'],
  E: ['실행형', 'Executor'],
  D: ['깊이파', 'Deep'],
  W: ['넓이파', 'Wide'],
  M: ['마라토너', 'Marathon'],
  S: ['스프린터', 'Sprint'],
}

// --- Usage category analysis ---
interface UsageCategory {
  id: string
  title: string
  subtitle: string
  emoji: string
  keywords: string[]
  color: string
}

const USAGE_CATEGORIES: UsageCategory[] = [
  {
    id: 'feature',
    title: '풀스택 기획자',
    subtitle: '기능 뚝딱 제조기',
    emoji: '🏭',
    keywords: ['만들어', '추가', '구현', '개발', 'implement', 'create', 'build', 'add', 'feature', '기능', '페이지', 'component', '컴포넌트', 'api', '엔드포인트', 'endpoint', 'route', '라우트'],
    color: 'var(--color-accent)',
  },
  {
    id: 'debug',
    title: '버그 헌터',
    subtitle: 'AI 119 신고 전문',
    emoji: '🚨',
    keywords: ['버그', 'bug', 'fix', '수정', '고쳐', '에러', 'error', '오류', '안돼', '안됨', '작동', 'broken', 'crash', 'fail', '실패', 'issue', 'debug', '디버그', 'warning', '경고', 'undefined', 'null'],
    color: 'var(--color-rose)',
  },
  {
    id: 'refactor',
    title: '코드 성형외과',
    subtitle: '못생긴 코드 참을 수 없는 자',
    emoji: '💅',
    keywords: ['리팩토', 'refactor', '정리', 'cleanup', 'clean up', '개선', 'improve', 'optimize', '최적화', 'simplify', '단순화', 'restructure', '구조', 'rename', '이름', 'extract', 'split'],
    color: 'var(--color-cyan)',
  },
  {
    id: 'review',
    title: '코드 감정사',
    subtitle: '"이거 왜 이렇게 짰어?" 전문가',
    emoji: '🧐',
    keywords: ['리뷰', 'review', '분석', 'analyze', '확인', 'check', '봐줘', '살펴', '설명', 'explain', '이해', 'understand', '뭐야', '어떻게', '왜', 'why', 'how', 'what', '읽어', 'read'],
    color: 'var(--color-green)',
  },
  {
    id: 'writing',
    title: 'AI 고스트라이터',
    subtitle: '글은 AI가 쓰고 이름은 내가 올리고',
    emoji: '✍️',
    keywords: ['문서', 'doc', 'readme', '작성', 'write', '글', 'text', '블로그', 'blog', '마크다운', 'markdown', '번역', 'translate', '요약', 'summary', 'summarize', '보고서', 'report', '이메일', 'email'],
    color: 'var(--color-amber)',
  },
  {
    id: 'design',
    title: 'AI 아트 디렉터',
    subtitle: '"여기 1px 옮겨" 장인',
    emoji: '🎨',
    keywords: ['디자인', 'design', 'ui', 'ux', '스타일', 'style', 'css', 'tailwind', '레이아웃', 'layout', '반응형', 'responsive', '색상', 'color', '테마', 'theme', 'animation', '애니메이션', 'font', '폰트'],
    color: '#a78bfa',
  },
  {
    id: 'devops',
    title: '배포 마스터',
    subtitle: 'npm publish 중독자',
    emoji: '🚀',
    keywords: ['배포', 'deploy', 'ci', 'cd', 'docker', 'build', '빌드', 'npm', 'publish', 'package', 'vercel', 'aws', 'server', '서버', 'config', '설정', 'env', 'pipeline', 'github', 'action'],
    color: '#f97316',
  },
  {
    id: 'data',
    title: '데이터 연금술사',
    subtitle: 'JSON을 금으로 바꾸는 자',
    emoji: '🧙',
    keywords: ['데이터', 'data', 'database', 'db', 'sql', 'query', '쿼리', 'csv', 'json', 'parse', '파싱', 'schema', '스키마', 'migration', '마이그레이션', 'model', '모델', 'api', 'fetch'],
    color: '#06b6d4',
  },
  {
    id: 'test',
    title: '품질 감독관',
    subtitle: '통과할 때까지 테스트하는 집착러',
    emoji: '🧪',
    keywords: ['테스트', 'test', 'spec', 'jest', 'playwright', 'e2e', 'unit', '단위', 'mock', 'assert', 'expect', 'coverage', '커버리지'],
    color: '#22c55e',
  },
]

interface CategoryScore {
  category: UsageCategory
  score: number
  sessionCount: number
}

function analyzeUsageCategories(sessions: Session[]): CategoryScore[] {
  const scores: Record<string, { score: number; sessions: Set<string> }> = {}
  for (const cat of USAGE_CATEGORIES) {
    scores[cat.id] = { score: 0, sessions: new Set() }
  }

  for (const session of sessions) {
    for (const msg of session.messages) {
      if (msg.role !== 'user') continue
      const text = msg.text.toLowerCase()
      for (const cat of USAGE_CATEGORIES) {
        for (const kw of cat.keywords) {
          if (text.includes(kw)) {
            scores[cat.id].score++
            scores[cat.id].sessions.add(session.id)
            break // count once per message per category
          }
        }
      }
    }
  }

  return USAGE_CATEGORIES
    .map((cat) => ({
      category: cat,
      score: scores[cat.id].score,
      sessionCount: scores[cat.id].sessions.size,
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
}

function UsageProfile({ sessions }: { sessions: Session[] }) {
  const categories = useMemo(() => analyzeUsageCategories(sessions), [sessions])
  const maxScore = categories[0]?.score || 1

  if (categories.length === 0) return null

  // Top category — fun verdict
  const top = categories[0]
  const topVerdict = top.score > (categories[1]?.score || 0) * 1.5
    ? `당신의 AI 직업은 "${top.category.title}" 입니다`
    : `"${top.category.title}" 겸 "${categories[1]?.category.title}" — 투잡 뛰는 중`

  return (
    <div className="animate-in h-full rounded-xl border border-border bg-bg-card p-5">
      <h2 className="text-lg font-bold text-text-bright mb-1">AI 활용 직업</h2>
      <p className="text-sm text-text/50 mb-4">{topVerdict}</p>
      <div className="space-y-3">
        {categories.map(({ category, score, sessionCount }, rank) => {
          const pct = Math.round((score / maxScore) * 100)
          return (
            <div key={category.id} className="rounded-lg border border-border bg-bg-card p-3">
              <div className="flex items-center gap-3 mb-1.5">
                <span className="text-xl">{category.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-text-bright">{category.title}</span>
                    {rank === 0 && (
                      <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                        주직업
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-text/40">{category.subtitle}</span>
                </div>
                <div className="shrink-0 text-right text-xs text-text/40">
                  <div>{score}회</div>
                  <div>{sessionCount}세션</div>
                </div>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: category.color, opacity: 0.7 }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

void UsageProfile

function UsageCategoryCard({
  entry,
  rank,
  maxScore,
}: {
  entry: CategoryScore
  rank: number
  maxScore: number
}) {
  const { category, score, sessionCount } = entry
  const pct = Math.round((score / maxScore) * 100)

  return (
    <div className="rounded-lg border border-border bg-bg-card p-3">
      <div className="mb-1.5 flex items-center gap-3">
        <span className="text-xl">{category.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-text-bright">{category.title}</span>
            {rank === 0 && (
              <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                대표
              </span>
            )}
          </div>
          <span className="text-[11px] text-text/40">{category.subtitle}</span>
        </div>
        <div className="shrink-0 text-right text-xs text-text/40">
          <div>{score}회</div>
          <div>{sessionCount}세션</div>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: category.color, opacity: 0.7 }}
        />
      </div>
    </div>
  )
}

function UsageHighlights({ categories }: { categories: CategoryScore[] }) {
  const maxScore = categories[0]?.score || 1

  if (categories.length === 0) return null

  const top = categories[0]
  const next = categories[1]
  const topVerdict = next && top.score <= next.score * 1.5
    ? `${top.category.title}와 ${next.category.title} 성향이 함께 강해요`
    : `당신의 대표 AI 활용 직업은 ${top.category.title}입니다`

  return (
    <div className="animate-in h-full rounded-xl border border-border bg-bg-card p-5">
      <h2 className="mb-1 text-lg font-bold text-text-bright">AI 활용 직업</h2>
      <p className="mb-4 text-sm text-text/50">{topVerdict}</p>
      <div className="space-y-3">
        {categories.slice(0, 2).map((entry, index) => (
          <UsageCategoryCard
            key={entry.category.id}
            entry={entry}
            rank={index}
            maxScore={maxScore}
          />
        ))}
      </div>
    </div>
  )
}

function UsageProfileRest({ categories }: { categories: CategoryScore[] }) {
  const remainingCategories = categories.slice(2)
  const maxScore = categories[0]?.score || 1

  if (remainingCategories.length === 0) return null

  return (
    <div className="animate-in mb-6">
      <h2 className="mb-3 text-lg font-bold text-text-bright">다른 AI 활용 직업</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {remainingCategories.map((entry, index) => (
          <UsageCategoryCard
            key={entry.category.id}
            entry={entry}
            rank={index + 2}
            maxScore={maxScore}
          />
        ))}
      </div>
    </div>
  )
}

function AxisBar({ axis }: { axis: { label: [string, string]; value: number } }) {
  const pct = Math.round(axis.value * 100)
  const leftActive = axis.value < 0.5
  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className={leftActive ? 'text-text-bright font-semibold' : 'text-text/40'}>{axis.label[0]}</span>
        <span className={!leftActive ? 'text-text-bright font-semibold' : 'text-text/40'}>{axis.label[1]}</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden relative">
        <div
          className="absolute top-0 h-full rounded-full bg-accent/60 transition-all duration-500"
          style={axis.value >= 0.5
            ? { left: '50%', width: `${pct - 50}%` }
            : { right: '50%', width: `${50 - pct}%` }
          }
        />
        <div className="absolute top-0 left-1/2 w-px h-full bg-white/20" />
      </div>
    </div>
  )
}

function TypeCard({ type, isCurrentType }: {
  type: TypeCode
  isCurrentType: boolean
}) {
  const info = useMemo(() => {
    return computePersonalityStatic(type)
  }, [type])

  return (
    <div className={`rounded-xl border p-4 transition-all ${
      isCurrentType
        ? 'border-accent/50 bg-accent/5 ring-1 ring-accent/20'
        : 'border-border bg-bg-card hover:border-border/80'
    }`}>
      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl">{info.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-text-bright">{info.title}</h3>
            {isCurrentType && (
              <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                나의 유형
              </span>
            )}
          </div>
          <p className="text-xs text-text/50">{info.subtitle}</p>
        </div>
        <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-text/40">{type}</span>
      </div>

      <p className="text-xs text-text/70 leading-relaxed mb-3">{info.description}</p>

      {/* Axis breakdown */}
      <div className="mb-3 flex gap-2 text-[10px]">
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-text/50">
          {AXIS_LABELS[type[0]][0]}
        </span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-text/50">
          {AXIS_LABELS[type[1]][0]}
        </span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-text/50">
          {AXIS_LABELS[type[2]][0]}
        </span>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 rounded-lg bg-white/5 p-2">
          <div className="text-[9px] text-accent/60 mb-0.5">STRENGTHS</div>
          <div className="text-[11px] text-text/60">{info.strengths}</div>
        </div>
        <div className="flex-1 rounded-lg bg-white/5 p-2">
          <div className="text-[9px] text-amber/60 mb-0.5">HEADS UP</div>
          <div className="text-[11px] text-text/60">{info.caution}</div>
        </div>
      </div>
    </div>
  )
}

/** Get static personality info for a type code without session data */
function computePersonalityStatic(type: TypeCode): PersonalityResult {
  // Create fake axes that match the type code
  const styleValue = type[0] === 'E' ? 0.8 : 0.2
  const scopeValue = type[1] === 'W' ? 0.8 : 0.2
  const rhythmValue = type[2] === 'S' ? 0.8 : 0.2

  const axes: Record<AxisKey, { label: [string, string]; value: number }> = {
    style: { label: ['읽기형', '실행형'], value: styleValue },
    scope: { label: ['깊이파', '넓이파'], value: scopeValue },
    rhythm: { label: ['마라토너', '스프린터'], value: rhythmValue },
  }

  // We need the actual type defs — call computePersonality with mock data
  // Instead, just import from the TYPE_DEFS via computePersonality
  // Since TYPE_DEFS is not exported, we'll use a workaround
  return {
    type,
    axes,
    ...getTypeDef(type),
  }
}

function getTypeDef(type: TypeCode) {
  const defs: Record<TypeCode, { title: string; subtitle: string; emoji: string; description: string; shareQuote: string; strengths: string; caution: string }> = {
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
  return defs[type]
}

export function PersonalityView({ sessions, onBack }: Props) {
  const stats = useMemo(() => computeStats(sessions), [sessions])
  const personality = useMemo(() => computePersonality(sessions, stats), [sessions, stats])
  const usageCategories = useMemo(() => analyzeUsageCategories(sessions), [sessions])

  const axisOrder: AxisKey[] = ['style', 'scope', 'rhythm']

  return (
    <div className="dashboard-shell">
      {/* Header */}
      <div className="animate-in mb-6 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-text transition-colors hover:border-accent/30 hover:text-text-bright"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-text-bright">AI 코딩 성향 도감</h1>
          <p className="text-sm text-text/50">3축 성격 유형 시스템 — 8가지 코딩 페르소나</p>
        </div>
      </div>

      {/* My Personality Summary + Usage Profile */}
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <div className="animate-in h-full rounded-xl border border-accent/20 bg-accent/5 p-5">
          <div className="flex h-full flex-col gap-5 sm:flex-row sm:items-start">
            <div className="text-6xl">{personality.emoji}</div>
            <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                나의 유형
              </span>
              <span className="text-xs font-mono text-text/40">{personality.type}</span>
            </div>
            <h2 className="text-2xl font-bold text-text-bright mb-0.5">{personality.title}</h2>
            <p className="text-sm text-accent mb-2">{personality.subtitle}</p>
            <p className="text-sm text-text/60 leading-relaxed">{personality.description}</p>

            {/* My Axis Bars */}
            <div className="mt-4 w-full max-w-xs space-y-2">
              {axisOrder.map((key) => (
                <AxisBar key={key} axis={personality.axes[key]} />
              ))}
            </div>
            </div>
          </div>
        </div>

        <UsageHighlights categories={usageCategories} />
      </div>

      <UsageProfileRest categories={usageCategories} />

      {/* 3-Axis Explanation */}
      <div className="animate-in mb-6">
        <h2 className="text-lg font-bold text-text-bright mb-3">3축 시스템</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-bg-card p-4">
            <div className="text-xs text-accent/60 font-semibold mb-1">AXIS 1 — Work Style</div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-text-bright font-medium">읽기형 (R)</span>
              <span className="text-text/30">vs</span>
              <span className="text-text-bright font-medium">실행형 (E)</span>
            </div>
            <p className="text-xs text-text/50">Read/Grep/Glob 비율 vs Write/Edit/Bash 비율로 측정</p>
          </div>
          <div className="rounded-lg border border-border bg-bg-card p-4">
            <div className="text-xs text-accent/60 font-semibold mb-1">AXIS 2 — Scope</div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-text-bright font-medium">깊이파 (D)</span>
              <span className="text-text/30">vs</span>
              <span className="text-text-bright font-medium">넓이파 (W)</span>
            </div>
            <p className="text-xs text-text/50">도구 다양성, 프로젝트 수, 모델 다양성으로 측정</p>
          </div>
          <div className="rounded-lg border border-border bg-bg-card p-4">
            <div className="text-xs text-accent/60 font-semibold mb-1">AXIS 3 — Rhythm</div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-text-bright font-medium">마라토너 (M)</span>
              <span className="text-text/30">vs</span>
              <span className="text-text-bright font-medium">스프린터 (S)</span>
            </div>
            <p className="text-xs text-text/50">평균 세션 시간으로 측정 (30분+ = 마라톤, 10분- = 스프린트)</p>
          </div>
        </div>
      </div>

      {/* All 8 Types Grid */}
      <div className="animate-in">
        <h2 className="text-lg font-bold text-text-bright mb-3">전체 유형 도감</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ALL_TYPES.map((type) => (
            <TypeCard
              key={type}
              type={type}
              isCurrentType={type === personality.type}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
