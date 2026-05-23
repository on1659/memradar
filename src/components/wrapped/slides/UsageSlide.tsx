import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { SlideLayout, FadeInText } from './SlideLayout'
import type { Session } from '../../../types'
import { analyzeUsageTopCategories } from '../../../lib/usageProfile'
import { ROLE_ICONS, type RoleIconKey } from '../../../icons'

interface Props {
  sessions: Session[]
}

export function UsageSlide({ sessions }: Props) {
  const top3 = useMemo(() => analyzeUsageTopCategories(sessions, 3), [sessions])

  if (top3.length === 0) return null

  const totalScore = top3.reduce((sum, c) => sum + c.score, 0) || 1

  return (
    <SlideLayout gradient="from-[#0a0612] via-[#120a1e] to-[#0a0612]">
      <FadeInText delay={0.2} className="mb-6 text-sm text-accent/60 uppercase tracking-widest">
        내 AI는 무슨 일을 할까?
      </FadeInText>

      <FadeInText
        delay={0.4}
        className="font-display mb-2 text-center text-4xl font-bold text-text-bright md:text-5xl"
      >
        AI가 자주 한 일
      </FadeInText>
      <FadeInText delay={0.6} className="mb-8 text-sm text-text/45">
        자주 보인 요청 패턴 (상위 {top3.length})
      </FadeInText>

      <motion.div
        className="flex w-full max-w-md flex-col gap-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
      >
        {top3.map((category, index) => {
          const sharePct = Math.round((category.score / totalScore) * 100)
          const CategoryIcon = ROLE_ICONS[category.id as RoleIconKey]
          return (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.9 + index * 0.15 }}
              className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3"
            >
              <span className="flex w-9 shrink-0 justify-center">
                <CategoryIcon size={30} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-text-bright">
                    {category.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-text/45">{sharePct}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: category.color, opacity: 0.75 }}
                    initial={{ width: 0 }}
                    animate={{ width: `${sharePct}%` }}
                    transition={{ delay: 1.05 + index * 0.15, duration: 0.6 }}
                  />
                </div>
                <div className="mt-1 truncate text-[10px] text-text/35">{category.subtitle}</div>
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      <FadeInText delay={1.8} className="mt-8 max-w-md text-center text-xs text-text/30">
        사용자 메시지 패턴 기반의 가벼운 추정이에요. 정확한 분류는 아닙니다.
      </FadeInText>
    </SlideLayout>
  )
}
