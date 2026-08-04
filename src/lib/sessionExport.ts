/**
 * sessionExport
 *
 * 세션 상세(SessionView) 화면에서 대화를 마크다운/HTML로 내보내고
 * 클립보드 복사·파일 다운로드를 지원하는 헬퍼 모듈.
 *
 * 원칙
 * - 외부 네트워크 I/O 절대 금지 (CLAUDE.md: 세션 데이터 외부 전송 금지)
 * - 도구 호출(toolCalls/toolUses) 은 본문과 함께 직렬화 — 어시스턴트 작업 흐름 보존
 *   - toolCalls 있으면 도구명 + 입력 + 결과 상세 (서버 모드 + heavy parse 결과)
 *   - toolCalls 없고 toolUses 만 있으면 도구명 chip 폴백 (static 모드)
 * - cleanClaudeText 를 입구에서 항상 적용 (시스템 태그 누출 방지)
 * - maskSecrets 를 직렬화 경계에서 항상 적용 — export 산출물(.md/.html/클립보드)에는
 *   원문 시크릿이 없다. `[REDACTED:kind]` 고정, 리빌 없음.
 * - 신규 deps 금지: 마크다운→HTML 은 react-dom/server + ReactMarkdown 사용
 */
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Session, ParsedMessage, ToolCall, ToolResult } from '../types'
import { shortModelName } from './modelNames'
import { displayModel } from './modelAttribution'

/**
 * export 산출물의 모델 라벨 — 표시 규칙은 displayModel 한 곳에서만 정의한다.
 * `<synthetic>` 이 대표 모델로 잡히던 세션(실측 2건)에서 "Synthetic" 배지가 사라진다.
 */
function displayModelLabel(session: Session): string | null {
  const model = displayModel(session)
  return model ? shortModelName(model) : null
}
import { cleanClaudeText } from './cleanClaudeText'
import { maskSecrets } from './secretMask'

// ─── 공통 유틸 ───────────────────────────────────────────────────────────────

function formatTime(ts: string): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toPlainTitle(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, '').trim())
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim()
}

function getSessionTitle(session: Session, messages: ParsedMessage[]): string {
  const first = messages[0]?.text ?? session.messages[0]?.text ?? ''
  const cleaned = cleanClaudeText(first).text
  // 제목은 export 헤더/<title> 에 그대로 실린다 — 직렬화 경계 마스킹
  const title = maskSecrets(toPlainTitle(cleaned)).masked
  return title || '빈 대화'
}

/**
 * 윈도우/맥/리눅스 안전 파일명으로 정규화.
 * - 금지 문자: / \ : * ? " < > | 및 control chars
 * - 빈 문자열이면 'session' 폴백
 * - 100자 길이 제한
 */
export function sanitizeFileName(name: string): string {
  if (!name) return 'session'
  let s = name
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return 'session'
  if (s.length > 100) s = s.slice(0, 100).trim()
  // 윈도우 끝점·공백 금지
  s = s.replace(/[. ]+$/g, '').trim()
  return s || 'session'
}

/**
 * 최소한의 HTML escape — 본문 텍스트(마크다운 원본 노출은 buildHtmlMarkdown 에서 안 씀)와
 * 헤더 메타 라인용. 마크다운 렌더링 결과는 react-dom/server 가 이미 안전하게 escape 한다.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 마크다운 텍스트를 react-dom/server 로 정적 HTML 렌더링.
 * - ReactMarkdown + remarkGfm 만 사용 (mdComponents 의 Tailwind className 은
 *   자체완결 HTML 에서는 의미 없음 — 인라인 스타일로 별도 처리하므로
 *   여기서는 components prop 을 넘기지 않는다.)
 * - 결과는 <p>...</p> 등 표준 HTML 태그 시퀀스
 */
export function renderMarkdownToHtml(text: string): string {
  const element: ReactElement = createElement(
    ReactMarkdown,
    { remarkPlugins: [remarkGfm] },
    text
  )
  return renderToStaticMarkup(element)
}

// ─── 도구 호출 직렬화 보조 ──────────────────────────────────────────────────

