import { useCallback, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, RotateCcw, HelpCircle } from 'lucide-react'
import type { Session } from '../types'
import { USAGE_CATEGORIES, analyzeUsageTopCategories } from '../lib/usageProfile'
import { ROLE_ICONS, type RoleIconKey } from '../icons'
import { useI18n } from '../i18n'
import {
  generateBalancedPairs,
  computeCalibration,
  normalizeTopShare,
  PERSONA_QUIZ_VERSION,
  type Pair,
  type Answer,
  type Side,
  type CategoryId,
  type QuizState,
  type JobLens,
} from '../lib/personaQuiz'
import { PERSONA_STATEMENTS, resolveStatements } from '../data/personaStatements'
import { savePersonaQuiz } from '../lib/personaQuizStorage'

interface PersonaQuizViewProps {
  sessions: Session[]
  onClose: () => void
}

type Phase = 'intro' | 'quiz' | 'result'

const CATEGORY_IDS: CategoryId[] = USAGE_CATEGORIES.map((c) => c.id)
const CATEGORY_META = new Map(USAGE_CATEGORIES.map((c) => [c.id, c]))

/**
 * 직업(직군) 선택지. 진술의 어휘 렌즈만 바꿀 뿐 측정 카테고리(9개)와 무관.
 * 라벨은 사용자 본인 직군만 노출 — 측정 카테고리 id/라벨은 절대 노출 금지.
 * 표시 순서: 개발자 → 기획·PM → 디자이너 → 데이터·분석 → 기타(일반).
 */
const JOB_OPTIONS: ReadonlyArray<{ id: JobLens; ko: string; en: string }> = [
  { id: 'developer', ko: '개발자', en: 'Developer' },
  { id: 'pm', ko: '기획·PM', en: 'Product / PM' },
  { id: 'designer', ko: '디자이너', en: 'Designer' },
  { id: 'data', ko: '데이터·분석', en: 'Data / Analytics' },
  { id: 'general', ko: '기타(일반)', en: 'Other' },
]

function makeSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return buf[0]! >>> 0
  }
  return Date.now() >>> 0
}

/** 세션에서 9 카테고리 raw 점수(전부) 수집. 미등장 카테고리는 0. */
function collectRawScores(sessions: Session[]): Record<CategoryId, number> {
  const top = analyzeUsageTopCategories(sessions, CATEGORY_IDS.length)
  const scores: Record<CategoryId, number> = {}
  for (const id of CATEGORY_IDS) scores[id] = 0
  for (const c of top) scores[c.id] = c.score
  return scores
}

