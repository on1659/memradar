#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 그날 이야기(Story of the Day) 순수 함수 어설션 테스트 (외부 의존성 0, node:assert 만 사용)
 *
 * 실행: npx tsx tests/story-of-day.test.mts
 * 종료 코드: 모두 통과 → 0, 하나라도 실패 → 1
 *
 * 범위: matchRetryMarker(export), buildDailyCollab, renormalizeTermWeights, scoreStoryDays
 * (docs/design/kim-feat-eval-sharpness-design-20260612-013324.md 카드 2 + 공통 데이터 정책,
 *  docs/goal/collab-fingerprint-cards.md W2)
 * + DailyCollab 가산 필드 4종 userWords/aiWords/models/projects · sessionProjectKey
 * (docs/goal/precision-quiz-fingerprint-signals.md W2)
 *
 * TZ 비의존: 모든 어설션은 offsetMinutes 주입 경로(KST=540)로 작성 —
 * 머신 타임존이 무엇이든 같은 결과가 나온다 (coding-rhythm.test.mts 패턴).
 */
import assert from 'node:assert/strict'
import { countWords, matchRetryMarker, stripMarkup } from '../src/parser.ts'
import { buildAuthorshipRatio } from '../src/lib/authorshipRatio.ts'
import { extractProject } from '../src/lib/personality.ts'
import {
  buildDailyCollab,
  LANGUAGE_COUNT_NORMALIZER,
  MIN_ACTIVE_DAYS_FOR_STORY,
  MIN_FOLLOWUPS_FOR_RETRY_TERM,
  MIN_USER_MESSAGES_PER_DAY,
  renormalizeTermWeights,
  scoreStoryDays,
  sessionProjectKey,
  STORY_TERM_WEIGHTS,
} from '../src/lib/storyOfDay.ts'
import type { ParsedMessage, Session, SessionSource, TokenUsage } from '../src/types.ts'

// --- 미니 테스트 러너 -----------------------------------------------------
let passed = 0
let failed = 0
const failures: { name: string; err: unknown }[] = []

