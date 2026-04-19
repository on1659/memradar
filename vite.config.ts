import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { IncomingMessage, ServerResponse } from 'node:http'

function sessionApiPlugin(): Plugin {
  const claudeDir = process.env.MEMRADAR_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects')
  const codexDir = process.env.MEMRADAR_CODEX_DIR || (
    process.env.MEMRADAR_PROJECTS_DIR
      ? ''
      : path.join(os.homedir(), '.codex', 'sessions')
  )

  const logRoots = [
    { source: 'claude', dir: claudeDir },
    ...(codexDir ? [{ source: 'codex', dir: codexDir }] : []),
  ].filter((entry) => entry.dir)

  function findJsonlFiles(dir: string, files: string[] = []): string[] {
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
    } catch { }
    return files
  }

  function isAllowedPath(filePath: string) {
    const normalizedPath = path.resolve(filePath)
    return logRoots.some((root) => normalizedPath.startsWith(path.resolve(root.dir)))
  }

  const SKILL_SKIP_DIRS = new Set(['node_modules', '.git', '.private', '.cache', 'subagents'])

  function parseFrontmatter(text: string): { frontmatter: Record<string, string>; body: string } {
    if (!text.startsWith('---')) return { frontmatter: {}, body: text }
    const end = text.indexOf('\n---', 3)
    if (end === -1) return { frontmatter: {}, body: text }
    const fmText = text.slice(3, end).replace(/^\r?\n/, '')
    const body = text.slice(end + 4).replace(/^\r?\n/, '')
    const fm: Record<string, string> = {}
    const lines = fmText.split(/\r?\n/)
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
      if (!m) { i++; continue }
      const key = m[1]
      const value = m[2]
      if (value === '|' || value === '|-' || value === '>') {
        const collected: string[] = []
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

  function summarize(raw: string | undefined): string {
    if (!raw) return ''
    const flat = raw.replace(/\s+/g, ' ').trim()
    if (flat.length <= 140) return flat
    return flat.slice(0, 137).trimEnd() + '…'
  }

  function extractCommandDescription(text: string): string {
    const { frontmatter, body } = parseFrontmatter(text)
    if (frontmatter.description) return summarize(frontmatter.description)
    const firstLine = body.split(/\r?\n/).find((line) => line.trim().length > 0) || ''
    const headingMatch = firstLine.match(/^#+\s*\/?[\w:-]+\s*[-—]\s*(.+)$/)
    if (headingMatch) return summarize(headingMatch[1])
    return summarize(firstLine.replace(/^#+\s*/, '').trim())
  }

  function scanDir(
    dir: string,
    predicate: (name: string) => boolean,
    collect: (full: string) => void,
    depth = 0,
  ): void {
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
        if (SKILL_SKIP_DIRS.has(entry.name)) continue
        scanDir(full, predicate, collect, depth + 1)
      } else if (entry.isFile() && predicate(entry.name)) {
        collect(full)
      }
    }
  }

  function scanSkills(): Record<string, string> {
    const home = os.homedir()
    const descriptions: Record<string, string> = {}
    const setIfMissing = (name: string, desc: string) => {
      if (!name || descriptions[name] || !desc) return
      descriptions[name] = desc
    }
    const read = (p: string) => {
      try { return fs.readFileSync(p, 'utf-8') } catch { return null }
    }

    const personalCommandsDir = path.join(home, '.claude', 'commands')
    scanDir(
      personalCommandsDir,
      (name) => name.endsWith('.md') && !name.endsWith('.tmpl.md') && !name.startsWith('_'),
      (full) => {
        const text = read(full)
        if (!text) return
        const rel = path.relative(personalCommandsDir, full).replace(/\\/g, '/')
        setIfMissing(rel.replace(/\.md$/, ''), extractCommandDescription(text))
      },
    )

    const personalSkillsDir = path.join(home, '.claude', 'skills')
    scanDir(
      personalSkillsDir,
      (name) => name === 'SKILL.md',
      (full) => {
        const text = read(full)
        if (!text) return
        const { frontmatter } = parseFrontmatter(text)
        const name = frontmatter.name || path.basename(path.dirname(full))
        setIfMissing(name, summarize(frontmatter.description))
      },
    )

    let plugins: Record<string, Array<{ installPath?: string }>> = {}
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), 'utf-8'))
      plugins = raw.plugins || {}
    } catch { /* no plugins manifest */ }

    for (const [key, entries] of Object.entries(plugins)) {
      const pluginName = key.split('@')[0]
      const installPath = Array.isArray(entries) ? entries[entries.length - 1]?.installPath : undefined
      if (!installPath || !fs.existsSync(installPath)) continue

      scanDir(
        path.join(installPath, 'skills'),
        (name) => name === 'SKILL.md',
        (full) => {
          const text = read(full)
          if (!text) return
          const { frontmatter } = parseFrontmatter(text)
          const skillName = frontmatter.name || path.basename(path.dirname(full))
          const desc = summarize(frontmatter.description)
          setIfMissing(`${pluginName}:${skillName}`, desc)
          setIfMissing(skillName, desc)
        },
      )

      const commandsDir = path.join(installPath, 'commands')
      scanDir(
        commandsDir,
        (name) => name.endsWith('.md') && !name.endsWith('.tmpl.md') && !name.startsWith('_'),
        (full) => {
          const text = read(full)
          if (!text) return
          const rel = path.relative(commandsDir, full).replace(/\\/g, '/')
          const cmdName = rel.replace(/\.md$/, '')
          const desc = extractCommandDescription(text)
          setIfMissing(`${pluginName}:${cmdName}`, desc)
          setIfMissing(cmdName, desc)
        },
      )
    }

    return descriptions
  }

  return {
    name: 'session-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/skills', (_req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(scanSkills()))
      })

      server.middlewares.use('/api/sessions', (_req: IncomingMessage, res: ServerResponse) => {
        const sessions = logRoots.flatMap((root) =>
          findJsonlFiles(root.dir).map((filePath) => ({
            path: filePath,
            name: path.basename(filePath),
            project: root.source === 'claude' ? path.basename(path.dirname(filePath)) : 'codex',
            size: fs.statSync(filePath).size,
            source: root.source,
          }))
        )
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(sessions))
      })

      server.middlewares.use('/api/session-content', (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '/', 'http://localhost')
        const filePath = url.searchParams.get('path')
        if (!filePath || !filePath.endsWith('.jsonl') || !isAllowedPath(filePath)) {
          res.statusCode = 400
          res.end('Invalid path')
          return
        }
        try {
          const content = fs.readFileSync(filePath, 'utf-8')
          res.setHeader('Content-Type', 'text/plain')
          res.end(content)
        } catch {
          res.statusCode = 404
          res.end('Not found')
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), sessionApiPlugin()],
})