export function PersonaQuizView({ sessions, onClose }: PersonaQuizViewProps) {
  const { locale } = useI18n()
  const isKorean = locale === 'ko'

  const rawScores = useMemo(() => collectRawScores(sessions), [sessions])

  const [seed, setSeed] = useState<number>(() => makeSeed())
  const [job, setJob] = useState<JobLens>('general')
  const [phase, setPhase] = useState<Phase>('intro')
  const [pairs, setPairs] = useState<Pair[]>(() =>
    generateBalancedPairs(
      CATEGORY_IDS,
      resolveStatements(PERSONA_STATEMENTS, 'general'),
      seed,
    ),
  )
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [result, setResult] = useState<{
    autoDistribution: Record<CategoryId, number>
    finalDistribution: Record<CategoryId, number>
  } | null>(null)

  const total = pairs.length

  const startQuiz = useCallback(() => {
    // 최종 선택된 job 기준으로 진술을 resolve 해 페어를 셋업한다(intro 에서 고른 직군 반영).
    setPairs(
      generateBalancedPairs(CATEGORY_IDS, resolveStatements(PERSONA_STATEMENTS, job), seed),
    )
    setPhase('quiz')
    setCurrent(0)
    setAnswers([])
  }, [job, seed])

  const finish = useCallback(
    (finalAnswers: Answer[], usedSeed: number) => {
      const { calibration, finalDistribution } = computeCalibration(
        finalAnswers,
        rawScores,
        CATEGORY_IDS,
      )
      const autoDistribution = normalizeTopShare(rawScores, CATEGORY_IDS)
      const state: QuizState = {
        version: PERSONA_QUIZ_VERSION,
        job,
        ts: new Date().toISOString(),
        seed: usedSeed,
        answers: finalAnswers,
        calibration,
        finalDistribution,
      }
      savePersonaQuiz(state)
      setResult({ autoDistribution, finalDistribution })
      setPhase('result')
    },
    [job, rawScores],
  )

  const answer = useCallback(
    (chosen: Side) => {
      const pair = pairs[current]
      if (!pair) return
      const next: Answer = {
        leftCategory: pair.leftCategory,
        rightCategory: pair.rightCategory,
        chosen,
      }
      const nextAnswers = [...answers, next]
      if (current + 1 >= total) {
        finish(nextAnswers, seed)
      } else {
        setAnswers(nextAnswers)
        setCurrent((c) => c + 1)
      }
    },
    [answers, current, finish, pairs, seed, total],
  )

  const restart = useCallback(() => {
    // 현재 job 유지 — 같은 직군 눈높이로 페어만 새 시드로 재생성.
    const newSeed = makeSeed()
    setSeed(newSeed)
    setPairs(
      generateBalancedPairs(CATEGORY_IDS, resolveStatements(PERSONA_STATEMENTS, job), newSeed),
    )
    setCurrent(0)
    setAnswers([])
    setResult(null)
    setPhase('quiz')
  }, [job])

  return (
    <div className="min-h-screen w-full bg-bg text-text">
      {/* 상단 바 */}
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 rounded-full border border-border/70 bg-bg-card px-4 py-2 text-sm font-medium text-text/80 transition-colors hover:bg-bg-hover hover:text-text-bright"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{isKorean ? '대시보드로' : 'Dashboard'}</span>
        </button>
        <div className="text-sm font-semibold tracking-wide text-text/60">
          {isKorean ? '내 페르소나 진단' : 'My Persona Quiz'}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 pb-16">
        <AnimatePresence mode="wait">
          {phase === 'intro' && (
            <IntroPhase
              key="intro"
              isKorean={isKorean}
              total={total}
              job={job}
              onJobChange={setJob}
              onStart={startQuiz}
            />
          )}
          {phase === 'quiz' && pairs[current] && (
            <QuizPhase
              key={`quiz-${current}`}
              pair={pairs[current]!}
              current={current}
              total={total}
              isKorean={isKorean}
              onAnswer={answer}
            />
          )}
          {phase === 'result' && result && (
            <ResultPhase
              key="result"
              isKorean={isKorean}
              autoDistribution={result.autoDistribution}
              finalDistribution={result.finalDistribution}
              onRestart={restart}
              onClose={onClose}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// --- 시작 화면 ------------------------------------------------------------
function IntroPhase({
  isKorean,
  total,
  job,
  onJobChange,
  onStart,
}: {
  isKorean: boolean
  total: number
  job: JobLens
  onJobChange: (job: JobLens) => void
  onStart: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center pt-10 text-center"
    >
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-accent/25 bg-accent/10">
        <HelpCircle className="h-10 w-10 text-accent" aria-hidden="true" />
      </div>
      <h1 className="font-display mb-3 text-3xl font-bold text-text-bright">
        {isKorean ? '내 페르소나 진단' : 'Diagnose Your Persona'}
      </h1>
      <p className="mb-2 max-w-md text-sm leading-relaxed text-text/70">
        {isKorean
          ? `두 문장 중 더 나에게 가까운 쪽을 직관으로 골라요. 총 ${total}개의 질문이면 끝나요.`
          : `Pick the statement that fits you better, by instinct. Just ${total} quick questions.`}
      </p>
      <p className="mb-8 max-w-md text-xs leading-relaxed text-text/45">
        {isKorean
          ? '응답은 이 브라우저에만 저장되고 어디로도 전송되지 않아요. 검사 결과로 AI 활용 분포가 더 또렷하게 보정돼요.'
          : 'Your answers stay in this browser only and are never sent anywhere. The result refines your AI usage distribution.'}
      </p>

      {/* 직업 선택 — 진술의 눈높이(어휘)만 바꾼다. 측정 카테고리는 노출하지 않는다. */}
      <div className="mb-8 w-full max-w-md">
        <p className="mb-3 text-sm font-medium text-text/70">
          {isKorean ? '당신의 직업은?' : "What's your role?"}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {JOB_OPTIONS.map((opt) => {
            const selected = opt.id === job
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onJobChange(opt.id)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  selected
                    ? 'border-accent bg-accent/15 text-text-bright'
                    : 'border-border/70 bg-bg-card text-text/70 hover:bg-bg-hover hover:text-text-bright'
                }`}
              >
                {isKorean ? opt.ko : opt.en}
              </button>
            )
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onStart}
        className="rounded-full bg-accent px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-dim"
      >
        {isKorean ? '시작하기' : 'Start'}
      </button>
    </motion.div>
  )
}

// --- 검사 화면 (한 화면 한 쌍) --------------------------------------------
// 카테고리 id/라벨 절대 노출 금지 — 진술 텍스트만.
function QuizPhase({
  pair,
  current,
  total,
  isKorean,
  onAnswer,
}: {
  pair: Pair
  current: number
  total: number
  isKorean: boolean
  onAnswer: (chosen: Side) => void
}) {
  const progressPct = Math.round(((current + 1) / total) * 100)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
      className="pt-6"
    >
      {/* 진행률 */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-xs text-text/50">
          <span>
            {current + 1} / {total}
          </span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-bg-hover">
          <motion.div
            className="h-full rounded-full bg-accent"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>

      <p className="mb-6 text-center text-sm text-text/55">
        {isKorean ? '더 나에게 가까운 쪽은?' : 'Which fits you better?'}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatementButton text={pair.leftStatement} onClick={() => onAnswer('left')} index={0} />
        <StatementButton text={pair.rightStatement} onClick={() => onAnswer('right')} index={1} />
      </div>

      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={() => onAnswer('skip')}
          className="rounded-full border border-border/60 bg-bg-card px-5 py-2 text-xs font-medium text-text/55 transition-colors hover:bg-bg-hover hover:text-text/80"
        >
          {isKorean ? '잘 모르겠어요' : 'Not sure'}
        </button>
      </div>
    </motion.div>
  )
}

function StatementButton({
  text,
  onClick,
  index,
}: {
  text: string
  onClick: () => void
  index: number
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, x: index === 0 ? -16 : 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.05 * index }}
      className="group min-h-[7rem] rounded-2xl border border-border bg-bg-card p-5 text-left transition-colors hover:border-accent/45 hover:bg-bg-hover focus:outline-none focus:ring-2 focus:ring-accent/35"
    >
      <span className="text-base leading-relaxed text-text-bright">{text}</span>
    </motion.button>
  )
}

// --- 결과 화면 (전/후 비교) -----------------------------------------------
function ResultPhase({
  isKorean,
  autoDistribution,
  finalDistribution,
  onRestart,
  onClose,
}: {
  isKorean: boolean
  autoDistribution: Record<CategoryId, number>
  finalDistribution: Record<CategoryId, number>
  onRestart: () => void
  onClose: () => void
}) {
  // 차이 큰 카테고리 1~3개 강조
  const highlights = useMemo(() => {
    return CATEGORY_IDS.map((id) => ({
      id,
      delta: (finalDistribution[id] ?? 0) - (autoDistribution[id] ?? 0),
    }))
      .filter((d) => Math.abs(d.delta) >= 0.03)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3)
  }, [autoDistribution, finalDistribution])

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4 }}
      className="pt-4"
    >
      <h1 className="font-display mb-1 text-center text-2xl font-bold text-text-bright">
        {isKorean ? '진단 결과' : 'Your Result'}
      </h1>
      <p className="mb-8 text-center text-sm text-text/55">
        {isKorean
          ? '자동 분류와 검사 응답을 합쳐 보정한 결과예요.'
          : 'We blended the auto-classification with your answers.'}
      </p>

      {/* 강조 카드 */}
      {highlights.length > 0 && (
        <div className="mb-8 space-y-2">
          {highlights.map((h) => {
            const meta = CATEGORY_META.get(h.id)
            const pct = Math.round(h.delta * 100)
            const up = h.delta > 0
            const Icon = ROLE_ICONS[h.id as RoleIconKey]
            return (
              <div
                key={h.id}
                className="flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent/6 px-4 py-3"
              >
                <span className="flex w-7 shrink-0 justify-center">
                  <Icon size={24} aria-hidden="true" />
                </span>
                <span className="flex-1 text-sm text-text-bright">
                  {isKorean ? (
                    <>
                      <span className="font-semibold">{meta?.title ?? h.id}</span>
                      {up
                        ? ` 성향이 +${pct}% 더 또렷해졌어요`
                        : ` 성향이 ${pct}% 옅어졌어요`}
                    </>
                  ) : (
                    <>
                      <span className="font-semibold">{meta?.title ?? h.id}</span>
                      {up ? ` got +${pct}% stronger` : ` softened by ${pct}%`}
                    </>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* 전/후 분포 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <DistributionCard
          title={isKorean ? '자동 분류' : 'Auto-classified'}
          distribution={autoDistribution}
          dim
        />
        <DistributionCard
          title={isKorean ? '보정 후' : 'Calibrated'}
          distribution={finalDistribution}
        />
      </div>

      <div className="mt-8 flex justify-center gap-3">
        <button
          type="button"
          onClick={onRestart}
          className="flex items-center gap-2 rounded-full border border-border/70 bg-bg-card px-5 py-2.5 text-sm font-medium text-text/80 transition-colors hover:bg-bg-hover hover:text-text-bright"
        >
          <RotateCcw className="h-4 w-4" />
          <span>{isKorean ? '다시 하기' : 'Retake'}</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-dim"
        >
          {isKorean ? '대시보드에서 보기' : 'View on Dashboard'}
        </button>
      </div>

      <p className="mx-auto mt-6 max-w-md text-center text-xs leading-relaxed text-text/45">
        {isKorean
          ? '검사 응답과 사용 패턴을 합친 가벼운 추정이에요. 정확한 분류는 아닙니다.'
          : 'A light estimate from your answers and usage patterns — not an exact classification.'}
      </p>
    </motion.div>
  )
}

function DistributionCard({
  title,
  distribution,
  dim = false,
}: {
  title: string
  distribution: Record<CategoryId, number>
  dim?: boolean
}) {
  const ranked = useMemo(
    () =>
      CATEGORY_IDS.map((id) => ({ id, share: distribution[id] ?? 0 }))
        .sort((a, b) => b.share - a.share)
        .slice(0, 6),
    [distribution],
  )
  const max = ranked[0]?.share || 1

  return (
    <div className="rounded-2xl border border-border bg-bg-card p-5">
      <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text/45">{title}</div>
      <div className="space-y-2.5">
        {ranked.map(({ id, share }) => {
          const meta = CATEGORY_META.get(id)
          const barPct = Math.max(3, Math.round((share / max) * 100))
          const sharePct = Math.round(share * 100)
          const Icon = ROLE_ICONS[id as RoleIconKey]
          return (
            <div key={id} className="flex items-center gap-2.5">
              <span className="flex w-5 shrink-0 justify-center">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="w-24 shrink-0 truncate text-xs text-text-bright">
                {meta?.title ?? id}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-hover">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${barPct}%`,
                    backgroundColor: meta?.color ?? 'var(--color-accent)',
                    opacity: dim ? 0.45 : 0.8,
                  }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-[11px] text-text/40">{sharePct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
