import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import os from 'os'

function sessionApiPlugin() {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects')

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

  return {
    name: 'session-api',
    configureServer(server: any) {
      server.middlewares.use('/api/sessions', (_req: any, res: any) => {
        const files = findJsonlFiles(claudeDir)
        const sessions = files.map((f) => ({
          path: f,
          name: path.basename(f),
          project: path.basename(path.dirname(f)),
          size: fs.statSync(f).size,
        }))
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(sessions))
      })

      server.middlewares.use('/api/session-content', (req: any, res: any) => {
        const url = new URL(req.url, 'http://localhost')
        const filePath = url.searchParams.get('path')
        if (!filePath || !filePath.endsWith('.jsonl') || !filePath.startsWith(claudeDir)) {
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
