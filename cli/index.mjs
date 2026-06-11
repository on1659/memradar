#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { exec, spawn } from 'node:child_process'
import { maskSecrets } from './lib/secretMask.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'))

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(`memradar v${pkg.version}`)
  process.exit(0)
}

async function checkForUpdate() {
  try {
    const res = await fetch('https://registry.npmjs.org/memradar/latest', {
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.version || null
  } catch {
    return null
  }
}

async function handleUpdate(latest) {
  if (!latest || latest === pkg.version) return

  console.log(`  ── 새 버전 감지: v${pkg.version} → v${latest} — 최신 버전으로 재실행합니다 ──`)
  console.log()

  await new Promise((resolve) => {
    const args = [`memradar@${latest}`, ...process.argv.slice(2)]
    // Child가 또 자기 자신을 자동 업데이트하려 시도하면 npx 캐시 갱신 전까지
    // 무한 재시도가 발생할 수 있어 child에서는 update check를 끈다.
    const child = spawn('npx', ['--yes', ...args], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, MEMRADAR_SKIP_UPDATE_CHECK: '1' },
    })
    child.on('close', resolve)
    child.on('error', () => {
      console.log(`  자동 업데이트 실패. npx memradar@latest 로 직접 실행해주세요.`)
      resolve()
    })
  })

  process.exit(0)
}

const noUpdateCheck =
  process.argv.includes('--no-update-check') ||
  process.env.MEMRADAR_SKIP_UPDATE_CHECK === '1'

const updateCheckPromise = noUpdateCheck
  ? Promise.resolve(null)
  : checkForUpdate()

const distDir = path.join(__dirname, '..', 'dist')
const shouldOpenBrowser = process.env.MEMRADAR_NO_OPEN !== '1'
const isStaticMode = !process.argv.includes('--server')
const DEFAULT_PORT = parseInt(process.env.MEMRADAR_PORT || '3939', 10)

// --host <value> 또는 MEMRADAR_HOST 로 바인딩 인터페이스 변경.
// 기본은 127.0.0.1(localhost) — 의도적으로 loopback 만 노출.
// 0.0.0.0 / LAN IP 지정 시 같은 네트워크의 다른 기기에서 접근 가능.
function parseHostArg(argv) {
  const i = argv.indexOf('--host')
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1]
  return process.env.MEMRADAR_HOST || '127.0.0.1'
}
const SERVER_HOST = parseHostArg(process.argv)

function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

function getLanIps() {
  const ifaces = os.networkInterfaces()
  const ips = []
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address)
    }
  }
  return ips
}

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

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { frontmatter: {}, body: text }
  const end = text.indexOf('\n---', 3)
  if (end === -1) return { frontmatter: {}, body: text }
  const fmText = text.slice(3, end).replace(/^\r?\n/, '')
  const body = text.slice(end + 4).replace(/^\r?\n/, '')
  const fm = {}
  const lines = fmText.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!m) { i++; continue }
    const key = m[1]
    let value = m[2]
    if (value === '|' || value === '|-' || value === '>') {
      const collected = []
      i++
      while (i < lines.length && /^\s+/.test(lines[i])) {
        collected.push(lines[i].replace(/^\s+/, ''))
        i++
      }
      fm[key] = collected.join(' ').trim()
      continue
    }
    fm[key] = value.replace(/^["']|["']$/g, '').trim()
    i++
  }
  return { frontmatter: fm, body }
}

function summarizeDescription(raw) {
  if (!raw) return ''
  const flat = raw.replace(/\s+/g, ' ').trim()
  if (flat.length <= 140) return flat
  return flat.slice(0, 137).trimEnd() + '…'
}

function readSkillFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

function extractCommandDescription(text) {
  const { frontmatter, body } = parseFrontmatter(text)
  if (frontmatter.description) return summarizeDescription(frontmatter.description)
  const firstLine = body.split(/\r?\n/).find((line) => line.trim().length > 0) || ''
  const headingMatch = firstLine.match(/^#+\s*\/?[\w:-]+\s*[-—]\s*(.+)$/)
  if (headingMatch) return summarizeDescription(headingMatch[1])
  const plain = firstLine.replace(/^#+\s*/, '').trim()
  return summarizeDescription(plain)
}

function scanDir(dir, predicate, collect, depth = 0) {
  if (depth > 8) return
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      scanDir(full, predicate, collect, depth + 1)
    } else if (entry.isFile() && predicate(entry.name, full)) {
      collect(full)
    }
  }
}

