#!/usr/bin/env node
// Dummy Claude jsonl session generator for memradar hotfix verification.
//
//   node tests/gen-dummy-sessions.mjs [--count=1000] [--size=600] [--out=path]
//     --count : number of session files (default 1000)
//     --size  : approx file size in KB (default 600)
//     --out   : output directory (default .tmp-dummy-sessions)
//
// Cleanup:
//   node tests/clean-dummy-sessions.mjs [--out=path]
//   or PowerShell: Remove-Item .tmp-dummy-sessions -Recurse -Force

import fs from 'node:fs'
import path from 'node:path'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/)
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]
  })
)

const count = parseInt(args.count ?? '1000', 10)
const sizeKb = parseInt(args.size ?? '600', 10)
const outDir = path.resolve(args.out ?? '.tmp-dummy-sessions')

if (!Number.isFinite(count) || count <= 0) {
  console.error(`Invalid --count: ${args.count}`)
  process.exit(1)
}
if (!Number.isFinite(sizeKb) || sizeKb <= 0) {
  console.error(`Invalid --size: ${args.size}`)
  process.exit(1)
}

const projectDir = path.join(outDir, 'projects', 'dummy-project')
fs.mkdirSync(projectDir, { recursive: true })

const msgsPerFile = 4
const textBytesPerMsg = Math.max(64, Math.floor((sizeKb * 1024) / msgsPerFile) - 200)

const filler = 'lorem ipsum dolor sit amet consectetur adipiscing elit '
function makeText(bytes) {
  const repeats = Math.ceil(bytes / filler.length)
  return filler.repeat(repeats).slice(0, bytes)
}

const totalMb = (count * sizeKb) / 1024
console.log(`Generating ${count} dummy session files (~${sizeKb} KB each) in ${projectDir}`)
console.log(`Estimated total: ~${totalMb.toFixed(0)} MB`)

const startTime = Date.now()
let lastReport = startTime
const sessionPrefix = `dummy-${Date.now().toString(36)}`

for (let i = 0; i < count; i++) {
  const sessionId = `${sessionPrefix}-${i.toString().padStart(5, '0')}`
  const lines = []
  for (let j = 0; j < msgsPerFile; j++) {
    const role = j % 2 === 0 ? 'user' : 'assistant'
    const text = makeText(textBytesPerMsg)
    const record = {
      type: role,
      sessionId,
      cwd: 'D:\\dummy\\path',
      version: '1.0.0',
      timestamp: new Date(Date.now() - (count - i) * 60_000).toISOString(),
      message: {
        role,
        content: [{ type: 'text', text }],
        ...(role === 'assistant'
          ? {
              model: 'claude-sonnet-4-5-20250929',
              usage: {
                input_tokens: 1200,
                output_tokens: 800,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
              },
            }
          : {}),
      },
    }
    lines.push(JSON.stringify(record))
  }
  const filePath = path.join(projectDir, `${sessionId}.jsonl`)
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8')

  const now = Date.now()
  if (now - lastReport > 500) {
    process.stdout.write(`\r  ${i + 1}/${count}`)
    lastReport = now
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
process.stdout.write('\r' + ' '.repeat(40) + '\r')
console.log(`Done. ${count} files in ${elapsed}s`)
console.log()
console.log('Run memradar against the dummy data (PowerShell):')
console.log(`  $env:MEMRADAR_PROJECTS_DIR = "${outDir}\\projects"`)
console.log(`  $env:MEMRADAR_NO_OPEN = "1"`)
console.log(`  $env:MEMRADAR_OUTPUT_HTML = "${outDir}\\memradar.html"`)
console.log(`  Measure-Command { node cli/index.mjs }`)
console.log()
console.log('Cleanup when done:')
console.log(`  node tests/clean-dummy-sessions.mjs --out="${outDir}"`)
