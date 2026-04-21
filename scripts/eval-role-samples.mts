#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import type { Session } from '../src/types.ts'
import { analyzeUsageTopCategories, analyzeUsageRoles } from '../src/lib/usageProfile.ts'

interface SampleMetadata {
  id: string
  intendedRole: string
  acceptableRoles: string[]
  category: 'pure' | 'mixed' | 'ambiguous' | 'consistency'
  difficulty: 'easy' | 'normal' | 'hard'
  scenario: string
}

interface EvaluationResult {
  sampleId: string
  metadata: SampleMetadata
  predictedRole: string | null
  confidence: number
  isCorrect: boolean
  details: {
    top3: Array<{ id: string; score: number }>
    topShare: number
    matchedMessages: number
    totalMessages: number
  }
}

interface ConfusionEntry {
  actual: string
  predicted: string
  count: number
}

interface Stats {
  total: number
  correct: number
  accuracy: number
  byCategory: Record<string, { total: number; correct: number; accuracy: number }>
  byDifficulty: Record<string, { total: number; correct: number; accuracy: number }>
  byRole: Record<string, { precision: number; recall: number; f1: number }>
  confusionMatrix: ConfusionEntry[]
  mixedRoleAnalysis: {
    correct: number
    total: number
    accuracy: number
  }
}

function loadSamples(dir: string): { sample: Session; metadata: SampleMetadata }[] {
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`)
    return []
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  const results = []

  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))

      // Extract metadata
      const metadata: SampleMetadata = {
        id: content.id,
        intendedRole: content.intendedRole,
        acceptableRoles: content.acceptableRoles,
        category: content.category,
        difficulty: content.difficulty,
        scenario: content.scenario,
      }

      // Convert to Session format
      const session: Session = {
        id: content.id,
        fileName: file,
        source: 'claude',
        messages: content.messages.map((msg: any) => ({
          role: msg.role,
          text: msg.text,
          timestamp: new Date().toISOString(),
          toolUses: msg.toolUses || [],
        })),
        startTime: content.createdAt,
        endTime: content.createdAt,
        totalTokens: { input: 0, output: 0 },
        messageCount: { user: 0, assistant: 0 },
      }

      results.push({ sample: session, metadata })
    } catch (err) {
      console.warn(`Failed to load ${file}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return results
}

function evaluateSample(sample: Session, metadata: SampleMetadata): EvaluationResult {
  const scores = analyzeUsageTopCategories([sample], 3)
  const predictedRole = scores.length > 0 ? scores[0].id : null
  const topScore = scores.length > 0 ? scores[0].score : 0
  const totalScore = scores.reduce((sum, c) => sum + c.score, 0) || 1
  const topShare = topScore / totalScore

  const isCorrect = predictedRole ? metadata.acceptableRoles.includes(predictedRole) : false

  const matchedCount = sample.messages.filter((m) => m.text && m.text.length > 0).length
  const userMessages = sample.messages.filter((m) => m.role === 'user').length

  return {
    sampleId: metadata.id,
    metadata,
    predictedRole,
    confidence: topShare,
    isCorrect,
    details: {
      top3: scores.slice(0, 3).map((c) => ({
        id: c.id,
        score: c.score,
      })),
      topShare,
      matchedMessages: matchedCount,
      totalMessages: sample.messages.length,
    },
  }
}

function computeStats(results: EvaluationResult[]): Stats {
  const stats: Stats = {
    total: results.length,
    correct: results.filter((r) => r.isCorrect).length,
    accuracy: 0,
    byCategory: {},
    byDifficulty: {},
    byRole: {},
    confusionMatrix: [],
    mixedRoleAnalysis: { correct: 0, total: 0, accuracy: 0 },
  }

  stats.accuracy = stats.correct / stats.total

  // By category
  for (const category of ['pure', 'mixed', 'ambiguous', 'consistency']) {
    const filtered = results.filter((r) => r.metadata.category === category)
    const correct = filtered.filter((r) => r.isCorrect).length
    stats.byCategory[category] = {
      total: filtered.length,
      correct,
      accuracy: filtered.length > 0 ? correct / filtered.length : 0,
    }
  }

  // By difficulty
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const filtered = results.filter((r) => r.metadata.difficulty === difficulty)
    const correct = filtered.filter((r) => r.isCorrect).length
    stats.byDifficulty[difficulty] = {
      total: filtered.length,
      correct,
      accuracy: filtered.length > 0 ? correct / filtered.length : 0,
    }
  }

  // Confusion matrix
  const confusionMap = new Map<string, number>()
  for (const result of results) {
    if (result.predictedRole) {
      const key = `${result.metadata.intendedRole}→${result.predictedRole}`
      confusionMap.set(key, (confusionMap.get(key) || 0) + 1)
    }
  }

  // Extract diagonal and off-diagonal
  const categories = ['feature', 'debug', 'refactor', 'review', 'writing', 'design', 'devops', 'data', 'test']
  for (const actual of categories) {
    for (const predicted of categories) {
      const key = `${actual}→${predicted}`
      const count = confusionMap.get(key) || 0
      if (count > 0 || actual === predicted) {
        stats.confusionMatrix.push({ actual, predicted, count })
      }
    }
  }

  // Mixed role analysis
  const mixedResults = results.filter((r) => r.metadata.category === 'mixed')
  if (mixedResults.length > 0) {
    const mixedCorrect = mixedResults.filter((r) => r.isCorrect).length
    stats.mixedRoleAnalysis = {
      correct: mixedCorrect,
      total: mixedResults.length,
      accuracy: mixedCorrect / mixedResults.length,
    }
  }

  return stats
}

