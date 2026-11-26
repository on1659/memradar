/**
 * styleSignals — AI 협업 스타일 신호 공유 수집기 (단일 소스)
 *
 * 네 파서가 이 모듈 하나를 공유한다:
 *   Claude — cli/index.mjs:parseClaudeJsonl · src/parser.ts:parseJsonl
 *   Codex  — cli/index.mjs:parseCodexJsonl  · src/providers/codex.ts:parseCodexJsonl
 * (usageSignals.mjs / hookExtract.mjs 전례 — cli/index.mjs 가 TypeScript 를 import 할 수
 * 없어 구현은 plain ESM, 인접한 styleSignals.d.mts 가 공유 스키마다.)
 *
 * 무엇을 세는가 — "내 AI 가 어떻게 일하나" (AI 협업 16유형의 네 축 재료):
 *  1. E/I — 사용자의 요청 중 **에이전트를 부른** 요청
 *  2. S/N — 최종 답에 **확인 표현**이 있나, **추측 표현**이 있나
 *  3. T/F — 사용자가 감정·반응을 드러냈을 때 답 첫머리에서 **그걸 받아 주나**
 *  4. J/P — 최종 답을 **질문·선택지로 끝내나**
 * 사람의 말투가 아니라 AI 의 행동을 센다. 같은 모델도 사용자의 설정(CLAUDE.md·AGENTS.md)에
 * 따라 달라지므로 "모델 + 내 설정" 이 재는 대상이다.
 *
 * 원칙
 * - 네트워크 I/O 0, 외부 의존성 0 — Node 18 / 브라우저 공용.
 * - 본문을 방출하지 않는다 — 프롬프트·답은 판정에만 쓰고 결과에는 **정수만** 남는다.
 *   정적 임베드는 공유 가능한 단일 파일이라 타입이 곧 방어선이다.
 * - 집계는 **병합 이전** raw 라인 루프에서 수행한다. "턴의 첫 답 / 마지막 답 / 그 뒤에 도구를
 *   또 썼나" 는 병합 후 session.messages 에서 복원할 수 없다.
 * - 사람이 직접 연 세션만 센다. 스크립트가 돌린 세션(Claude `sdk-cli`, Codex `exec`)과
 *   에이전트가 띄운 세션(Codex subagent)은 undefined 를 낸다 — 실측에서 `sdk-cli` 세션 533개 중
 *   531개가 같은 템플릿 프롬프트였다.
 * - 요청 하나 = 사람이 보낸 말 하나에 AI 가 한 일. 경계는 로그가 알려 주는 것을 먼저 쓴다:
 *   Claude 는 `origin.kind`, Codex 는 작업 이벤트(`task_started` · `task_complete` · `turn_aborted`)와
 *   답의 `phase`. 그 표식이 없는 옛 로그에서만 글 모양으로 추정한다.
 */
import { promptText } from './usageSignals.mjs'

// ── 판정 상수 (모두 잠정값 — 실측 보정 전) ──────────────────────────────────
/** 감정·반응 신호는 이보다 짧은 프롬프트에서만 찾는다 (긴 붙여넣기의 우연한 일치 제거) */
export const CUE_PROMPT_MAX_CHARS = 300
/** "받아 줬나" 는 턴의 첫 답 앞머리 이만큼만 본다 — 먼저 받았는지가 핵심이다 */
export const RECEIVE_HEAD_CHARS = 150
/** "질문으로 끝냈나" 는 최종 답 끝 이만큼만 본다 */
export const ASK_TAIL_CHARS = 200

/** 일을 다른 에이전트에게 넘기는 도구 (Claude · Codex) */
const AGENT_TOOLS = new Set(['Agent', 'Task', 'Workflow', 'spawn_agent', 'send_message', 'followup_task'])
/** 앱이 시켜서 부르는 관리용 호출 — 답 뒤에 붙어도 "답으로 끝난 턴" 으로 본다 */
const isHarnessTool = (name) => name.startsWith('mcp__ccd_') || name === 'ToolSearch' || name === 'SendUserFile'

// S/N — 확인하고 말하나, 추측으로 말하나
const VERIFIED_RE =
  /(확인했|확인해\s*봤|확인한\s*결과|실측|재\s*봤|세어|검증|테스트.{0,8}통과|실행해\s*(?:보|봤)|verified|confirmed|measured|i (?:ran|checked)|tests? pass)/gi
