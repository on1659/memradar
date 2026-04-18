#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { exec } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'))

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(`memradar v${pkg.version}`)
  process.exit(0)
}

const distDir = path.join(__dirname, '..', 'dist')
const shouldOpenBrowser = process.env.MEMRADAR_NO_OPEN !== '1'
const isStaticMode = process.argv.includes('--static')
const DEFAULT_PORT = parseInt(process.env.MEMRADAR_PORT || '3939', 10)

// ─── Common utilities ────────────────────────────────────────────────

function getLogRoots() {
  const claudeDir = process.env.MEMRADAR_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects')
  const codexDir = process.env.MEMRADAR_CODEX_DIR || (
    process.env.MEMRADAR_PROJECTS_DIR
      ? ''
      : path.join(os.homedir(), '.codex', 'sessions')
  )

  return [
    { source: 'claude', dir: claudeDir },
    ...(codexDir ? [{ source: 'codex', dir: codexDir }] : []),
  ].filter((entry) => entry.dir)
}

const SKIP_DIRS = new Set(['subagents', 'node_modules', '.git', '.private', '.cache'])

function findJsonlFiles(dir, files = [], depth = 0) {
  if (depth > 12) return files
  try {
    const real = fs.realpathSync(dir)
    if (real !== dir && files._visited?.has(real)) return files
    files._visited ??= new Set()
    files._visited.add(real)

    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        findJsonlFiles(fullPath, files, depth + 1)
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push(fullPath)
      }
    }
  } catch {
    // Skip inaccessible directories.
  }
  return files
}

