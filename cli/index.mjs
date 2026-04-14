#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { exec } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')
const projectsDir = process.env.MEMRADAR_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects')
const outPath = process.env.MEMRADAR_OUTPUT_HTML || path.join(os.tmpdir(), 'memradar.html')
const shouldOpenBrowser = process.env.MEMRADAR_NO_OPEN !== '1'

function findJsonlFiles(dir, files = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory() && entry.name !== 'subagents') {
        findJsonlFiles(fullPath, files)
      } else if (entry.isFile() && entry.name.endsWith('.jsonl') && !fullPath.includes('subagents')) {
        files.push(fullPath)
      }
    }
  } catch {
    // Skip inaccessible directories.
  }
  return files
}

function openBrowser(filePath) {
  const cmd = process.platform === 'win32'
    ? `start "" "${filePath}"`
    : process.platform === 'darwin'
      ? `open "${filePath}"`
      : `xdg-open "${filePath}"`
  exec(cmd)
}

function extractText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter((block) => block.type === 'text' && block.text).map((block) => block.text).join('\n')
}

function extractToolUses(content) {
  if (typeof content === 'string' || !Array.isArray(content)) return []
  return content.filter((block) => block.type === 'tool_use' && block.name).map((block) => block.name)
}

function parseJsonl(text, fileName) {
  const lines = text.trim().split('\n')
  const messages = []
  let sessionId = ''
  let cwd = ''
  let version = ''
  let model = ''

  for (const line of lines) {
    try {
      const raw = JSON.parse(line)
      if (raw.type === 'file-history-snapshot') continue
      if (raw.isMeta || raw.isSidechain) continue
      if (!raw.message?.role) continue

      const textContent = extractText(raw.message.content)
      if (!textContent.trim()) continue

      if (!sessionId && raw.sessionId) sessionId = raw.sessionId
      if (!cwd && raw.cwd) cwd = raw.cwd
      if (!version && raw.version) version = raw.version
      if (!model && raw.message.model) model = raw.message.model

      const usage = raw.message.usage
      messages.push({
        role: raw.message.role,
        text: textContent,
        timestamp: raw.timestamp || '',
        model: raw.message.model,
        tokens: usage
          ? {
              input: (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0),
              output: usage.output_tokens || 0,
            }
          : undefined,
        toolUses: extractToolUses(raw.message.content),
      })
    } catch {
      // Skip invalid JSONL lines.
    }
  }

  if (messages.length === 0) return null

  const merged = []
  for (const message of messages) {
    const previous = merged[merged.length - 1]
    if (previous && previous.role === message.role) {
      previous.text += '\n\n' + message.text
      previous.timestamp = previous.timestamp || message.timestamp
      if (message.tokens) {
        if (previous.tokens) {
          previous.tokens.input += message.tokens.input
          previous.tokens.output += message.tokens.output
        } else {
          previous.tokens = { ...message.tokens }
        }
      }
      previous.toolUses = [...previous.toolUses, ...message.toolUses]
      if (!previous.model && message.model) previous.model = message.model
    } else {
      merged.push({
        ...message,
        tokens: message.tokens ? { ...message.tokens } : undefined,
        toolUses: [...message.toolUses],
      })
    }
  }

  const totalTokens = merged.reduce((accumulator, message) => ({
    input: accumulator.input + (message.tokens?.input || 0),
    output: accumulator.output + (message.tokens?.output || 0),
  }), { input: 0, output: 0 })

  return {
    id: sessionId || fileName,
    fileName,
    messages: merged,
    startTime: merged[0]?.timestamp || '',
    endTime: merged[merged.length - 1]?.timestamp || '',
    cwd,
    version,
    model,
    totalTokens,
    messageCount: {
      user: merged.filter((message) => message.role === 'user').length,
      assistant: merged.filter((message) => message.role === 'assistant').length,
    },
  }
}

if (!fs.existsSync(distDir)) {
  console.error('dist/ folder not found. Run `npm run build` first.')
  process.exit(1)
}

const files = findJsonlFiles(projectsDir)
console.log()
console.log('  Memradar')
console.log('  ------------------------------')
console.log(`  Log dir:   ${projectsDir}`)
console.log(`  Sessions:  ${files.length}`)

if (files.length === 0) {
  console.log('  No session files found.')
  console.log('  ------------------------------')
  process.exit(0)
}

console.log('  Parsing sessions...')
const sessions = []
for (const file of files) {
  try {
    const content = fs.readFileSync(file, 'utf-8')
    const session = parseJsonl(content, path.basename(file))
    if (session) sessions.push(session)
  } catch {
    // Skip unreadable files.
  }
}
console.log(`  Parsed:    ${sessions.length}`)

const assetsDir = path.join(distDir, 'assets')
if (!fs.existsSync(assetsDir)) {
  console.error('dist/assets folder not found. Run `npm run build` first.')
  process.exit(1)
}

const assetFiles = fs.readdirSync(assetsDir)
const jsFile = assetFiles.find((file) => file.endsWith('.js'))
const cssFile = assetFiles.find((file) => file.endsWith('.css'))

if (!jsFile || !cssFile) {
  console.error('Built JS/CSS assets are missing from dist/assets. Run `npm run build` again.')
  process.exit(1)
}

const jsContent = fs.readFileSync(path.join(assetsDir, jsFile), 'utf-8')
const cssContent = fs.readFileSync(path.join(assetsDir, cssFile), 'utf-8')

const safeJson = JSON.stringify(sessions).replace(/<\/script/gi, '<\\/script')
const safeJs = jsContent.replace(/<\/script/gi, '<\\/script')

const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Memradar</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Serif+KR:wght@500;700&display=swap" rel="stylesheet" />
    <style>${cssContent}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>window.__MEMRADAR_SESSIONS__=${safeJson};</script>
    <script type="module">${safeJs}</script>
  </body>
</html>`

fs.writeFileSync(outPath, html, 'utf-8')

const sizeMB = (Buffer.byteLength(html, 'utf-8') / 1024 / 1024).toFixed(1)
console.log(`  Output:    ${outPath} (${sizeMB} MB)`)
console.log('  ------------------------------')
console.log()

if (shouldOpenBrowser) {
  openBrowser(outPath)
}
