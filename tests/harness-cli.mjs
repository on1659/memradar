import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const cliPath = path.join(repoRoot, 'cli', 'index.mjs')
const fixtureDir = path.join(__dirname, 'fixtures', 'logs')
const outPath = path.join(os.tmpdir(), 'memradar-harness.html')

if (fs.existsSync(outPath)) {
  fs.rmSync(outPath, { force: true })
}

execFileSync(process.execPath, [cliPath], {
  cwd: repoRoot,
  env: {
    ...process.env,
    MEMRADAR_PROJECTS_DIR: fixtureDir,
    MEMRADAR_OUTPUT_HTML: outPath,
    MEMRADAR_NO_OPEN: '1',
  },
  stdio: 'inherit',
  timeout: 120000,
})

assert.ok(fs.existsSync(outPath), 'CLI harness did not create an HTML file')

const html = fs.readFileSync(outPath, 'utf8')
assert.match(html, /<title>Memradar<\/title>/, 'HTML title is missing')
assert.match(html, /window\.__MEMRADAR_SESSIONS__=/, 'Embedded session payload is missing')
assert.match(html, /Strict harness smoke test for dashboard flows/, 'Fixture content was not embedded')
assert.match(html, /Budget search fix for session filtering and browser history/, 'Second fixture session was not embedded')
assert.doesNotMatch(html, /<script[^>]+src="[^"]*assets\//i, 'CLI output should inline the JavaScript bundle')
assert.doesNotMatch(html, /<link[^>]+href="[^"]*assets\/[^"]+\.css"/i, 'CLI output should inline the CSS bundle')
assert.ok(html.length > 10000, `Generated HTML is unexpectedly small: ${html.length} bytes`)

console.log('CLI harness checks passed.')
