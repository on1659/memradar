import { motion } from 'framer-motion'
import { SlideLayout, FadeInText } from './SlideLayout'
import type { Session } from '../../../types'
import { useMemo } from 'react'

interface Props {
  sessions: Session[]
}

interface UsageCategory {
  id: string
  title: string
  subtitle: string
  emoji: string
  keywords: string[]
}

const USAGE_CATEGORIES: UsageCategory[] = [
  { id: 'feature', title: '풀스택 기획자', subtitle: '기능 뚝딱 제조기', emoji: '🏭', keywords: ['만들어', '추가', '구현', '개발', 'implement', 'create', 'build', 'add', 'feature', '기능', '페이지', 'component', '컴포넌트', 'api', '엔드포인트', 'endpoint', 'route', '라우트'] },
  { id: 'debug', title: '버그 헌터', subtitle: 'AI 119 신고 전문', emoji: '🚨', keywords: ['버그', 'bug', 'fix', '수정', '고쳐', '에러', 'error', '오류', '안돼', '안됨', '작동', 'broken', 'crash', 'fail', '실패', 'issue', 'debug', '디버그', 'warning', '경고', 'undefined', 'null'] },
  { id: 'refactor', title: '코드 성형외과', subtitle: '못생긴 코드 참을 수 없는 자', emoji: '💅', keywords: ['리팩토', 'refactor', '정리', 'cleanup', 'clean up', '개선', 'improve', 'optimize', '최적화', 'simplify', '단순화', 'restructure', '구조', 'rename', '이름', 'extract', 'split'] },
  { id: 'review', title: '코드 감정사', subtitle: '"이거 왜 이렇게 짰어?" 전문가', emoji: '🧐', keywords: ['리뷰', 'review', '분석', 'analyze', '확인', 'check', '봐줘', '살펴', '설명', 'explain', '이해', 'understand', '뭐야', '어떻게', '왜', 'why', 'how', 'what', '읽어', 'read'] },
  { id: 'writing', title: 'AI 고스트라이터', subtitle: '글은 AI가 쓰고 이름은 내가 올리고', emoji: '✍️', keywords: ['문서', 'doc', 'readme', '작성', 'write', '글', 'text', '블로그', 'blog', '마크다운', 'markdown', '번역', 'translate', '요약', 'summary', 'summarize', '보고서', 'report', '이메일', 'email'] },
  { id: 'design', title: 'AI 아트 디렉터', subtitle: '"여기 1px 옮겨" 장인', emoji: '🎨', keywords: ['디자인', 'design', 'ui', 'ux', '스타일', 'style', 'css', 'tailwind', '레이아웃', 'layout', '반응형', 'responsive', '색상', 'color', '테마', 'theme', 'animation', '애니메이션', 'font', '폰트'] },
  { id: 'devops', title: '배포 마스터', subtitle: 'npm publish 중독자', emoji: '🚀', keywords: ['배포', 'deploy', 'ci', 'cd', 'docker', 'build', '빌드', 'npm', 'publish', 'package', 'vercel', 'aws', 'server', '서버', 'config', '설정', 'env', 'pipeline', 'github', 'action'] },
  { id: 'data', title: '데이터 연금술사', subtitle: 'JSON을 금으로 바꾸는 자', emoji: '🧙', keywords: ['데이터', 'data', 'database', 'db', 'sql', 'query', '쿼리', 'csv', 'json', 'parse', '파싱', 'schema', '스키마', 'migration', '마이그레이션', 'model', '모델', 'api', 'fetch'] },
  { id: 'test', title: '품질 감독관', subtitle: '통과할 때까지 테스트하는 집착러', emoji: '🧪', keywords: ['테스트', 'test', 'spec', 'jest', 'playwright', 'e2e', 'unit', '단위', 'mock', 'assert', 'expect', 'coverage', '커버리지'] },
]

function analyzeTop3(sessions: Session[]) {
  const scores: Record<string, number> = {}
  for (const cat of USAGE_CATEGORIES) scores[cat.id] = 0

  for (const session of sessions) {
    for (const msg of session.messages) {
      if (msg.role !== 'user') continue
      const text = msg.text.toLowerCase()
      for (const cat of USAGE_CATEGORIES) {
        for (const kw of cat.keywords) {
          if (text.includes(kw)) {
            scores[cat.id]++
            break
          }
        }
      }
    }
  }

  return USAGE_CATEGORIES
    .map((cat) => ({ ...cat, score: scores[cat.id] }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

export function UsageSlide({ sessions }: Props) {
  const top3 = useMemo(() => analyzeTop3(sessions), [sessions])
  const primary = top3[0]

  if (!primary) return null

  return (
    <SlideLayout gradient="from-[#0a0612] via-[#120a1e] to-[#0a0612]">
      <FadeInText delay={0.2} className="text-accent/60 text-sm tracking-widest uppercase mb-6">
        Your AI Job Title
      </FadeInText>

      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', duration: 1, delay: 0.4 }}
        className="text-8xl mb-4"
      >
        {primary.emoji}
      </motion.div>

      <FadeInText delay={0.7} className="text-4xl md:text-6xl font-bold text-text-bright mb-1 text-center" style={{ fontFamily: "'Instrument Serif', serif" } as React.CSSProperties}>
        {primary.title}
      </FadeInText>
      <FadeInText delay={0.9} className="text-base text-text/40 mb-8">
        {primary.subtitle}
      </FadeInText>

      {/* Runner-ups */}
      {top3.length > 1 && (
        <motion.div
          className="flex gap-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
        >
          {top3.slice(1).map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, x: i === 0 ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.4 + i * 0.15 }}
              className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3"
            >
              <span className="text-2xl">{cat.emoji}</span>
              <div>
                <div className="text-xs text-text-bright font-semibold">{cat.title}</div>
                <div className="text-[10px] text-text/30">{cat.subtitle}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      <FadeInText delay={1.8} className="mt-8 text-xs text-text/20">
        유저 메시지 키워드 기반 분석
      </FadeInText>
    </SlideLayout>
  )
}
