#!/usr/bin/env node

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { exec } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')
const claudeDir = path.join(os.homedir(), '.claude', 'projects')
const PORT = parseInt(process.env.PORT || '3456', 10)

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

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
  } catch { /* skip inaccessible dirs */ }
  return files
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start ${url}`
    : process.platform === 'darwin' ? `open ${url}`
    : `xdg-open ${url}`
  exec(cmd)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  // API: list sessions
  if (url.pathname === '/api/sessions') {
    const files = findJsonlFiles(claudeDir)
    const sessions = files.map((f) => ({
      path: f,
      name: path.basename(f),
      project: path.basename(path.dirname(f)),
      size: fs.statSync(f).size,
    }))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(sessions))
    return
  }

  // API: read session content
  if (url.pathname === '/api/session-content') {
    const filePath = url.searchParams.get('path')
    if (!filePath || !filePath.endsWith('.jsonl') || !filePath.startsWith(claudeDir)) {
      res.writeHead(400)
      res.end('Invalid path')
      return
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(content)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
    return
  }

  // Static file serving
  let filePath = path.join(distDir, url.pathname === '/' ? 'index.html' : url.pathname)

  // SPA fallback
  if (!fs.existsSync(filePath)) {
    filePath = path.join(distDir, 'index.html')
  }

  try {
    const content = fs.readFileSync(filePath)
    const ext = path.extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(content)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
})

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`
  console.log()
  console.log(`  ✦ Memradar`)
  console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`  로컬 서버:  ${url}`)
  console.log(`  로그 경로:  ${claudeDir}`)
  const files = findJsonlFiles(claudeDir)
  console.log(`  발견된 세션: ${files.length}개`)
  console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`  종료: Ctrl+C`)
  console.log()
  openBrowser(url)
})