function test(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    failures.push({ name, err: e })
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  ✗ ${name}\n    ${msg}`)
  }
}

// --- 픽스처 헬퍼 -----------------------------------------------------------
const KST = 540 // +09:00 — 오프셋 주입으로 머신 TZ 비의존

/** KST 벽시계 시각의 ISO — '2026-06-10', 10, 30 → 2026-06-10T10:30+09:00 */
function kstIso(day: string, hour: number, minute = 0): string {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return `${day}T${hh}:${mm}:00+09:00`
}

function kstMsg(
  role: 'user' | 'assistant',
  text: string,
  day: string,
  hour: number,
  minute = 0,
  tokens?: TokenUsage
): ParsedMessage {
  return { role, text, timestamp: kstIso(day, hour, minute), tokens, toolUses: [] }
}

function makeSession(
  source: SessionSource,
  messages: ParsedMessage[],
  overrides?: { cwd?: string; model?: string; filePath?: string }
): Session {
  return {
    id: `s-${Math.random().toString(36).slice(2)}`,
    fileName: 'fixture.jsonl',
    source,
    messages,
    startTime: messages[0]?.timestamp || '',
    endTime: messages[messages.length - 1]?.timestamp || '',
    totalTokens: { input: 0, output: 0 },
    messageCount: {
      user: messages.filter((m) => m.role === 'user').length,
      assistant: messages.filter((m) => m.role === 'assistant').length,
    },
    ...overrides,
  }
}

/** 활동일만 채우는 필러 — user 1건이라 후보(≥10) 아님, 토큰 없음 */
function fillerSession(source: SessionSource, day: string): Session {
  return makeSession(source, [kstMsg('user', '오늘 작업 메모', day, 12)])
}

/**
 * 페르소나 A — 토큰 폭주일형. 2026-06-10 에 2세션:
 * 세션1: user 13 / assistant 12 교차 (10:00~14:00, 10분 간격), assistant 마다 토큰 150.
 *        follow-up 12건 중 전반 6건 retry('다시 해줘'), 후반 6건 정상.
 * 세션2: user 1 + assistant 1 (15:30/16:00), assistant 토큰 200 → 일 토큰 2000, 시간 범위 6h.
 * 필러 6일 → 활동 7일, 후보 1일.
 */
function personaA(): Session[] {
  const day = '2026-06-10'
  const msgs1: ParsedMessage[] = []
  for (let i = 0; i < 25; i++) {
    const hour = 10 + Math.floor((i * 10) / 60)
    const minute = (i * 10) % 60
    if (i % 2 === 0) {
      const userIndex = i / 2 // 0~12
      const text =
        userIndex === 0
          ? '<command-name>/ship</command-name> src/app.ts 시작'
          : userIndex <= 6
            ? '다시 해줘'
            : '이어서 진행해 주세요'
      msgs1.push(kstMsg('user', text, day, hour, minute))
    } else {
      msgs1.push(kstMsg('assistant', '응답', day, hour, minute, { input: 100, output: 50 }))
    }
  }
  const session2 = makeSession('claude', [
    kstMsg('user', '마무리 점검 부탁', day, 15, 30),
    kstMsg('assistant', '응답', day, 16, 0, { input: 200, output: 0 }),
  ])
  const fillers = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-08']
    .map((d) => fillerSession('claude', d))
  return [makeSession('claude', msgs1), session2, ...fillers]
}

/**
 * 페르소나 B — 다양성형. 2026-07-15 에 1세션: user 10 / assistant 9 교차 (10:00~11:30, 5분 간격).
 * 스킬 5종 + 언어 5종, 토큰 없음(① 결측), follow-up 9건(③ 결측).
 */
function personaB(source: SessionSource = 'claude'): Session[] {
  const day = '2026-07-15'
  const userTexts = [
    '<command-name>/alpha</command-name> main.py 정리',
    '<command-name>/beta</command-name> lib.rs 손보기',
    '<command-name>/gamma</command-name> core.go 점검',
    '<command-name>/delta</command-name> App.java 검토 요청',
    '<command-name>/epsilon</command-name> tool.rb 마무리',
    '이어서 진행해 주세요',
    '다음 단계로 넘어가요',
    '계속 진행해 주세요',
    '한 번 더 이어가요',
    '마지막 정리 부탁해요',
  ]
  const msgs: ParsedMessage[] = []
  for (let i = 0; i < 19; i++) {
    const hour = 10 + Math.floor((i * 5) / 60)
    const minute = (i * 5) % 60
    if (i % 2 === 0) msgs.push(kstMsg('user', userTexts[i / 2], day, hour, minute))
    else msgs.push(kstMsg('assistant', '응답', day, hour, minute))
  }
  const fillers = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-06', '2026-07-07', '2026-07-08']
    .map((d) => fillerSession(source, d))
  return [makeSession(source, msgs), ...fillers]
}

const OPTS = { offsetMinutes: KST }

// === matchRetryMarker (export 승격) =========================================
console.log('\n[matchRetryMarker export]')

test('정정 마커 매칭 — growth 테스트와 동일 마커', () => {
  assert.strictEqual(matchRetryMarker('다시 해줘'), '다시')
})

test('긴 마커 우선 — "그게 아니라"가 "아니"로 흡수되지 않음', () => {
  assert.strictEqual(matchRetryMarker('그게 아니라 이쪽으로'), '그게 아니라')
})

test('마커 없으면 null', () => {
  assert.strictEqual(matchRetryMarker('좋아 보여요, 계속 진행해 주세요'), null)
})

// === buildDailyCollab =======================================================
console.log('\n[buildDailyCollab]')

test('일별 집계 — user 수·세션 수·토큰·시간 범위·스킬·언어', () => {
  const days = buildDailyCollab(personaA(), OPTS)
  const day = days.get('2026-06-10')
  assert.ok(day)
  assert.strictEqual(day.userMessageCount, 14)
  assert.strictEqual(day.sessionCount, 2)
  assert.strictEqual(day.tokens, 2000) // 12×150 + 200 (input+output+cachedInput 공식)
  assert.strictEqual((day.lastTs - day.firstTs) / 3_600_000, 6) // 10:00~16:00
  assert.deepStrictEqual([...day.skills], ['ship'])
  assert.deepStrictEqual([...day.languages], ['TypeScript'])
  assert.strictEqual(day.hasClaudeSession, true)
  assert.strictEqual(days.size, 7)
})

test('tokens 공식 — cachedInput 포함, cacheWriteInput 제외 (computeStats msgTokenTotal)', () => {
  const s = makeSession('claude', [
    kstMsg('user', '질문', '2026-06-01', 10),
    kstMsg('assistant', '응답', '2026-06-01', 10, 5, { input: 10, output: 5, cachedInput: 100, cacheWriteInput: 999 }),
  ])
  const days = buildDailyCollab([s], OPTS)
  assert.strictEqual(days.get('2026-06-01')?.tokens, 115)
})

test('follow-up — assistant 직후 user 만, isRetry 마킹, 시간순 정렬', () => {
  const days = buildDailyCollab(personaA(), OPTS)
  const day = days.get('2026-06-10')!
  assert.strictEqual(day.followUps.length, 12) // 세션1의 u2~u13. 세션2 첫 user 는 follow-up 아님
  for (let i = 1; i < day.followUps.length; i++) {
    assert.ok(day.followUps[i].ts >= day.followUps[i - 1].ts, 'followUps 시간순 정렬 깨짐')
  }
  assert.deepStrictEqual(day.followUps.map((f) => f.isRetry), [
    true, true, true, true, true, true, false, false, false, false, false, false,
  ])
})

test('세션 경계 리셋 — 이전 세션이 assistant 로 끝나도 다음 세션 첫 user 는 follow-up 아님', () => {
  const s1 = makeSession('claude', [
    kstMsg('user', '질문', '2026-06-01', 10),
    kstMsg('assistant', '응답', '2026-06-01', 10, 10),
  ])
  const s2 = makeSession('claude', [kstMsg('user', '새 세션 질문', '2026-06-01', 11)])
  const days = buildDailyCollab([s1, s2], OPTS)
  assert.strictEqual(days.get('2026-06-01')?.followUps.length, 0)
})

test('follow-up 정렬 — 세션 배열 순서가 시간 역순이어도 ts 오름차순', () => {
  const afternoon = makeSession('claude', [
    kstMsg('user', '오후 질문', '2026-06-01', 15),
    kstMsg('assistant', '응답', '2026-06-01', 15, 10),
    kstMsg('user', '오후 후속', '2026-06-01', 15, 20),
  ])
  const morning = makeSession('claude', [
    kstMsg('user', '아침 질문', '2026-06-01', 9),
    kstMsg('assistant', '응답', '2026-06-01', 9, 10),
    kstMsg('user', '아침 후속', '2026-06-01', 9, 20),
  ])
  const days = buildDailyCollab([afternoon, morning], OPTS)
  const followUps = days.get('2026-06-01')!.followUps
  assert.strictEqual(followUps.length, 2)
  assert.ok(followUps[0].ts < followUps[1].ts)
})

test('KST 자정 경계 — UTC 17:30(KST 02:30)은 로컬 다음 날로 귀속', () => {
  const s = makeSession('claude', [
    { role: 'user', text: '심야 질문', timestamp: '2026-06-11T17:30:00Z', toolUses: [] },
    { role: 'user', text: '저녁 질문', timestamp: '2026-06-11T14:59:00Z', toolUses: [] },
  ])
  const days = buildDailyCollab([s], OPTS)
  assert.ok(days.has('2026-06-12'), 'KST 02:30 이 로컬 12일로 가야 함')
  assert.ok(days.has('2026-06-11'), 'KST 23:59 는 로컬 11일')
})

test('자정 넘는 세션 — 양쪽 날에 각각 세션 1로 집계', () => {
  const s = makeSession('claude', [
    { role: 'user', text: '밤 질문', timestamp: '2026-06-11T14:00:00Z', toolUses: [] },  // KST 23:00
    { role: 'assistant', text: '응답', timestamp: '2026-06-11T16:00:00Z', toolUses: [] }, // KST 01:00 (12일)
  ])
  const days = buildDailyCollab([s], OPTS)
  assert.strictEqual(days.get('2026-06-11')?.sessionCount, 1)
  assert.strictEqual(days.get('2026-06-12')?.sessionCount, 1)
})

test('빈/파싱불가 timestamp 가드 — 크래시 없이 제외', () => {
  const s = makeSession('claude', [
    { role: 'user', text: '유효', timestamp: kstIso('2026-06-01', 10), toolUses: [] },
    { role: 'user', text: '빈 타임스탬프', timestamp: '', toolUses: [] },
    { role: 'user', text: '파싱 불가', timestamp: 'not-a-date', toolUses: [] },
  ])
  const days = buildDailyCollab([s], OPTS)
  assert.strictEqual(days.size, 1)
  assert.strictEqual(days.get('2026-06-01')?.userMessageCount, 1)
})

test('Codex 세션 — <command-name> 텍스트가 있어도 스킬 미수집 (source-aware)', () => {
  const s = makeSession('codex', [
    kstMsg('user', '<command-name>/alpha</command-name> main.py 정리', '2026-06-01', 10),
  ])
  const day = buildDailyCollab([s], OPTS).get('2026-06-01')!
  assert.strictEqual(day.skills.size, 0)
  assert.strictEqual(day.hasClaudeSession, false)
  assert.ok(day.languages.has('Python')) // 언어 감지는 source 무관
})

// === DailyCollab 가산 필드 4종 (W2 — 지문 ⑥~⑨ 재료) =========================
console.log('\n[DailyCollab 가산 필드 (W2)]')

test('userWords/aiWords — countWords(stripMarkup) 합산, buildAuthorshipRatio 와 동일 산식 (기존 필드 무변경)', () => {
  const userText1 = '함수 정리 부탁해요'                                  // 3단어
  const userText2 = '<tag>무시</tag> 좋아요'                              // 태그 제거 후 2단어 (무시, 좋아요)
  const aiText = '```js\nconst a = 1\n```\n정리했습니다 확인해 주세요'     // 코드펜스 제거 후 3단어
  const s = makeSession('claude', [
    kstMsg('user', userText1, '2026-06-01', 10, 0),
    kstMsg('assistant', aiText, '2026-06-01', 10, 5),
    kstMsg('user', userText2, '2026-06-01', 10, 10),
  ])
  const day = buildDailyCollab([s], OPTS).get('2026-06-01')!
  // 산식 정합 — 나 vs AI 글 비중 카드와 동일 합산 (카드 간 수치 드리프트 방지)
  const ratio = buildAuthorshipRatio([s])
  assert.strictEqual(day.userWords, ratio.userWords)
  assert.strictEqual(day.aiWords, ratio.aiWords)
  // 호출식 고정 + 수기 검산
  assert.strictEqual(day.userWords, countWords(stripMarkup(userText1)) + countWords(stripMarkup(userText2)))
  assert.strictEqual(day.userWords, 5)
  assert.strictEqual(day.aiWords, 3)
  // 기존 필드 무변경 동시 어설션 (structuredCount 선례)
  assert.strictEqual(day.userMessageCount, 2)
  assert.strictEqual(day.sessionCount, 1)
})

test('models — 메시지 레벨 model 우선 + 세션 폴백 공존, 둘 다 없으면 미기록', () => {
  const withBoth = makeSession('claude', [
    { ...kstMsg('user', '질문', '2026-06-01', 10), model: 'opus' }, // 메시지 레벨
    kstMsg('assistant', '응답', '2026-06-01', 10, 5),               // 세션 폴백
  ], { model: 'sonnet' })
  const day = buildDailyCollab([withBoth], OPTS).get('2026-06-01')!
  assert.deepStrictEqual([...day.models].sort(), ['opus', 'sonnet'])
  assert.strictEqual(day.userMessageCount, 1) // 기존 필드 무변경

  const withNeither = makeSession('claude', [kstMsg('user', '질문', '2026-06-02', 10)])
  const bare = buildDailyCollab([withNeither], OPTS).get('2026-06-02')!
  assert.strictEqual(bare.models.size, 0)
})

test('projects 규칙① — cwd 있으면 extractProject(cwd), source 무관 (personality 와 동일 규칙)', () => {
  const winCwd = 'D:\\Work\\vibe\\promptale\\src\\lib\\deep'
  const claude = makeSession('claude', [kstMsg('user', '질문', '2026-06-01', 10)], { cwd: winCwd })
  assert.strictEqual(sessionProjectKey(claude), extractProject(winCwd)) // 규칙 단일 소스
  const day = buildDailyCollab([claude], OPTS).get('2026-06-01')!
  assert.deepStrictEqual([...day.projects], ['D:/Work/vibe/promptale/src/lib']) // 앞 6뎁스
  // Codex 도 cwd 가 있으면 규칙① 적용
  const codex = makeSession('codex', [kstMsg('user', '질문', '2026-06-01', 11)], { cwd: '/home/u/proj' })
  assert.strictEqual(sessionProjectKey(codex), 'home/u/proj')
})

test('projects 규칙② — cwd 없는 Claude 세션은 filePath 부모 디렉터리명 (경로 구분자 양쪽 처리)', () => {
  const win = makeSession('claude', [kstMsg('user', '질문', '2026-06-01', 10)],
    { filePath: 'C:\\Users\\u\\.claude\\projects\\d--Work-promptale\\a.jsonl' })
  const posix = makeSession('claude', [kstMsg('user', '질문', '2026-06-01', 11)],
    { filePath: '/home/u/.claude/projects/my-proj/b.jsonl' })
  const day = buildDailyCollab([win, posix], OPTS).get('2026-06-01')!
  assert.deepStrictEqual([...day.projects].sort(), ['d--Work-promptale', 'my-proj'])
})

test('projects 규칙③ — Codex 는 filePath 폴백 금지 (날짜 디렉터리 — 프로젝트 정보 아님)', () => {
  const s = makeSession('codex', [kstMsg('user', '질문', '2026-06-01', 10)],
    { filePath: '/home/u/.codex/sessions/2026/06/01/x.jsonl' })
  assert.strictEqual(sessionProjectKey(s), null)
  const day = buildDailyCollab([s], OPTS).get('2026-06-01')!
  assert.strictEqual(day.projects.size, 0)
  assert.strictEqual(day.sessionCount, 1) // 세션 자체는 정상 집계 — 프로젝트만 미기록
})

test('projects 규칙④ — cwd·filePath 둘 다 없으면 미기록 (해당 세션은 projects 비기여)', () => {
  const s = makeSession('claude', [kstMsg('user', '질문', '2026-06-01', 10)])
  assert.strictEqual(sessionProjectKey(s), null)
  assert.strictEqual(buildDailyCollab([s], OPTS).get('2026-06-01')!.projects.size, 0)
})

test('projects — 자정 넘는 세션은 양쪽 날에 프로젝트 기여 (sessionCount 와 동일 귀속 축)', () => {
  const s = makeSession('claude', [
    { role: 'user', text: '밤 질문', timestamp: '2026-06-11T14:00:00Z', toolUses: [] },  // KST 23:00
    { role: 'assistant', text: '응답', timestamp: '2026-06-11T16:00:00Z', toolUses: [] }, // KST 01:00 (12일)
  ], { cwd: '/home/u/proj' })
  const days = buildDailyCollab([s], OPTS)
  assert.deepStrictEqual([...days.get('2026-06-11')!.projects], ['home/u/proj'])
  assert.deepStrictEqual([...days.get('2026-06-12')!.projects], ['home/u/proj'])
})

// === renormalizeTermWeights =================================================
console.log('\n[renormalizeTermWeights]')

test('전 항 존재 — 원 가중치 그대로 (합 1 전제)', () => {
  const w = renormalizeTermWeights(['tokenAnomaly', 'sessionDensity', 'retryRecovery', 'variety'])
  assert.deepStrictEqual(w, STORY_TERM_WEIGHTS)
})

test('③ 결측 — 남은 가중치 비율 보존 + 합 1', () => {
  const w = renormalizeTermWeights(['tokenAnomaly', 'sessionDensity', 'variety'])
  const sum = (w.tokenAnomaly ?? 0) + (w.sessionDensity ?? 0) + (w.variety ?? 0)
  assert.ok(Math.abs(sum - 1) < 1e-9)
  // 비율 보존: 0.3 : 0.25 : 0.2
  assert.ok(Math.abs((w.tokenAnomaly ?? 0) / (w.variety ?? 1) - 0.3 / 0.2) < 1e-9)
  assert.strictEqual(w.retryRecovery, undefined)
})

test('빈 입력 — 빈 객체 (0 나누기 없음)', () => {
  assert.deepStrictEqual(renormalizeTermWeights([]), {})
})

// === scoreStoryDays — 정규화·가중합·dominantTerm ============================
console.log('\n[scoreStoryDays 점수]')

test('페르소나 A — 항별 값·가중합·dominantTerm 수기 계산 일치', () => {
  const result = scoreStoryDays(buildDailyCollab(personaA(), OPTS))
  assert.strictEqual(result.activeDayCount, 7)
  assert.strictEqual(result.candidateCount, 1)
  const best = result.best
  assert.ok(best)
  assert.strictEqual(best.dayKey, '2026-06-10')
  // ① 토큰: 2000 / (2000/7) = 7배 → cap 5 → 1.0
  assert.strictEqual(best.terms.tokenAnomaly?.value, 1)
  // ② 밀도: (2/6 + 6/12) / 2 = 5/12
  assert.ok(Math.abs((best.terms.sessionDensity?.value ?? 0) - 5 / 12) < 1e-9)
  // ③ 재질문: 전반 6/6=1.0 → 후반 0/6=0 → 하락 1.0 → /0.3 clamp → 1.0
  assert.strictEqual(best.terms.retryRecovery?.value, 1)
  // ④ 다양성: (1/5 + 1/5) / 2 = 0.2
  assert.ok(Math.abs((best.terms.variety?.value ?? 0) - 0.2) < 1e-9)
  // 가중합: 0.3 + 0.25·5/12 + 0.25 + 0.2·0.2
  const expected = 0.3 * 1 + 0.25 * (5 / 12) + 0.25 * 1 + 0.2 * 0.2
  assert.ok(Math.abs(best.score - expected) < 1e-9, `score=${best.score}, expected=${expected}`)
  assert.strictEqual(best.dominantTerm, 'tokenAnomaly')
})

test('페르소나 A 영수증 — 분모 동반 원시 수치', () => {
  const best = scoreStoryDays(buildDailyCollab(personaA(), OPTS)).best!
  const r = best.receipts
  assert.strictEqual(r.tokens, 2000)
  assert.ok(Math.abs(r.dayAvgTokens - 2000 / 7) < 1e-9)
  assert.strictEqual(r.sessionCount, 2)
  assert.strictEqual(r.spanHours, 6)
  assert.strictEqual(r.retryRateFirst, 1)   // 0~1 raw — % 변환은 UI에서
  assert.strictEqual(r.retryRateSecond, 0)
  assert.strictEqual(r.followUpCount, 12)   // 영수증 n= 분모
  assert.strictEqual(r.skillCount, 1)
  assert.strictEqual(r.languageCount, 1)
  assert.strictEqual(r.userMessageCount, 14)
})

test('점수는 0~1 분수 — % 변환은 UI에서', () => {
  const best = scoreStoryDays(buildDailyCollab(personaA(), OPTS)).best!
  assert.ok(best.score > 0 && best.score <= 1)
  for (const term of Object.values(best.terms)) {
    assert.ok(term.value >= 0 && term.value <= 1)
  }
})

// === scoreStoryDays — 결측 항 재정규화 ======================================
console.log('\n[scoreStoryDays 결측 재정규화]')

test('follow-up 미달(9건 < 10) — ③ 결측, 남은 항 가중치 합 1', () => {
  const best = scoreStoryDays(buildDailyCollab(personaB(), OPTS)).best!
  assert.ok(best.receipts.followUpCount < MIN_FOLLOWUPS_FOR_RETRY_TERM)
  assert.strictEqual(best.terms.retryRecovery, undefined)
  assert.strictEqual(best.receipts.retryRateFirst, null)
  const weightSum = Object.values(best.terms).reduce((sum, t) => sum + t.weight, 0)
  assert.ok(Math.abs(weightSum - 1) < 1e-9, `재정규화 후 가중치 합=${weightSum}`)
})

test('토큰 전무 — ① 결측 (일평균 0 가드, 0 나누기 없음)', () => {
  const best = scoreStoryDays(buildDailyCollab(personaB(), OPTS)).best!
  assert.strictEqual(best.terms.tokenAnomaly, undefined)
  assert.ok(Number.isFinite(best.score))
})

test('Codex-only 픽스처 — 스킬 서브항 제외·언어만, 0/쓰레기 붕괴 없음 (goal AC)', () => {
  const result = scoreStoryDays(buildDailyCollab(personaB('codex'), OPTS))
  const best = result.best
  assert.ok(best, 'Codex-only 도 카드가 성립해야 함')
  assert.strictEqual(best.receipts.hasClaudeSession, false)
  assert.strictEqual(best.receipts.skillCount, 0)
  // ④ = 언어 서브항 단독 (스킬 0과 평균 내지 않음): 5종/5 = 1.0
  assert.strictEqual(best.receipts.languageCount, 5)
  assert.strictEqual(best.terms.variety?.value, Math.min(1, 5 / LANGUAGE_COUNT_NORMALIZER))
  assert.ok(best.score > 0, '점수가 0으로 붕괴하면 안 됨')
})

// === scoreStoryDays — 최소 표본 가드 ========================================
console.log('\n[scoreStoryDays 가드]')

test('활동일 < 7 — best null (이야기 모으는 중), 원인 수치 동반', () => {
  const sessions = personaA().filter((s) => {
    const first = s.messages[0]?.timestamp ?? ''
    return !first.startsWith('2026-06-08') // 필러 1일 제거 → 활동 6일
  })
  const result = scoreStoryDays(buildDailyCollab(sessions, OPTS))
  assert.strictEqual(result.activeDayCount, 6)
  assert.ok(result.activeDayCount < MIN_ACTIVE_DAYS_FOR_STORY)
  assert.strictEqual(result.best, null)
  assert.strictEqual(result.candidateCount, 1) // 후보는 있었다 — 빈상태 원인 분기용
})

test('후보 0 — 활동 7일이어도 모든 날 user < 10 이면 best null', () => {
  const days = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-08', '2026-06-09']
  const result = scoreStoryDays(buildDailyCollab(days.map((d) => fillerSession('claude', d)), OPTS))
  assert.strictEqual(result.activeDayCount, 7)
  assert.strictEqual(result.candidateCount, 0)
  assert.strictEqual(result.best, null)
})

test('user 메시지 9건 날은 후보 제외 (MIN_USER_MESSAGES_PER_DAY 경계)', () => {
  const day = '2026-06-10'
  const msgs: ParsedMessage[] = []
  for (let i = 0; i < MIN_USER_MESSAGES_PER_DAY - 1; i++) {
    msgs.push(kstMsg('user', `질문 ${i}`, day, 10, i * 5))
  }
  const sessions = [
    makeSession('claude', msgs),
    ...['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-08']
      .map((d) => fillerSession('claude', d)),
  ]
  const result = scoreStoryDays(buildDailyCollab(sessions, OPTS))
  assert.strictEqual(result.activeDayCount, 7)
  assert.strictEqual(result.candidateCount, 0)
  assert.strictEqual(result.best, null)
})

test('빈 입력 — 크래시 없이 빈상태', () => {
  const result = scoreStoryDays(buildDailyCollab([], OPTS))
  assert.strictEqual(result.activeDayCount, 0)
  assert.strictEqual(result.candidateCount, 0)
  assert.strictEqual(result.best, null)
})

// === scoreStoryDays — 동점 결정성 ===========================================
console.log('\n[scoreStoryDays 동점 결정성]')

test('최고일 동점 — 빠른 날짜가 이긴다 (dayKey 오름차순 + strict >)', () => {
  // 동일 패턴 2일 — 모든 항 값이 같아 점수 동점
  const makeCandidateDay = (day: string): Session => {
    const msgs: ParsedMessage[] = []
    for (let i = 0; i < 20; i++) {
      const minute = (i * 5) % 60
      const hour = 10 + Math.floor((i * 5) / 60)
      if (i % 2 === 0) msgs.push(kstMsg('user', `질문 ${i}`, day, hour, minute))
      else msgs.push(kstMsg('assistant', '응답', day, hour, minute, { input: 100, output: 50 }))
    }
    return makeSession('claude', msgs)
  }
  const sessions = [
    makeCandidateDay('2026-06-10'),
    makeCandidateDay('2026-06-12'),
    ...['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']
      .map((d) => fillerSession('claude', d)),
  ]
  const result = scoreStoryDays(buildDailyCollab(sessions, OPTS))
  assert.strictEqual(result.candidateCount, 2)
  assert.ok(result.best)
  assert.strictEqual(result.best.dayKey, '2026-06-10') // 동점이면 빠른 날짜
})

test('dominantTerm 동률 — STORY_TERM_ORDER 앞 항이 이긴다 (가중치 주입으로 동률 유도)', () => {
  // 페르소나 A: ① tokenAnomaly=1.0, ③ retryRecovery=1.0 — 균등 가중치면 기여 동률
  const equalWeights = { tokenAnomaly: 0.25, sessionDensity: 0.25, retryRecovery: 0.25, variety: 0.25 }
  const best = scoreStoryDays(buildDailyCollab(personaA(), OPTS), { weights: equalWeights }).best!
  assert.strictEqual(best.terms.tokenAnomaly?.contribution, best.terms.retryRecovery?.contribution)
  assert.strictEqual(best.dominantTerm, 'tokenAnomaly') // ORDER 상 앞 항
})

// === divergence — 동질화 회귀 ===============================================
console.log('\n[divergence]')

test('페르소나 2벌(토큰 폭주형 vs 다양성형) — 다른 스토리일·다른 dominantTerm', () => {
  const a = scoreStoryDays(buildDailyCollab(personaA(), OPTS)).best!
  const b = scoreStoryDays(buildDailyCollab(personaB(), OPTS)).best!
  assert.notStrictEqual(a.dayKey, b.dayKey)
  assert.strictEqual(a.dominantTerm, 'tokenAnomaly')
  assert.strictEqual(b.dominantTerm, 'variety')
  assert.notStrictEqual(a.dominantTerm, b.dominantTerm)
})

// === 결과 보고 =============================================================
console.log(`\n=== ${passed} passed, ${failed} failed ===`)
if (failed > 0) {
  console.log('\n실패 상세:')
  for (const f of failures) {
    console.log(`  ✗ ${f.name}`)
    console.log(`    ${f.err instanceof Error ? f.err.stack ?? f.err.message : String(f.err)}`)
  }
  process.exit(1)
}
