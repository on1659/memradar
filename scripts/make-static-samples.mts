#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'

interface Message {
  role: 'user' | 'assistant'
  text: string
  toolUses: string[]
}

interface Sample {
  id: string
  generator: string
  createdAt: string
  intendedRole: string
  acceptableRoles: string[]
  category: 'pure' | 'mixed' | 'ambiguous' | 'consistency'
  difficulty: 'easy' | 'normal' | 'hard'
  length: { total: number; userMessages: number; assistantMessages: number }
  scenario: string
  messages: Message[]
}

const CATEGORY_PROMPTS: Record<string, { user: string[]; assistant: string[]; tools: string[] }> = {
  feature: {
    user: [
      '새 기능 추가해줘',
      '사용자 대시보드에 필터 기능 만들어줘',
      'api 연결 해줘',
      '새 페이지 만들어줘',
      '기능 구현 부탁',
      '컴포넌트 추가해줘',
      'endpoint 추가해줘',
      'route 만들어줘',
      '이거 구현해줘 사용자 프로필 편집',
      'create 해줘',
    ],
    assistant: [
      '새 기능 구현하겠습니다. feature 컴포넌트를 추가하고 endpoint를 만들어드릴게요.',
      'component 추가하고 route 연결했습니다.',
      'api 연결하고 페이지 완성했어요. feature가 잘 작동합니다.',
      'endpoint 추가 완료. 새 기능이 동작합니다.',
      'create 완료. route와 component 모두 준비됐습니다.',
    ],
    tools: ['Edit', 'Write', 'MultiEdit'],
  },
  debug: {
    user: [
      '에러 원인 찾아줘',
      '왜 안돼',
      '깨져',
      '고쳐줘',
      '수정해줘',
      '실패해',
      '버그 있어',
      'error 떠',
      '오류 해결해줘',
      'undefined 나옴',
      'null 에러',
      'fix 해줘',
      'broken 됐어',
    ],
    assistant: [
      'error 원인을 찾아보겠습니다. debug 해볼게요.',
      '버그 원인 파악 중입니다. fix 하겠습니다.',
      'undefined 문제네요. null check 추가하고 고쳤습니다.',
      'broken된 부분 수정 완료. warning도 제거했습니다.',
      'fail 원인은 async 처리였네요. debug 끝내고 fix 완료.',
      'crash 원인 찾았습니다. error handling 추가.',
    ],
    tools: ['Bash', 'Read', 'Grep', 'Edit'],
  },
  refactor: {
    user: [
      '리팩터링 해줘',
      '구조 정리해줘',
      '코드 정리 부탁',
      '깔끔하게 만들어줘',
      '함수 나눠줘',
      '정리 필요해',
      '개선해줘',
      'refactor',
      'split 해줘',
      'extract 해줘',
      'rename 해줘',
      'cleanup',
      'simplify',
      'restructure',
    ],
    assistant: [
      '리팩터링 진행하겠습니다. refactor 하고 extract 해볼게요.',
      '코드 정리 완료. cleanup과 rename 적용했습니다.',
      '구조 정리했습니다. simplify하고 split 했어요.',
      'refactor 끝. extract method 적용했습니다.',
      'restructure 완료. 개선된 구조로 정리됐어요.',
    ],
    tools: ['Edit', 'MultiEdit'],
  },
  review: {
    user: [
      '이 코드 리뷰해줘',
      '설명해줘 이거',
      '어떻게 동작하는지 분석해줘',
      '왜 이렇게 짰어?',
      '분석 부탁',
      '이해가 안 돼',
      '확인해줘',
      'review 해줘',
      'analyze 해줘',
      '동작 방식 알려줘',
    ],
    assistant: [
      '코드 review 해보겠습니다. analyze 진행할게요.',
      '이 부분은 async pattern입니다. 설명드릴게요.',
      '분석 결과 알려드립니다. 구조는 이렇게 동작해요.',
      'review 완료. 전반적으로 괜찮은 구조입니다.',
      '이해를 돕기 위해 분석하고 설명드립니다.',
    ],
    tools: ['Read', 'Grep', 'Glob'],
  },
  writing: {
    user: [
      '문서 작성 해줘',
      '정리해줘',
      '요약해줘',
      '번역해줘',
      'readme 써줘',
      'markdown 작성 부탁',
      'report 만들어줘',
      'summary 해줘',
      'translate',
      '블로그 글 써줘',
      '문서에 추가해줘',
    ],
    assistant: [
      'readme 작성하겠습니다. markdown 으로 document 만들게요.',
      '문서 summary 완료. translate도 했습니다.',
      'report 작성했습니다. 문서 구조는 이렇게 잡았어요.',
      'readme 업데이트. markdown 포맷으로 정리했습니다.',
      '요약 문서 작성 완료. 번역 버전도 추가했어요.',
    ],
    tools: ['Write', 'Edit'],
  },
  design: {
    user: [
      '디자인 바꿔줘',
      'ui 손봐줘',
      '스타일 수정해줘',
      '레이아웃 바꿔줘',
      '반응형으로 만들어줘',
      '로고 만들어줘',
      '이미지 생성해줘',
      '무드보드',
      '색감 바꿔',
      '브랜딩 도와줘',
      'css 수정',
      'ux 개선',
      'palette 정하자',
    ],
    assistant: [
      '디자인 수정하겠습니다. ui css 바꿀게요.',
      'layout 변경 완료. responsive 적용했습니다.',
      '로고 이미지 생성했어요. 무드보드에 맞게 palette 조정.',
      'ux 개선 완료. theme 조정하고 color 수정했습니다.',
      'css 스타일 업데이트. 브랜딩 맞춰서 font, spacing 조정.',
    ],
    tools: ['Edit', 'Write'],
  },
  devops: {
    user: [
      '배포해줘',
      '빌드 깨져 도와줘',
      '환경 변수 설정',
      'ci 설정 부탁',
      'github action 만들어줘',
      'docker 설정',
      'vercel 배포',
      '파이프라인 만들어줘',
      'workflow 설정',
      'aws 배포',
      'npm publish',
    ],
    assistant: [
      'deploy 진행하겠습니다. 배포 환경 확인할게요.',
      'docker 설정 완료. pipeline 구성했습니다.',
      'env 변수 추가. workflow 설정 끝났습니다.',
      'github action 만들었어요. ci pipeline 동작합니다.',
      'aws 배포 준비. vercel 설정도 연결했습니다.',
    ],
    tools: ['Bash', 'Edit', 'Write'],
  },
  data: {
    user: [
      '데이터 변환 해줘',
      '쿼리 짜줘',
      'json 파싱 필요해',
      'schema 바꿔줘',
      'migration 만들어줘',
      '데이터베이스 수정',
      'sql 작성해줘',
      'csv 파싱',
      'db 설정',
    ],
    assistant: [
      'sql query 작성하겠습니다. schema 확인할게요.',
      'json parsing 완료. data 변환 적용했습니다.',
      'database migration 준비. schema 업데이트했어요.',
      'csv 처리 완료. query 실행 결과 반환.',
      'data 구조 정리했습니다. db migration 실행했어요.',
    ],
    tools: ['Read', 'Edit', 'Bash'],
  },
  test: {
    user: [
      '테스트 추가해줘',
      '테스트 작성 부탁',
      'e2e 짜줘',
      'spec 만들어줘',
      '재현 케이스 만들어줘',
      'unit test 부탁',
      'coverage 높여줘',
      'playwright 테스트',
      'jest 설정',
    ],
    assistant: [
      'test 추가하겠습니다. unit spec 작성할게요.',
      'e2e test playwright로 구현했어요. coverage 확인.',
      'jest spec 작성 완료. assert 구문 추가했습니다.',
      'mock 설정하고 test 작성. expect 검증 완료.',
      '테스트 커버리지 개선했어요. unit과 e2e 모두 추가.',
    ],
    tools: ['Bash', 'Edit', 'Write'],
  },
}

