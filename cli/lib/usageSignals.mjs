/**
 * usageSignals — 사용 습관 신호 공유 수집기 (단일 소스)
 *
 * 두 Claude 파서가 이 모듈 하나를 공유한다:
 *   cli/index.mjs:parseClaudeJsonl · src/parser.ts:parseJsonl
 * (modelAttribution.mjs / hookExtract.mjs 전례 — cli/index.mjs 가 TypeScript 를
 * import 할 수 없어 구현은 plain ESM, 인접한 usageSignals.d.mts 가 공유 스키마다.)
 *
 * 무엇을 세는가 — "어떻게 쓰면 덜 새는가"에 답하는 세 가지:
 *  1. 쉬었다 이어간 뒤의 **캐시 재작성** — 캐시가 만료된 채 큰 대화를 다시 보낸 요청
 *  2. **컨텍스트 크기** — 요청 한 번에 실려 가는 토큰 (대화가 길어질수록 매 요청이 비싸진다)
 *  3. **가벼운 턴** — 출력이 짧고 도구도 거의 안 쓴 턴 (모델별로, 최상위 모델 과사용 판정용)
 *
 * 원칙
 * - 네트워크 I/O 0, 외부 의존성 0 — Node 18 / 브라우저 공용.
 * - 식별자·본문을 방출하지 않는다 — requestId 는 중복 제거 키로만 쓰고 결과에는
 *   **모델명과 정수만** 남는다. 정적 임베드는 공유 가능한 단일 파일이라 타입이 곧 방어선이다.
 * - 집계는 **병합 이전** raw 라인 루프에서 수행한다. 요청 단위 usage·타임스탬프는
 *   병합 후 session.messages 에서 복원할 수 없다 (병합은 비가역).
 *
 * 응답 1건은 thinking/text/tool_use 여러 라인으로 쪼개지고 **모든 라인이 같은 usage 를
 * 반복**한다 (실측 2,009응답 전부 동일) — 그래서 usage 는 requestId 당 한 번만 읽는다.
 */
import { isAggregatableModel } from './modelAttribution.mjs'

// ── 판정 상수 (모두 잠정값 — 실측 보정 전) ──────────────────────────────────
/** 이 크기를 넘는 요청을 "큰 컨텍스트" 로 센다 (input + 캐시 쓰기 + 캐시 읽기) */
export const LARGE_CONTEXT_TOKENS = 200_000
/** 이전 응답 끝 ~ 다음 요청 사이가 이만큼 벌어져야 "쉬었다 이어감" 으로 본다 (API 기본 캐시 TTL) */
export const IDLE_GAP_MS = 5 * 60 * 1000
/** 직전 요청이 캐시에 올린 양이 이보다 작으면 재작성 판정 대상이 아니다 (잡음 제거) */
export const REBUILD_MIN_PREV_CACHED = 10_000
/** 직전에 캐시된 양 대비 이번에 읽은 비율이 이 미만이면 캐시를 못 탄 것으로 본다 */
export const REBUILD_MAX_READ_RATIO = 0.2
/** 컨텍스트가 직전의 이 비율 밑으로 줄었으면 압축(/compact)·초기화라 재작성으로 세지 않는다 */
export const REBUILD_MIN_CONTEXT_RATIO = 0.5
/** 가벼운 턴 — 턴 전체 출력 토큰 상한 (thinking 포함) */
export const LIGHT_TURN_MAX_OUTPUT = 800
/** 가벼운 턴 — 턴 전체 도구 호출 수 상한 */
export const LIGHT_TURN_MAX_TOOLS = 2

/** 하나라도 쓰면 가벼운 턴이 아니다 — 파일을 고치거나 일을 위임하는 도구 */
const HEAVY_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Agent', 'Task', 'Workflow'])

/**
 * 사용자가 직접 친 프롬프트의 본문 — 턴 경계 판정용.
 * tool_result 를 실은 user 라인은 프롬프트가 아니라 도구 결과 전달이다.
 */
export function promptText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  let text = ''
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'tool_result') return ''
    if (block.type === 'text' && typeof block.text === 'string') text += block.text
  }
  return text
}

function toMs(timestamp) {
  const ms = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN
  return Number.isFinite(ms) ? ms : null
}

/**
 * 세션 1건의 사용 습관 신호 수집기 — 파서의 raw 라인 루프에서
 * isMeta/isSidechain 가드 직후 매 라인 collect(raw) 를 호출한다.
 */
