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
    } catch { /* skip inaccessible dirs */ }
    return files
  }

  function isAllowedPath(filePath: string) {
    const normalizedPath = path.resolve(filePath)
    return logRoots.some((root) => normalizedPath.startsWith(path.resolve(root.dir)))
  }

  return {
    name: 'session-api',
    configureServer(server: ViteDevServer) {
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
