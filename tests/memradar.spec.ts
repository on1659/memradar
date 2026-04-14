import { test, expect } from '@playwright/test'
import { fixtureSessions } from './fixtures/fixtureSessions'

test.describe('Dashboard loads', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((sessions) => {
      ;(window as Window & { __MEMRADAR_SESSIONS__?: unknown }).__MEMRADAR_SESSIONS__ = sessions
    }, fixtureSessions)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Memradar/i })).toBeVisible()
  })

  test('shows Memradar title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Memradar/i })).toBeVisible()
  })

  test('displays stat cards', async ({ page }) => {
    await expect(page.locator('.bg-bg-card.rounded-xl.p-5')).toHaveCount(4)
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

  test('wrapped CTA opens and closes', async ({ page }) => {
    await page.getByRole('button', { name: /Wrapped/i }).click()
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
    const wordCloudCard = page.locator('.mb-8.grid .bg-bg-card').filter({ hasText: '자주 쓴 단어' })
    const aiTab = wordCloudCard.locator('button').nth(1)
    await aiTab.click()
    await expect(aiTab).toHaveClass(/bg-accent/)
  })

  test('busy day toggle remains interactive', async ({ page }) => {
    const busyCard = page.locator('.bg-bg-card.rounded-xl.p-5').nth(3)
    const valueBefore = await busyCard.locator('.count-up').textContent()
    await busyCard.locator('button').click()
    await expect(busyCard.locator('.count-up')).not.toHaveText(valueBefore ?? '')
  })

  test('token cost tooltip appears on hover', async ({ page }) => {
    const tokenCard = page.locator('.bg-bg-card.rounded-xl.p-5').nth(1)
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

  test('tools section shows aggregated usage', async ({ page }) => {
    const toolsSection = page.locator('.bg-bg-card.rounded-xl.p-6').filter({ has: page.locator('.bg-bg.rounded-lg.p-3') }).first()
    await expect(toolsSection).toBeVisible()
  })

  test('mobile viewport still shows heading and sessions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Memradar/i })).toBeVisible()
    await expect(page.locator('.divide-y.divide-border > button').first()).toBeVisible()
  })
})
