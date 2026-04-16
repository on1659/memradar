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

  test('busy day toggle remains interactive', async ({ page }) => {
    const busyCard = page.locator('.dashboard-stats-grid .dashboard-card').nth(3)
    const pinButton = busyCard.getByRole('button')
    await expect(pinButton).toHaveAttribute('aria-pressed', 'false')
    await pinButton.click()
    await expect(pinButton).toHaveAttribute('aria-pressed', 'true')
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
})
