import { execSync } from 'child_process'

const raw = await new Promise(r => {
  let buf = ''
  process.stdin.on('data', d => buf += d)
  process.stdin.on('end', () => r(buf))
})
const input = JSON.parse(raw || '{}')

// 무한루프 방지: 이전 block으로 재발동된 Stop은 통과
if (input.stop_hook_active) process.exit(0)

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd()

let changed = []
try {
  changed = execSync('git diff --name-only HEAD', { cwd, encoding: 'utf-8' })
    .split('\n').filter(Boolean)
} catch { process.exit(0) }

const srcChanged = changed.filter(f => /^(src|cli)\//.test(f))
if (srcChanged.length === 0) process.exit(0)

const docsChanged = changed.filter(f => f.startsWith('docs/'))
if (docsChanged.length > 0) process.exit(0)

const DOC_MAP = [
  { re: /^src\/parser\.ts|src\/types\.ts/, docs: ['docs/ARCHITECTURE.md'] },
  { re: /^src\/components\//,              docs: ['docs/DESIGN-GUIDE.md'] },
  { re: /^src\/lib\//,                     docs: ['docs/ARCHITECTURE.md'] },
  { re: /^src\/index\.css/,                docs: ['docs/DESIGN-GUIDE.md'] },
  { re: /^cli\//,                          docs: ['docs/ARCHITECTURE.md', 'docs/DEPLOYMENT.md'] },
]

const docsToCheck = new Set()
for (const f of srcChanged) {
  for (const { re, docs } of DOC_MAP) {
    if (re.test(f)) docs.forEach(d => docsToCheck.add(d))
  }
}

const fileList = srcChanged.map(f => `- \`${f}\``).join('\n')
const docList  = [...docsToCheck].map(d => `- [ ] \`${d}\``).join('\n')

console.log(JSON.stringify({
  decision: 'block',
  reason: '소스 파일이 변경됐지만 docs/ 가 업데이트되지 않았습니다.',
  additionalContext: `## ⚠️ 문서 업데이트 필요

수정된 소스 파일:
${fileList}

업데이트가 필요한 문서:
${docList}

업데이트가 불필요하다면 "문서 변경 불필요 — 이유: ..." 로 명시해주세요.`,
}))