function openBrowser(url) {
  const cmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`
  exec(cmd)
}

// ─── Dist check ──────────────────────────────────────────────────────

if (!fs.existsSync(distDir)) {
  console.error('dist/ folder not found. Run `npm run build` first.')
  process.exit(1)
}

const logRoots = getLogRoots()

// ─── Server mode (default) ───────────────────────────────────────────

if (!isStaticMode) {
  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  }

  function isAllowedPath(filePath) {
    const normalized = path.resolve(filePath)
    return logRoots.some((root) => normalized.startsWith(path.resolve(root.dir)))
  }

  function serveStatic(req, res) {
    let urlPath = new URL(req.url, 'http://localhost').pathname
    if (urlPath === '/') urlPath = '/index.html'

    const filePath = path.join(distDir, urlPath)
    const resolved = path.resolve(filePath)
    if (!resolved.startsWith(path.resolve(distDir))) {
      res.statusCode = 403
      res.end('Forbidden')
      return
    }

    try {
      const data = fs.readFileSync(resolved)
      const ext = path.extname(resolved)
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream')
      res.end(data)
    } catch {
      res.statusCode = 404
      res.end('Not found')
    }
  }

  function handleSessions(_req, res) {
    const sessions = logRoots.flatMap((root) =>
      findJsonlFiles(root.dir).map((filePath) => ({
        path: filePath,
        name: path.basename(filePath),
        project: root.source === 'claude' ? path.basename(path.dirname(filePath)) : 'codex',
        size: fs.statSync(filePath).size,
        source: root.source,
      }))
    )
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(sessions))
  }

  function handleSessionContent(req, res) {
    const url = new URL(req.url, 'http://localhost')
    const filePath = url.searchParams.get('path')
    if (!filePath || !filePath.endsWith('.jsonl') || !isAllowedPath(filePath)) {
      res.statusCode = 400
      res.end('Invalid path')
      return
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end(content)
    } catch {
      res.statusCode = 404
      res.end('Not found')
    }
  }

  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname

    if (pathname === '/api/sessions') return handleSessions(req, res)
    if (pathname === '/api/session-content') return handleSessionContent(req, res)
    return serveStatic(req, res)
  })

  function tryListen(port, maxAttempts = 10) {
    return new Promise((resolve, reject) => {
      let attempts = 0
      function attempt() {
        server.listen(port + attempts, '127.0.0.1', () => resolve(port + attempts))
        server.once('error', (err) => {
          if (err.code === 'EADDRINUSE' && ++attempts < maxAttempts) {
            server.removeAllListeners('error')
            attempt()
          } else {
            reject(err)
          }
        })
      }
      attempt()
    })
  }

  const actualPort = await tryListen(DEFAULT_PORT)
  const url = `http://localhost:${actualPort}`

  // Count sessions for display
  const fileCount = logRoots.reduce((sum, root) => sum + findJsonlFiles(root.dir).length, 0)

  console.log()
  console.log('  Memradar')
  console.log('  ------------------------------')
  console.log('  Log dirs:  ')
  for (const root of logRoots) {
    console.log(`    - ${root.source}: ${root.dir}`)
  }
  console.log(`  Sessions:  ${fileCount}`)
  console.log(`  Server:    ${url}`)
  console.log('  ------------------------------')
  console.log('  Press Ctrl+C to stop')
  console.log()

  if (shouldOpenBrowser) {
    openBrowser(url)
  }

  process.on('SIGINT', () => {
    console.log('\n  Shutting down...\n')
    server.close(() => process.exit(0))
  })
  process.on('SIGTERM', () => {
    server.close(() => process.exit(0))
  })
} else {
  // ─── Static HTML mode (--static) ────────────────────────────────────

  const outPath = process.env.MEMRADAR_OUTPUT_HTML || path.join(os.tmpdir(), 'memradar.html')

  function extractText(content) {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return ''
    return content.filter((block) => block.type === 'text' && block.text).map((block) => block.text).join('\n')
  }

  function extractToolUses(content) {
    if (typeof content === 'string' || !Array.isArray(content)) return []
    return content.filter((block) => block.type === 'tool_use' && block.name).map((block) => block.name)
  }

  function parseClaudeJsonl(text, fileName) {
    const lines = text.trim().split('\n')
    const rawMessages = []
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
        const toolUses = extractToolUses(raw.message.content)
        if (!textContent.trim() && toolUses.length === 0) continue

        if (!sessionId && raw.sessionId) sessionId = raw.sessionId
        if (!cwd && raw.cwd) cwd = raw.cwd
        if (!version && raw.version) version = raw.version
        if (!model && raw.message.model) model = raw.message.model

        const usage = raw.message.usage
        rawMessages.push({
          role: raw.message.role,
          text: textContent,
          timestamp: raw.timestamp || '',
          model: raw.message.model,
          tokens: usage
            ? {
                input: usage.input_tokens || 0,
                output: usage.output_tokens || 0,
                cachedInput: (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0),
              }
            : undefined,
          toolUses,
        })
      } catch {
        // Skip invalid JSONL lines.
      }
    }

    if (rawMessages.length === 0) return null

    const merged = []
    for (const message of rawMessages) {
      const previous = merged[merged.length - 1]
      if (previous && previous.role === message.role) {
        previous.text += '\n\n' + message.text
        previous.timestamp = previous.timestamp || message.timestamp
        if (message.tokens) {
          if (previous.tokens) {
            previous.tokens.input += message.tokens.input
            previous.tokens.output += message.tokens.output
            previous.tokens.cachedInput = (previous.tokens.cachedInput || 0) + (message.tokens.cachedInput || 0)
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
      cachedInput: (accumulator.cachedInput || 0) + (message.tokens?.cachedInput || 0),
    }), { input: 0, output: 0, cachedInput: 0 })

    return {
      id: sessionId || fileName,
      fileName,
      source: 'claude',
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

  const CODEX_SETUP_PREFIXES = [
    '# AGENTS.md instructions',
    '<environment_context>',
    '<collaboration_mode>',
    '<permissions instructions>',
  ]

  function extractCodexText(content) {
    if (!Array.isArray(content)) return ''
    return content
      .map((block) => {
        const type = typeof block.type === 'string' ? block.type : ''
        if (!['input_text', 'output_text', 'summary_text', 'text'].includes(type)) return ''
        return typeof block.text === 'string' ? block.text : ''
      })
      .filter(Boolean)
      .join('\n')
  }

  function normalizeCodexUserText(text) {
    const trimmed = text.trim()
    if (!trimmed) return ''
    if (CODEX_SETUP_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return ''
    const marker = '## My request for Codex:'
    if (trimmed.includes(marker)) {
      return trimmed.split(marker).pop()?.trim() || ''
    }
    return trimmed
  }

  function parseCodexJsonl(text, fileName) {
    const lines = text.trim().split('\n')
    const rawMessages = []
    let sessionId = ''
    let cwd = ''
    let version = ''
    let model = ''
    let totalTokens = { input: 0, output: 0, cachedInput: 0 }
    let pendingToolUses = []

    for (const line of lines) {
      try {
        const record = JSON.parse(line)
        if (record.type === 'session_meta') {
          sessionId = typeof record.payload?.id === 'string' ? record.payload.id : sessionId
          cwd = typeof record.payload?.cwd === 'string' ? record.payload.cwd : cwd
          version = typeof record.payload?.cli_version === 'string' ? record.payload.cli_version : version
          continue
        }
        if (record.type === 'turn_context') {
          cwd = typeof record.payload?.cwd === 'string' ? record.payload.cwd : cwd
          model = typeof record.payload?.model === 'string' ? record.payload.model : model
          continue
        }
        if (record.type === 'event_msg') {
          const total = record.payload?.info?.total_token_usage
          if (total) {
            totalTokens = {
              input: Number(total.input_tokens || 0),
              output: Number(total.output_tokens || 0),
              cachedInput: Number(total.cached_input_tokens || 0),
            }
          }
          continue
        }
        if (record.type !== 'response_item' || !record.payload) continue
        if (record.payload.type === 'function_call' && record.payload.name) {
          const previous = rawMessages[rawMessages.length - 1]
          if (previous?.role === 'assistant') {
            previous.toolUses.push(record.payload.name)
          } else {
            pendingToolUses.push(record.payload.name)
          }
          continue
        }
        if (record.payload.type !== 'message') continue
        if (record.payload.role !== 'user' && record.payload.role !== 'assistant') continue

        const textContent = extractCodexText(record.payload.content)
        const normalizedText = record.payload.role === 'user'
          ? normalizeCodexUserText(textContent)
          : textContent.trim()

        if (!normalizedText && pendingToolUses.length === 0) continue

        rawMessages.push({
          role: record.payload.role,
          text: normalizedText,
          timestamp: record.timestamp || '',
          model: record.payload.role === 'assistant' ? model : undefined,
          toolUses: pendingToolUses,
        })
        pendingToolUses = []
      } catch {
        // Skip invalid JSONL lines.
      }
    }

    if (rawMessages.length === 0) return null

    const merged = []
    for (const message of rawMessages) {
      const previous = merged[merged.length - 1]
      if (previous && previous.role === message.role) {
        previous.text = previous.text && message.text ? `${previous.text}\n\n${message.text}` : previous.text || message.text
        previous.timestamp = previous.timestamp || message.timestamp
        previous.toolUses = [...previous.toolUses, ...message.toolUses]
        if (!previous.model && message.model) previous.model = message.model
      } else {
        merged.push({
          ...message,
          toolUses: [...message.toolUses],
        })
      }
    }

    return {
      id: sessionId || fileName,
      fileName,
      source: 'codex',
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

  function detectAndParse(content, fileName) {
    const first = content.slice(0, 1200)
    if (first.includes('"type":"session_meta"') || first.includes('"originator":"codex_') || first.includes('"type":"turn_context"')) {
      return parseCodexJsonl(content, fileName)
    }
    if (first.includes('"sessionId"') || first.includes('"file-history-snapshot"')) {
      return parseClaudeJsonl(content, fileName)
    }
    return null
  }

  const files = logRoots.flatMap((root) =>
    findJsonlFiles(root.dir).map((filePath) => ({ ...root, filePath }))
  )

  console.log()
  console.log('  Memradar (static)')
  console.log('  ------------------------------')
  console.log('  Log dirs:  ')
  for (const root of logRoots) {
    console.log(`    - ${root.source}: ${root.dir}`)
  }
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
      const content = fs.readFileSync(file.filePath, 'utf-8')
      const session = detectAndParse(content, path.basename(file.filePath))
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
}
