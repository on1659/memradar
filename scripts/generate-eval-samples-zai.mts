#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'

// Load .env if present (zero-dep)
function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}
loadDotEnv()

const ZAI_ENDPOINT = process.env.ZAI_ENDPOINT || 'https://api.z.ai/api/paas/v4/chat/completions'
const ZAI_MODEL = process.env.ZAI_MODEL || 'glm-4.6'
const ZAI_KEY = process.env.ZAI_API_KEY || process.env.Z_AI_API_KEY

interface SampleMeta {
  intendedRole: string
  acceptableRoles: string[]
  category: 'pure' | 'mixed' | 'ambiguous' | 'consistency'
  difficulty: 'easy' | 'normal' | 'hard'
  scenario: string
}

interface SampleMessage {
  role: 'user' | 'assistant'
  text: string
  toolUses: string[]
}

interface Sample extends SampleMeta {
  id: string
  generator: string
  createdAt: string
  length: {
    total: number
    userMessages: number
    assistantMessages: number
  }
  messages: SampleMessage[]
}

const CATEGORIES = ['feature', 'debug', 'refactor', 'review', 'writing', 'design', 'devops', 'data', 'test']
const CLAUDE_TOOLS = ['Edit', 'MultiEdit', 'Write', 'Read', 'Grep', 'Glob', 'Bash', 'Task', 'WebFetch', 'WebSearch', 'TodoWrite']
const CODEX_TOOLS = ['apply_patch', 'exec_command', 'shell', 'update_plan', 'view_image']
const ALL_TOOLS = [...CLAUDE_TOOLS, ...CODEX_TOOLS]
const TOOL_WHITELIST = new Set(ALL_TOOLS)

const MIXED_SAMPLES = [
  { intendedRole: 'feature', secondary: 'debug' },
  { intendedRole: 'feature', secondary: 'debug' },
  { intendedRole: 'feature', secondary: 'debug' },
  { intendedRole: 'feature', secondary: 'debug' },
  { intendedRole: 'feature', secondary: 'debug' },
  { intendedRole: 'refactor', secondary: 'debug' },
  { intendedRole: 'refactor', secondary: 'debug' },
  { intendedRole: 'refactor', secondary: 'debug' },
  { intendedRole: 'debug', secondary: 'test' },
  { intendedRole: 'debug', secondary: 'test' },
  { intendedRole: 'debug', secondary: 'test' },
  { intendedRole: 'feature', secondary: 'design' },
  { intendedRole: 'feature', secondary: 'design' },
  { intendedRole: 'data', secondary: 'feature' },
  { intendedRole: 'data', secondary: 'feature' },
  { intendedRole: 'writing', secondary: 'review' },
  { intendedRole: 'writing', secondary: 'review' },
  { intendedRole: 'devops', secondary: 'debug' },
  { intendedRole: 'devops', secondary: 'debug' },
  { intendedRole: 'review', secondary: 'refactor' },
]

const AMBIGUOUS_SCENARIOS = [
  { intendedRole: 'review', acceptableRoles: ['review', 'feature'], scenario: 'JSX 컴포넌트 코드 설명 요청' },
  { intendedRole: 'review', acceptableRoles: ['review', 'feature'], scenario: 'API 응답 구조 설명' },
  { intendedRole: 'review', acceptableRoles: ['review', 'feature'], scenario: 'React 패턴 설명 및 리팩토링' },
  { intendedRole: 'data', acceptableRoles: ['data', 'refactor'], scenario: 'JSON 스키마 재구성' },
  { intendedRole: 'data', acceptableRoles: ['data', 'refactor'], scenario: '데이터 형식 변환 및 정리' },
  { intendedRole: 'writing', acceptableRoles: ['writing', 'feature'], scenario: 'README 새 기능 설명 추가' },
  { intendedRole: 'writing', acceptableRoles: ['writing', 'feature'], scenario: '새 API 엔드포인트 문서화' },
  { intendedRole: 'devops', acceptableRoles: ['devops', 'debug', 'review'], scenario: '빌드 실패 분석 및 배포 재검토' },
]

const CONSISTENCY_SCENARIOS = [
  { name: 'pure-feature', intendedRole: 'feature', category: 'pure' as const, scenario: 'React 대시보드 통계 탭 추가' },
  {
    name: 'mixed-debug-feature',
    intendedRole: 'debug',
    acceptableRoles: ['debug', 'feature'],
    category: 'mixed' as const,
    scenario: '버그 fix + 성능 개선',
  },
  {
    name: 'ambiguous-boundary',
    intendedRole: 'review',
    acceptableRoles: ['review', 'feature'],
    category: 'ambiguous' as const,
    scenario: 'TS generics 설명 및 리팩토링',
  },
]

interface GenerationConfig {
  id: string
  meta: SampleMeta
}

