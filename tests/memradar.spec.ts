import { test, expect } from '@playwright/test'
import { fixtureSessions } from './fixtures/fixtureSessions'

test.describe('Dashboard loads', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((sessions) => {
      ;(window as Window & { __MEMRADAR_SESSIONS__?: unknown }).__MEMRADAR_SESSIONS__ = sessions
    }, fixtureSessions)
    await page.goto('/#dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Memradar/i })).toBeVisible()
  })

  test('shows Memradar title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Memradar/i })).toBeVisible()
  })

  test('displays stat cards', async ({ page }) => {
    await expect(page.locator('.dashboard-stats-grid .dashboard-card')).toHaveCount(4)
  })

  test('total messages count is non-zero', async ({ page }) => {
    const firstCardValue = page.locator('.count-up').first()
    const text = await firstCardValue.textContent()
    const count = parseInt(text?.replace(/,/g, '') || '0', 10)
    expect(count).toBeGreaterThan(0)
  })

  test('heatmap renders activity cells', async ({ page }) => {
    await expect(page.locator('.heatmap-cell').first()).toBeVisible()
    const cellCount = await page.locator('.heatmap-cell').count()
    expect(cellCount).toBeGreaterThan(1)
  })

  test('hour chart renders 24 bars', async ({ page }) => {
    await expect(page.locator('.h-36 > div')).toHaveCount(24)
  })

  test('code report CTA opens and closes', async ({ page }) => {
    await page.getByRole('button', { name: /Code Report|코드 리포트/i }).click()
    await expect(page.getByRole('heading', { name: /Memradar/i })).toHaveCount(0)
    await page.locator('.relative.w-full.h-screen.overflow-hidden').focus()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: /Memradar/i })).toBeVisible()
  })

  test('session list renders with search bar', async ({ page }) => {
    await expect(page.locator('input[type="text"]').first()).toBeVisible()
  })

  test('session search filters results', async ({ page }) => {
    const searchInput = page.locator('input[type="text"]').first()
    const sessionsBefore = await page.locator('.divide-y.divide-border > button').count()

    await searchInput.fill('budget')

    const sessionsAfter = await page.locator('.divide-y.divide-border > button').count()
    expect(sessionsAfter).toBeLessThan(sessionsBefore)
  })

  test('word cloud tab switching works', async ({ page }) => {
    const wordCloudCard = page.locator('.dashboard-card').filter({ hasText: '자주 쓴 단어' })
    const aiTab = wordCloudCard.locator('button').nth(1)
    await aiTab.click()
    await expect(aiTab).toHaveClass(/bg-accent/)
  })

  test('story of the day card shows collecting empty state on sparse fixtures', async ({ page }) => {
    // W2: 토큰 피크일 카드(고정 토글)가 그날 이야기 카드로 대체됨 — 픽스처는 활동 2일이라 빈상태
    const storyCard = page.locator('.dashboard-stats-grid .dashboard-card').nth(3)
    await expect(storyCard).toContainText(/그날 이야기|Story of the Day/)
    await expect(storyCard).toContainText(/이야기를 모으는 중|Collecting your story/)
  })

  test('token cost tooltip appears on hover', async ({ page }) => {
    const tokenCard = page.locator('.dashboard-stats-grid .dashboard-card').nth(1)
    await tokenCard.hover()
    await expect(tokenCard.locator('text=$')).toBeVisible()
  })

  test('clicking session navigates to session view', async ({ page }) => {
    await page.locator('.divide-y.divide-border > button').filter({ hasText: 'Strict harness smoke test' }).click()
    await expect(page.getByRole('heading', { name: /Memradar/i })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /Strict harness smoke test for dashboard flows/i })).toBeVisible()
  })

  test('browser back button returns to dashboard', async ({ page }) => {
    await page.locator('.divide-y.divide-border > button').filter({ hasText: 'Strict harness smoke test' }).click()
    await page.goBack()
    await expect(page.getByRole('heading', { name: /Memradar/i })).toBeVisible()
  })

  test('tools used in analytics section', async ({ page }) => {
    // Verify the analytics grid renders model chart
    await expect(page.locator('.dashboard-card').filter({ hasText: '사용한 모델' })).toBeVisible()
  })

  test('mobile viewport still shows heading and sessions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Memradar/i })).toBeVisible()
    await expect(page.locator('.divide-y.divide-border > button').first()).toBeVisible()
  })

  test('replay opens from session and responds to controls', async ({ page }) => {
    await page.locator('.divide-y.divide-border > button').filter({ hasText: 'Strict harness smoke test' }).click()
    await page.locator('[data-replay-open]').click()
    await expect(page.locator('[data-replay-root]')).toBeVisible()
    await expect(page.locator('[data-replay-counter]')).toBeVisible()
    await expect(page.locator('[data-replay-time]')).toBeVisible()

    // Speed toggle
    await page.locator('[data-replay-speed="2"]').click()
    await expect(page.locator('[data-replay-speed="2"]')).toHaveClass(/text-accent/)

    // Pause, then step forward
    await page.locator('[data-replay-play]').click()
    await page.locator('[data-replay-next]').click()

    // Esc returns to session view
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-replay-root]')).toHaveCount(0)
    await expect(page.locator('[data-replay-open]')).toBeVisible()
  })
})