const CATEGORIES = Object.keys(CATEGORY_PROMPTS)

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickMany<T>(arr: T[], n: number): T[] {
  const out: T[] = []
  for (let i = 0; i < n; i++) out.push(pick(arr))
  return out
}

function generateMessages(
  targetLength: number,
  primaryRole: string,
  secondaryRole: string | null,
  difficulty: 'easy' | 'normal' | 'hard'
): Message[] {
  const msgs: Message[] = []
  const primary = CATEGORY_PROMPTS[primaryRole]
  const secondary = secondaryRole ? CATEGORY_PROMPTS[secondaryRole] : null

  // Signal density by difficulty
  const signalRate = difficulty === 'easy' ? 0.8 : difficulty === 'normal' ? 0.5 : 0.25
  const secondaryRate = secondary ? 0.35 : 0

  let consecutiveUser = 0
  let consecutiveAssistant = 0

  while (msgs.length < targetLength) {
    // Determine next role (alternating with some variance)
    let nextRole: 'user' | 'assistant'
    if (consecutiveUser >= 2) {
      nextRole = 'assistant'
    } else if (consecutiveAssistant >= 2) {
      nextRole = 'user'
    } else {
      nextRole = msgs.length % 2 === 0 ? 'user' : 'assistant'
    }

    const rand = Math.random()
    const useSecondary = rand < secondaryRate && secondary
    const useSignal = rand < signalRate

    let text: string
    let tools: string[] = []

    if (nextRole === 'user') {
      if (useSecondary && secondary) {
        text = pick(secondary.user)
      } else if (useSignal) {
        text = pick(primary.user)
      } else {
        text = pick(['확인했어', '좋아', '다음은?', '이것도 봐줘', '잠깐', '음...', '어떻게 생각해', '맞네', '그러네'])
      }
    } else {
      if (useSecondary && secondary) {
        text = pick(secondary.assistant)
        tools = pickMany(secondary.tools, Math.floor(Math.random() * 2) + 1)
      } else if (useSignal) {
        text = pick(primary.assistant)
        tools = pickMany(primary.tools, Math.floor(Math.random() * 2) + 1)
      } else {
        text = pick([
          '확인했어요',
          '알겠습니다',
          '다음 단계 진행할게요',
          '이어서 작업하겠습니다',
          '네 좋습니다',
          '처리했어요',
        ])
        if (Math.random() < 0.3) tools = [pick(['Read', 'Grep'])]
      }
    }

    msgs.push({ role: nextRole, text, toolUses: tools })

    if (nextRole === 'user') {
      consecutiveUser++
      consecutiveAssistant = 0
    } else {
      consecutiveAssistant++
      consecutiveUser = 0
    }
  }

  return msgs
}

