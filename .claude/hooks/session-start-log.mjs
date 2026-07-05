import fs from 'fs'
import path from 'path'

async function main() {
  try {
    let input = {}
    const raw = await new Promise(r => {
      let buf = ''
      process.stdin.on('data', d => buf += d)
      process.stdin.on('end', () => r(buf))
    })
    try {
      input = JSON.parse(raw || '{}')
    } catch (e) {
      // Ignore malformed JSON
    }

    const sessionId = process.env.CLAUDE_CODE_SESSION_ID
    if (!sessionId) {
      console.log(JSON.stringify({}))
      return
    }

    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
    const logsDir = path.join(projectDir, '.claude', 'logs')
    const logsFile = path.join(logsDir, 'sessions.jsonl')

    fs.mkdirSync(logsDir, { recursive: true })

    // Check for duplicate: prevent multiple start records for same session_id
    let records = []
    if (fs.existsSync(logsFile)) {
      try {
        const content = fs.readFileSync(logsFile, 'utf-8')
        const lines = content.trim().split('\n').filter(l => l.length > 0)
        records = lines.map(line => {
          try {
            return JSON.parse(line)
          } catch (e) {
            return null
          }
        }).filter(Boolean)
      } catch (e) {
        // Start fresh if read fails
        records = []
      }
    }

    // Duplicate check: skip if this session_id already has a start record
    const isDuplicate = records.some(r => r.session_id === sessionId)
    if (!isDuplicate) {
      const startTime = new Date().toISOString()
      const record = { session_id: sessionId, start_time: startTime }
      records.push(record)

      // Rewrite entire file to maintain append-only semantics while preventing duplicates
      const output = records.map(r => JSON.stringify(r)).join('\n') + '\n'
      fs.writeFileSync(logsFile, output, 'utf-8')
    }

    console.log(JSON.stringify({}))
  } catch (e) {
    // Graceful: hook not interrupted on error
    console.log(JSON.stringify({}))
  }
}

main().catch(console.error)
