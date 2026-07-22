/**
 * hookExtract — Claude Code 훅 텔레메트리 공유 수집기 (단일 소스)
 *
 * 세션 JSONL 의 훅 레코드 3종을 두 파서(src/parser.ts, cli/index.mjs)가
 * 공용으로 수집한다 (docs/goal/hooks-analytics.md D1~D3, D10):
 *
 *  1. `{type:"attachment", attachment:{type:"hook_*"}}` — 실행/동반 레코드
 *  2. `{type:"system", subtype:"stop_hook_summary"}` — Stop 이벤트 원장
 *  3. user 메시지의 `tool_result`(is_error) — PreToolUse 거부(denial) 텍스트
 *
 * 원칙
 * - 네트워크 I/O 0, 외부 의존성 0 — plain ESM (Node 18 / 브라우저 공용).
 *   sha256 은 내장 순수 구현 (브라우저 crypto.subtle 은 비동기라 사용 불가).
 * - 레코드 단위 fail-soft: collect() 내부 try/catch — 훅 수집 실패가
 *   세션 파스 자체를 깨지 않는다.
 * - 구조적 프라이버시: summary 에는 command/stdout/stderr/content 필드가
 *   타입 차원에서 존재하지 않는다 (commandKey = 비가역 sha256-8 다이제스트).
 *   light 경로는 다이제스트/정규식용으로 문자열을 일시적으로 읽되 절대
 *   저장하지 않는다. stdout/stderr/additionalContext 는 includeDetail
 *   (서버 tier-2)일 때만 executions 에 담긴다.
 *
 * 카운팅 시맨틱 (실측 코퍼스 검증 — 재론 금지)
 * - 실행 identity = (sessionId, toolUseID, command). 터미널 결과는 5종:
 *   success / denied / blocking_error / non_blocking_error / cancelled.
 * - hook_system_message / hook_additional_context 는 같은 실행의 동반
 *   페이로드 레코드다 (코퍼스 603쌍 검증) — 실행으로 세지 않는다.
 *   다중 command 그룹에서 command 없는 동반 레코드는 (hookName, 'unknown')
 *   행으로만 집계한다 (소유자 추측 금지).
 * - Stop 정합: stop_hook_summary ↔ Stop attachment 를 (toolUseID) 정확
 *   일치로 조인, hookInfos 귀속은 durationMs 정확 일치 → command 정확
 *   일치 → ASCII 스켈레톤 일치 순. 미귀속 hookInfos = summaryOnly 실행
 *   (duration 합산 포함, denied/failure 합계 제외).
 * - denial 은 is_error tool_result 의 구조화 블록에서만 추출 (산문 스캔
 *   금지). hook_blocking_error attachment 와 toolUseID 를 공유하면 1회만
 *   집계 (attachment 우선).
 * - hook_cancelled.timedOut 은 cancelled 와 구분되는 timedOut 집계
 *   (타임아웃 vs 사용자 중단 진단 분리).
 */

// ─── sha256 (순수 JS, 동기) ──────────────────────────────────────────────────
// commandKey 용 비가역 다이제스트. 브라우저 crypto.subtle 은 async 라서
// collect/finalize 동기 계약과 충돌 — FIPS 180-4 표준 구현을 내장한다.

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function rotr(x, n) {
  return (x >>> n) | (x << (32 - n))
}

function utf8Bytes(str) {
  const bytes = []
  for (let i = 0; i < str.length; i++) {
    let code = str.codePointAt(i)
    if (code > 0xffff) i++ // 서로게이트 페어 소비
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63))
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63))
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63))
  }
  return bytes
}

/** sha256 hex 전체 (내부용) */
function sha256Hex(text) {
  const bytes = utf8Bytes(String(text))
  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  const hi = Math.floor(bitLen / 0x100000000)
  bytes.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff)
  bytes.push((bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff)

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19
  const w = new Array(64)

  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = (bytes[i + t * 4] << 24) | (bytes[i + t * 4 + 1] << 16) | (bytes[i + t * 4 + 2] << 8) | bytes[i + t * 4 + 3]
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3)
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10)
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + SHA256_K[t] + w[t]) | 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) | 0
      h = g; g = f; f = e; e = (d + temp1) | 0
      d = c; c = b; b = a; a = (temp1 + temp2) | 0
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((x) => (x >>> 0).toString(16).padStart(8, '0'))
    .join('')
}

