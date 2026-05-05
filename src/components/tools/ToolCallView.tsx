import { useState } from 'react'
import { ChevronRight, Wrench, AlertTriangle } from 'lucide-react'
import type { ToolCall } from '../../types'
import { Truncate } from './Truncate'

export interface ExpandSignal {
  expanded: boolean
  key: number
}

interface ToolCallViewProps {
  call: ToolCall
  expandSignal?: ExpandSignal
}

function basename(p: string): string {
  if (!p) return ''
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

function getString(input: Record<string, unknown>, key: string): string {
  const v = input[key]
  return typeof v === 'string' ? v : ''
}

function getNumber(input: Record<string, unknown>, key: string): number | undefined {
  const v = input[key]
  return typeof v === 'number' ? v : undefined
}

function HeaderRow({ name, summary, isError, expanded, onToggle }: { name: string; summary?: string; isError?: boolean; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left bg-bg-hover/40 hover:bg-bg-hover/70 transition-colors ${expanded ? 'border-b border-border/60' : ''}`}
    >
      <ChevronRight className={`h-3 w-3 text-text/40 transition-transform ${expanded ? 'rotate-90' : ''} flex-shrink-0`} />
      <Wrench className="h-3 w-3 text-text/50 flex-shrink-0" />
      <span className="font-mono text-[11px] font-semibold text-text-bright flex-shrink-0">{name}</span>
      {summary && (
        <span className="font-mono text-[11px] text-text/60 truncate min-w-0">{summary}</span>
      )}
      {isError && (
        <span className="ml-auto flex items-center gap-1 text-[10px] text-red-400 flex-shrink-0">
          <AlertTriangle className="h-3 w-3" /> error
        </span>
      )}
    </button>
  )
}

function ResultBlock({ content, isError }: { content: string; isError: boolean }) {
  if (!content) return null
  return (
    <div className={`px-3 py-2 border-t border-border/60 ${isError ? 'bg-red-500/5' : ''}`}>
      <div className="text-[10px] uppercase tracking-wider text-text/35 mb-1">result</div>
      <Truncate text={content} maxChars={1200} />
    </div>
  )
}

function diffStats(oldStr: string, newStr: string): { added: number; removed: number } {
  const oldLines = oldStr.split('\n').length
  const newLines = newStr.split('\n').length
  return { added: Math.max(0, newLines - oldLines), removed: Math.max(0, oldLines - newLines) }
}

function EditBody({ input }: { input: Record<string, unknown> }) {
  const oldStr = getString(input, 'old_string')
  const newStr = getString(input, 'new_string')
  const stats = diffStats(oldStr, newStr)
  return (
    <div className="px-3 py-2 space-y-2">
      <div className="text-[10px] text-text/45">
        {stats.added > 0 && <span className="text-emerald-400">+{stats.added} </span>}
        {stats.removed > 0 && <span className="text-red-400">-{stats.removed} </span>}
        <span>(old {oldStr.length}자 → new {newStr.length}자)</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-red-500/20 bg-red-500/5">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-red-300/70 border-b border-red-500/10">- old</div>
          <div className="px-2 py-1">
            <Truncate text={oldStr || '(empty)'} maxChars={800} />
          </div>
        </div>
        <div className="rounded border border-emerald-500/20 bg-emerald-500/5">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-emerald-300/70 border-b border-emerald-500/10">+ new</div>
          <div className="px-2 py-1">
            <Truncate text={newStr || '(empty)'} maxChars={800} />
          </div>
        </div>
      </div>
    </div>
  )
}

function WriteBody({ input }: { input: Record<string, unknown> }) {
  const content = getString(input, 'content')
  const lines = content ? content.split('\n').length : 0
  return (
    <div className="px-3 py-2 space-y-1">
      <div className="text-[10px] text-text/45">
        <span className="text-emerald-400">+{lines}</span> lines · {content.length}자
      </div>
      <div className="rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-1">
        <Truncate text={content || '(empty)'} maxChars={1500} />
      </div>
    </div>
  )
}

function BashBody({ input }: { input: Record<string, unknown> }) {
  const command = getString(input, 'command')
  const description = getString(input, 'description')
  return (
    <div className="px-3 py-2 space-y-1">
      {description && <div className="text-[10px] text-text/45">{description}</div>}
      <div className="rounded bg-bg/60 border border-border/40 px-2 py-1">
        <Truncate text={command} maxChars={600} />
      </div>
    </div>
  )
}

function GenericBody({ input }: { input: Record<string, unknown> }) {
  const json = JSON.stringify(input, null, 2)
  if (json === '{}') return null
  return (
    <div className="px-3 py-2">
      <Truncate text={json} maxChars={800} />
    </div>
  )
}

function summaryFor(call: ToolCall): string {
  const i = call.input
  switch (call.name) {
    case 'Edit':
    case 'Write':
    case 'Read': {
      const fp = getString(i, 'file_path')
      const offset = getNumber(i, 'offset')
      const limit = getNumber(i, 'limit')
      const range = offset != null || limit != null ? `:${offset ?? 0}+${limit ?? '∞'}` : ''
      return fp ? basename(fp) + range : ''
    }
    case 'Bash': {
      const cmd = getString(i, 'command')
      return cmd.length > 80 ? cmd.slice(0, 80) + '…' : cmd
    }
    case 'Grep':
    case 'Glob': {
      const pattern = getString(i, 'pattern')
      const glob = getString(i, 'glob')
      return pattern + (glob ? ` (${glob})` : '')
    }
    case 'TodoWrite': {
      const todos = i.todos
      if (Array.isArray(todos)) return `${todos.length} item(s)`
      return ''
    }
    default:
      return ''
  }
}

function bodyFor(call: ToolCall) {
  switch (call.name) {
    case 'Edit':
      return <EditBody input={call.input} />
    case 'Write':
      return <WriteBody input={call.input} />
    case 'Bash':
      return <BashBody input={call.input} />
    case 'Read':
    case 'Grep':
    case 'Glob':
      return null
    default:
      return <GenericBody input={call.input} />
  }
}

export function ToolCallView({ call, expandSignal }: ToolCallViewProps) {
  const [expanded, setExpanded] = useState(expandSignal?.expanded ?? true)
  const [lastSignalKey, setLastSignalKey] = useState(expandSignal?.key ?? -1)
  // Sync with parent signal when its key changes (global expand/collapse).
  // React-recommended derived-state pattern — see https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (expandSignal && expandSignal.key !== lastSignalKey) {
    setLastSignalKey(expandSignal.key)
    setExpanded(expandSignal.expanded)
  }

  const summary = summaryFor(call)
  const isError = !!call.result?.isError

  return (
    <div className="rounded-lg border border-border/60 bg-bg-card/40 overflow-hidden">
      <HeaderRow
        name={call.name}
        summary={summary}
        isError={isError}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded && (
        <>
          {bodyFor(call)}
          {call.result && <ResultBlock content={call.result.content} isError={isError} />}
        </>
      )}
    </div>
  )
}
