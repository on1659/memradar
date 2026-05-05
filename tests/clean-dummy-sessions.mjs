#!/usr/bin/env node
// Remove the dummy session directory created by tests/gen-dummy-sessions.mjs.
//
//   node tests/clean-dummy-sessions.mjs [--out=path]

import fs from 'node:fs'
import path from 'node:path'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/)
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]
  })
)

const outDir = path.resolve(args.out ?? '.tmp-dummy-sessions')

if (!fs.existsSync(outDir)) {
  console.log(`Nothing to clean: ${outDir} not found`)
  process.exit(0)
}

const stat = fs.statSync(outDir)
if (!stat.isDirectory()) {
  console.error(`Refusing to remove non-directory: ${outDir}`)
  process.exit(1)
}

console.log(`Removing ${outDir}...`)
fs.rmSync(outDir, { recursive: true, force: true })
console.log('Done.')