/**
 * 커맨드 문자열의 비가역 8자 hex 다이제스트 (sha256 앞 8자).
 * 빈/비문자열 입력은 'unknown'.
 */
export function commandDigest(command) {
  if (typeof command !== 'string' || command.length === 0) return 'unknown'
  return sha256Hex(command).slice(0, 8)
}

/**
 * ASCII 스켈레톤 — 비ASCII(U+FFFD 포함) 런 제거.
 * cp949 mojibake 로 깨진 command 를 stop_hook_summary hookInfos 와
 * 귀속시키기 위한 관용 축 (D3).
 */
export function asciiSkeleton(command) {
  if (typeof command !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return command.replace(/[^\x00-\x7f]+/g, '')
}

// ─── denial 추출 (D10) ───────────────────────────────────────────────────────
//
// user 메시지의 구조화 tool_result(is_error===true) 블록 텍스트가
// `PreToolUse:Edit hook error: [<command>]: <메시지>` 형태일 때만 매치.
// group 1 = resolved hookName, group 2 = command (첫 `]:` + 공백 직전까지
// non-greedy — command 내부의 `]:` 뒤에 공백이 없으면 계속 진행).
// 산문(text 블록)은 절대 스캔하지 않는다 — 코퍼스에 훅 에러 문자열의
// 텍스트 사본이 존재한다.
//
export const HOOK_DENIAL_RE = /^(\w+(?::[^\s\]]+)?) hook error: \[([\s\S]+?)\]:\s/

const TERMINAL_SUBTYPES = new Set([
  'hook_success',
  'hook_blocking_error',
  'hook_non_blocking_error',
  'hook_cancelled',
])

const COMPANION_SUBTYPES = new Set(['hook_system_message', 'hook_additional_context'])

function outcomeOf(subtype) {
  switch (subtype) {
    case 'hook_success': return 'success'
    case 'hook_blocking_error': return 'blocking_error'
    case 'hook_non_blocking_error': return 'non_blocking_error'
    case 'hook_cancelled': return 'cancelled'
    default: return null
  }
}

/** attachment 에서 command 추출 — hook_blocking_error 는 blockingError 안에 중첩 */
function attachmentCommand(att) {
  if (typeof att.command === 'string') return att.command
  if (att.blockingError && typeof att.blockingError.command === 'string') return att.blockingError.command
  return ''
}

function eventOf(att) {
  if (typeof att.hookEvent === 'string' && att.hookEvent) return att.hookEvent
  const name = typeof att.hookName === 'string' ? att.hookName : ''
  const idx = name.indexOf(':')
  return idx >= 0 ? name.slice(0, idx) : name
}

// ─── Collector ───────────────────────────────────────────────────────────────

/**
 * 훅 수집기 생성.
 *
 * 두 파서가 라인 루프에서 role-drop 가드 직전에 `collect(raw)` 를 호출하고,
 * 루프 종료 후 `finalize()` 로 결과를 받는다.
 *
 * @param {{ includeDetail?: boolean }} [opts]
 *   includeDetail=true (서버 tier-2 heavy parse)일 때만 executions 반환 +
 *   stdout/stderr/additionalContext 페이로드 캡처.
 * @returns {{ collect(raw: unknown): void, finalize(): { summary?: object, executions?: object[] } }}
 */
