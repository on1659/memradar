import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { SlideLayout } from './SlideLayout'
import { CollabType16Hero } from '../../CollabType16Card'
import { TYPE16_AXIS_ORDER, type CollabType16 } from '../../../lib/collabType16'

interface Props {
  /** 판정된 AI 만, 1건 이상 — 주로 쓴 AI 가 먼저 */
  results: CollabType16[]
}

/** 첫 근거가 나오기까지 / 한 단계에서 다음 단계까지 (ms) */
const REVEAL_START_MS = 900
const REVEAL_STEP_MS = 1300
/** 축 넷 + 마지막에 별명 */
const REVEAL_STEPS = TYPE16_AXIS_ORDER.length + 1

/**
 * 성향 슬라이드 자리 — "내 AI" 16유형. 대시보드 맨 위 카드와 같은 본문을 쓰되 차례로 보여 준다:
 * 빈 칸 네 개 → AI 가 한 일이 한 줄씩 나오며 글자가 하나씩 채워짐 → 마지막에 별명.
 */
export function AiTypeSlide({ results }: Props) {
  const reducedMotion = useReducedMotion()
  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    if (reducedMotion) return
    const timers = Array.from({ length: REVEAL_STEPS }, (_, index) =>
      window.setTimeout(() => setRevealed(index + 1), REVEAL_START_MS + index * REVEAL_STEP_MS),
    )
    return () => timers.forEach(clearTimeout)
  }, [reducedMotion])

  return (
    <SlideLayout gradient="from-[#06060e] via-[#10081e] to-[#06060e]">
      <motion.div
        className="w-full"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <CollabType16Hero results={results} revealed={reducedMotion ? undefined : revealed} />
      </motion.div>
    </SlideLayout>
  )
}