// Hook Activity card (docs/goal/hooks-analytics.md D5/D8) — 카드 렌더 + __MEMRADAR_HOOKS__
// 소비 경로 회귀 가드(정적 임베드에서 dead-global 로 죽는 것을 막는다) + empty-state.
test.describe('Hook Activity card', () => {
  // buildHookStats 는 source==='claude' 세션만 집계한다 — 픽스처에 source 를 부여
  const claudeSessions = fixtureSessions.map((s) => ({
    ...s,
    source: (s.model && s.model.startsWith('gpt') ? 'codex' : 'claude') as 'claude' | 'codex',
  }))

  const hookSummary = {
    firstSeen: '2026-04-01T09:00:00.000Z',
    lastSeen: '2026-04-02T10:00:00.000Z',
    rows: [
      {
        hookName: 'PreToolUse:Edit', hookEvent: 'PreToolUse', commandKey: 'abcd1234',
        counts: { success: 5, denied: 2, blockingError: 0, nonBlockingError: 0, cancelled: 0, timedOut: 0, summaryOnly: 0 },
        durationMsSum: 600, durationMsCount: 5, lastSeen: '2026-04-02T10:00:00.000Z',
        hasSystemMessage: false, additionalContextCount: 0, encodingDamaged: false,
      },
      {
        hookName: 'Stop', hookEvent: 'Stop', commandKey: 'ef567890',
        counts: { success: 3, denied: 0, blockingError: 0, nonBlockingError: 1, cancelled: 0, timedOut: 0, summaryOnly: 0 },
        durationMsSum: 1200, durationMsCount: 4, lastSeen: '2026-04-01T09:30:00.000Z',
        hasSystemMessage: true, additionalContextCount: 0, encodingDamaged: false,
      },
    ],
  }
  const sessionsWithHooks = claudeSessions.map((s, i) => (i === 0 ? { ...s, hookSummary } : s))

  const hooksConfig = [
    { event: 'PreToolUse', matcher: 'Edit', sourceLabel: '프로젝트', observed: true, confidence: 'command' as const, commandKey: 'abcd1234' },
    { event: 'Stop', matcher: null, sourceLabel: '프로젝트', observed: true, confidence: 'event' as const, commandKey: 'ef567890' },
    { event: 'Notification', matcher: null, sourceLabel: '유저 설정', observed: false, confidence: null, commandKey: '11112222' },
  ]

  async function inject(page: import('@playwright/test').Page, sessions: unknown, hooks?: unknown) {
    await page.addInitScript((data) => {
      const w = window as Window & { __MEMRADAR_SESSIONS__?: unknown; __MEMRADAR_HOOKS__?: unknown }
      w.__MEMRADAR_SESSIONS__ = data.sessions
      if (data.hooks) w.__MEMRADAR_HOOKS__ = data.hooks
    }, { sessions, hooks })
    await page.goto('/#dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Memradar/i })).toBeVisible()
  }

  test('renders card with observed/blocked/failed chips and hook rows', async ({ page }) => {
    await inject(page, sessionsWithHooks, hooksConfig)
    const card = page.locator('.dashboard-analytics-card-hooks')
    await expect(card).toBeVisible()
    await expect(card).toContainText(/훅 활동|Hook Activity/)
    await expect(card).toContainText(/관측 11|Observed 11/)
    await expect(card).toContainText(/차단 2|Blocked 2/)
    await expect(card).toContainText(/실패 1|Failed 1/)
    await expect(card).toContainText('PreToolUse:Edit')
    await expect(card).toContainText('Stop')
  })

  test('consumes window.__MEMRADAR_HOOKS__ — pill opens Escape-closable popover', async ({ page }) => {
    await inject(page, sessionsWithHooks, hooksConfig)
    const pill = page.locator('[data-hooks-pill]')
    await expect(pill).toContainText(/설정 3개 · 관측 2개|3 configured · 2 observed/)
    await pill.click()
    const popover = page.locator('[data-hooks-popover]')
    await expect(popover).toBeVisible()
    await expect(popover).toContainText(/설정된 훅|Configured hooks/)
    await expect(popover).toContainText('Notification')
    await expect(popover).toContainText(/기록된 실행 없음|no recorded run/)
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
  })

  test('configured-but-unobserved empty state when no executions recorded', async ({ page }) => {
    await inject(page, claudeSessions, hooksConfig) // 세션에 hookSummary 없음
    const card = page.locator('.dashboard-analytics-card-hooks')
    await expect(card).toBeVisible()
    await expect(card).toContainText(/설정된 훅은 있지만 기록된 실행이 아직 없어요|Hooks are configured, but no executions have been recorded yet/)
    await expect(page.locator('[data-hooks-pill]')).toBeVisible()
  })

  test('version tolerance — no __MEMRADAR_HOOKS__ renders card without pill or error', async ({ page }) => {
    // 구버전 산출물: 훅 전역 부재 + /api/hooks 없음 → 크래시 없이 카드만, 핀 없음
    await page.route('**/api/hooks', (route) => route.fulfill({ status: 404, body: '' }))
    await inject(page, claudeSessions, undefined)
    const card = page.locator('.dashboard-analytics-card-hooks')
    await expect(card).toBeVisible()
    await expect(page.locator('[data-hooks-pill]')).toHaveCount(0)
  })
})

test.describe('npm 다운로드 집계 줄', () => {
  const claudeSessions = fixtureSessions.map((s) => ({
    ...s,
    source: (s.model && s.model.startsWith('gpt') ? 'codex' : 'claude') as 'claude' | 'codex',
  }))

  async function inject(page: import('@playwright/test').Page, npm: unknown) {
    await page.addInitScript((data) => {
      const w = window as Window & { __MEMRADAR_SESSIONS__?: unknown; __MEMRADAR_NPM__?: unknown }
      w.__MEMRADAR_SESSIONS__ = data.sessions
      // undefined 를 넣으면 "키 부재"가 아니라 "값이 undefined 인 키"가 되어
      // 서버 폴백 분기를 못 타므로, 부재 케이스는 아예 대입하지 않는다.
      if (data.npm !== undefined) w.__MEMRADAR_NPM__ = data.npm
    }, { sessions: claudeSessions, npm })
    await page.goto('/#dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Memradar/i })).toBeVisible()
  }

  test('집계가 있으면 상단바에 횟수 + 도움말 툴팁이 나온다', async ({ page }) => {
    await inject(page, { total: 8346, since: '2026-04-01', until: '2026-08-24' })
    // 천 단위 구분자 — 8346 이 아니라 8,346 으로 읽혀야 한다
    await expect(page.getByText(/8,346번 불려나왔어요|summoned 8,346 times/)).toBeVisible()
    // 툴팁 본문은 hover 전에도 DOM 에 있으나 opacity 0 — "전송되지 않는다"는
    // 문구가 실제로 실려 있는지가 이 기능의 핵심 약속이라 존재를 확인한다.
    await expect(
      page.getByText(/어디로도 전송되지 않습니다|ever leaves your machine/)
    ).toBeAttached()
    // 다운로드 ≠ 사용자 수라는 단서도 반드시 함께 실린다 (수치 과대 해석 방지).
    await expect(
      page.getByText(/실제 사용자 수보다는 커요|counts downloads, not people/)
    ).toBeAttached()
  })

  test('집계가 null 이면 줄 자체를 숨긴다 (0 으로 폴백하지 않는다)', async ({ page }) => {
    // --no-update-check / 조회 실패 경로. "0번 불려나왔어요"는 사실과 다른 말이다.
    await inject(page, null)
    await expect(page.getByText(/불려나왔어요|summoned/)).toHaveCount(0)
    await expect(page.getByText(/0번 불려나왔어요|summoned 0 times/)).toHaveCount(0)
  })

  // 사용자가 HTML 을 열면 대시보드가 아니라 코드 리포트(wrapped)로 먼저 떨어진다.
  // 상단바가 없는 화면이라 한때 여기서만 집계 줄이 안 보였다 — 그 회귀를 막는다.
  test('대시보드 밖(코드 리포트 화면)에서도 보인다', async ({ page }) => {
    await page.addInitScript((data) => {
      const w = window as Window & { __MEMRADAR_SESSIONS__?: unknown; __MEMRADAR_NPM__?: unknown }
      w.__MEMRADAR_SESSIONS__ = data.sessions
      w.__MEMRADAR_NPM__ = data.npm
    }, { sessions: claudeSessions, npm: { total: 8346, since: '2026-04-01', until: '2026-08-24' } })
    await page.goto('/#wrapped', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/8,346번 불려나왔어요|summoned 8,346 times/)).toBeVisible()
  })

  test('버전 톨러런스 — 전역도 /api/npm-stats 도 없으면 조용히 생략', async ({ page }) => {
    await page.route('**/api/npm-stats', (route) => route.fulfill({ status: 404, body: '' }))
    await inject(page, undefined)
    await expect(page.getByRole('heading', { name: /Memradar/i })).toBeVisible()
    await expect(page.getByText(/불려나왔어요|summoned/)).toHaveCount(0)
  })
})

// 모델 귀속 — docs/goal/model-attribution-per-message.md ⑧
// 세션 모델 구성 배지: "여기서부터 바뀜" 마커가 아니라 "이 대화가 어떤 모델을 얼마나 썼는가"를
// 토큰·비용 배지와 같은 패턴(압축 값 + hover 내역)으로 적는다.
test.describe('Session model composition badge', () => {
  const mixedSession = {
    id: 'sess-mixed',
    fileName: 'mixed.jsonl',
    source: 'claude' as const,
    startTime: '2026-04-05T14:00:00.000Z',
    endTime: '2026-04-05T14:10:00.000Z',
    totalTokens: { input: 100, output: 200, cachedInput: 0, cacheWriteInput: 0 },
    messageCount: { user: 1, assistant: 2 },
    model: 'claude-sonnet-4',
    modelResponses: { 'claude-sonnet-4': 4, 'claude-opus-4-1': 2 },
    messages: [
      { role: 'user' as const, text: '이거 고쳐줘', timestamp: '2026-04-05T14:00:00.000Z', toolUses: [] },
      {
        role: 'assistant' as const,
        // 실측 원문 그대로 — 타임존·리셋 시각이 들어 있다. 이 문자열이 픽스처에 실재해야
        // 아래 '원문 미노출' 단언이 빈 단언이 아니게 된다: 트랜스크립트에는 남되
        // 배지 툴팁(정규화 분류)에는 절대 나오면 안 되는 값.
        text: "You've hit your session limit · resets 4:20am (Asia/Seoul)",
        timestamp: '2026-04-05T14:01:00.000Z',
        toolUses: [],
        model: 'claude-sonnet-4',
      },
      {
        role: 'assistant' as const,
        text: '다른 모델이 이어서 답합니다',
        timestamp: '2026-04-05T14:02:00.000Z',
        toolUses: [],
        model: 'claude-opus-4-1',
        models: ['claude-opus-4-1', 'claude-sonnet-4'],
      },
    ],
  }

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((sessions) => {
      ;(window as Window & { __MEMRADAR_SESSIONS__?: unknown }).__MEMRADAR_SESSIONS__ = sessions
    }, [mixedSession])
    await page.goto('/#dashboard', { waitUntil: 'domcontentloaded' })
  })

  test('세션 목록 배지가 쓴 모델을 모두 나열한다 (단일 모델처럼 보이지 않는다)', async ({ page }) => {
    const badge = page.locator('span[class*="group/model"]').first()
    await expect(badge).toBeVisible()
    await expect(badge).toContainText('Sonnet 4')
    await expect(badge).toContainText('Opus 4.1')
  })

  test('hover 내역에 모델별 응답 수·비중·전환 사유가 나온다 (원문 미노출)', async ({ page }) => {
    const badge = page.locator('span[class*="group/model"]').first()
    const tip = badge.locator('span').first()
    await expect(tip).toContainText('4 응답')
    await expect(tip).toContainText('2 응답')
    await expect(tip).toContainText('모델 2종')
    await expect(tip).toContainText('전환 사유')
    // 정규화된 분류만 — 타임존이 든 원문이 산출물에 새면 안 된다
    await expect(tip).not.toContainText('Asia/Seoul')
  })

  test('메시지 사이에 전환 마커를 넣지 않는다', async ({ page }) => {
    await page.locator('span[class*="group/model"]').first().click({ force: true }).catch(() => {})
    await expect(page.getByText(/여기부터|여기서부터/)).toHaveCount(0)
  })
})