export function createUsageSignalCollector() {
  const totals = {
    requests: 0,
    contextTokens: 0,
    peakContextTokens: 0,
    largeContextRequests: 0,
    cacheWriteTokens: 0,
  }
  const byModel = new Map()
  const closedIds = new Set()
  let current = null // 라인이 아직 들어오는 중인 요청
  let previous = null // 직전에 닫힌 요청
  let turn = null // 진행 중인 사용자 턴

  function modelEntry(model) {
    let entry = byModel.get(model)
    if (!entry) {
      entry = { turns: 0, lightTurns: 0, idleRebuilds: 0, idleRebuildTokens: 0 }
      byModel.set(model, entry)
    }
    return entry
  }

  function closeRequest() {
    if (!current) return
    const req = current
    current = null
    closedIds.add(req.id)

    const context = req.input + req.cacheWrite + req.cacheRead
    totals.requests++
    totals.contextTokens += context
    if (context > totals.peakContextTokens) totals.peakContextTokens = context
    if (context > LARGE_CONTEXT_TOKENS) totals.largeContextRequests++
    totals.cacheWriteTokens += req.cacheWrite

    // 쉬었다 이어간 뒤의 캐시 재작성. 모델이 바뀌었으면 캐시가 모델별이라 쉬지 않아도
    // 다시 쓰이므로 여기서 세지 않는다 (원인이 다르다).
    if (
      previous &&
      previous.model === req.model &&
      req.startMs !== null &&
      previous.endMs !== null &&
      req.startMs - previous.endMs >= IDLE_GAP_MS
    ) {
      const prevCached = previous.cacheRead + previous.cacheWrite
      const prevContext = previous.input + prevCached
      if (
        prevCached >= REBUILD_MIN_PREV_CACHED &&
        req.cacheRead < REBUILD_MAX_READ_RATIO * prevCached &&
        context >= REBUILD_MIN_CONTEXT_RATIO * prevContext
      ) {
        const entry = modelEntry(req.model)
        entry.idleRebuilds++
        entry.idleRebuildTokens += req.cacheWrite
      }
    }

    if (req.turn) {
      req.turn.output += req.output
      req.turn.toolCount += req.toolCount
      if (req.heavy) req.turn.heavy = true
    }
    previous = req
  }

  function closeTurn() {
    if (!turn) return
    const done = turn
    turn = null
    // 응답이 한 번도 없던 턴(슬래시 명령·중단)은 모델을 쓴 게 아니라 세지 않는다
    if (done.requests === 0) return
    const entry = modelEntry(done.model)
    entry.turns++
    if (done.output < LIGHT_TURN_MAX_OUTPUT && done.toolCount <= LIGHT_TURN_MAX_TOOLS && !done.heavy) {
      entry.lightTurns++
    }
  }

  return {
    collect(raw) {
      const message = raw && raw.message
      if (!message || typeof message !== 'object') return

      if (message.role === 'user') {
        const text = promptText(message.content).trim()
        // `<` 로 시작하는 건 Claude Code 가 끼워 넣은 것(명령 출력·알림·리마인더)이라
        // 사용자가 고른 턴이 아니다 — 경계로 삼지 않고 앞 턴에 흡수시킨다 (보수적).
        if (!text || text.startsWith('<')) return
        closeRequest()
        closeTurn()
        turn = { model: '', requests: 0, output: 0, toolCount: 0, heavy: false }
        return
      }

      if (message.role !== 'assistant') return
      if (!isAggregatableModel(message.model)) return
      const usage = message.usage
      if (!usage || typeof usage !== 'object') return
      const id = typeof raw.requestId === 'string' && raw.requestId ? raw.requestId : message.id
      if (typeof id !== 'string' || !id) return
      // 이미 닫힌 응답의 뒤늦은 라인 — 도구 결과가 사이에 끼어 순서가 엇갈린 경우
      if (closedIds.has(id)) return

      const ms = toMs(raw.timestamp)
      if (!current || current.id !== id) {
        closeRequest()
        current = {
          id,
          model: message.model,
          startMs: ms,
          endMs: ms,
          input: usage.input_tokens || 0,
          cacheWrite: usage.cache_creation_input_tokens || 0,
          cacheRead: usage.cache_read_input_tokens || 0,
          output: usage.output_tokens || 0,
          toolCount: 0,
          heavy: false,
          turn,
        }
        if (turn) {
          turn.requests++
          if (!turn.model) turn.model = message.model
        }
      } else if (ms !== null) {
        current.endMs = ms
      }

      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (!block || block.type !== 'tool_use' || typeof block.name !== 'string') continue
          current.toolCount++
          if (HEAVY_TOOLS.has(block.name)) current.heavy = true
        }
      }
    },

    /**
     * usage 가 있는 응답이 하나도 없으면 undefined — 소비처는 absent 를 no-data 로 관용 처리한다
     * (Session.hookSummary / modelResponses 관례). 모델명 오름차순으로 고정 (직렬화 결정성).
     */
    finalize() {
      closeRequest()
      closeTurn()
      if (totals.requests === 0) return undefined
      const models = {}
      for (const model of [...byModel.keys()].sort()) models[model] = byModel.get(model)
      return { ...totals, byModel: models }
    },
  }
}