function formatStats(stats: Stats): string {
  const lines: string[] = []

  lines.push(`## 전체 정확도`)
  lines.push(`- 정확도: ${(stats.accuracy * 100).toFixed(1)}% (${stats.correct}/${stats.total})`)
  lines.push('')

  lines.push(`## 카테고리별 성능`)
  for (const cat of ['pure', 'mixed', 'ambiguous', 'consistency']) {
    const c = stats.byCategory[cat]
    if (c.total > 0) {
      lines.push(`- ${cat}: ${(c.accuracy * 100).toFixed(1)}% (${c.correct}/${c.total})`)
    }
  }
  lines.push('')

  lines.push(`## 난이도별 성능`)
  for (const diff of ['easy', 'normal', 'hard']) {
    const d = stats.byDifficulty[diff]
    if (d.total > 0) {
      lines.push(`- ${diff}: ${(d.accuracy * 100).toFixed(1)}% (${d.correct}/${d.total})`)
    }
  }
  lines.push('')

  lines.push(`## 혼합 역할 정확도`)
  if (stats.mixedRoleAnalysis.total > 0) {
    lines.push(`- ${(stats.mixedRoleAnalysis.accuracy * 100).toFixed(1)}% (${stats.mixedRoleAnalysis.correct}/${stats.mixedRoleAnalysis.total})`)
  }
  lines.push('')

  lines.push(`## 혼동 행렬 (상위 오분류)`)
  const offDiag = stats.confusionMatrix.filter((e) => e.actual !== e.predicted && e.count > 0).sort((a, b) => b.count - a.count).slice(0, 10)
  for (const entry of offDiag) {
    lines.push(`- ${entry.actual} → ${entry.predicted}: ${entry.count}`)
  }

  return lines.join('\n')
}

async function main() {
  const currentDir = path.dirname(new URL(import.meta.url).pathname)
  const samplesDir = path.join(currentDir, '..', 'tests', 'fixtures', 'role-eval-samples')
  const outputDir = path.join(currentDir, '..', 'docs')

  console.log(`\n=== AI Role Evaluation Pipeline ===`)
  console.log(`Loading samples from: ${samplesDir}`)

  const loaded = loadSamples(samplesDir)
  console.log(`Loaded: ${loaded.length} samples\n`)

  if (loaded.length === 0) {
    console.warn(`No samples found. Run generate-eval-samples.mts first.`)
    return
  }

  console.log(`Evaluating...`)
  const results = loaded.map(({ sample, metadata }) => evaluateSample(sample, metadata))

  const stats = computeStats(results)

  // Print summary
  console.log(`\n=== Results ===`)
  console.log(formatStats(stats))

  // Save detailed results
  const resultsPath = path.join(outputDir, 'AI-ROLE-EVAL-RESULTS.md')
  const markdown = `# AI Role 분류 평가 결과

생성 일시: ${new Date().toISOString()}

## 요약

${formatStats(stats)}

## 상세 샘플 결과

| ID | 의도 | 예측 | 정답 | 난이도 | 카테고리 |
|---|---|---|---|---|---|
${results
  .map(
    (r) =>
      `| ${r.sampleId} | ${r.metadata.intendedRole} | ${r.predictedRole || '(undefined)'} | ${r.isCorrect ? '✓' : '✗'} | ${r.metadata.difficulty} | ${r.metadata.category} |`
  )
  .join('\n')}
`

  fs.writeFileSync(resultsPath, markdown)
  console.log(`\nDetailed results saved to: ${resultsPath}`)
}

main()
