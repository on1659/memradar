import { chromium } from '@playwright/test'
import os from 'os'
import path from 'path'

const htmlPath = path.join(os.tmpdir(), 'memradar.html')
const url = 'file:///' + htmlPath.replace(/\\/g, '/')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 2400 } })
await page.goto(url, { timeout: 90000, waitUntil: 'load' })
await page.waitForTimeout(3000)
await page.screenshot({ path: 'tests/screenshot-full.png', fullPage: true })
console.log('Screenshot saved')
await browser.close()