// 확인 표현이 "아직 안 한 일" 로 쓰인 자리 — 부정("검증하지 않았습니다", "not verified")과
// 예정("검증 전입니다", "검증하겠습니다"). 표현의 바로 뒤 / 바로 앞을 본다.
const NOT_DONE_AFTER_RE =
  /^\s*(?:[은는이가을를도]\s*)?(?:(?:하|되)?지\s*(?:않|못)|안\s*(?:했|됐|된)|못\s*(?:했|한)|전(?:입|이|에|\s|$)|하겠|할게|할\s*예정|해야|필요|없|아니)/
const NOT_DONE_BEFORE_RE = /(?:미|\bun|(?:\bnot|n't|\bnever|\bto be)\s+(?:\w+\s+){0,2})$/i
const GUESS_RE =
  /(아마|것\s*같|듯합|듯해|추정|로\s*보입|보여요|일\s*수\s*있|probably|likely|seems|appears|i (?:think|suspect))/i
// J/P — 답을 질문·선택지로 열어 두고 끝내나
const ASK_RE =
  /(\?\s*$|까요\??\s*$|할까요|드릴까요|하시겠|원하시면|알려\s*주세요|which (?:one|option)|would you like|should i|let me know)/i
// T/F — 사용자가 드러낸 감정·반응 (키 = 상황)
const CUE_RES = {
  frustration:
    /(짜증|빡치|화나|답답|아오|아\s*진짜|왜\s*(?:또|자꾸|안\s*돼|이래)|또\s*(?:틀|안\s*되|그러)|제발|ㅡㅡ|;;|ㅠ|ㅜ|힘들|미치겠|망했|최악|엉망|개판|시발|씨발|ㅅㅂ|\b(?:fuck|wtf|damn|frustrat\w+|annoy\w+)\b)/i,
  joy: /(대박|최고|굿|좋아+!|좋네|좋다|됐다|된다!|성공|완벽|멋지|예쁘|이쁘|마음에\s*들|ㅋㅋ|ㅎㅎ|오+\s|와+\s|\b(?:nice|great|awesome|perfect|love it)\b)/i,
  thanks: /(고마워|고맙|감사|땡큐|수고|잘했|\b(?:thanks|thank you|good job)\b)/i,
  correction:
    /(아니\s|아니야|아닌데|틀렸|잘못|그게\s*아니|다시\s*해|안\s*되잖|안\s*돼|안되는데|말고\s|왜\s*이렇게|이상해|\b(?:wrong|not what)\b)/i,
  worry: /(걱정|불안|고민|모르겠|헷갈|어렵|무서|괜찮을까|될까\?|맞나\?|\b(?:worried|not sure|confused)\b)/i,
}
// T/F — 답 첫머리에서 그 마음을 받아 주는 말 (사과·인정·공감·같이 기뻐함).
// 이모지는 넣지 않는다 — 실측에서 첫머리 이모지의 대부분이 표·목록 장식(📊 ✅)이었다.
const RECEIVE_RE =
  /(죄송|미안|사과|맞습니다|맞아요|제\s*(?:실수|잘못|불찰)|제가\s*(?:잘못|놓쳤|틀렸)|답답하|불편|번거|이해합|그럴\s*만|힘드|다행|기쁘|축하|감사합니다|별말씀|천만에|잘\s*됐|좋습니다!|걱정\s*(?:마|하지)|괜찮습니다|충분히|sorry|apolog\w+|you're (?:absolutely )?right|my (?:mistake|bad)|understand|glad|you're welcome|no worries)/i
// 인용·코드 — 남의 말이나 문자열을 옮긴 것이라 말한 사람의 표현이 아니다 (코드 블록·백틱·따옴표·인용 줄)
const QUOTED_RE =
  /```[\s\S]*?```|`[^`\n]+`|"[^"\n]{1,200}"|“[^”\n]{1,200}”|‘[^’\n]{1,200}’|「[^」\n]{1,200}」|『[^』\n]{1,200}』|^[ \t]*>.*$/gm

/** 인용·코드를 걷어 낸, 말한 사람 자신의 표현 */
function ownWords(text) {
  return text.replace(QUOTED_RE, ' ')
}

/** 부정·예정으로 쓰이지 않은 확인 표현이 하나라도 있나 */
function saysVerified(text) {
  for (const match of text.matchAll(VERIFIED_RE)) {
    const end = match.index + match[0].length
    if (NOT_DONE_AFTER_RE.test(text.slice(end, end + 12))) continue
    if (NOT_DONE_BEFORE_RE.test(text.slice(Math.max(0, match.index - 24), match.index))) continue
    return true
  }
  return false
}

const CODEX_SETUP_PREFIX = '# AGENTS.md instructions'
/** 앱이 띄운 질문에 사용자가 고른 답 — 사람의 입력이지만 문장이 아니다 */
const CODEX_REPLY_PREFIX = '<send_user_message_question_reply'
const CODEX_REQUEST_MARKER = '## My request for Codex:'

// 사용자의 말 앞에 붙는 마크업 블록 — 리마인더·붙여넣기·화면 컨텍스트 (`<tag …>…</tag>` 또는 `<tag …/>`)
const LEADING_MARKUP_RE = /^(?:\s*<([a-zA-Z_-]+)(?:\s[^>]*)?>[\s\S]*?<\/\1>|\s*<[a-zA-Z_-]+(?:\s[^>]*)?\/>)+/

/** 앞머리의 마크업 블록을 걷어 낸 사용자의 말 — 마크업뿐이면 빈 문자열 */
function stripLeadingMarkup(text) {
  return text.replace(LEADING_MARKUP_RE, '').trim()
}

function codexText(content) {
  if (!Array.isArray(content)) return ''
  let text = ''
  for (const block of content) {
    if (block && typeof block.text === 'string') text += (text ? '\n' : '') + block.text
  }
  return text.trim()
}

/** 사람이 보낸 메시지면 그 말(IDE·앱이 감싼 것은 알맹이만), Codex 가 끼워 넣은 설정·컨텍스트면 null */
function codexPrompt(text) {
  if (!text || text.startsWith(CODEX_SETUP_PREFIX)) return null
  if (text.startsWith(CODEX_REPLY_PREFIX)) return ''
  const said = stripLeadingMarkup(text)
  if (!said) return null
  return said.includes(CODEX_REQUEST_MARKER) ? said.split(CODEX_REQUEST_MARKER).pop().trim() : said
}

/**
 * 세션 1건의 스타일 신호 수집기 — 파서의 raw 라인 루프에서 매 라인 collect(raw) 를 호출한다.
 * Claude 는 isMeta/isSidechain 가드 직후, Codex 는 JSON.parse 직후.
 *
 * @param {'claude' | 'codex'} source
 */
export function createStyleSignalCollector(source) {
  const totals = {
    turns: 0,
    agentTurns: 0,
    answers: 0,
    askEndings: 0,
    guessAnswers: 0,
    verifiedAnswers: 0,
    cuedTurns: 0,
    cuedReceived: 0,
  }
  const cues = {}
  for (const key of Object.keys(CUE_RES)) cues[key] = [0, 0]
  let automated = false
  let turn = null
  /** Claude — 이미 본 라인 uuid. 이어 쓴 세션은 같은 기록을 파일에 다시 적는다 */
  const seenUuids = new Set()
  /** Codex — 작업 이벤트가 기록되는 버전인가 (그러면 요청 경계는 이벤트가 정한다) */
  let tasked = false

  function closeTurn() {
    if (!turn) return
    const done = turn
    turn = null
    // 답도 도구도 없던 턴(슬래시 명령·중단)은 AI 가 일한 게 아니라 세지 않는다.
    // prompt 가 null 이면 사람이 보낸 말 없이 돈 작업(에이전트 메시지·재개)이다.
    if (!done.responded || done.prompt === null) return
    totals.turns++
    if (done.agent) totals.agentTurns++

    // 최종 답 = 마지막 글(Codex 는 final_answer 로 표시된 것만). 그 뒤에 도구를 또 썼으면 답으로 끝난 턴이 아니다
    if (done.last && !done.toolAfterLast) {
      totals.answers++
      const final = ownWords(done.last)
      if (ASK_RE.test(final.slice(-ASK_TAIL_CHARS))) totals.askEndings++
      if (GUESS_RE.test(final)) totals.guessAnswers++
      if (saysVerified(final)) totals.verifiedAnswers++
    }

    if (done.first && done.prompt.length < CUE_PROMPT_MAX_CHARS) {
      const received = RECEIVE_RE.test(ownWords(done.first.slice(0, RECEIVE_HEAD_CHARS)))
      const said = ownWords(done.prompt)
      let cued = false
      for (const key of Object.keys(CUE_RES)) {
        if (!CUE_RES[key].test(said)) continue
        cued = true
        cues[key][0]++
        if (received) cues[key][1]++
      }
      if (cued) {
        totals.cuedTurns++
        if (received) totals.cuedReceived++
      }
    }
  }

  function startTurn(prompt) {
    closeTurn()
    turn = { prompt, responded: false, agent: false, first: '', last: '', toolAfterLast: false }
  }

  /** @param {string} [phase] Codex 가 답에 붙이는 단계 — 중간 진행 글(commentary)은 최종 답 후보가 아니다 */
  function addText(text, phase) {
    if (!turn || !text) return
    turn.responded = true
    if (!turn.first) turn.first = text
    turn.last = phase && phase !== 'final_answer' ? '' : text
    turn.toolAfterLast = false
  }

  function addTool(name) {
    if (!turn || typeof name !== 'string' || isHarnessTool(name)) return
    turn.responded = true
    turn.toolAfterLast = true
    if (AGENT_TOOLS.has(name)) turn.agent = true
  }

  function collectClaude(raw) {
    if (raw.entrypoint === 'sdk-cli') automated = true
    if (typeof raw.uuid === 'string') {
      if (seenUuids.has(raw.uuid)) return
      seenUuids.add(raw.uuid)
    }
    const message = raw.message
    if (!message || typeof message !== 'object') return

    if (message.role === 'user') {
      const text = promptText(message.content).trim()
      if (!text) return
      const kind = raw.origin && typeof raw.origin === 'object' ? raw.origin.kind : undefined
      // 알림·플러그인이 넣은 프롬프트 — 사람의 요청은 아니지만 앞 요청은 여기서 끝난다.
      // 닫지 않으면 이 뒤의 답이 앞 요청의 최종 답을 덮어쓴다.
      if (kind && kind !== 'human') {
        closeTurn()
        return
      }
      // origin 없이 마크업으로 시작하는 줄은 누가 넣었는지 알 수 없다 — 실측에서 대부분 리마인더·명령 출력·
      // 압축 요약·예약 작업이었다. 경계로 삼지 않는다. 사람이 쳤다고 기록된 줄은 앞의 마크업만 걷어 낸다.
      if (!kind && text.startsWith('<')) return
      const prompt = stripLeadingMarkup(text)
      if (prompt.startsWith('[Request interrupted') || prompt.startsWith('Caveat:')) return
      startTurn(prompt)
      return
    }

    if (message.role !== 'assistant' || !Array.isArray(message.content)) return
    for (const block of message.content) {
      if (!block || typeof block !== 'object') continue
      if (block.type === 'text' && typeof block.text === 'string') addText(block.text.trim())
      else if (block.type === 'tool_use') addTool(block.name)
    }
  }

  function collectCodex(record) {
    const payload = record.payload
    if (!payload || typeof payload !== 'object') return
    if (record.type === 'session_meta') {
      // exec = 스크립트 실행, 객체 = 다른 에이전트가 띄운 세션
      if (payload.source === 'exec' || (payload.source && typeof payload.source === 'object')) automated = true
      return
    }
    if (record.type === 'event_msg') {
      // 작업 하나 = 요청 하나. 사람이 보낸 말이 들어오기 전까지 prompt 는 null 이다
      if (payload.type === 'task_started') {
        tasked = true
        startTurn(null)
      } else if (payload.type === 'task_complete' || payload.type === 'turn_aborted') {
        closeTurn()
      }
      return
    }
    if (record.type !== 'response_item') return

    if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
      addTool(payload.name)
      return
    }
    if (payload.type !== 'message') return
    const text = codexText(payload.content)
    if (payload.role === 'user') {
      const prompt = codexPrompt(text)
      if (prompt === null) return
      // 작업 이벤트가 없는 옛 로그에서만 사용자 메시지가 경계다. 작업 도중에 보낸 말은 같은 요청이다
      if (!tasked) startTurn(prompt)
      else if (turn && turn.prompt === null) turn.prompt = prompt
    } else if (payload.role === 'assistant') {
      addText(text, typeof payload.phase === 'string' ? payload.phase : undefined)
    }
  }

  return {
    collect(raw) {
      if (!raw || typeof raw !== 'object') return
      if (source === 'codex') collectCodex(raw)
      else collectClaude(raw)
    },

    /**
     * 사람이 직접 연 세션이 아니거나 AI 가 답한 요청이 없으면 undefined —
     * 소비처는 absent 를 no-data 로 관용 처리한다 (Session.usageSignals 관례).
     */
    finalize() {
      closeTurn()
      if (automated || totals.turns === 0) return undefined
      return { ...totals, cues }
    },
  }
}
