import fs from 'fs'
import path from 'path'

function getMessageCount(transcriptPath) {
  try {
    if (!fs.existsSync(transcriptPath)) {
      return { count: 0, exists: false }
    }
    const content = fs.readFileSync(transcriptPath, 'utf-8')
    const lines = content.trim().split('\n').filter(l => l.length > 0)
    return { count: lines.length, exists: true }
  } catch (e) {
    return { count: 0, exists: false }
  }
}

function getStatus(countInfo, isError) {
  if (isError) return 'error'
  if (!countInfo.exists) return 'error'
  if (countInfo.count === 0) return 'empty'
  return 'normal'
}

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

    // Skip if already active (prevent infinite loop)
    if (input.stop_hook_active) {
      console.log(JSON.stringify({}))
      return
    }

    const sessionId = process.env.CLAUDE_CODE_SESSION_ID
    if (!sessionId) {
      console.log(JSON.stringify({}))
      return
    }

    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
    const homeDir = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH
    const logsDir = path.join(projectDir, '.claude', 'logs')
    const logsFile = path.join(logsDir, 'sessions.jsonl')
    const transcriptPath = path.join(homeDir, '.claude', 'projects', 'd--Work-vibe-promptale', `${sessionId}.jsonl`)

    fs.mkdirSync(logsDir, { recursive: true })

    // Get message count (includes exists flag for error detection)
    const countInfo = getMessageCount(transcriptPath)
    const isError = input.hook_error || process.env.CLAUDE_CODE_SESSION_ERROR === '1'
    const status = getStatus(countInfo, isError)
    const stopTime = new Date().toISOString()
    const messageCount = countInfo.count

    // Read existing records and find/update the matching session
    let records = []
    let startTime = new Date().toISOString()
    let foundExisting = false

    if (fs.existsSync(logsFile)) {
      const content = fs.readFileSync(logsFile, 'utf-8')
      const lines = content.split('\n').filter(line => line.trim().length > 0)
      for (const line of lines) {
        try {
          const record = JSON.parse(line)
          if (record.session_id === sessionId && !foundExisting) {
            // Found the matching session record - update it
            startTime = record.start_time || startTime
            records.push({
              session_id: sessionId,
              start_time: startTime,
              stop_time: stopTime,
              status: status,
              message_count: messageCount,
            })
            foundExisting = true
          } else {
            // Keep other records as-is
            records.push(record)
          }
        } catch (e) {
          // Skip malformed lines
        }
      }
    }

    // If this session wasn't in the log, add it as new
    if (!foundExisting) {
      records.push({
        session_id: sessionId,
        start_time: startTime,
        stop_time: stopTime,
        status: status,
        message_count: messageCount,
      })
    }

    // Write all records back (preserves append-only semantics: single authoritative file)
    const output = records.map(r => JSON.stringify(r)).join('\n') + '\n'
    fs.writeFileSync(logsFile, output, 'utf-8')

    // Silent response
    console.log(JSON.stringify({}))
  } catch (e) {
    // Graceful: hook not interrupted on error
    console.log(JSON.stringify({}))
  }
}

main().catch(console.error)
