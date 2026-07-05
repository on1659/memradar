/**
 * cleanClaudeText
 *
 * Strips system-injected noise from Claude Code session messages.
 * These are annotations that Claude Code (and the Claude API harness)
 * injects into the conversation context — they are never part of the
 * user's actual message or Claude's actual response.
 *
 * Discovered by scanning ~2,000 real .jsonl session files.
 */

// ─── XML-style system tags ────────────────────────────────────────────────────
//
// Claude Code injects these as XML blocks into message content.
// They carry IDE context, compaction summaries, and command metadata.
//
// Format: <tag>...content...</tag>   (single-line or multi-line)
//
// Tag              | Source
// ─────────────────|───────────────────────────────────────────────────────────
// ide_opened_file  | VSCode extension — file the user has open in the editor
// ide_selection    | VSCode extension — text the user has selected
// ide_diagnostics  | VSCode extension — lint/type errors in the current file
// system-reminder  | Harness — periodic reminders injected mid-conversation
// system_reminder  | Harness — same, underscore variant
// task-notification| Harness — background task status updates
// task_notification| Harness — same, underscore variant
// local-command-stdout | Slash command output (e.g. /model)
// local-command-caveat | Disclaimer appended to slash command output
// bash-input       | Bash tool call input echoed into context
// bash-stdout      | Bash tool call stdout echoed into context
// summary          | Compaction summary — injected when context is compressed
//
// NOTE: command-name / command-message / command-args are NOT in this list.
// They are handled separately below (see COMMAND_CLUSTER_RE) because
// <command-args> holds the user's ACTUAL typed request — so the cluster is
// UNWRAPPED (args, falling back to the command name), not deleted. Stripping
// them would blank out skill-first-sentence sessions (rendered "(빈 세션)").
//
const SYSTEM_XML_TAGS = [
  'ide_opened_file', 'ide_selection', 'ide_diagnostics',
  'system-reminder', 'system_reminder',
  'task-notification', 'task_notification',
  'local-command-stdout', 'local-command-caveat',
  'bash-input', 'bash-stdout',
  'summary',
  'turn_aborted',
  'result',
  'image',
]

// ─── Bracket-style tool annotations ──────────────────────────────────────────
//
// Claude Code also injects short `[verb noun]` annotations inline.
// These are NOT user-typed — they are injected by the IDE extension.
//
// Examples:
//   [opened CLAUDE.md]
//   [read src/index.ts]
//   [wrote package.json]
//
const TOOL_ANNOTATION_VERBS = [
  'opened', 'closed',
  'read', 'wrote', 'created', 'deleted', 'edited', 'updated',
  'ran', 'viewed', 'searched', 'fetched',
]

// ─── Build patterns once ──────────────────────────────────────────────────────

const tagAlt = SYSTEM_XML_TAGS.map(t => t.replace('-', '[-_]')).join('|')
const XML_TAG_RE = new RegExp(
  `<(?:${tagAlt})[^>]*>[\\s\\S]*?</(?:${tagAlt})>\\n?`,
  'gi',
)

const verbAlt = TOOL_ANNOTATION_VERBS.join('|')
const BRACKET_RE = new RegExp(`\\[(?:${verbAlt})\\s[^\\]]+\\]\\s*`, 'gi')

// [Image #1], [Image: source: path], [Image: original WxH...]
const IMAGE_ANNOTATION_RE = /\[Image[^\]]*\]\s*/gi

// ─── Command cluster (slash-command metadata) ────────────────────────────────
//
// Claude Code wraps a slash-command invocation as a cluster of sibling tags —
// in ANY order, separated by whitespace/newlines:
//
//   <command-name>/goal</command-name>
//   <command-message>goal</command-message>
//   <command-args>docs/x.md 정리해줘</command-args>
//
// Unlike the strip-only tags above, <command-args> carries the USER'S ACTUAL
// TYPED REQUEST. Deleting it blanks out skill-first-sentence sessions, which
// then render as "(빈 세션)" in the dashboard. So we UNWRAP the whole cluster
// into a single value:
//   command-args content  (the real request)   — preferred
//   └ if empty → command-name content (e.g. "/goal") — fallback
//   command-message is discarded (it only duplicates the command name).
//
// The trailing `\s*` inside the group lets the `+` swallow the whitespace
// between sibling tags so the cluster matches as one unit regardless of order.
const COMMAND_CLUSTER_RE = /(?:<command[-_](?:name|message|args)[^>]*>[\s\S]*?<\/command[-_](?:name|message|args)>\s*)+/gi
const COMMAND_ARGS_RE = /<command[-_]args[^>]*>([\s\S]*?)<\/command[-_]args>/i
const COMMAND_NAME_RE = /<command[-_]name[^>]*>([\s\S]*?)<\/command[-_]name>/i

function unwrapCommandCluster(cluster: string): string {
  const args = (cluster.match(COMMAND_ARGS_RE)?.[1] ?? '').trim()
  const name = (cluster.match(COMMAND_NAME_RE)?.[1] ?? '').trim()
  const value = args || name
  // The cluster regex consumed the whitespace that separated it from any
  // trailing user text, so re-insert one separator to avoid gluing the
  // collapsed value onto that text. The outer .trim() drops it when the
  // cluster is the whole message.
  return value ? `${value} ` : ''
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface CleanResult {
  /** Cleaned message text, ready for display */
  text: string
  /** True when the original text contained a <turn_aborted> block */
  interrupted: boolean
}

/**
 * Strip all Claude Code system injections from a raw message string.
 *
 * Safe to call on both user and assistant messages.
 * Does not mutate the input.
 */
export function cleanClaudeText(raw: string): CleanResult {
  const interrupted = /<turn_aborted>[\s\S]*?<\/turn_aborted>/i.test(raw)
  const text = raw
    // Unwrap command clusters FIRST so <command-args> content survives; any
    // system tags nested inside the unwrapped request are then stripped below.
    .replace(COMMAND_CLUSTER_RE, unwrapCommandCluster)
    .replace(XML_TAG_RE, '')
    .replace(BRACKET_RE, '')
    .replace(IMAGE_ANNOTATION_RE, '')
    .trim()
  return { text, interrupted }
}
