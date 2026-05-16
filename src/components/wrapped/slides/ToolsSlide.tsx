import { motion } from 'framer-motion'
import { Rank1Icon, TOOL_ICONS, ToolDefaultIcon } from '../../../icons'
import { SlideLayout, FadeInText } from './SlideLayout'

interface Props {
  toolsUsed: Record<string, number>
}


export function ToolsSlide({ toolsUsed }: Props) {
  const sorted = Object.entries(toolsUsed).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxCount = sorted[0]?.[1] || 1

  return (
    <SlideLayout gradient="from-[#06060e] via-[#0e0e06] to-[#06060e]">
      <FadeInText className="text-amber/60 text-sm tracking-widest uppercase mb-8">
        Your Top Tools
      </FadeInText>
      <FadeInText delay={0.2} className="font-display text-3xl md:text-4xl font-bold text-text-bright mb-10">
        가장 많이 쓴 도구
      </FadeInText>

      <div className="w-full max-w-sm space-y-4">
        {sorted.map(([tool, count], i) => {
          const rank = i + 1
          const pct = (count / maxCount) * 100
          const ToolIcon = TOOL_ICONS[tool as keyof typeof TOOL_ICONS] ?? ToolDefaultIcon
          return (
            <motion.div
              key={tool}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + (4 - i) * 0.2, duration: 0.5 }}
              className="flex items-center gap-3"
            >
              <span className={`flex w-8 justify-center ${rank === 1 ? 'text-amber' : 'text-text/40'}`}>
                {rank === 1 ? <Rank1Icon size={20} aria-hidden="true" /> : `#${rank}`}
              </span>
              <span className="flex h-7 w-7 items-center justify-center">
                <ToolIcon size={22} aria-hidden="true" />
              </span>
              <span className="text-sm text-text-bright w-16">{tool}</span>
              <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${rank === 1 ? 'bg-amber/50' : 'bg-amber/25'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: 0.8 + (4 - i) * 0.2, duration: 0.6 }}
                />
              </div>
              <span className="text-xs text-text/40 font-mono w-12 text-right">{count.toLocaleString()}</span>
            </motion.div>
          )
        })}
      </div>
    </SlideLayout>
  )
}
