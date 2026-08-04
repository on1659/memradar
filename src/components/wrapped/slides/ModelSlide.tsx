import { motion } from 'framer-motion'
import { SlideLayout, FadeInText } from './SlideLayout'
import { getModelLabel } from '../../../lib/personality'
import { shortModelName } from '../../../lib/modelNames'

interface Props {
  /** 모델별 **응답** 수 (세션당 1표가 아니다) — Stats.modelResponses */
  modelResponses: Record<string, number>
}

export function ModelSlide({ modelResponses }: Props) {
  const sorted = Object.entries(modelResponses).sort((a, b) => b[1] - a[1])
  const topModel = sorted[0]
  const total = sorted.reduce((a, [, c]) => a + c, 0)

  if (!topModel) return null

  return (
    <SlideLayout gradient="from-[#06060e] via-[#0c0818] to-[#08061a]">
      <FadeInText className="text-accent/60 text-sm tracking-widest uppercase mb-8">
        Your Favorite Model
      </FadeInText>
      <FadeInText delay={0.3} className="font-display text-4xl md:text-6xl font-bold text-text-bright mb-4 text-center">
        {shortModelName(topModel[0])}
      </FadeInText>
      <FadeInText delay={0.6} className="text-lg text-accent mb-8">
        {getModelLabel(topModel[0])}
      </FadeInText>

      <div className="w-full max-w-sm space-y-2">
        {sorted.slice(0, 4).map(([model, count], i) => {
          const pct = Math.round((count / total) * 100)
          return (
            <motion.div
              key={model}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + i * 0.15 }}
              className="flex items-center gap-3"
            >
              <span className="text-xs text-text/60 w-32 truncate text-right">{shortModelName(model)}</span>
              <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-accent/60 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: 1 + i * 0.15, duration: 0.6 }}
                />
              </div>
              <span className="text-xs text-text/40 w-10">{pct}%</span>
            </motion.div>
          )
        })}
      </div>

      {/*
        단위 영수증 — 막대는 라벨/바/% 3열로 폭 예산이 꽉 차 있어(DESIGN-GUIDE 폭 규칙)
        정보를 막대 행에 얹지 않고 목록 아래 한 줄로 붙인다.
        서브에이전트 제외를 명시하는 이유: 제외분이 포함분보다 크고, 포함 시 1·2위 격차가
        88.7% 우위에서 3.1% 접전으로 바뀐다 — 밝히지 않으면 가장 큰 오차를 숨긴 채
        "정확한 모델 귀속"을 광고하는 셈이 된다.
      */}
      <FadeInText delay={1.6} className="mt-7 max-w-xs text-center text-[10px] leading-relaxed text-text/35">
        Based on {total.toLocaleString()} responses · main conversation only (subagents not counted)
      </FadeInText>
    </SlideLayout>
  )
}
