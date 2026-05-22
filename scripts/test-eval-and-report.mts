#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Session } from '../src/types.ts'
import { analyzeUsageTopCategories } from '../src/lib/usageProfile.ts'

// v3 §3-3 카테고리 4종. v1 잔재 'consistency' 제거, 'edge' 신규.
type SampleCategory = 'pure' | 'mixed' | 'ambiguous' | 'edge'
const SAMPLE_CATEGORIES: SampleCategory[] = ['pure', 'mixed', 'ambiguous', 'edge']
const ROLE_IDS = ['feature', 'debug', 'refactor', 'review', 'writing', 'design', 'devops', 'data', 'test']

interface SampleMetadata {
  id: string
  intendedRole: string
  acceptableRoles: string[]
  category: SampleCategory
  difficulty: 'easy' | 'normal' | 'hard'
  scenario: string
}

interface EvaluationResult {
  sampleId: string
  metadata: SampleMetadata
  predictedRole: string | null
  /** 랭킹 2위 역할 (mixed 완전정답 판정용). 2위가 없으면 null. */
  predictedTop2: string | null
  confidence: number
  isCorrect: boolean
  /** undecided: 분류 함수가 빈 배열을 반환한 경우 */
  undecided: boolean
  details: {
    top3: Array<{ id: string; score: number }>
    topShare: number
    matchedMessages: number
    totalMessages: number
  }
}

/** 역할별 precision/recall/F1 (단일 라벨 기준 — 아래 computeStats 주석 참조) */
interface RoleStats {
  precision: number
  recall: number
  f1: number
  tp: number
  fp: number
  fn: number
  support: number
}

interface Stats {
  total: number
  correct: number
  accuracy: number
  byCategory: Record<string, { total: number; correct: number; accuracy: number }>
  byDifficulty: Record<string, { total: number; correct: number; accuracy: number }>
  /** 9역할 각각의 precision/recall/F1 (단일 라벨 = intendedRole ground truth) */
  byRole: Record<string, RoleStats>
  confusionMatrix: Array<{ actual: string; predicted: string; count: number }>
  confidenceDistribution: Array<{ min: number; max: number; correct: number; total: number; accuracy: number }>
  /** undecided(분류 빈 배열) 비율 = undecided 수 / 전체 */
  undecidedRate: number
  undecidedCount: number
  /** mixed 샘플 통계: top1 정답 수 + top1·top2 모두 정답인 "완전정답" 수 */
  mixed: { total: number; correct: number; fullyCorrect: number }
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

      const metadata: SampleMetadata = {
        id: content.id,
        intendedRole: content.intendedRole,
        acceptableRoles: content.acceptableRoles,
        category: content.category,
        difficulty: content.difficulty,
        scenario: content.scenario,
      }

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
  // analyzeUsageTopCategories 는 점수순 랭킹 배열을 반환. 빈 배열 = undecided.
  const scores = analyzeUsageTopCategories([sample], 3)
  const undecided = scores.length === 0
  const predictedRole = scores.length > 0 ? scores[0].id : null
  const predictedTop2 = scores.length > 1 ? scores[1].id : null
  const topScore = scores.length > 0 ? scores[0].score : 0
  const totalScore = scores.reduce((sum, c) => sum + c.score, 0) || 1
  const topShare = topScore / totalScore

  const isCorrect = predictedRole ? metadata.acceptableRoles.includes(predictedRole) : false
  const matchedCount = sample.messages.filter((m) => m.text && m.text.length > 0).length

  return {
    sampleId: metadata.id,
    metadata,
    predictedRole,
    predictedTop2,
    confidence: topShare,
    isCorrect,
    undecided,
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
    confidenceDistribution: [],
    undecidedRate: 0,
    undecidedCount: 0,
    mixed: { total: 0, correct: 0, fullyCorrect: 0 },
  }

  stats.accuracy = stats.total > 0 ? stats.correct / stats.total : 0