function generatePureSamples(): GenerationConfig[] {
  const out: GenerationConfig[] = []
  let id = 1
  const scenarios: Record<string, string> = {
    feature: '사용자 대시보드에 새 필터 기능 추가',
    debug: 'React 컴포넌트 무한 렌더링 원인 찾기',
    refactor: '레거시 콜백 코드를 Promise 기반으로 변경',
    review: 'async/await 패턴 코드 리뷰',
    writing: '프로젝트 설치 및 시작 가이드 작성',
    design: '다크 모드 UI 색상 팔레트 디자인',
    devops: 'GitHub Actions CI 파이프라인 설정',
    data: '사용자 활동 데이터 마이그레이션',
    test: 'E2E 테스트 커버리지 확대',
  }
  for (const cat of CATEGORIES) {
    for (let i = 0; i < 8; i++) {
      const difficulty = i < 2 ? 'easy' : i < 6 ? 'normal' : 'hard'
      out.push({
        id: `sample-${String(id).padStart(3, '0')}`,
        meta: {
          intendedRole: cat,
          acceptableRoles: [cat],
          category: 'pure',
          difficulty,
          scenario: `${scenarios[cat]} (variant ${i + 1})`,
        },
      })
      id++
    }
  }
  return out
}

function generateMixedSamples(startId: number): GenerationConfig[] {
  let id = startId
  return MIXED_SAMPLES.map((p) => ({
    id: `sample-${String(id++).padStart(3, '0')}`,
    meta: {
      intendedRole: p.intendedRole,
      acceptableRoles: [p.intendedRole, p.secondary].sort(),
      category: 'mixed',
      difficulty: 'normal',
      scenario: `${p.intendedRole} + ${p.secondary} 혼합 작업`,
    },
  }))
}

function generateAmbiguousSamples(startId: number): GenerationConfig[] {
  let id = startId
  return AMBIGUOUS_SCENARIOS.map((s) => ({
    id: `sample-${String(id++).padStart(3, '0')}`,
    meta: {
      intendedRole: s.intendedRole,
      acceptableRoles: s.acceptableRoles,
      category: 'ambiguous',
      difficulty: 'normal',
      scenario: s.scenario,
    },
  }))
}

function generateConsistencySamples(): GenerationConfig[] {
  const out: GenerationConfig[] = []
  for (const s of CONSISTENCY_SCENARIOS) {
    for (let run = 1; run <= 3; run++) {
      out.push({
        id: `sample-consistency-${s.name}-run${run}`,
        meta: {
          intendedRole: s.intendedRole,
          acceptableRoles: s.acceptableRoles || [s.intendedRole],
          category: s.category,
          difficulty: 'normal',
          scenario: s.scenario,
        },
      })
    }
  }
  return out
}

function createPrompt(config: GenerationConfig): string {
  const { meta } = config
  return `합성 소프트웨어 개발 대화 세션 JSON 을 만들어줘.

## 조건
- intendedRole: "${meta.intendedRole}"
- acceptableRoles: ${JSON.stringify(meta.acceptableRoles)}
- category: "${meta.category}"
- difficulty: "${meta.difficulty}"
- scenario: "${meta.scenario}"
- 총 메시지 수: 50~400 (${meta.difficulty === 'easy' ? '100~150' : meta.difficulty === 'normal' ? '150~250' : '200~350'} 권장)

## 난이도 규칙
${
  meta.difficulty === 'easy'
    ? '강한 키워드/문구 4~6회 등장, 툴 사용 명확히 카테고리와 정렬'
    : meta.difficulty === 'normal'
      ? '키워드 2~4회, 약한 토큰 섞임, 일부 툴은 카테고리와 다름'
      : '의도 드러내는 메시지 1~2개만, 나머지는 일반 코딩 대화, negative 키워드 의도적 혼합'
}

## 말투 규칙 (4가지 섞음)
- 격식: "이 함수의 동작 방식을 설명해주시겠어요?"
- 평어체: "이 함수 뭐하는 건지 알려줘"
- 한 줄: "고쳐" / "왜안됨"
- 생각나열: "아 이거 때문이네 그럼..."

코드 단어는 영어 (useState, const, deploy), 일반 문장은 한국어.
간헐적 오타, "음..." "잠깐" 같은 간투사.

## toolUses 화이트리스트 (이 이름만 사용)
Claude: ${CLAUDE_TOOLS.join(', ')}
Codex: ${CODEX_TOOLS.join(', ')}

assistant 메시지에 0~5개 toolUse, 대부분 1~2.

## 금지
- 특정 회사/사람 이름
- 의도 키워드 5회 이상 같은 메시지 반복 (stuffing)
- 화이트리스트 외 툴

## 출력 (JSON 만, 다른 텍스트 없이)

\`\`\`json
{
  "id": "${config.id}",
  "generator": "${ZAI_MODEL}",
  "createdAt": "${new Date().toISOString()}",
  "intendedRole": "${meta.intendedRole}",
  "acceptableRoles": ${JSON.stringify(meta.acceptableRoles)},
  "category": "${meta.category}",
  "difficulty": "${meta.difficulty}",
  "length": {"total": 0, "userMessages": 0, "assistantMessages": 0},
  "scenario": "${meta.scenario}",
  "messages": [
    {"role": "user", "text": "...", "toolUses": []},
    {"role": "assistant", "text": "...", "toolUses": ["Edit"]}
  ]
}
\`\`\`

제약:
- 연속 user 3개 금지, 연속 assistant 2개 금지
- length 필드의 카운트 정확히 맞추기
- intendedRole, acceptableRoles, category, difficulty, id 값 그대로 유지`
}

