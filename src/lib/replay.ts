import type { ParsedMessage } from '../types'

export type ReplaySpeed = 1 | 2 | 5

export type GapMagnitude =
  | { unit: 'none' }
  | { unit: 'minutes'; value: number }
  | { unit: 'hours'; value: number }

export type ReplayEvent =
  | { kind: 'message'; messageIndex: number; message: ParsedMessage; offsetMs: number; durationMs: number }
  | { kind: 'gap'; afterMessageIndex: number; realGapMs: number; magnitude: GapMagnitude; offsetMs: number; durationMs: number }

export interface ReplayTimeline {
  events: ReplayEvent[]
  totalMs: number
  messageCount: number
}

const MIN_MESSAGE_DURATION_MS = 500
const MAX_MESSAGE_DURATION_MS = 4_000
const MS_PER_CHAR = 8

function messageDurationFor(text: string): number {
  const len = text?.length ?? 0
  const scaled = MIN_MESSAGE_DURATION_MS + len * MS_PER_CHAR
  return Math.min(MAX_MESSAGE_DURATION_MS, Math.max(MIN_MESSAGE_DURATION_MS, scaled))
}

function compressGap(realGapMs: number): { durationMs: number; magnitude: GapMagnitude } {
  if (realGapMs < 10_000) return { durationMs: 0, magnitude: { unit: 'none' } }
  if (realGapMs < 60_000) return { durationMs: 1_000, magnitude: { unit: 'none' } }
  if (realGapMs < 5 * 60_000) {
    const minutes = Math.round(realGapMs / 60_000)
    return { durationMs: 2_000, magnitude: { unit: 'minutes', value: minutes } }
  }
  if (realGapMs < 30 * 60_000) {
    const minutes = Math.round(realGapMs / 60_000)
    return { durationMs: 3_000, magnitude: { unit: 'minutes', value: minutes } }
  }
  const hours = Math.max(1, Math.round(realGapMs / 3_600_000))
  return { durationMs: 3_000, magnitude: { unit: 'hours', value: hours } }
}

export function buildTimeline(messages: ParsedMessage[]): ReplayTimeline {
  const events: ReplayEvent[] = []
  let cursor = 0

  messages.forEach((message, index) => {
    if (index > 0) {
      const prev = messages[index - 1]
      const prevTs = Date.parse(prev.timestamp)
      const nowTs = Date.parse(message.timestamp)
      const realGapMs = Number.isFinite(prevTs) && Number.isFinite(nowTs) ? Math.max(0, nowTs - prevTs) : 0
      const { durationMs, magnitude } = compressGap(realGapMs)
      if (durationMs > 0) {
        events.push({
          kind: 'gap',
          afterMessageIndex: index - 1,
          realGapMs,
          magnitude,
          offsetMs: cursor,
          durationMs,
        })
        cursor += durationMs
      }
    }

    const durationMs = messageDurationFor(message.text)
    events.push({
      kind: 'message',
      messageIndex: index,
      message,
      offsetMs: cursor,
      durationMs,
    })
    cursor += durationMs
  })

  return {
    events,
    totalMs: cursor,
    messageCount: messages.length,
  }
}

export function findEventAt(timeline: ReplayTimeline, elapsedMs: number): number {
  let lo = 0
  let hi = timeline.events.length - 1
  let result = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const ev = timeline.events[mid]
    if (ev.offsetMs <= elapsedMs) {
      result = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return result
}

export function messageIndexAt(timeline: ReplayTimeline, elapsedMs: number): number {
  const idx = findEventAt(timeline, elapsedMs)
  if (idx < 0) return -1
  for (let i = idx; i >= 0; i--) {
    const ev = timeline.events[i]
    if (ev.kind === 'message') return ev.messageIndex
  }
  return -1
}

export function offsetForMessageIndex(timeline: ReplayTimeline, messageIndex: number): number {
  for (const ev of timeline.events) {
    if (ev.kind === 'message' && ev.messageIndex === messageIndex) return ev.offsetMs
  }
  return 0
}

export function formatReplayTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function computeDensityBuckets(timeline: ReplayTimeline, bucketCount: number): number[] {
  const buckets = new Array(bucketCount).fill(0) as number[]
  if (timeline.totalMs <= 0 || bucketCount <= 0) return buckets

  for (const ev of timeline.events) {
    if (ev.kind !== 'message') continue
    const ratio = ev.offsetMs / timeline.totalMs
    const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(ratio * bucketCount)))
    buckets[idx] += 1
  }

  const max = Math.max(1, ...buckets)
  return buckets.map((count) => count / max)
}