function buildSample(
  id: string,
  category: 'pure' | 'mixed' | 'ambiguous' | 'consistency',
  intendedRole: string,
  acceptableRoles: string[],
  difficulty: 'easy' | 'normal' | 'hard',
  length: number,
  scenario: string,
  secondaryRole?: string
): Sample {
  const messages = generateMessages(length, intendedRole, secondaryRole || null, difficulty)
  const userCount = messages.filter((m) => m.role === 'user').length
  const assistantCount = messages.filter((m) => m.role === 'assistant').length
  return {
    id,
    generator: 'static-hand-crafted',
    createdAt: new Date().toISOString(),
    intendedRole,
    acceptableRoles,
    category,
    difficulty,
    length: { total: messages.length, userMessages: userCount, assistantMessages: assistantCount },
    scenario,
    messages,
  }
}

function generateLength(difficulty: 'easy' | 'normal' | 'hard'): number {
  // Roughly 25/50/25 distribution of short/medium/long
  const bucket = Math.random()
  if (bucket < 0.25) return 50 + Math.floor(Math.random() * 50) // 50-100
  if (bucket < 0.75) return 100 + Math.floor(Math.random() * 150) // 100-250
  return 250 + Math.floor(Math.random() * 150) // 250-400
}

function difficultyFor(index: number): 'easy' | 'normal' | 'hard' {
  // Per category of 8: 2 easy, 4 normal, 2 hard
  if (index < 2) return 'easy'
  if (index < 6) return 'normal'
  return 'hard'
}

