#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseJsonl } from '../src/parser.ts'
import { codexProvider } from '../src/providers/codex.ts'
import type { Session } from '../src/types.ts'
import {
  analyzeUsageTopCategories,
  analyzeUsageRoles,
  USAGE_CATEGORIES,
} from '../src/lib/usageProfile.ts'

function walkJsonl(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkJsonl(full, out)
    else if (entry.isFile() && (entry.name.endsWith('.jsonl') || entry.name.endsWith('.json'))) {
      out.push(full)
    }
  }
  return out
}

function loadClaude(sessions: Session[]) {
  const dir = path.join(os.homedir(), '.claude', 'projects')
  const files = walkJsonl(dir)
  console.log(`[claude] ${files.length} files under ${dir}`)
  let ok = 0, fail = 0
  for (const f of files) {
    try {
      const text = fs.readFileSync(f, 'utf8')
      const session = parseJsonl(text, path.basename(f))
      if (session) { sessions.push(session); ok++ } else { fail++ }
    } catch { fail++ }
  }
  console.log(`[claude] parsed ok=${ok}, skipped/fail=${fail}`)
}

function loadCodex(sessions: Session[]) {
  const dir = path.join(os.homedir(), '.codex', 'sessions')
  const files = walkJsonl(dir)
  console.log(`[codex] ${files.length} files under ${dir}`)
  let ok = 0, fail = 0
  for (const f of files) {
    try {
      const text = fs.readFileSync(f, 'utf8')
      const session = codexProvider.parse(text, path.basename(f))
      if (session) { sessions.push(session); ok++ } else { fail++ }
    } catch { fail++ }
  }
  console.log(`[codex] parsed ok=${ok}, skipped/fail=${fail}`)
}

function bar(pct: number, width = 20): string {
  const filled = Math.round(pct * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function main() {
  const sessions: Session[] = []
  loadClaude(sessions)
  loadCodex(sessions)

  const totalUserMessages = sessions.reduce((n, s) => n + s.messages.filter((m) => m.role === 'user').length, 0)
  console.log(`\n=== Overview ===`)
  console.log(`Sessions: ${sessions.length}`)
  console.log(`Total user messages: ${totalUserMessages}`)

  // Global aggregate (same as Dashboard "내 AI의 직업")
  const top = analyzeUsageTopCategories(sessions, USAGE_CATEGORIES.length)
  const topSum = top.reduce((n, c) => n + c.score, 0) || 1

  console.log(`\n=== Global role scores (all sessions aggregated) ===`)
  for (const c of top) {
    const share = c.score / topSum
    console.log(`  ${c.emoji} ${c.title.padEnd(14)} ${bar(share)} ${(share * 100).toFixed(1)}%  · ${Math.round(c.score)}점 · ${c.sessionCount}세션`)
  }

  // Phase 3 analysis (experimental — magic numbers未튜닝)
  const analysis = analyzeUsageRoles(sessions, 3)
  console.log(`\n=== Phase 3 API snapshot (실측 튜닝 전) ===`)
  console.log(`  undecided : ${analysis.undecided}`)
  console.log(`  mixedRole : ${analysis.mixedRole}`)
  console.log(`  confidence: ${analysis.confidence}`)
  console.log(`  matched   : ${analysis.matchedMessages}/${analysis.totalMessages} messages`)

  // Per-session breakdown (top 20 largest sessions)
  console.log(`\n=== Per-session top role (top 20 by message count) ===`)
  const sessionBreakdown = sessions
    .map((s) => {
      const userCount = s.messages.filter((m) => m.role === 'user').length
      const cats = analyzeUsageTopCategories([s], 2)
      return {
        session: s,
        userCount,
        top1: cats[0],
        top2: cats[1],
      }
    })
    .filter((x) => x.userCount > 0)
    .sort((a, b) => b.userCount - a.userCount)
    .slice(0, 20)

  for (const { session, userCount, top1, top2 } of sessionBreakdown) {
    const label = top1
      ? `${top1.emoji} ${top1.title}${top2 ? ` + ${top2.emoji} ${top2.title}` : ''}`
      : '(탐색 중)'
    console.log(`  ${String(userCount).padStart(3)} msgs · ${session.fileName.padEnd(40)} → ${label}`)
  }

  // Distribution of per-session top roles
  console.log(`\n=== Distribution: how often each role comes out as #1 per session ===`)
  const top1Counter: Record<string, number> = {}
  let undecidedSessions = 0
  for (const s of sessions) {
    const cats = analyzeUsageTopCategories([s], 1)
    if (cats.length === 0) { undecidedSessions++; continue }
    const id = cats[0].id
    top1Counter[id] = (top1Counter[id] || 0) + 1
  }
  const totalSessions = sessions.length
  const sortedDist = Object.entries(top1Counter).sort((a, b) => b[1] - a[1])
  for (const [id, count] of sortedDist) {
    const cat = USAGE_CATEGORIES.find((c) => c.id === id)
    const share = count / totalSessions
    console.log(`  ${cat?.emoji ?? '  '} ${(cat?.title ?? id).padEnd(14)} ${bar(share)} ${(share * 100).toFixed(1)}% (${count}/${totalSessions})`)
  }
  console.log(`   (탐색 중)        ${bar(undecidedSessions / totalSessions)} ${((undecidedSessions / totalSessions) * 100).toFixed(1)}% (${undecidedSessions}/${totalSessions})`)
}

main()
