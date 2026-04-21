#!/usr/bin/env node
/**
 * memtest eval runner — reads samples, runs analyzeUsageRoles, computes stats, writes reports.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ── Inline the scoring engine (mirrors usageProfile.ts) ──────────────────────

function isAsciiOnly(s) {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 127) return false
  return true
}
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function countMatches(text, keyword) {
  if (!keyword) return 0
  if (isAsciiOnly(keyword)) {
    const hits = text.match(new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'g'))
    return hits ? hits.length : 0
  }
  let count = 0, idx = 0
  while (idx <= text.length) {
    const hit = text.indexOf(keyword, idx)
    if (hit === -1) break
    count++
    idx = hit + keyword.length
  }
  return count
}
function sumHits(text, kws) { return kws.reduce((t, k) => t + countMatches(text, k), 0) }
function scoreMessageText(text, sig) {
  const phrase = Math.min(sumHits(text, sig.phraseStrong), 2)
  const strong = Math.min(sumHits(text, sig.tokenStrong), 4)
  const weak   = Math.min(sumHits(text, sig.tokenWeak),   5)
  const neg    = Math.min(sumHits(text, sig.negative),    3)
  const s = phrase * 4.0 + strong * 2.5 + weak * 1.0 - neg * 2.0
  return s > 0 ? s : 0
}
const TOOL_ALIAS = {
  edit: ['edit', 'multiedit', 'apply_patch', 'str_replace', 'str_replace_editor'],
  write: ['write', 'create_file'],
  read: ['read', 'view_file', 'view_image'],
  search: ['grep', 'glob', 'ripgrep'],
  shell: ['bash', 'exec_command', 'shell'],
  image_gen: ['image_gen', 'generate_image'],
}
function normalizeToolName(raw) {
  const lower = raw.toLowerCase()
  for (const alias in TOOL_ALIAS) if (TOOL_ALIAS[alias].includes(lower)) return alias
  return null
}
function scoreGroupTools(toolUses, hints) {
  if (!hints.length || !toolUses.length) return 0
  let hits = 0
  for (const t of toolUses) { const a = normalizeToolName(t); if (a && hints.includes(a)) hits++ }
  return Math.min(hits, 3) * 1.5
}

const CATEGORIES = [
  { id: 'feature', signals: {
      phraseStrong: ['구현해줘','만들어줘','추가해줘','새 페이지','새 기능','api 연결'],
      tokenStrong: ['구현','추가','feature','component','endpoint','route'],
      tokenWeak: ['페이지','기능','create'],
      negative: ['원인','왜','에러','오류','리뷰'],
      toolHints: ['edit','write'] } },
  { id: 'debug', signals: {
      phraseStrong: ['에러 원인','왜 안돼','깨져','고쳐줘','수정해줘','실패해'],
      tokenStrong: ['버그','error','오류','fix','debug','broken','undefined','null'],
      tokenWeak: ['warning','fail','crash','안됨'],
      negative: ['새 기능','리팩터링','문서'],
      toolHints: ['shell','read','search','edit'] } },
  { id: 'refactor', signals: {
      phraseStrong: ['리팩터링','구조 정리','코드 정리','깔끔하게','나눠줘'],
      tokenStrong: ['refactor','cleanup','simplify','extract','rename','restructure'],
      tokenWeak: ['정리','개선','split'],
      negative: ['버그','에러 원인','새 기능'],
      toolHints: ['edit'] } },
  { id: 'review', signals: {
      phraseStrong: ['리뷰해줘','설명해줘','분석해줘','어떻게 동작','왜 이렇게'],
      tokenStrong: ['review','분석','설명','이해','확인'],
      tokenWeak: ['analyze'],
      negative: ['구현','추가','고쳐','배포'],
      toolHints: ['read','search'] } },
  { id: 'writing', signals: {
      phraseStrong: ['문서 작성','정리해줘','요약해줘','번역해줘','readme 써줘'],
      tokenStrong: ['문서','readme','translate','summary','markdown','report'],
      tokenWeak: ['작성','blog'],
      negative: ['에러','디버그','테스트 실패'],
      toolHints: ['write','edit'] } },
  { id: 'design', signals: {
      phraseStrong: ['디자인 바꿔줘','ui 손봐줘','스타일 수정','레이아웃 바꿔줘','반응형','로고 만들어','이미지 생성','무드보드','색감 바꿔'],
      tokenStrong: ['디자인','ui','ux','css','layout','responsive','theme','브랜딩','로고','무드','palette'],
      tokenWeak: ['color','font','spacing','style','이미지','그래픽','일러스트'],
      negative: ['빌드','배포','테스트 실패'],
      toolHints: ['edit','write','image_gen'] } },
  { id: 'devops', signals: {
      phraseStrong: ['배포해줘','빌드 깨져','환경 변수','ci 설정','github action'],
      tokenStrong: ['deploy','배포','docker','vercel','env','pipeline','workflow'],
      tokenWeak: ['build','aws','npm'],
      negative: ['설명만','리뷰','문서'],
      toolHints: ['shell','edit','write'] } },
  { id: 'data', signals: {
      phraseStrong: ['데이터 변환','쿼리 짜줘','json 파싱','schema 바꿔줘','migration'],
      tokenStrong: ['data','database','sql','query','json','csv','schema'],
      tokenWeak: ['db','parse','migration'],
      negative: ['디자인','폰트','레이아웃'],
      toolHints: ['read','edit','shell'] } },
  { id: 'test', signals: {
      phraseStrong: ['테스트 추가','테스트 작성','e2e 짜줘','spec 만들어줘','재현 케이스'],
      tokenStrong: ['test','spec','jest','playwright','e2e','unit','coverage'],
      tokenWeak: ['mock','assert','expect'],
      negative: ['배포','디자인만','문서'],
      toolHints: ['shell','edit','write'] } },
]

function analyzeSession(sample) {
  const msgs = sample.messages
  const scores = {}
  const matchedByCategory = {}
  for (const c of CATEGORIES) { scores[c.id] = 0; matchedByCategory[c.id] = 0 }

  let totalUser = 0, matchedMessages = 0

  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i]
    if (msg.role !== 'user') continue
    totalUser++

    let groupTools = []
    for (let j = i + 1; j < msgs.length; j++) {
      if (msgs[j].role === 'assistant') { groupTools = msgs[j].toolUses || []; break }
    }

    const text = msg.text.toLowerCase()
    let any = false
    for (const cat of CATEGORIES) {
      const ts = scoreMessageText(text, cat.signals)
      const tb = scoreGroupTools(groupTools, cat.signals.toolHints)
      const s = ts + tb
      if (s > 0) { scores[cat.id] += s; matchedByCategory[cat.id]++; any = true }
    }
    if (any) matchedMessages++
  }

  // undecided check
  if (totalUser < 4 || matchedMessages < 2) return { predicted: null, confidence: 'low', scores, undecided: true }

  const ranked = CATEGORIES
    .map(c => ({ id: c.id, score: scores[c.id] }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)

  if (!ranked.length) return { predicted: null, confidence: 'low', scores, undecided: false }

  const top = ranked[0]
  const second = ranked[1]
  const total = ranked.reduce((s, c) => s + c.score, 0)

  // confidence (simplified sigmoid model)
  const matchedCoverage = totalUser > 0 ? matchedMessages / totalUser : 0
  const topShare = total > 0 ? top.score / total : 0
  const gapRatio = second ? (top.score - second.score) / Math.max(top.score, 1) : 1
  const support = matchedByCategory[top.id] || 0

  function sigmoid(x, mid, slope) { return 1 / (1 + Math.exp(-slope * (x - mid))) }
  const idx =
    sigmoid(matchedCoverage, 0.25, 10) * 0.35 +
    sigmoid(topShare, 0.38, 12) * 0.35 +
    sigmoid(gapRatio, 0.18, 12) * 0.2 +
    sigmoid(support, 6, 0.8) * 0.1

  const confidence = idx < 0.45 ? 'low' : idx < 0.7 ? 'medium' : 'high'

  return { predicted: top.id, confidence, scores, undecided: false }
}

// ── Load samples ──────────────────────────────────────────────────────────────

const samplesDir = path.join(ROOT, 'tests/fixtures/role-eval-samples')
const files = fs.readdirSync(samplesDir).filter(f => f.endsWith('.json')).sort()
const samples = files.map(f => JSON.parse(fs.readFileSync(path.join(samplesDir, f), 'utf8')))

console.log(`✓ 샘플 로드: ${samples.length}개`)

// ── Evaluate ──────────────────────────────────────────────────────────────────

const results = []
for (const sample of samples) {
  // Build a fake Session array (id=sample.id, messages as-is)
  const fakeSession = { id: sample.id, messages: sample.messages }
  const res = analyzeSession(fakeSession)
  const correct = res.predicted != null && sample.acceptableRoles.includes(res.predicted)
  results.push({
    id: sample.id,
    file: `sample-${String(sample.id).padStart(3, '0')}`,
    intendedRole: sample.intendedRole,
    acceptableRoles: sample.acceptableRoles,
    category: sample.category || 'unknown',
    difficulty: sample.difficulty || 'normal',
    predicted: res.predicted,
    confidence: res.confidence,
    undecided: res.undecided,
    correct,
    scores: res.scores,
  })
}

const total = results.length
const correct = results.filter(r => r.correct).length
const undecidedCount = results.filter(r => r.undecided).length

console.log(`✓ 평가 완료`)
console.log('─────────────────────────────────────')

// Overall
console.log(`📊 정확도: ${(correct/total*100).toFixed(1)}% (${correct}/${total})`)
if (undecidedCount) console.log(`  ⚠ undecided: ${undecidedCount}개`)

// By category
const cats = ['pure','mixed','ambiguous','consistency']
for (const cat of cats) {
  const sub = results.filter(r => r.category === cat)
  if (!sub.length) continue
  const c = sub.filter(r => r.correct).length
  console.log(`  • ${cat.padEnd(12)}: ${(c/sub.length*100).toFixed(1)}% (${c}/${sub.length})`)
}

// By difficulty
const diffs = ['easy','normal','hard']
console.log()
for (const d of diffs) {
  const sub = results.filter(r => r.difficulty === d)
  if (!sub.length) continue
  const c = sub.filter(r => r.correct).length
  console.log(`  • ${d.padEnd(8)}: ${(c/sub.length*100).toFixed(1)}% (${c}/${sub.length})`)
}

// Per-role accuracy
const roles = ['feature','debug','refactor','review','writing','design','devops','data','test']
const roleStats = {}
for (const r of roles) {
  const sub = results.filter(x => x.intendedRole === r)
  const c = sub.filter(x => x.correct).length
  roleStats[r] = { total: sub.length, correct: c }
}

console.log()
console.log('역할별 정확도:')
for (const r of roles) {
  const s = roleStats[r]
  if (!s.total) continue
  const pct = (s.correct/s.total*100).toFixed(1)
  const bar = '█'.repeat(Math.round(s.correct/s.total*20)) + '░'.repeat(20 - Math.round(s.correct/s.total*20))
  console.log(`  ${r.padEnd(10)}: ${bar} ${pct}% (${s.correct}/${s.total})`)
}

// Confusion matrix
console.log()
console.log('혼동 행렬 (predicted → actual 오분류 top 10):')
const confusions = {}
for (const r of results) {
  if (!r.correct && r.predicted) {
    const key = `${r.intendedRole} → ${r.predicted}`
    confusions[key] = (confusions[key] || 0) + 1
  }
}
const topConfusions = Object.entries(confusions).sort((a,b) => b[1]-a[1]).slice(0, 10)
for (const [k, v] of topConfusions) console.log(`  ${k}: ${v}`)

// ── Write JSON ────────────────────────────────────────────────────────────────

const jsonOut = {
  generatedAt: new Date().toISOString(),
  totalSamples: total,
  correctCount: correct,
  accuracy: correct / total,
  undecidedCount,
  byCategoryAccuracy: Object.fromEntries(cats.map(cat => {
    const sub = results.filter(r => r.category === cat)
    return [cat, sub.length ? sub.filter(r => r.correct).length / sub.length : null]
  })),
  byDifficultyAccuracy: Object.fromEntries(diffs.map(d => {
    const sub = results.filter(r => r.difficulty === d)
    return [d, sub.length ? sub.filter(r => r.correct).length / sub.length : null]
  })),
  byRoleAccuracy: roleStats,
  confusionMatrix: confusions,
  results: results.map(r => ({
    id: r.id, file: r.file, intendedRole: r.intendedRole, acceptableRoles: r.acceptableRoles,
    category: r.category, difficulty: r.difficulty, predicted: r.predicted,
    confidence: r.confidence, undecided: r.undecided, correct: r.correct,
  })),
}
fs.writeFileSync(path.join(ROOT, 'docs/eval-results.json'), JSON.stringify(jsonOut, null, 2))

// ── Write HTML report ─────────────────────────────────────────────────────────

const accuracyPct = (correct / total * 100).toFixed(1)
const categoryRows = cats.map(cat => {
  const sub = results.filter(r => r.category === cat)
  if (!sub.length) return ''
  const c = sub.filter(r => r.correct).length
  const pct = (c / sub.length * 100).toFixed(1)
  return `<tr><td>${cat}</td><td>${c}/${sub.length}</td><td>${pct}%</td><td><div class="bar"><div class="fill" style="width:${pct}%"></div></div></td></tr>`
}).join('')

const diffRows = diffs.map(d => {
  const sub = results.filter(r => r.difficulty === d)
  if (!sub.length) return ''
  const c = sub.filter(r => r.correct).length
  const pct = (c / sub.length * 100).toFixed(1)
  return `<tr><td>${d}</td><td>${c}/${sub.length}</td><td>${pct}%</td><td><div class="bar"><div class="fill" style="width:${pct}%"></div></div></td></tr>`
}).join('')

const roleRows = roles.map(r => {
  const s = roleStats[r]
  if (!s.total) return ''
  const pct = (s.correct / s.total * 100).toFixed(1)
  return `<tr><td>${r}</td><td>${s.correct}/${s.total}</td><td>${pct}%</td><td><div class="bar"><div class="fill" style="width:${pct}%"></div></div></td></tr>`
}).join('')

// Build confusion matrix HTML (roles × roles)
const confMatrix = {}
for (const r of roles) confMatrix[r] = {}
for (const r of results) {
  if (r.predicted) {
    confMatrix[r.intendedRole][r.predicted] = (confMatrix[r.intendedRole][r.predicted] || 0) + 1
  }
}
const maxVal = Math.max(...Object.values(confMatrix).flatMap(row => Object.values(row)))
const matrixHeader = `<tr><th></th>${roles.map(r => `<th>${r}</th>`).join('')}</tr>`
const matrixBody = roles.map(actual => {
  const cells = roles.map(pred => {
    const v = confMatrix[actual][pred] || 0
    const intensity = maxVal > 0 ? Math.round((v / maxVal) * 200) : 0
    const bg = actual === pred
      ? `rgba(34, 197, 94, ${v > 0 ? 0.2 + (v/maxVal)*0.6 : 0})`
      : `rgba(239, 68, 68, ${v > 0 ? 0.1 + (v/maxVal)*0.7 : 0})`
    return `<td style="background:${bg};text-align:center">${v || ''}</td>`
  }).join('')
  return `<tr><th>${actual}</th>${cells}</tr>`
}).join('')

// Sample details table (first 50 rows for brevity)
const sampleRows = results.map(r => {
  const status = r.undecided ? '⚪ undecided' : r.correct ? '✅ 정답' : '❌ 오답'
  const predicted = r.predicted || '(none)'
  const rowClass = r.undecided ? '' : r.correct ? 'correct' : 'wrong'
  return `<tr class="${rowClass}"><td>${r.id}</td><td>${r.intendedRole}</td><td>${predicted}</td><td>${r.confidence}</td><td>${r.category}</td><td>${r.difficulty}</td><td>${status}</td></tr>`
}).join('')

// Confidence accuracy
const confGroups = { low: {t:0,c:0}, medium: {t:0,c:0}, high: {t:0,c:0} }
for (const r of results) {
  if (confGroups[r.confidence]) { confGroups[r.confidence].t++; if (r.correct) confGroups[r.confidence].c++ }
}
const confRows = Object.entries(confGroups).map(([conf, s]) => {
  const pct = s.t ? (s.c/s.t*100).toFixed(1) : 'N/A'
  return `<tr><td>${conf}</td><td>${s.c}/${s.t}</td><td>${pct}${s.t ? '%' : ''}</td></tr>`
}).join('')

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI 역할 평가 리포트 — ${new Date().toLocaleDateString('ko-KR')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0 }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.6 }
  .container { max-width: 1200px; margin: 0 auto; padding: 2rem 1rem }
  h1 { font-size: 1.8rem; color: #f1f5f9; margin-bottom: 0.25rem }
  .meta { color: #64748b; font-size: 0.85rem; margin-bottom: 2rem }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem }
  .card { background: #1e293b; border-radius: 12px; padding: 1.5rem; text-align: center }
  .card-val { font-size: 2.5rem; font-weight: 700; color: #7c3aed }
  .card-lbl { font-size: 0.8rem; color: #94a3b8; margin-top: 0.25rem }
  h2 { font-size: 1.2rem; margin: 2rem 0 0.75rem; color: #cbd5e1 }
  table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden }
  th, td { padding: 0.6rem 0.8rem; text-align: left; font-size: 0.85rem; border-bottom: 1px solid #334155 }
  th { background: #0f172a; color: #94a3b8; font-weight: 600 }
  .bar { background: #334155; border-radius: 4px; height: 8px; overflow: hidden }
  .fill { background: #7c3aed; height: 100%; border-radius: 4px }
  .correct td { background: rgba(34,197,94,0.05) }
  .wrong td { background: rgba(239,68,68,0.05) }
  .section { margin-bottom: 2.5rem }
  #filter-input { background: #1e293b; border: 1px solid #334155; color: #e2e8f0; padding: 0.5rem 0.8rem; border-radius: 6px; width: 300px; font-size: 0.85rem; margin-bottom: 0.75rem }
  .matrix-wrap { overflow-x: auto }
  .matrix-wrap table th, .matrix-wrap table td { font-size: 0.75rem; padding: 0.3rem 0.4rem; min-width: 55px; text-align: center }
  .export-btn { background: #7c3aed; border: none; color: #fff; padding: 0.4rem 0.9rem; border-radius: 6px; cursor: pointer; font-size: 0.8rem; margin-bottom: 0.75rem }
  .export-btn:hover { background: #6d28d9 }
</style>
</head>
<body>
<div class="container">
  <h1>AI 역할 평가 리포트</h1>
  <p class="meta">생성: ${new Date().toLocaleString('ko-KR')} &nbsp;|&nbsp; 모델: analyzeUsageRoles (Phase 3)</p>

  <div class="cards">
    <div class="card"><div class="card-val">${accuracyPct}%</div><div class="card-lbl">전체 정확도</div></div>
    <div class="card"><div class="card-val">${correct}/${total}</div><div class="card-lbl">정답 / 전체</div></div>
    <div class="card"><div class="card-val">${undecidedCount}</div><div class="card-lbl">Undecided</div></div>
    <div class="card"><div class="card-val">${topConfusions.length ? topConfusions[0][0].split(' → ')[0] + '↔' + topConfusions[0][0].split(' → ')[1] : 'N/A'}</div><div class="card-lbl">최다 혼동 쌍</div></div>
  </div>

  <div class="section">
    <h2>카테고리별 정확도</h2>
    <table><thead><tr><th>카테고리</th><th>정답/전체</th><th>정확도</th><th>Bar</th></tr></thead>
    <tbody>${categoryRows}</tbody></table>
  </div>

  <div class="section">
    <h2>난이도별 정확도</h2>
    <table><thead><tr><th>난이도</th><th>정답/전체</th><th>정확도</th><th>Bar</th></tr></thead>
    <tbody>${diffRows}</tbody></table>
  </div>

  <div class="section">
    <h2>역할별 정확도</h2>
    <table><thead><tr><th>역할</th><th>정답/전체</th><th>정확도</th><th>Bar</th></tr></thead>
    <tbody>${roleRows}</tbody></table>
  </div>

  <div class="section">
    <h2>신뢰도별 정확도</h2>
    <table><thead><tr><th>신뢰도</th><th>정답/전체</th><th>정확도</th></tr></thead>
    <tbody>${confRows}</tbody></table>
  </div>

  <div class="section">
    <h2>혼동 행렬 (실제 역할 → 예측 역할)</h2>
    <div class="matrix-wrap">
      <table><thead>${matrixHeader}</thead><tbody>${matrixBody}</tbody></table>
    </div>
  </div>

  <div class="section">
    <h2>샘플 상세 결과</h2>
    <input id="filter-input" placeholder="역할 또는 ID 검색..." oninput="filterTable(this.value)">
    <button class="export-btn" onclick="exportCSV()">CSV 내보내기</button>
    <table id="samples-table">
      <thead><tr><th>ID</th><th>실제 역할</th><th>예측</th><th>신뢰도</th><th>카테고리</th><th>난이도</th><th>결과</th></tr></thead>
      <tbody id="samples-body">${sampleRows}</tbody>
    </table>
  </div>
</div>
<script>
const rawData = ${JSON.stringify(results.map(r => ({ id: r.id, intendedRole: r.intendedRole, predicted: r.predicted, confidence: r.confidence, category: r.category, difficulty: r.difficulty, correct: r.correct, undecided: r.undecided })))};
function filterTable(q) {
  const rows = document.querySelectorAll('#samples-body tr')
  const lq = q.toLowerCase()
  rows.forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(lq) ? '' : 'none'
  })
}
function exportCSV() {
  const header = 'id,intendedRole,predicted,confidence,category,difficulty,correct'
  const lines = rawData.map(r => [r.id, r.intendedRole, r.predicted||'', r.confidence, r.category, r.difficulty, r.correct].join(','))
  const blob = new Blob([header + '\\n' + lines.join('\\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'eval-results.csv'
  a.click()
}
</script>
</body>
</html>`

fs.writeFileSync(path.join(ROOT, 'docs/eval-report.html'), html)
console.log()
console.log(`📄 HTML 리포트: docs/eval-report.html`)
console.log(`📄 JSON 데이터: docs/eval-results.json`)