  for (const category of SAMPLE_CATEGORIES) {
    const filtered = results.filter((r) => r.metadata.category === category)
    const correct = filtered.filter((r) => r.isCorrect).length
    stats.byCategory[category] = {
      total: filtered.length,
      correct,
      accuracy: filtered.length > 0 ? correct / filtered.length : 0,
    }
  }

  for (const difficulty of ['easy', 'normal', 'hard']) {
    const filtered = results.filter((r) => r.metadata.difficulty === difficulty)
    const correct = filtered.filter((r) => r.isCorrect).length
    stats.byDifficulty[difficulty] = {
      total: filtered.length,
      correct,
      accuracy: filtered.length > 0 ? correct / filtered.length : 0,
    }
  }

  // --- 역할별 precision/recall/F1 ---------------------------------------
  // 기준: 단일 라벨 — intendedRole 을 ground truth 로 사용 (혼동행렬과 동일 기준).
  //   mixed 샘플의 intendedRole 은 "주도 역할"이다 (v3 §2-3).
  //   acceptableRoles 기반 멀티라벨이 아니라, 한 샘플당 정답 역할 1개로 본다.
  // 역할 r 에 대해:
  //   TP = intendedRole===r && predictedRole===r
  //   FP = predictedRole===r && intendedRole!==r
  //   FN = intendedRole===r && predictedRole!==r  (predictedRole===null 포함)
  for (const role of ROLE_IDS) {
    let tp = 0
    let fp = 0
    let fn = 0
    let support = 0
    for (const r of results) {
      const actual = r.metadata.intendedRole
      const predicted = r.predictedRole
      if (actual === role) support++
      if (actual === role && predicted === role) tp++
      else if (predicted === role && actual !== role) fp++
      else if (actual === role && predicted !== role) fn++
    }
    // 0 division 방어: 분모 0 이면 해당 지표 0.
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
    stats.byRole[role] = { precision, recall, f1, tp, fp, fn, support }
  }

  // --- undecided 비율 ---------------------------------------------------
  stats.undecidedCount = results.filter((r) => r.undecided).length
  stats.undecidedRate = stats.total > 0 ? stats.undecidedCount / stats.total : 0

  // --- mixed 완전정답 ---------------------------------------------------
  // top1 이 acceptableRoles 에 포함 = 정답(기존 isCorrect 와 동일).
  // top1·top2 둘 다 acceptableRoles 에 포함 = "완전정답".
  const mixedResults = results.filter((r) => r.metadata.category === 'mixed')
  stats.mixed.total = mixedResults.length
  for (const r of mixedResults) {
    const accept = r.metadata.acceptableRoles
    const top1Ok = r.predictedRole !== null && accept.includes(r.predictedRole)
    if (top1Ok) stats.mixed.correct++
    const top2Ok = r.predictedTop2 !== null && accept.includes(r.predictedTop2)
    if (top1Ok && top2Ok) stats.mixed.fullyCorrect++
  }

  const confusionMap = new Map<string, number>()
  for (const result of results) {
    if (result.predictedRole) {
      const key = `${result.metadata.intendedRole}→${result.predictedRole}`
      confusionMap.set(key, (confusionMap.get(key) || 0) + 1)
    }
  }

  for (const actual of ROLE_IDS) {
    for (const predicted of ROLE_IDS) {
      const key = `${actual}→${predicted}`
      const count = confusionMap.get(key) || 0
      if (count > 0) {
        stats.confusionMatrix.push({ actual, predicted, count })
      }
    }
  }

  // Confidence distribution
  for (const range of [
    { min: 0, max: 0.3 },
    { min: 0.3, max: 0.5 },
    { min: 0.5, max: 0.7 },
    { min: 0.7, max: 0.85 },
    { min: 0.85, max: 1 },
  ]) {
    const filtered = results.filter((r) => r.confidence >= range.min && r.confidence < range.max)
    if (filtered.length === 0 && range.max < 1) continue

    const correct = filtered.filter((r) => r.isCorrect).length
    stats.confidenceDistribution.push({
      min: range.min,
      max: range.max,
      correct,
      total: filtered.length,
      accuracy: filtered.length > 0 ? correct / filtered.length : 0,
    })
  }