function basename(p: string): string {
  if (!p) return ''
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

function getString(input: Record<string, unknown>, key: string): string {
  const v = input[key]
  return typeof v === 'string' ? v : ''
}

/**
 * 도구 호출 한 줄 요약 — `<details>` summary / 카드 헤더에 쓰는 짧은 라벨.
 * - Bash: command 60자 트림
 * - Edit/Write/Read: file_path basename
 * - Grep/Glob: pattern (+ glob 옵션)
 * - 알 수 없는 도구: input의 첫 번째 string 값(60자 트림) 또는 첫 키
 */
export function summarizeToolCall(call: ToolCall): string {
  const i = call.input
  switch (call.name) {
    case 'Bash': {
      // summary 는 <details> 헤더로 export 에 항상 노출 — slice 전에 마스킹
      const cmd = maskSecrets(getString(i, 'command')).masked
      return cmd.length > 60 ? cmd.slice(0, 60) + '…' : cmd
    }
    case 'Edit':
    case 'Write':
    case 'Read': {
      const fp = getString(i, 'file_path')
      return fp ? basename(fp) : ''
    }
    case 'Grep':
    case 'Glob': {
      // pattern/glob 도 사용자 입력 — Bash 와 동일하게 summary 노출 전 마스킹
      const pattern = maskSecrets(getString(i, 'pattern')).masked
      const glob = maskSecrets(getString(i, 'glob')).masked
      return pattern + (glob ? ` (${glob})` : '')
    }
    case 'TodoWrite': {
      const todos = i.todos
      if (Array.isArray(todos)) return `${todos.length} item(s)`
      return ''
    }
    default: {
      // 첫 번째 문자열 값을 찾아 60자 트림 (마스킹 후 trim/slice — 잘린 시크릿 방지)
      for (const key of Object.keys(i)) {
        const v = i[key]
        if (typeof v === 'string' && v) {
          const trimmed = maskSecrets(v).masked.replace(/\s+/g, ' ').trim()
          return trimmed.length > 60 ? trimmed.slice(0, 60) + '…' : trimmed
        }
      }
      const keys = Object.keys(i)
      return keys[0] ?? ''
    }
  }
}

interface ToolInputSerialized {
  lang: string
  content: string
  /** Bash 의 description (있을 때만, MD 에서 인용 한 줄로 위에 깔린다) */
  description?: string
}

/**
 * 도구 입력을 코드블록용 직렬 표현으로 변환.
 * - Bash: command 본문 + description(있으면) — bash 코드블록
 * - 그 외: JSON pretty — json 코드블록
 *
 * Record<string, unknown> 안에 순환 참조가 있을 가능성은 사실상 없지만,
 * 안전하게 try/catch 로 감싸 직렬화 실패 시 '(직렬화 실패)' 문자열을 돌려준다.
 */
export function formatToolInput(call: ToolCall): ToolInputSerialized {
  if (call.name === 'Bash') {
    const command = maskSecrets(getString(call.input, 'command')).masked
    const description = maskSecrets(getString(call.input, 'description')).masked
    return {
      lang: 'bash',
      content: command,
      description: description || undefined,
    }
  }
  let content = ''
  try {
    content = JSON.stringify(call.input ?? {}, null, 2)
  } catch {
    content = '(직렬화 실패)'
  }
  return { lang: 'json', content: maskSecrets(content).masked }
}

/**
 * 도구 결과 본문 추출. result 가 없으면 '(결과 없음)' 자리표시 반환.
 * 도구 결과는 env 출력 등 시크릿 최고위험 표면 — 항상 마스킹해 반환.
 */
export function formatToolResult(result: ToolResult | undefined): string {
  if (!result) return '(결과 없음)'
  return maskSecrets(result.content ?? '').masked
}

// ─── 메시지 직렬화 ──────────────────────────────────────────────────────────

interface ExportMessage {
  role: 'user' | 'assistant'
  timestamp: string
  cleaned: string
  interrupted: boolean
  /** 원본 toolCalls — 상세 표시용 (서버 모드 heavy parse 일 때만) */
  toolCalls?: ToolCall[]
  /** 항상 채워지는 도구명 배열 — toolCalls 없을 때 chip 폴백 */
  toolUses: string[]
}

/**
 * 빈 메시지: 본문이 비고 도구 호출도 없는 경우.
 * - 본문이 비어도 toolCalls/toolUses 가 있으면 어시스턴트의 "도구 호출만" 턴이므로 포함.
 */
function isEmptyForExport(m: ParsedMessage): boolean {
  const cleaned = cleanClaudeText(m.text).text.trim()
  const hasTools = (m.toolCalls?.length ?? 0) > 0 || m.toolUses.length > 0
  return cleaned === '' && !hasTools
}

function toExportMessages(messages: ParsedMessage[]): ExportMessage[] {
  const out: ExportMessage[] = []
  for (const m of messages) {
    if (isEmptyForExport(m)) continue
    const { text, interrupted } = cleanClaudeText(m.text)
    out.push({
      role: m.role,
      timestamp: m.timestamp,
      cleaned: maskSecrets(text).masked.trim(),
      interrupted,
      toolCalls: m.toolCalls,
      toolUses: m.toolUses,
    })
  }
  return out
}

function roleLabel(role: 'user' | 'assistant', source: Session['source']): string {
  if (role === 'user') return 'You'
  return source === 'codex' ? 'Codex' : 'Claude'
}

// ─── 훅 실행 요약 (페이로드-프리) ───────────────────────────────────────────
//
// export v1 은 hookSummary(집계 행)만 싣는다 — command/stdout/stderr 는
// 타입 차원에서 존재하지 않아 구조적으로 누출 불가 (hooks-analytics D7).
//

/**
 * 세션 훅 요약을 export 용 한 줄 텍스트 배열로 직렬화.
 * hookSummary 부재(구버전 산출물·Codex·훅 없음) 시 빈 배열 — 호출부는 섹션 생략.
 */
export function buildHookSummaryLines(session: Session): string[] {
  const rows = session.hookSummary?.rows
  if (!rows || rows.length === 0) return []
  return rows.map((row) => {
    const parts: string[] = []
    if (row.counts.success > 0) parts.push(`성공 ${row.counts.success}`)
    if (row.counts.denied > 0) parts.push(`차단 ${row.counts.denied}`)
    if (row.counts.blockingError > 0) parts.push(`차단 에러 ${row.counts.blockingError}`)
    if (row.counts.nonBlockingError > 0) parts.push(`실패 ${row.counts.nonBlockingError}`)
    if (row.counts.cancelled > 0) parts.push(`취소 ${row.counts.cancelled}`)
    if (row.counts.timedOut > 0) parts.push(`시간초과 ${row.counts.timedOut}`)
    if (row.counts.summaryOnly > 0) parts.push(`요약만 ${row.counts.summaryOnly}`)
    const tally = parts.length > 0 ? parts.join(' · ') : '기록 0'
    return `${row.hookName} (${row.hookEvent}) — ${tally}`
  })
}

// ─── (1) 마크다운 (.md) ─────────────────────────────────────────────────────

/**
 * 한 메시지의 마크다운 표현을 반환 (헤더 + 본문 + 도구 호출 블록).
 * - buildMarkdown 내부 / SessionView 메시지 단위 복사에서 공통으로 사용.
 * - 메시지가 export 대상이 아니면 빈 문자열 반환.
 */
export function buildMessageMarkdown(msg: ParsedMessage, source: Session['source']): string {
  if (isEmptyForExport(msg)) return ''
  const { text, interrupted } = cleanClaudeText(msg.text)
  const label = roleLabel(msg.role, source)
  const time = formatTime(msg.timestamp)
  const heading = time ? `## ${label} · ${time}` : `## ${label}`
  const interruptedLine = interrupted ? '> ⚠️ 중단됨\n\n' : ''
  // toExportMessages 를 안 거치는 경로(메시지 단위 복사)도 여기서 마스킹된다
  const body = maskSecrets(text).masked.trim()
  const toolBlock = renderToolCallsMarkdown(msg)
  const parts = [heading, '', `${interruptedLine}${body}`]
  if (toolBlock) parts.push('', toolBlock)
  return parts.join('\n')
}

/**
 * 메시지의 도구 호출 블록을 마크다운으로 직렬화.
 * - toolCalls 있으면 각 호출당 `<details>` 블록 (이름 + 입력 + 결과)
 * - toolCalls 없고 toolUses 만 있으면 `🔧 도구: A, B, C` 한 줄 폴백
 * - 둘 다 없으면 빈 문자열
 */
function renderToolCallsMarkdown(msg: ParsedMessage): string {
  if (msg.toolCalls && msg.toolCalls.length > 0) {
    return msg.toolCalls.map((c) => renderToolCallMarkdown(c)).join('\n\n')
  }
  if (msg.toolUses.length > 0) {
    const unique = [...new Set(msg.toolUses)]
    return `🔧 도구: ${unique.join(', ')}`
  }
  return ''
}

function renderToolCallMarkdown(call: ToolCall): string {
  const summary = summarizeToolCall(call)
  const summaryLabel = summary ? `🔧 ${call.name} — ${summary}` : `🔧 ${call.name}`
  const input = formatToolInput(call)
  const result = formatToolResult(call.result)
  const isError = call.result?.isError === true

  const lines: string[] = []
  lines.push(`<details><summary>${summaryLabel}</summary>`)
  lines.push('')
  lines.push('**입력**')
  lines.push('')
  if (input.description) {
    // Bash description 한 줄 인용
    lines.push(`> ${input.description}`)
    lines.push('')
  }
  lines.push('```' + input.lang)
  lines.push(input.content)
  lines.push('```')
  lines.push('')
  lines.push('**결과**')
  lines.push('')
  if (isError) {
    lines.push('> ⚠️ 에러')
    lines.push('')
  }
  lines.push('```')
  lines.push(result)
  lines.push('```')
  lines.push('')
  lines.push('</details>')
  return lines.join('\n')
}

/**
 * 원본 마크다운 직렬화. assistant text 자체가 마크다운이므로 그대로 둔다.
 * - 메타 헤더 + 메시지 본문 + 도구 호출 블록
 * - 중단됨은 `> ⚠️ 중단됨` blockquote
 */
export function buildMarkdown(session: Session, messages: ParsedMessage[]): string {
  const title = getSessionTitle(session, messages)
  const exportMessages = toExportMessages(messages)
  const totalMessages = exportMessages.length

  const sourceLabel = session.source === 'codex' ? 'Codex' : 'Claude'
  const startedAt = session.startTime ? new Date(session.startTime).toLocaleString('ko-KR') : '-'
  const modelLabel = displayModelLabel(session) ?? '-'

  // 훅 실행 요약 — 페이로드-프리 집계 라인만 (command/stdout 구조적 부재)
  const hookLines = buildHookSummaryLines(session)

  const header = [
    `# ${title}`,
    '',
    `- 시작: ${startedAt}`,
    `- 소스: ${sourceLabel}`,
    `- 모델: ${modelLabel}`,
    `- 메시지 수: ${totalMessages}`,
    ...(hookLines.length > 0
      ? ['', '## 훅 실행 기록', '', ...hookLines.map((line) => `- ${line}`)]
      : []),
    '',
    '---',
    '',
  ].join('\n')

  // 메시지마다 buildMessageMarkdown 재사용 — 메시지 단위 복사와 정확히 같은 형태.
  const body = messages
    .map((m) => buildMessageMarkdown(m, session.source))
    .filter((s) => s.length > 0)
    .join('\n\n')

  return `${header}${body}\n`
}

// ─── (2) HTML 채팅 톤 (다크) ────────────────────────────────────────────────

const CHAT_HTML_STYLE = `
:root {
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: #0f141c;
  color: #97a3b6;
  font-family: Pretendard, 'Noto Sans KR', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.wrap {
  max-width: 760px;
  margin: 0 auto;
  padding: 32px 20px 64px;
}
.header {
  border: 1px solid #2a3444;
  background: #171d28;
  border-radius: 14px;
  padding: 20px 22px;
  margin-bottom: 24px;
}
.header h1 {
  font-size: 18px;
  font-weight: 600;
  color: #edf2fb;
  margin: 0 0 12px;
  line-height: 1.4;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  font-size: 12px;
  color: rgba(151, 163, 182, 0.75);
}
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(151, 163, 182, 0.18);
  background: rgba(151, 163, 182, 0.08);
  font-size: 11px;
  color: #edf2fb;
}
.badge.claude {
  color: #f59e0b;
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.1);
}
.badge.codex {
  color: #7c83ff;
  border-color: rgba(124, 131, 255, 0.35);
  background: rgba(124, 131, 255, 0.1);
}
.badge.model {
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.3);
  background: rgba(52, 211, 153, 0.08);
}
.messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.msg {
  border-radius: 14px;
  padding: 16px 20px;
  border: 1px solid #2a3444;
  background: #171d28;
}
.msg.user {
  margin-left: 40px;
  border-color: rgba(52, 211, 153, 0.18);
  background: rgba(52, 211, 153, 0.06);
}
.msg-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 12px;
  color: rgba(151, 163, 182, 0.7);
}
.role {
  font-weight: 600;
  font-size: 12px;
  color: #edf2fb;
}
.role.user { color: #34d399; }
.role.assistant { color: #7c83ff; }
.time { font-size: 11px; color: rgba(151, 163, 182, 0.5); }
.interrupted-badge {
  display: inline-block;
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 500;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.28);
}
.body {
  color: #d6dfee;
  font-size: 14px;
  line-height: 1.75;
  word-wrap: break-word;
  overflow-wrap: anywhere;
}
.msg.user .body { color: #edf2fb; }
.body > :first-child { margin-top: 0; }
.body > :last-child { margin-bottom: 0; }
.body p { margin: 0 0 10px; }
.body h1, .body h2, .body h3, .body h4 {
  color: #edf2fb;
  font-weight: 600;
  margin: 18px 0 8px;
  line-height: 1.35;
}
.body h1 { font-size: 1.05rem; }
.body h2 { font-size: 1rem; }
.body h3 { font-size: 0.95rem; }
.body ul, .body ol { margin: 0 0 10px; padding-left: 22px; }
.body li { margin: 4px 0; }
.body code {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, ui-monospace, monospace;
  font-size: 0.85em;
  background: #0f141c;
  color: #a78bfa;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid rgba(151, 163, 182, 0.12);
}
.body pre {
  background: #0f141c;
  border: 1px solid #2a3444;
  border-radius: 8px;
  padding: 12px 14px;
  overflow-x: auto;
  font-size: 0.82em;
  margin: 0 0 12px;
}
.body pre code {
  background: transparent;
  border: 0;
  padding: 0;
  color: #d6dfee;
}
.body blockquote {
  margin: 0 0 10px;
  padding: 4px 14px;
  border-left: 3px solid rgba(124, 131, 255, 0.5);
  color: rgba(151, 163, 182, 0.85);
  background: rgba(124, 131, 255, 0.05);
  border-radius: 0 6px 6px 0;
}
.body a {
  color: #7c83ff;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.body table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
  margin: 0 0 12px;
}
.body th, .body td {
  padding: 6px 10px;
  border-bottom: 1px solid rgba(151, 163, 182, 0.18);
  text-align: left;
}
.body th { color: #edf2fb; font-weight: 600; }
.body hr {
  border: 0;
  border-top: 1px solid rgba(151, 163, 182, 0.18);
  margin: 16px 0;
}
.body img { max-width: 100%; border-radius: 6px; }
/* ── tool calls ──────────────────────────────────────────────────────── */
.tool-calls {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tool-uses {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tool-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  color: rgba(214, 223, 238, 0.7);
  background: rgba(151, 163, 182, 0.08);
  border: 1px solid rgba(151, 163, 182, 0.18);
}
.tool-call {
  border-radius: 8px;
  border: 1px solid #2a3444;
  background: rgba(0, 0, 0, 0.15);
}
.tool-call > summary {
  list-style: none;
}
.tool-call > summary::-webkit-details-marker {
  display: none;
}
.tool-call-head {
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  align-items: center;
  border-bottom: 1px solid transparent;
}
.tool-call[open] .tool-call-head {
  border-bottom-color: #2a3444;
}
.tool-icon {
  flex-shrink: 0;
  font-size: 11px;
  opacity: 0.65;
}
.tool-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  color: #f3efff;
  flex-shrink: 0;
}
.tool-summary {
  color: rgba(255, 255, 255, 0.6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}
.tool-error-chip {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 10px;
  color: #f87171;
}
.tool-body {
  padding: 10px 12px;
  font-size: 12px;
}
.tool-section-label {
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.4);
  margin: 6px 0 4px;
}
.tool-section-label:first-child {
  margin-top: 0;
}
.tool-desc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  margin: 0 0 4px;
}
.tool-input,
.tool-result {
  background: rgba(0, 0, 0, 0.3);
  padding: 8px 10px;
  border-radius: 6px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
.tool-input code,
.tool-result code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  background: transparent;
  border: 0;
  padding: 0;
  color: #d6dfee;
}
.tool-result.error {
  background: rgba(255, 90, 90, 0.08);
  border: 1px solid rgba(255, 90, 90, 0.2);
}
.hook-summary {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(151, 163, 182, 0.18);
  font-size: 11px;
  color: rgba(151, 163, 182, 0.75);
}
.hook-summary-title {
  font-weight: 600;
  color: #edf2fb;
  margin-bottom: 4px;
}
.hook-summary li { margin: 2px 0 2px 16px; }
.footer {
  margin-top: 28px;
  text-align: center;
  font-size: 11px;
  color: rgba(151, 163, 182, 0.4);
}
`.trim()

interface ToolCardClasses {
  call: string
  head: string
  body: string
  sectionLabel: string
  desc: string
  input: string
  result: string
  resultError: string
  errorChip: string
  icon: string
  name: string
  summary: string
  toolCallsWrap: string
  toolUsesWrap: string
  toolChip: string
}

const CHAT_TOOL_CLASSES: ToolCardClasses = {
  call: 'tool-call',
  head: 'tool-call-head',
  body: 'tool-body',
  sectionLabel: 'tool-section-label',
  desc: 'tool-desc',
  input: 'tool-input',
  result: 'tool-result',
  resultError: 'tool-result error',
  errorChip: 'tool-error-chip',
  icon: 'tool-icon',
  name: 'tool-name',
  summary: 'tool-summary',
  toolCallsWrap: 'tool-calls',
  toolUsesWrap: 'tool-uses',
  toolChip: 'tool-chip',
}

interface ToolBundle {
  toolCalls?: ToolCall[]
  toolUses: string[]
}

/**
 * 메시지의 도구 호출 블록을 HTML 로 직렬화. 채팅/문서 톤 공통 — class 매핑만 다르다.
 * - toolCalls 있으면 각 호출당 `<details class="tool-call">` (기본 닫힘)
 * - toolCalls 없고 toolUses 만 있으면 chip 한 줄 폴백
 * - 둘 다 없으면 빈 문자열
 *
 * 모든 사용자 입력(input/result/이름)은 escapeHtml 통과 후 삽입.
 */
function renderToolCallsHtml(bundle: ToolBundle, c: ToolCardClasses): string {
  if (bundle.toolCalls && bundle.toolCalls.length > 0) {
    const cards = bundle.toolCalls.map((call) => renderToolCallHtml(call, c)).join('\n')
    return `<div class="${c.toolCallsWrap}">\n${cards}\n</div>`
  }
  if (bundle.toolUses.length > 0) {
    const chips = [...new Set(bundle.toolUses)]
      .map((t) => `<span class="${c.toolChip}">${escapeHtml(t)}</span>`)
      .join('')
    return `<div class="${c.toolUsesWrap}">${chips}</div>`
  }
  return ''
}

function renderToolCallHtml(call: ToolCall, c: ToolCardClasses): string {
  const summary = summarizeToolCall(call)
  const input = formatToolInput(call)
  const result = formatToolResult(call.result)
  const isError = call.result?.isError === true
  const resultClass = isError ? c.resultError : c.result

  const headParts: string[] = [
    `<span class="${c.icon}">🔧</span>`,
    `<span class="${c.name}">${escapeHtml(call.name)}</span>`,
  ]
  if (summary) {
    headParts.push(`<span class="${c.summary}">${escapeHtml(summary)}</span>`)
  }
  if (isError) {
    headParts.push(`<span class="${c.errorChip}">⚠️ 에러</span>`)
  }

  const bodyParts: string[] = []
  bodyParts.push(`<div class="${c.sectionLabel}">입력</div>`)
  if (input.description) {
    bodyParts.push(`<div class="${c.desc}">${escapeHtml(input.description)}</div>`)
  }
  bodyParts.push(`<pre class="${c.input}"><code>${escapeHtml(input.content)}</code></pre>`)
  bodyParts.push(`<div class="${c.sectionLabel}">결과</div>`)
  bodyParts.push(`<pre class="${resultClass}"><code>${escapeHtml(result)}</code></pre>`)

  return [
    `<details class="${c.call}">`,
    `  <summary class="${c.head}">${headParts.join('')}</summary>`,
    `  <div class="${c.body}">`,
    bodyParts.map((p) => `    ${p}`).join('\n'),
    `  </div>`,
    `</details>`,
  ].join('\n')
}

export function buildHtmlChat(session: Session, messages: ParsedMessage[]): string {
  const title = getSessionTitle(session, messages)
  const exportMessages = toExportMessages(messages)
  const sourceLabel = session.source === 'codex' ? 'Codex' : 'Claude'
  const sourceClass = session.source === 'codex' ? 'codex' : 'claude'
  const startedAt = session.startTime ? new Date(session.startTime).toLocaleString('ko-KR') : '-'
  const modelLabel = displayModelLabel(session)
  const totalMessages = exportMessages.length

  const metaParts: string[] = [
    `<span>${escapeHtml(startedAt)}</span>`,
    `<span class="badge ${sourceClass}">${escapeHtml(sourceLabel)}</span>`,
  ]
  if (modelLabel) {
    metaParts.push(`<span class="badge model">${escapeHtml(modelLabel)}</span>`)
  }
  metaParts.push(`<span class="badge">${totalMessages} 메시지</span>`)

  const messagesHtml = exportMessages
    .map((m) => {
      const label = roleLabel(m.role, session.source)
      const time = formatTime(m.timestamp)
      const interrupted = m.interrupted
        ? `<span class="interrupted-badge">중단됨</span>`
        : ''
      const bodyHtml = m.cleaned ? renderMarkdownToHtml(m.cleaned) : ''
      const toolHtml = renderToolCallsHtml(
        { toolCalls: m.toolCalls, toolUses: m.toolUses },
        CHAT_TOOL_CLASSES,
      )
      return [
        `<article class="msg ${m.role}">`,
        `  <header class="msg-head">`,
        `    <span class="role ${m.role}">${escapeHtml(label)}</span>`,
        time ? `    <span class="time">${escapeHtml(time)}</span>` : '',
        interrupted ? `    ${interrupted}` : '',
        `  </header>`,
        `  <div class="body">${bodyHtml}</div>`,
        toolHtml ? `  ${toolHtml}` : '',
        `</article>`,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  // 훅 실행 요약 블록 — 페이로드-프리 집계만 (hooks-analytics D7)
  const hookLines = buildHookSummaryLines(session)
  const hookSummaryHtml = hookLines.length > 0
    ? `<div class="hook-summary"><div class="hook-summary-title">훅 실행 기록</div><ul>${hookLines
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join('')}</ul></div>`
    : ''

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${CHAT_HTML_STYLE}</style>
</head>
<body>
<main class="wrap">
  <section class="header">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      ${metaParts.join('\n      ')}
    </div>
    ${hookSummaryHtml}
  </section>
  <section class="messages">
${messagesHtml}
  </section>
  <footer class="footer">memradar export · ${escapeHtml(startedAt)}</footer>
</main>
</body>
</html>
`
}

// ─── (3) HTML 마크다운 톤 (라이트, 인쇄 친화) ───────────────────────────────

const DOC_HTML_STYLE = `
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: #ffffff;
  color: #1f2937;
  font-family: Pretendard, 'Noto Sans KR', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.7;
}
.wrap {
  max-width: 740px;
  margin: 0 auto;
  padding: 40px 28px 64px;
}
.doc-header {
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 16px;
  margin-bottom: 28px;
}
.doc-header h1 {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 10px;
  color: #111827;
  line-height: 1.35;
}
.doc-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 12px;
  color: #6b7280;
}
.doc-meta strong {
  color: #374151;
  font-weight: 600;
  margin-right: 4px;
}
.msg-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 28px 0 10px;
  padding-bottom: 4px;
  border-bottom: 1px dashed #e5e7eb;
}
.msg-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}
.msg-head .role-user { color: #047857; }
.msg-head .role-assistant { color: #4338ca; }
.msg-head .time {
  font-size: 12px;
  color: #9ca3af;
  font-weight: 400;
}
.interrupted-note {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fde68a;
}
.body { color: #1f2937; font-size: 14px; line-height: 1.75; }
.body > :first-child { margin-top: 0; }
.body > :last-child { margin-bottom: 0; }
.body p { margin: 0 0 10px; }
.body h1, .body h2, .body h3, .body h4 {
  color: #111827;
  font-weight: 600;
  margin: 16px 0 6px;
  line-height: 1.4;
}
.body h1 { font-size: 1.1rem; }
.body h2 { font-size: 1.02rem; }
.body h3 { font-size: 0.95rem; }
.body ul, .body ol { margin: 0 0 10px; padding-left: 22px; }
.body li { margin: 3px 0; }
.body code {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, ui-monospace, monospace;
  font-size: 0.86em;
  background: #f3f4f6;
  color: #be185d;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
}
.body pre {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 10px 12px;
  overflow-x: auto;
  font-size: 0.84em;
  margin: 0 0 12px;
}
.body pre code {
  background: transparent;
  border: 0;
  padding: 0;
  color: #1f2937;
}
.body blockquote {
  margin: 0 0 10px;
  padding: 4px 14px;
  border-left: 3px solid #d1d5db;
  color: #4b5563;
  background: #f9fafb;
}
.body a { color: #2563eb; text-decoration: underline; }
.body table { width: 100%; border-collapse: collapse; font-size: 0.92em; margin: 0 0 12px; }
.body th, .body td { padding: 6px 10px; border: 1px solid #e5e7eb; text-align: left; }
.body th { background: #f9fafb; font-weight: 600; }
.body hr { border: 0; border-top: 1px solid #e5e7eb; margin: 18px 0; }
.body img { max-width: 100%; }
/* ── tool calls (doc tone) ──────────────────────────────────────────── */
.tool-calls-doc {
  margin: 6px 0 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tool-uses-doc {
  margin: 6px 0 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tool-chip-doc {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: #4b5563;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
}
.tool-call-doc {
  border-radius: 6px;
  border: 1px solid #d0d7de;
  background: #f6f8fa;
}
.tool-call-doc > summary {
  list-style: none;
}
.tool-call-doc > summary::-webkit-details-marker {
  display: none;
}
.tool-call-head-doc {
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  align-items: center;
  color: #1f2328;
  border-bottom: 1px solid transparent;
}
.tool-call-doc[open] .tool-call-head-doc {
  border-bottom-color: #d0d7de;
}
.tool-icon-doc {
  flex-shrink: 0;
  font-size: 11px;
  opacity: 0.65;
}
.tool-name-doc {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  color: #1f2328;
  flex-shrink: 0;
}
.tool-summary-doc {
  color: #57606a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}
.tool-error-chip-doc {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 10px;
  color: #b91c1c;
}
.tool-body-doc {
  padding: 10px 12px;
  font-size: 12px;
  background: #ffffff;
}
.tool-section-label-doc {
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.05em;
  color: #6b7280;
  margin: 6px 0 4px;
}
.tool-section-label-doc:first-child {
  margin-top: 0;
}
.tool-desc-doc {
  font-size: 11px;
  color: #4b5563;
  margin: 0 0 4px;
}
.tool-input-doc,
.tool-result-doc {
  background: #f6f8fa;
  border: 1px solid #e5e7eb;
  padding: 8px 10px;
  border-radius: 6px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
.tool-input-doc code,
.tool-result-doc code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  background: transparent;
  border: 0;
  padding: 0;
  color: #1f2328;
}
.tool-result-doc.error {
  background: #fef2f2;
  border-color: #fecaca;
  color: #991b1b;
}
.hook-summary {
  margin-top: 10px;
  font-size: 12px;
  color: #6b7280;
}
.hook-summary-title {
  font-weight: 600;
  color: #374151;
  margin-bottom: 2px;
}
.hook-summary li { margin: 2px 0 2px 18px; }
.footer {
  margin-top: 36px;
  padding-top: 14px;
  border-top: 1px solid #e5e7eb;
  text-align: center;
  font-size: 11px;
  color: #9ca3af;
}
@media print {
  body { font-size: 12px; }
  .wrap { padding: 0; max-width: none; }
  .msg-head { page-break-after: avoid; }
  .body pre, .body blockquote { page-break-inside: avoid; }
  .tool-call-doc { page-break-inside: avoid; }
  /* 인쇄 시 도구 호출은 펼쳐서 보이도록 */
  .tool-call-doc[open] .tool-body-doc { display: block; }
}
`.trim()

const DOC_TOOL_CLASSES: ToolCardClasses = {
  call: 'tool-call-doc',
  head: 'tool-call-head-doc',
  body: 'tool-body-doc',
  sectionLabel: 'tool-section-label-doc',
  desc: 'tool-desc-doc',
  input: 'tool-input-doc',
  result: 'tool-result-doc',
  resultError: 'tool-result-doc error',
  errorChip: 'tool-error-chip-doc',
  icon: 'tool-icon-doc',
  name: 'tool-name-doc',
  summary: 'tool-summary-doc',
  toolCallsWrap: 'tool-calls-doc',
  toolUsesWrap: 'tool-uses-doc',
  toolChip: 'tool-chip-doc',
}

export function buildHtmlMarkdown(session: Session, messages: ParsedMessage[]): string {
  const title = getSessionTitle(session, messages)
  const exportMessages = toExportMessages(messages)
  const sourceLabel = session.source === 'codex' ? 'Codex' : 'Claude'
  const startedAt = session.startTime ? new Date(session.startTime).toLocaleString('ko-KR') : '-'
  const modelLabel = displayModelLabel(session) ?? '-'
  const totalMessages = exportMessages.length

  const messagesHtml = exportMessages
    .map((m) => {
      const label = roleLabel(m.role, session.source)
      const time = formatTime(m.timestamp)
      const roleClass = m.role === 'user' ? 'role-user' : 'role-assistant'
      const interruptedLine = m.interrupted
        ? `<p><span class="interrupted-note">⚠️ 중단됨</span></p>`
        : ''
      const bodyHtml = m.cleaned ? renderMarkdownToHtml(m.cleaned) : ''
      const toolHtml = renderToolCallsHtml(
        { toolCalls: m.toolCalls, toolUses: m.toolUses },
        DOC_TOOL_CLASSES,
      )
      return [
        `<section class="msg-block">`,
        `  <div class="msg-head">`,
        `    <h2 class="${roleClass}">${escapeHtml(label)}</h2>`,
        time ? `    <span class="time">${escapeHtml(time)}</span>` : '',
        `  </div>`,
        `  <div class="body">${interruptedLine}${bodyHtml}</div>`,
        toolHtml ? `  ${toolHtml}` : '',
        `</section>`,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  // 훅 실행 요약 블록 — 페이로드-프리 집계만 (hooks-analytics D7)
  const hookLines = buildHookSummaryLines(session)
  const hookSummaryHtml = hookLines.length > 0
    ? `<div class="hook-summary"><div class="hook-summary-title">훅 실행 기록</div><ul>${hookLines
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join('')}</ul></div>`
    : ''

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${DOC_HTML_STYLE}</style>
</head>
<body>
<main class="wrap">
  <header class="doc-header">
    <h1>${escapeHtml(title)}</h1>
    <div class="doc-meta">
      <span><strong>시작</strong>${escapeHtml(startedAt)}</span>
      <span><strong>소스</strong>${escapeHtml(sourceLabel)}</span>
      <span><strong>모델</strong>${escapeHtml(modelLabel)}</span>
      <span><strong>메시지</strong>${totalMessages}</span>
    </div>
    ${hookSummaryHtml}
  </header>
${messagesHtml}
  <footer class="footer">memradar export</footer>
</main>
</body>
</html>
`
}

// ─── 다운로드 ────────────────────────────────────────────────────────────────

/**
 * 텍스트(또는 HTML) 콘텐츠를 Blob 으로 만들어 a[download] 로 즉시 다운로드.
 * URL 객체는 클릭 직후 revoke (메모리 누수 방지).
 */
export function downloadText(content: string, fileName: string, mime: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Firefox/Safari는 click 직후 즉시 revoke 시 다운로드가 취소될 수 있음 — 1초 지연으로 보수적 처리
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
