import { chromium } from '@playwright/test'
import os from 'os'
import path from 'path'
import fs from 'fs'

const htmlPath = path.join(os.tmpdir(), 'memradar.html')
console.log('File size:', (fs.statSync(htmlPath).size / 1024 / 1024).toFixed(1), 'MB')

const url = 'file:///' + htmlPath.replace(/\\/g, '/')
console.log('URL:', url)

const browser = await chromium.launch()
const page = await browser.newPage()

page.on('console', msg => console.log('CONSOLE:', msg.text()))
page.on('pageerror', err => console.log('PAGE ERROR:', err.message))

try {
  await page.goto(url, { timeout: 90000, waitUntil: 'load' })
  console.log('Page loaded, title:', await page.title())

  // Wait a bit for React
  await page.waitForTimeout(5000)
  const root = await page.locator('#root').innerHTML()
  console.log('Root length:', root.length)
  console.log('Root preview:', root.slice(0, 300))

  const h1 = await page.locator('h1').count()
  console.log('h1 count:', h1)
} catch (e) {
  console.error('Error:', e.message)
}

await browser.close()