export function createHookCollector(opts) {
  const includeDetail = Boolean(opts && opts.includeDetail)

  /** toolUseID → 그룹 (attachments / companions / denials / stop summary) */
  const groups = new Map()
  let syntheticCounter = 0
  let firstSeen = ''
  let lastSeen = ''

  function touchSeen(ts) {
    if (typeof ts !== 'string' || !ts) return
    if (!firstSeen || ts < firstSeen) firstSeen = ts
    if (!lastSeen || ts > lastSeen) lastSeen = ts
  }

  function group(toolUseID) {
    const key = typeof toolUseID === 'string' && toolUseID
      ? toolUseID
      : `__no-tool-use-${syntheticCounter++}`
    let g = groups.get(key)
    if (!g) {
      g = { toolUseID: key, attachments: [], companions: [], denials: [], summary: null }
      groups.set(key, g)
    }
    return g
  }

  function collectAttachment(raw) {
    const att = raw.attachment
    if (!att || typeof att.type !== 'string' || !att.type.startsWith('hook_')) return
    const timestamp = typeof raw.timestamp === 'string' ? raw.timestamp : ''

    if (TERMINAL_SUBTYPES.has(att.type)) {
      touchSeen(timestamp)
      group(att.toolUseID).attachments.push({
        outcome: outcomeOf(att.type),
        hookName: typeof att.hookName === 'string' ? att.hookName : '(unknown)',
        hookEvent: eventOf(att),
        command: attachmentCommand(att),
        durationMs: typeof att.durationMs === 'number' ? att.durationMs : undefined,
        exitCode: typeof att.exitCode === 'number' ? att.exitCode : undefined,
        timedOut: att.timedOut === true,
        timestamp,
        // 페이로드는 includeDetail 일 때만 보존 (light 경로는 저장 금지)
        stdout: includeDetail && typeof att.stdout === 'string' && att.stdout ? att.stdout : undefined,
        stderr: includeDetail && typeof att.stderr === 'string' && att.stderr ? att.stderr : undefined,
      })
      return
    }

    if (COMPANION_SUBTYPES.has(att.type)) {
      touchSeen(timestamp)
      const contents = att.type === 'hook_additional_context'
        ? (Array.isArray(att.content) ? att.content.filter((c) => typeof c === 'string') : [])
        : []
      group(att.toolUseID).companions.push({
        kind: att.type === 'hook_system_message' ? 'system_message' : 'additional_context',
        hookName: typeof att.hookName === 'string' ? att.hookName : '(unknown)',
        hookEvent: eventOf(att),
        timestamp,
        // additionalContext 본문도 tier-2 페이로드 (D7) — includeDetail 일 때만
        contents: includeDetail ? contents : undefined,
      })
    }
  }

  function collectStopSummary(raw) {
    if (!Array.isArray(raw.hookInfos)) return
    const timestamp = typeof raw.timestamp === 'string' ? raw.timestamp : ''
    touchSeen(timestamp)
    const g = group(raw.toolUseID)
    // toolUseID 당 summary 는 1개 — 중복 도착 시 첫 번째 유지 (결정적)
    if (!g.summary) {
      g.summary = {
        timestamp,
        hookInfos: raw.hookInfos
          .filter((info) => info && typeof info.command === 'string')
          .map((info) => ({
            command: info.command,
            durationMs: typeof info.durationMs === 'number' ? info.durationMs : undefined,
          })),
      }
    }
  }

  function collectDenials(raw) {
    const content = raw.message && raw.message.content
    if (!Array.isArray(content)) return
    for (const block of content) {
      if (!block || block.type !== 'tool_result' || block.is_error !== true) continue
      let text = ''
      if (typeof block.content === 'string') {
        text = block.content
      } else if (Array.isArray(block.content)) {
        const first = block.content.find((c) => c && c.type === 'text' && typeof c.text === 'string')
        text = first ? first.text : ''
      }
      const m = HOOK_DENIAL_RE.exec(text)
      if (!m) continue
      const hookName = m[1]
      const command = m[2]
      const idx = hookName.indexOf(':')
      const timestamp = typeof raw.timestamp === 'string' ? raw.timestamp : ''
      touchSeen(timestamp)
      group(block.tool_use_id).denials.push({
        hookName,
        hookEvent: idx >= 0 ? hookName.slice(0, idx) : hookName,
        command,
        timestamp,
      })
    }
  }

  function collect(raw) {
    try {
      if (!raw || typeof raw !== 'object') return
      if (raw.type === 'attachment') return collectAttachment(raw)
      if (raw.type === 'system' && raw.subtype === 'stop_hook_summary') return collectStopSummary(raw)
      if (raw.message && raw.message.role === 'user') return collectDenials(raw)
    } catch {
      // 레코드 단위 fail-soft — 훅 수집 실패가 파스를 깨지 않는다
    }
  }

  function finalize() {
    /** rowKey → HookSummaryRow */
    const rows = new Map()
    const executions = []

    function row(hookName, hookEvent, commandKey) {
      const key = `${hookName}\u0000${hookEvent}\u0000${commandKey}`
      let r = rows.get(key)
      if (!r) {
        r = {
          hookName,
          hookEvent,
          commandKey,
          counts: { success: 0, denied: 0, blockingError: 0, nonBlockingError: 0, cancelled: 0, timedOut: 0, summaryOnly: 0 },
          durationMsSum: 0,
          durationMsCount: 0,
          lastSeen: '',
          hasSystemMessage: false,
          additionalContextCount: 0,
        }
        rows.set(key, r)
      }
      return r
    }

    function bumpSeen(r, ts) {
      if (ts && (!r.lastSeen || ts > r.lastSeen)) r.lastSeen = ts
    }

    function addDuration(r, durationMs) {
      if (typeof durationMs === 'number' && Number.isFinite(durationMs)) {
        r.durationMsSum += durationMs
        r.durationMsCount += 1
      }
    }

    for (const g of groups.values()) {
      try {
        // ① 터미널 attachment 중복 제거 — 실행 identity (toolUseID, command).
        //    같은 command 가 같은 그룹에 두 번 나오면 첫 레코드만 실행으로 센다.
        const terminals = []
        const seenCommands = new Set()
        for (const att of g.attachments) {
          const idKey = `${att.hookName}\u0000${att.command}`
          if (seenCommands.has(idKey)) continue
          seenCommands.add(idKey)
          terminals.push(att)
        }

        // ② denial 정리 — hook_blocking_error attachment 와 공유 시 1회만
        //    (attachment 우선), 남은 denial 은 (hookName, command) 당 1회.
        const blockingAtts = terminals.filter((t) => t.outcome === 'blocking_error')
        const dedupedDenials = []
        const seenDenials = new Set()
        for (const d of g.denials) {
          const covered = blockingAtts.some((t) =>
            t.hookName === d.hookName ||
            (t.command && (t.command === d.command || asciiSkeleton(t.command) === asciiSkeleton(d.command)))
          )
          if (covered) continue
          const dKey = `${d.hookName}\u0000${d.command}`
          if (seenDenials.has(dKey)) continue
          seenDenials.add(dKey)
          dedupedDenials.push(d)
        }

        // ③ Stop 정합 — hookInfos 귀속: durationMs 정확 → command 정확 → 스켈레톤.
        //    3패스는 전역 순서다 (per-attachment 순회가 아니라 패스 단위) —
        //    duplicate-command hookInfos 에서 durationMs 우선 귀속을 보장.
        const summaryOnlyEntries = []
        if (g.summary) {
          const infos = g.summary.hookInfos.map((info) => ({ ...info, consumed: false }))
          const unmatched = new Set(terminals)

          // pass 1 — durationMs 정확 일치
          for (const att of terminals) {
            if (typeof att.durationMs !== 'number') continue
            const hit = infos.find((info) => !info.consumed && info.durationMs === att.durationMs)
            if (hit) { hit.consumed = true; unmatched.delete(att) }
          }
          // pass 2 — command 정확 일치
          for (const att of [...unmatched]) {
            if (!att.command) continue
            const hit = infos.find((info) => !info.consumed && info.command === att.command)
            if (hit) { hit.consumed = true; unmatched.delete(att) }
          }
          // pass 3 — ASCII 스켈레톤 일치 (cp949 mojibake 관용)
          for (const att of [...unmatched]) {
            if (!att.command) continue
            const skel = asciiSkeleton(att.command)
            const hit = infos.find((info) => !info.consumed && asciiSkeleton(info.command) === skel)
            if (hit) { hit.consumed = true; unmatched.delete(att) }
          }

          for (const info of infos) {
            if (!info.consumed) summaryOnlyEntries.push(info)
          }
        }

        // ④ 터미널 실행 집계 + (includeDetail) 상세
        const singleTerminal = terminals.length === 1 ? terminals[0] : null
        const extraContext = []
        let terminalHasSystemMessage = false
        let terminalAdditionalContext = 0

        for (const comp of g.companions) {
          if (singleTerminal) {
            // 단일 실행 그룹 — 동반 레코드를 그 실행의 행으로 병합
            if (comp.kind === 'system_message') terminalHasSystemMessage = true
            else {
              terminalAdditionalContext += 1
              if (comp.contents) extraContext.push(...comp.contents)
            }
          } else {
            // 다중/무 command 그룹 — 소유자 추측 금지, (hookName, 'unknown') 행
            const r = row(comp.hookName, comp.hookEvent, 'unknown')
            if (comp.kind === 'system_message') r.hasSystemMessage = true
            else r.additionalContextCount += 1
            bumpSeen(r, comp.timestamp)
          }
        }

        for (const att of terminals) {
          const commandKey = commandDigest(att.command)
          const r = row(att.hookName, att.hookEvent, commandKey)
          if (att.outcome === 'success') r.counts.success += 1
          else if (att.outcome === 'blocking_error') r.counts.blockingError += 1
          else if (att.outcome === 'non_blocking_error') r.counts.nonBlockingError += 1
          else if (att.outcome === 'cancelled') {
            if (att.timedOut) r.counts.timedOut += 1
            else r.counts.cancelled += 1
          }
          addDuration(r, att.durationMs)
          bumpSeen(r, att.timestamp)
          if (att === singleTerminal) {
            if (terminalHasSystemMessage) r.hasSystemMessage = true
            r.additionalContextCount += terminalAdditionalContext
          }

          if (includeDetail) {
            executions.push({
              hookName: att.hookName,
              hookEvent: att.hookEvent,
              commandKey,
              command: att.command,
              outcome: att.outcome,
              exitCode: att.exitCode,
              durationMs: att.durationMs,
              timedOut: att.timedOut || undefined,
              timestamp: att.timestamp,
              toolUseID: g.toolUseID,
              stdout: att.stdout,
              stderr: att.stderr,
              additionalContext: att === singleTerminal && extraContext.length > 0 ? extraContext : undefined,
            })
          }
        }

        // ⑤ denial 실행 집계
        for (const d of dedupedDenials) {
          const commandKey = commandDigest(d.command)
          const r = row(d.hookName, d.hookEvent, commandKey)
          r.counts.denied += 1
          bumpSeen(r, d.timestamp)
          if (includeDetail) {
            executions.push({
              hookName: d.hookName,
              hookEvent: d.hookEvent,
              commandKey,
              command: d.command,
              outcome: 'denied',
              timestamp: d.timestamp,
              toolUseID: g.toolUseID,
            })
          }
        }

        // ⑥ summaryOnly 실행 집계 — hookName/hookEvent 는 Stop 고정
        //    (stop_hook_summary 는 Stop 원장), commandKey 는 스켈레톤 다이제스트,
        //    denied/failure 합계에 안 들어가는 별도 카운트. 상세(tier-2)에는
        //    포함하지 않는다 (HookExecutionDetail outcome 유니언 밖).
        for (const info of summaryOnlyEntries) {
          const skel = asciiSkeleton(info.command)
          const r = row('Stop', 'Stop', commandDigest(skel))
          r.counts.summaryOnly += 1
          addDuration(r, info.durationMs)
          bumpSeen(r, g.summary.timestamp)
          if (skel !== info.command) r.encodingDamaged = true
        }
      } catch {
        // 그룹 단위 fail-soft
      }
    }

    const sortedRows = [...rows.values()].sort((a, b) =>
      a.hookName.localeCompare(b.hookName) ||
      a.hookEvent.localeCompare(b.hookEvent) ||
      a.commandKey.localeCompare(b.commandKey)
    )

    executions.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0))

    return {
      summary: sortedRows.length > 0
        ? { rows: sortedRows, firstSeen, lastSeen }
        : undefined,
      executions: includeDetail ? executions : undefined,
    }
  }

  return { collect, finalize }
}