  return stats
}

function generateHtmlReport(results: EvaluationResult[], stats: Stats, outputPath: string): void {
  const categoryLabels = Object.entries(stats.byCategory)
    .filter(([, v]) => v.total > 0)
    .map(([k]) => k)
  const categoryAccuracy = Object.entries(stats.byCategory)
    .filter(([, v]) => v.total > 0)
    .map(([, v]) => (v.accuracy * 100).toFixed(1))

  const difficultyLabels = Object.entries(stats.byDifficulty)
    .filter(([, v]) => v.total > 0)
    .map(([k]) => (k === 'easy' ? '쉬움' : k === 'normal' ? '보통' : '어려움'))
  const difficultyAccuracy = Object.entries(stats.byDifficulty)
    .filter(([, v]) => v.total > 0)
    .map(([, v]) => (v.accuracy * 100).toFixed(1))

  const confusionRoles = Array.from(new Set(stats.confusionMatrix.map((c) => c.predicted))).sort()
  const confusionActuals = Array.from(new Set(stats.confusionMatrix.map((c) => c.actual))).sort()

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 역할 평가 리포트</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #333;
      padding: 40px 20px;
      min-height: 100vh;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }

    .header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }

    .header p {
      font-size: 1.1em;
      opacity: 0.95;
      margin-bottom: 20px;
    }

    .timestamp {
      font-size: 0.95em;
      opacity: 0.8;
    }

    .content {
      padding: 40px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 30px;
      margin-bottom: 40px;
    }

    .card {
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      padding: 30px;
      border-radius: 10px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .card:hover {
      transform: translateY(-5px);
      box-shadow: 0 8px 25px rgba(0,0,0,0.15);
    }

    .card-number {
      font-size: 2.5em;
      font-weight: 700;
      color: #667eea;
      margin-bottom: 10px;
    }

    .card-label {
      font-size: 1.1em;
      color: #555;
      font-weight: 600;
    }

    .card-subtext {
      font-size: 0.9em;
      color: #777;
      margin-top: 10px;
    }

    .section {
      margin-bottom: 50px;
    }

    .section-title {
      font-size: 1.8em;
      font-weight: 700;
      color: #333;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 3px solid #667eea;
    }

    .chart-container {
      position: relative;
      height: 400px;
      margin-bottom: 30px;
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }

    .table-container {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      margin-top: 20px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95em;
    }

    th {
      background: #f5f7fa;
      padding: 15px;
      text-align: left;
      font-weight: 600;
      color: #333;
      border-bottom: 2px solid #ddd;
    }

    td {
      padding: 12px 15px;
      border-bottom: 1px solid #eee;
    }

    tr:hover {
      background: #f9f9f9;
    }

    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85em;
      font-weight: 600;
    }

    .badge-success {
      background: #d1fae5;
      color: #065f46;
    }

    .badge-error {
      background: #fee2e2;
      color: #991b1b;
    }

    .badge-pure {
      background: #e0e7ff;
      color: #3730a3;
    }

    .badge-mixed {
      background: #fce7f3;
      color: #831843;
    }

    .badge-ambiguous {
      background: #fef3c7;
      color: #92400e;
    }

    .badge-edge {
      background: #cffafe;
      color: #155e63;
    }

    .badge-easy {
      background: #d1fae5;
      color: #065f46;
    }

    .badge-normal {
      background: #fed7aa;
      color: #7c2d12;
    }

    .badge-hard {
      background: #fca5a5;
      color: #7f1d1d;
    }

    .accuracy-bar {
      background: linear-gradient(90deg, #667eea, #764ba2);
      height: 24px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 600;
      font-size: 0.9em;
      position: relative;
      overflow: hidden;
    }

    .footer {
      background: #f5f7fa;
      padding: 20px 40px;
      text-align: center;
      color: #666;
      font-size: 0.9em;
    }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }

    .stat-box {
      background: white;
      padding: 20px;
      border-left: 4px solid #667eea;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }

    .stat-value {
      font-size: 1.8em;
      font-weight: 700;
      color: #667eea;
    }

    .stat-label {
      font-size: 0.95em;
      color: #666;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 AI 역할 평가 리포트</h1>
      <p>AI 성향 분류 정확도 분석 및 성능 평가</p>
      <div class="timestamp">생성 일시: ${new Date().toLocaleString('ko-KR')}</div>
    </div>

    <div class="content">
      <!-- Summary Cards -->
      <div class="grid">
        <div class="card">
          <div class="card-number">${(stats.accuracy * 100).toFixed(1)}%</div>
          <div class="card-label">전체 정확도</div>
          <div class="card-subtext">${stats.correct}/${stats.total} 샘플 정답</div>
        </div>
        <div class="card">
          <div class="card-number">${stats.total}</div>
          <div class="card-label">테스트된 샘플</div>
          <div class="card-subtext">평가 완료</div>
        </div>
        <div class="card">
          <div class="card-number">${results.filter((r) => r.confidence > 0.8).length}</div>
          <div class="card-label">높은 신뢰도</div>
          <div class="card-subtext">80% 이상 신뢰도</div>
        </div>
        <div class="card">
          <div class="card-number">${(stats.undecidedRate * 100).toFixed(1)}%</div>
          <div class="card-label">Undecided 비율</div>
          <div class="card-subtext">${stats.undecidedCount}/${stats.total} 분류 보류 (edge 외 발생 시 비정상)</div>
        </div>
        <div class="card">
          <div class="card-number">${stats.mixed.correct}/${stats.mixed.total}</div>
          <div class="card-label">Mixed top1 정답</div>
          <div class="card-subtext">완전정답(top1·top2 모두): ${stats.mixed.fullyCorrect}/${stats.mixed.total}</div>
        </div>
      </div>

      <!-- Performance by Category -->
      <div class="section">
        <h2 class="section-title">📊 카테고리별 성능</h2>
        <div class="stats-row">
          ${SAMPLE_CATEGORIES.filter((cat) => stats.byCategory[cat].total > 0)
            .map((cat) => {
              const data = stats.byCategory[cat]
              const label = cat.charAt(0).toUpperCase() + cat.slice(1)
              return `
            <div class="stat-box">
              <div class="stat-value">${(data.accuracy * 100).toFixed(1)}%</div>
              <div class="stat-label">${label}</div>
              <div style="font-size: 0.85em; color: #999; margin-top: 5px;">
                ${data.correct}/${data.total}
              </div>
            </div>
          `
            })
            .join('')}
        </div>
        <div class="chart-container">
          <canvas id="categoryChart"></canvas>
        </div>
      </div>

      <!-- Performance by Difficulty -->
      <div class="section">
        <h2 class="section-title">📈 난이도별 성능</h2>
        <div class="stats-row">
          ${['easy', 'normal', 'hard']
            .filter((diff) => stats.byDifficulty[diff].total > 0)
            .map((diff) => {
              const data = stats.byDifficulty[diff]
              const label = diff === 'easy' ? '쉬움' : diff === 'normal' ? '보통' : '어려움'
              return `
            <div class="stat-box">
              <div class="stat-value">${(data.accuracy * 100).toFixed(1)}%</div>
              <div class="stat-label">${label}</div>
              <div style="font-size: 0.85em; color: #999; margin-top: 5px;">
                ${data.correct}/${data.total}
              </div>
            </div>
          `
            })
            .join('')}
        </div>
        <div class="chart-container">
          <canvas id="difficultyChart"></canvas>
        </div>
      </div>

      <!-- Confidence Distribution -->
      <div class="section">
        <h2 class="section-title">🎯 신뢰도 분포</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>신뢰도 범위</th>
                <th>샘플 수</th>
                <th>정답 수</th>
                <th>정확도</th>
                <th>시각화</th>
              </tr>
            </thead>
            <tbody>
              ${stats.confidenceDistribution
                .map((dist) => {
                  const minPercent = (dist.min * 100).toFixed(0)
                  const maxPercent = (dist.max * 100).toFixed(0)
                  const accuracy = (dist.accuracy * 100).toFixed(1)
                  const width = (dist.accuracy * 100).toFixed(0)
                  return `
              <tr>
                <td>${minPercent}% - ${maxPercent}%</td>
                <td>${dist.total}</td>
                <td>${dist.correct}</td>
                <td><strong>${accuracy}%</strong></td>
                <td>
                  <div class="accuracy-bar" style="width: ${width}%;">
                    ${width}%
                  </div>
                </td>
              </tr>
            `
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Confusion Matrix -->
      <div class="section">
        <h2 class="section-title">🔄 혼동 행렬</h2>
        <p style="color: #666; margin-bottom: 20px;">
          행: 의도된 역할, 열: 예측된 역할 | 대각선이 높을수록 정확도가 높음
        </p>
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>의도</th>
                ${confusionRoles.map((role) => `<th>${role}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${confusionActuals
                .map((actual) => {
                  const cells = confusionRoles
                    .map((predicted) => {
                      const count = stats.confusionMatrix.find((c) => c.actual === actual && c.predicted === predicted)?.count || 0
                      const bgColor = count === 0 ? '#f5f5f5' : actual === predicted ? '#d1fae5' : '#fee2e2'
                      return `<td style="background: ${bgColor}; text-align: center; font-weight: 600;">${count || '-'}</td>`
                    })
                    .join('')
                  return `
              <tr>
                <td><strong>${actual}</strong></td>
                ${cells}
              </tr>
            `
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Role Precision / Recall / F1 -->
      <div class="section">
        <h2 class="section-title">🎭 역할별 Precision / Recall / F1</h2>
        <p style="color: #666; margin-bottom: 20px;">
          단일 라벨 기준 — intendedRole 을 정답으로 사용 (혼동행렬과 동일 기준). Support = 해당 역할 샘플 수.
        </p>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>역할</th>
                <th>Precision</th>
                <th>Recall</th>
                <th>F1</th>
                <th>TP</th>
                <th>FP</th>
                <th>FN</th>
                <th>Support</th>
              </tr>
            </thead>
            <tbody>
              ${ROLE_IDS.map((role) => {
                const rs = stats.byRole[role]
                return `
              <tr>
                <td><strong>${role}</strong></td>
                <td>${(rs.precision * 100).toFixed(1)}%</td>
                <td>${(rs.recall * 100).toFixed(1)}%</td>
                <td><strong>${(rs.f1 * 100).toFixed(1)}%</strong></td>
                <td style="text-align: center;">${rs.tp}</td>
                <td style="text-align: center;">${rs.fp}</td>
                <td style="text-align: center;">${rs.fn}</td>
                <td style="text-align: center;">${rs.support}</td>
              </tr>
            `
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Sample Details -->
      <div class="section">
        <h2 class="section-title">📋 샘플 상세 결과</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>샘플 ID</th>
                <th>의도된 역할</th>
                <th>예측 역할</th>
                <th>신뢰도</th>
                <th>결과</th>
                <th>카테고리</th>
                <th>난이도</th>
              </tr>
            </thead>
            <tbody>
              ${results
                .map((r) => {
                  const resultBadge = r.isCorrect
                    ? '<span class="badge badge-success">✓ 정답</span>'
                    : '<span class="badge badge-error">✗ 오답</span>'
                  return `
              <tr>
                <td style="font-family: monospace; font-size: 0.9em;">${r.sampleId}</td>
                <td>${r.metadata.intendedRole}</td>
                <td><strong>${r.predictedRole || '(undefined)'}</strong></td>
                <td>${(r.confidence * 100).toFixed(1)}%</td>
                <td>${resultBadge}</td>
                <td><span class="badge badge-${r.metadata.category}">${r.metadata.category}</span></td>
                <td><span class="badge badge-${r.metadata.difficulty}">${r.metadata.difficulty}</span></td>
              </tr>
            `
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>memradar AI 역할 평가 시스템 | 자동 생성</p>
    </div>
  </div>

  <script>
    const categoryData = {
      labels: ${JSON.stringify(categoryLabels)},
      datasets: [{
        label: '정확도 (%)',
        data: ${JSON.stringify(categoryAccuracy)},
        backgroundColor: ['#667eea', '#764ba2', '#f093fb', '#4facfe'],
        borderRadius: 8,
        borderSkipped: false,
      }]
    };

    const categoryCtx = document.getElementById('categoryChart').getContext('2d');
    new Chart(categoryCtx, {
      type: 'bar',
      data: categoryData,
      options: {
        indexAxis: 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, max: 100 } }
      }
    });

    const difficultyData = {
      labels: ${JSON.stringify(difficultyLabels)},
      datasets: [{
        label: '정확도 (%)',
        data: ${JSON.stringify(difficultyAccuracy)},
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 6,
        pointBackgroundColor: '#667eea',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
      }]
    };

    const difficultyCtx = document.getElementById('difficultyChart').getContext('2d');
    new Chart(difficultyCtx, {
      type: 'line',
      data: difficultyData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, max: 100 } }
      }
    });
  </script>
</body>
</html>`

  fs.writeFileSync(outputPath, html)
}

async function main() {
  // fileURLToPath: Windows 에서 import.meta.url 의 '/D:/...' 형태를 'D:\...' 로 정규화
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const samplesDir = path.join(currentDir, '..', 'tests', 'fixtures', 'role-eval-samples')
  const docsDir = path.join(currentDir, '..', 'docs')

  console.log(`\n${'='.repeat(50)}`)
  console.log(`📊 AI 역할 평가 테스트 시작`)
  console.log(`${'='.repeat(50)}`)

  const loaded = loadSamples(samplesDir)
  console.log(`✓ 샘플 로드: ${loaded.length}개\n`)

  if (loaded.length === 0) {
    console.error(`❌ 샘플을 찾을 수 없습니다.`)
    console.log(`📁 경로: ${samplesDir}`)
    return
  }

  console.log(`⏳ 평가 진행 중...`)
  const results = loaded.map(({ sample, metadata }) => evaluateSample(sample, metadata))
  const stats = computeStats(results)

  // Print summary
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`📈 전체 결과`)
  console.log(`${'─'.repeat(50)}`)
  console.log(`정확도: ${(stats.accuracy * 100).toFixed(1)}% (${stats.correct}/${stats.total})`)

  console.log(`\n카테고리별:`)
  for (const [cat, data] of Object.entries(stats.byCategory)) {
    if (data.total > 0) {
      console.log(
        `  • ${cat.padEnd(15)} ${(data.accuracy * 100).toFixed(1).padStart(5)}% (${data.correct}/${data.total})`
      )
    }
  }

  console.log(`\n난이도별:`)
  for (const [diff, data] of Object.entries(stats.byDifficulty)) {
    if (data.total > 0) {
      const label = diff === 'easy' ? '쉬움' : diff === 'normal' ? '보통' : '어려움'
      console.log(`  • ${label.padEnd(15)} ${(data.accuracy * 100).toFixed(1).padStart(5)}% (${data.correct}/${data.total})`)
    }
  }

  console.log(`\n역할별 (precision / recall / F1):`)
  for (const role of ROLE_IDS) {
    const rs = stats.byRole[role]
    if (rs.support === 0 && rs.fp === 0) continue
    console.log(
      `  • ${role.padEnd(10)} P ${(rs.precision * 100).toFixed(1).padStart(5)}%  ` +
        `R ${(rs.recall * 100).toFixed(1).padStart(5)}%  ` +
        `F1 ${(rs.f1 * 100).toFixed(1).padStart(5)}%  (support ${rs.support})`
    )
  }

  console.log(
    `\nUndecided 비율: ${(stats.undecidedRate * 100).toFixed(1)}% (${stats.undecidedCount}/${stats.total})`
  )
  if (stats.mixed.total > 0) {
    console.log(
      `Mixed: top1 정답 ${stats.mixed.correct}/${stats.mixed.total}, ` +
        `완전정답 ${stats.mixed.fullyCorrect}/${stats.mixed.total}`
    )
  }

  // Generate reports
  console.log(`\n⏳ 리포트 생성 중...`)

  // HTML report
  const htmlPath = path.join(docsDir, 'eval-report.html')
  generateHtmlReport(results, stats, htmlPath)
  console.log(`✓ HTML 리포트: ${htmlPath}`)

  // JSON results
  const jsonPath = path.join(docsDir, 'eval-results.json')
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ stats, results: results.map((r) => ({ ...r, details: undefined })) }, null, 2)
  )
  console.log(`✓ JSON 결과: ${jsonPath}`)

  // Markdown summary
  const mdPath = path.join(docsDir, 'AI-ROLE-EVAL-RESULTS.md')
  const markdown = `# AI 역할 분류 평가 결과

생성 일시: ${new Date().toISOString()}

## 요약

- **정확도**: ${(stats.accuracy * 100).toFixed(1)}% (${stats.correct}/${stats.total})
- **테스트된 샘플**: ${stats.total}개

## 카테고리별 성능

${Object.entries(stats.byCategory)
  .filter(([, v]) => v.total > 0)
  .map(([cat, data]) => `- **${cat}**: ${(data.accuracy * 100).toFixed(1)}% (${data.correct}/${data.total})`)
  .join('\n')}

## 난이도별 성능

${Object.entries(stats.byDifficulty)
  .filter(([, v]) => v.total > 0)
  .map(([diff, data]) => {
    const label = diff === 'easy' ? '쉬움' : diff === 'normal' ? '보통' : '어려움'
    return `- **${label}**: ${(data.accuracy * 100).toFixed(1)}% (${data.correct}/${data.total})`
  })
  .join('\n')}

## 신뢰도 분포

${stats.confidenceDistribution
  .map(
    (dist) =>
      `- **${(dist.min * 100).toFixed(0)}%-${(dist.max * 100).toFixed(0)}%**: ${(dist.accuracy * 100).toFixed(1)}% (${dist.correct}/${dist.total})`
  )
  .join('\n')}

## 상세 샘플 결과

| ID | 의도 | 예측 | 신뢰도 | 정답 | 난이도 | 카테고리 |
|---|---|---|---|---|---|---|
${results
  .map(
    (r) =>
      `| ${r.sampleId} | ${r.metadata.intendedRole} | ${r.predictedRole || '(undefined)'} | ${(r.confidence * 100).toFixed(1)}% | ${r.isCorrect ? '✓' : '✗'} | ${r.metadata.difficulty} | ${r.metadata.category} |`
  )
  .join('\n')}
`
  fs.writeFileSync(mdPath, markdown)
  console.log(`✓ 마크다운 요약: ${mdPath}`)

  console.log(`\n${'='.repeat(50)}`)
  console.log(`✅ 평가 완료!`)
  console.log(`${'='.repeat(50)}`)
  console.log(`\n🌐 HTML 리포트를 브라우저에서 보기:`)
  console.log(`   open ${htmlPath}`)
  console.log()
}

main().catch(console.error)