function scanSkills() {
  const home = os.homedir()
  const descriptions = {}
  const setIfMissing = (name, desc) => {
    if (!name || descriptions[name]) return
    if (!desc) return
    descriptions[name] = desc
  }

  const personalCommandsDir = path.join(home, '.claude', 'commands')
  scanDir(
    personalCommandsDir,
    (name) => name.endsWith('.md') && !name.endsWith('.tmpl.md') && !name.startsWith('_'),
    (full) => {
      const text = readSkillFile(full)
      if (!text) return
      const rel = path.relative(personalCommandsDir, full).replace(/\\/g, '/')
      const name = rel.replace(/\.md$/, '')
      setIfMissing(name, extractCommandDescription(text))
    }
  )

  const personalSkillsDir = path.join(home, '.claude', 'skills')
  scanDir(
    personalSkillsDir,
    (name) => name === 'SKILL.md',
    (full) => {
      const text = readSkillFile(full)
      if (!text) return
      const { frontmatter } = parseFrontmatter(text)
      const name = frontmatter.name || path.basename(path.dirname(full))
      setIfMissing(name, summarizeDescription(frontmatter.description))
    }
  )

  const pluginsManifest = path.join(home, '.claude', 'plugins', 'installed_plugins.json')
  let plugins = {}
  try {
    plugins = JSON.parse(fs.readFileSync(pluginsManifest, 'utf-8')).plugins || {}
  } catch {
    plugins = {}
  }
  for (const [key, entries] of Object.entries(plugins)) {
    const pluginName = key.split('@')[0]
    const entry = Array.isArray(entries) ? entries[entries.length - 1] : null
    const installPath = entry?.installPath
    if (!installPath || !fs.existsSync(installPath)) continue

    const skillsDir = path.join(installPath, 'skills')
    scanDir(
      skillsDir,
      (name) => name === 'SKILL.md',
      (full) => {
        const text = readSkillFile(full)
        if (!text) return
        const { frontmatter } = parseFrontmatter(text)
        const skillName = frontmatter.name || path.basename(path.dirname(full))
        const desc = summarizeDescription(frontmatter.description)
        setIfMissing(`${pluginName}:${skillName}`, desc)
        setIfMissing(skillName, desc)
      }
    )

    const commandsDir = path.join(installPath, 'commands')
    scanDir(
      commandsDir,
      (name) => name.endsWith('.md') && !name.endsWith('.tmpl.md') && !name.startsWith('_'),
      (full) => {
        const text = readSkillFile(full)
        if (!text) return
        const rel = path.relative(commandsDir, full).replace(/\\/g, '/')
        const cmdName = rel.replace(/\.md$/, '')
        const desc = extractCommandDescription(text)
        setIfMissing(`${pluginName}:${cmdName}`, desc)
        setIfMissing(cmdName, desc)
      }
    )
  }

  return descriptions
}

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
  } catch { }
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

// ─── Parser functions (shared by server and static modes) ────────────

function extractText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter((block) => block.type === 'text' && block.text).map((block) => block.text).join('\n')
}

function extractToolUses(content) {
  if (typeof content === 'string' || !Array.isArray(content)) return []
  return content.filter((block) => block.type === 'tool_use' && block.name).map((block) => block.name)
}

function applyTextCap(messages, cap) {
  if (!cap) return
  for (const m of messages) {
    if (typeof m.text === 'string' && m.text.length > cap) {
      m.text = m.text.slice(0, cap) + '\n\n…[잘림 — 세션 클릭 시 전체 보기]'
    }
  }
}

function parseClaudeJsonl(text, fileName, options = {}) {
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
    } catch { }
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

  applyTextCap(merged, options.messageTextCap)

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