function main() {
  const currentDir = path.dirname(new URL(import.meta.url).pathname)
  const outDir = path.join(currentDir, '..', 'tests', 'fixtures', 'role-eval-samples')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  // Clear existing
  for (const f of fs.readdirSync(outDir)) fs.unlinkSync(path.join(outDir, f))

  const samples: Sample[] = []
  let idCounter = 1

  // 72 Pure samples (9 × 8)
  for (const cat of CATEGORIES) {
    for (let i = 0; i < 8; i++) {
      const difficulty = difficultyFor(i)
      const length = generateLength(difficulty)
      const id = `sample-${String(idCounter).padStart(3, '0')}`
      samples.push(
        buildSample(id, 'pure', cat, [cat], difficulty, length, `${cat} 작업 (run ${i + 1})`)
      )
      idCounter++
    }
  }

  // 20 Mixed samples
  const mixedPairs: Array<[string, string]> = [
    ['feature', 'debug'],
    ['feature', 'debug'],
    ['feature', 'debug'],
    ['feature', 'debug'],
    ['feature', 'debug'],
    ['refactor', 'debug'],
    ['refactor', 'debug'],
    ['refactor', 'debug'],
    ['debug', 'test'],
    ['debug', 'test'],
    ['debug', 'test'],
    ['feature', 'design'],
    ['feature', 'design'],
    ['data', 'feature'],
    ['data', 'feature'],
    ['writing', 'review'],
    ['writing', 'review'],
    ['devops', 'debug'],
    ['devops', 'debug'],
    ['review', 'refactor'],
  ]
  for (const [primary, secondary] of mixedPairs) {
    const id = `sample-${String(idCounter).padStart(3, '0')}`
    const length = generateLength('normal')
    samples.push(
      buildSample(
        id,
        'mixed',
        primary,
        [primary, secondary].sort(),
        'normal',
        length,
        `${primary} + ${secondary} 혼합 작업`,
        secondary
      )
    )
    idCounter++
  }

  // 8 Ambiguous samples
  const ambiguous: Array<{ intended: string; acceptable: string[]; scenario: string }> = [
    { intended: 'review', acceptable: ['review', 'feature'], scenario: 'JSX 컴포넌트 설명 요청' },
    { intended: 'review', acceptable: ['review', 'feature'], scenario: 'API 응답 구조 설명' },
    { intended: 'review', acceptable: ['review', 'feature'], scenario: 'React 패턴 설명' },
    { intended: 'data', acceptable: ['data', 'refactor'], scenario: 'JSON 스키마 재구성' },
    { intended: 'data', acceptable: ['data', 'refactor'], scenario: '데이터 형식 변환 및 정리' },
    { intended: 'writing', acceptable: ['writing', 'feature'], scenario: 'README 기능 설명 추가' },
    { intended: 'writing', acceptable: ['writing', 'feature'], scenario: '새 API 문서화' },
    { intended: 'devops', acceptable: ['devops', 'debug', 'review'], scenario: '빌드 실패 분석 및 배포' },
  ]
  for (const amb of ambiguous) {
    const id = `sample-${String(idCounter).padStart(3, '0')}`
    const length = generateLength('normal')
    samples.push(buildSample(id, 'ambiguous', amb.intended, amb.acceptable, 'normal', length, amb.scenario))
    idCounter++
  }

  // 9 Consistency samples (3 scenarios × 3 runs)
  const consistencyScenarios = [
    { name: 'pure-feature', intended: 'feature', acceptable: ['feature'], scenario: 'React 대시보드 통계 탭 추가' },
    {
      name: 'mixed-debug-feature',
      intended: 'debug',
      acceptable: ['debug', 'feature'],
      scenario: '버그 fix + 성능 개선',
      secondary: 'feature',
    },
    {
      name: 'ambiguous-boundary',
      intended: 'review',
      acceptable: ['review', 'feature'],
      scenario: 'TS generics 설명 및 리팩토링',
    },
  ]
  for (const sc of consistencyScenarios) {
    for (let run = 1; run <= 3; run++) {
      const id = `sample-consistency-${sc.name}-run${run}`
      const length = generateLength('normal')
      const cat: 'pure' | 'mixed' | 'ambiguous' =
        sc.acceptable.length === 1 ? 'pure' : sc.name.startsWith('mixed') ? 'mixed' : 'ambiguous'
      samples.push(
        buildSample(id, 'consistency', sc.intended, sc.acceptable, 'normal', length, sc.scenario, (sc as any).secondary)
      )
    }
  }

  // Save
  let saved = 0
  for (const s of samples) {
    const filename = `${s.id}-${s.intendedRole}.json`
    fs.writeFileSync(path.join(outDir, filename), JSON.stringify(s, null, 2))
    saved++
  }

  console.log(`=== Static Sample Generation ===`)
  console.log(`Total: ${saved} samples`)
  console.log(`  Pure: 72`)
  console.log(`  Mixed: 20`)
  console.log(`  Ambiguous: 8`)
  console.log(`  Consistency: 9`)
  console.log(`Output: ${outDir}`)
}

main()