async function callZAI(prompt: string): Promise<string | null> {
  const resp = await fetch(ZAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ZAI_KEY}`,
    },
    body: JSON.stringify({
      model: ZAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8000,
      temperature: 0.7,
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Z.AI API ${resp.status}: ${text.slice(0, 200)}`)
  }

  const data = await resp.json() as any
  return data.choices?.[0]?.message?.content ?? null
}

function validateSample(sample: Sample, meta: SampleMeta): string | null {
  if (!sample.id || !Array.isArray(sample.messages)) return 'missing id or messages'
  if (sample.messages.length < 50 || sample.messages.length > 400) return `length ${sample.messages.length} out of range`
  if (sample.intendedRole !== meta.intendedRole) return 'intendedRole mismatch'
  if (JSON.stringify([...sample.acceptableRoles].sort()) !== JSON.stringify([...meta.acceptableRoles].sort())) {
    return 'acceptableRoles mismatch'
  }

  let user = 0, asst = 0, consecU = 0, consecA = 0
  for (const m of sample.messages) {
    if (m.role === 'user') {
      user++; consecU++; consecA = 0
      if (consecU > 3) return 'too many consecutive user'
    } else if (m.role === 'assistant') {
      asst++; consecA++; consecU = 0
      if (consecA > 2) return 'too many consecutive assistant'
      for (const t of m.toolUses || []) {
        if (!TOOL_WHITELIST.has(t)) return `unknown tool: ${t}`
      }
    } else {
      return `invalid role: ${m.role}`
    }
  }
  return null
}

async function generateSample(config: GenerationConfig, retries = 3): Promise<Sample | null> {
  const prompt = createPrompt(config)
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const content = await callZAI(prompt)
      if (!content) {
        console.error(`[${config.id}] attempt ${attempt}/${retries}: empty response`)
        continue
      }
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.error(`[${config.id}] attempt ${attempt}/${retries}: no JSON in response`)
        continue
      }
      const sample: Sample = JSON.parse(jsonMatch[0])
      // Fix length counts if model got them wrong
      const u = sample.messages.filter(m => m.role === 'user').length
      const a = sample.messages.filter(m => m.role === 'assistant').length
      sample.length = { total: sample.messages.length, userMessages: u, assistantMessages: a }
      sample.generator = ZAI_MODEL

      const err = validateSample(sample, config.meta)
      if (err) {
        console.error(`[${config.id}] attempt ${attempt}/${retries}: ${err}`)
        continue
      }
      console.log(`[${config.id}] ✓ ${sample.messages.length} msgs`)
      return sample
    } catch (e) {
      console.error(`[${config.id}] attempt ${attempt}/${retries}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return null
}

async function main() {
  if (!ZAI_KEY) {
    console.error('ERROR: ZAI_API_KEY not set.')
    console.error('Option 1: create .env file (cp .env.example .env and edit)')
    console.error('Option 2: export ZAI_API_KEY="your-key"')
    console.error('Get a key at https://z.ai/')
    process.exit(1)
  }

  const currentDir = path.dirname(new URL(import.meta.url).pathname)
  const outDir = path.join(currentDir, '..', 'tests', 'fixtures', 'role-eval-samples')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  const pure = generatePureSamples()
  const mixed = generateMixedSamples(pure.length + 1)
  const ambig = generateAmbiguousSamples(pure.length + mixed.length + 1)
  const cons = generateConsistencySamples()
  const all = [...pure, ...mixed, ...ambig, ...cons]

  console.log(`\n=== Z.AI Sample Generation (${ZAI_MODEL}) ===`)
  console.log(`Target: ${all.length} samples (${pure.length} pure + ${mixed.length} mixed + ${ambig.length} ambig + ${cons.length} consistency)`)
  console.log(`Output: ${outDir}\n`)

  // Parallelism: Z.AI usually allows 5-10 concurrent; be gentle
  const CONCURRENCY = 4
  let ok = 0, fail = 0

  async function worker(queue: GenerationConfig[]) {
    while (queue.length > 0) {
      const cfg = queue.shift()
      if (!cfg) break
      const sample = await generateSample(cfg)
      if (sample) {
        const filename = `${cfg.id}-${cfg.meta.intendedRole}.json`
        fs.writeFileSync(path.join(outDir, filename), JSON.stringify(sample, null, 2))
        ok++
      } else {
        fail++
      }
    }
  }

  const queue = [...all]
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)))

  console.log(`\n=== Summary ===`)
  console.log(`Generated: ${ok}/${all.length}`)
  console.log(`Failed: ${fail}/${all.length}`)
}

main()