function parseCodexJsonl(text, fileName, options = {}) {
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
    } catch { }
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

  // codex 메시지는 보통 짧아 cap 없이도 부담이 작고, SessionView 의 lazy
  // fetch 패턴이 아직 claude 만 지원해서 codex 본문은 풀로 들고 있는다.

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

function detectAndParse(content, fileName, options) {
  const first = content.slice(0, 1200)
  if (first.includes('"type":"session_meta"') || first.includes('"originator":"codex_') || first.includes('"type":"turn_context"')) {
    return parseCodexJsonl(content, fileName, options)
  }
  if (first.includes('"sessionId"') || first.includes('"file-history-snapshot"')) {
    return parseClaudeJsonl(content, fileName, options)
  }
  return null
}

// ─── Server mode (--server) ──────────────────────────────────────────

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

  // Light-parsed session cache. Server reads + parses every jsonl once with a
  // message-text cap and keeps both the result array AND the serialized JSON
  // in memory. The pre-serialized string skips the per-request stringify cost
  // (≈1.7s for 1500 sessions / 24MB) so cache hits respond in tens of ms.
  let lightCachePromise = null

  async function buildLightCache(textCap) {
    const filesByRoot = logRoots.flatMap((root) =>
      findJsonlFiles(root.dir).map((filePath) => ({ ...root, filePath }))
    )
    const sessions = []
    const concurrency = 32
    for (let i = 0; i < filesByRoot.length; i += concurrency) {
      const batch = filesByRoot.slice(i, i + concurrency)
      const results = await Promise.all(batch.map(async (f) => {
        try {
          const content = await fs.promises.readFile(f.filePath, 'utf-8')
          const session = detectAndParse(content, path.basename(f.filePath), { messageTextCap: textCap })
          if (session) {
            session.filePath = f.filePath
            return session
          }
          return null
        } catch {
          return null
        }
      }))
      for (const s of results) if (s) sessions.push(s)
    }
    const json = JSON.stringify(sessions)
    return { sessions, json }
  }

  function getLightCache(fresh = false) {
    if (fresh || !lightCachePromise) {
      lightCachePromise = buildLightCache(4000).catch((err) => {
        // 다음 요청에서 재시도 가능하게 promise 초기화
        lightCachePromise = null
        throw err
      })
    }
    return lightCachePromise
  }

  async function handleLightSessions(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost')
      const fresh = url.searchParams.get('fresh') === '1'
      const cache = await getLightCache(fresh)
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(cache.json)
    } catch (err) {
      res.statusCode = 500
      res.end('Failed: ' + (err?.message || 'unknown'))
    }
  }

  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname

    if (pathname === '/api/sessions') return handleSessions(req, res)
    if (pathname === '/api/session-content') return handleSessionContent(req, res)
    if (pathname === '/api/light-sessions') return handleLightSessions(req, res)
    if (pathname === '/api/skills') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(scanSkills()))
      return
    }
    return serveStatic(req, res)
  })

  function tryListen(port, maxAttempts = 10) {
    return new Promise((resolve, reject) => {
      let attempts = 0
      function attempt() {
        server.listen(port + attempts, SERVER_HOST, () => resolve(port + attempts))
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

  await handleUpdate(await updateCheckPromise)

  const actualPort = await tryListen(DEFAULT_PORT)
  const localUrl = `http://localhost:${actualPort}`
  const url = isLoopbackHost(SERVER_HOST) ? localUrl : `http://${SERVER_HOST}:${actualPort}`

  // Pre-warm light parse cache in the background — 첫 클라이언트 요청이 오기 전에
  // 미리 파싱을 시작해 응답 지연을 줄인다. 실패해도 첫 요청 시 재시도된다.
  getLightCache().catch(() => {})

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
  if (!isLoopbackHost(SERVER_HOST)) {
    const lanIps = SERVER_HOST === '0.0.0.0' ? getLanIps() : []
    if (lanIps.length > 0) {
      console.log('  LAN URLs:')
      for (const ip of lanIps) {
        console.log(`    - http://${ip}:${actualPort}`)
      }
    }
    console.log()
    console.log('  ⚠️  네트워크 노출 모드 (--host ' + SERVER_HOST + ')')
    console.log('     같은 네트워크의 다른 기기에서 세션 로그를 볼 수 있습니다.')
    console.log('     공용 와이파이 등 신뢰하지 않는 네트워크에서는 사용을 피하세요.')
  }
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
  // ─── Static HTML mode (default) ─────────────────────────────────────

  await handleUpdate(await updateCheckPromise)

  const outPath = process.env.MEMRADAR_OUTPUT_HTML || path.join(os.tmpdir(), 'memradar.html')

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
      if (session) {
        // 시크릿 마스킹 — 직렬화(임베드) 경계. 원본 .jsonl 은 불변, 메모리 객체만 변형.
        // 정적 HTML 에는 원문 시크릿이 아예 없어 공유 안전 (리빌 불가가 의도).
        // 서버 모드 API 는 무변경 — loopback 응답은 클라이언트 렌더에서 마스킹된다.
        session.messages = session.messages.map((m) => (m.text ? { ...m, text: maskSecrets(m.text).masked } : m))
        sessions.push(session)
      }
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

  const skills = scanSkills()
  const escapeScript = (str) => str.replace(/<\/script/gi, '<\\/script')
  const safeSkills = escapeScript(JSON.stringify(skills))
  const safeJs = escapeScript(jsContent)

  // Stream-write the HTML so we never hold the full sessions array as a single
  // string. JSON.stringify on the whole array fails with "Invalid string length"
  // once the serialized payload approaches V8's max string length (~512MB).
  let skipped = 0
  const fd = fs.openSync(outPath, 'w')
  try {
    fs.writeSync(fd, `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Memradar</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Serif+KR:wght@500;700&display=swap" rel="stylesheet" />
    <style>`)
    fs.writeSync(fd, cssContent)
    fs.writeSync(fd, `</style>
  </head>
  <body>
    <div id="root"></div>
    <script>window.__MEMRADAR_SESSIONS__=[`)

    for (let i = 0; i < sessions.length; i++) {
      let serialized
      try {
        serialized = escapeScript(JSON.stringify(sessions[i]))
      } catch {
        skipped++
        serialized = escapeScript(JSON.stringify({
          id: sessions[i]?.id || sessions[i]?.fileName || `session-${i}`,
          fileName: sessions[i]?.fileName || '',
          source: sessions[i]?.source || 'unknown',
          messages: [],
          _truncated: true,
        }))
      }
      if (i > 0) fs.writeSync(fd, ',')
      fs.writeSync(fd, serialized)
    }

    fs.writeSync(fd, `];window.__MEMRADAR_SKILLS__=${safeSkills};</script>
    <script type="module">`)
    fs.writeSync(fd, safeJs)
    fs.writeSync(fd, `</script>
  </body>
</html>`)
  } finally {
    fs.closeSync(fd)
  }

  const sizeBytes = fs.statSync(outPath).size
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(1)
  console.log(`  Output:    ${outPath} (${sizeMB} MB)`)
  if (skipped > 0) {
    console.log(`  Note:      ${skipped} session(s) too large to serialize — body omitted`)
  }
  console.log()
  console.log(`  ⚠ 이 HTML 파일에는 세션 대화 전문이 포함돼 있어요.`)
  console.log(`     다른 사람과 공유하기 전에 민감한 내용이 없는지 확인하세요.`)
  const HUGE_OUTPUT_THRESHOLD = 200 * 1024 * 1024
  const isHuge = sizeBytes > HUGE_OUTPUT_THRESHOLD
  if (isHuge) {
    console.log()
    console.log(`  ⚠ HTML이 ${sizeMB} MB로 매우 커서 브라우저에서 안 열리거나 멈출 수 있어요.`)
    console.log(`     서버 모드를 권장합니다: npx memradar@latest --server`)
  }
  console.log('  ------------------------------')
  console.log()

  if (shouldOpenBrowser && !isHuge) {
    openBrowser(outPath)
  } else if (shouldOpenBrowser && isHuge) {
    console.log(`  (자동 열기 생략 — 위 경로를 직접 열어보거나 서버 모드를 사용하세요)`)
    console.log()
  }
}
