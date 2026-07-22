/**
 * secretMask
 *
 * 프롬프트/도구 출력에 실수로 남은 API 키·토큰을 `[REDACTED:kind]` 로 가린다.
 *
 * 원칙
 * - 원본 데이터 불변 — 표시/직렬화 경계 전용. 원본 .jsonl 은 절대 수정하지 않는다.
 * - 정적 HTML 은 임베드 시점에 마스킹되므로 원문이 파일에 아예 없다(공유 안전).
 *   따라서 정적 산출물에서 리빌(원문 보기)이 불가능한 것은 의도된 동작이다.
 * - 네트워크 I/O 0, 외부 의존성 0 — plain ESM 순수 함수만 (Node 18 / 브라우저 공용).
 * - 고신뢰 패턴만 마스킹. UUID·순수 hex(커밋 SHA, digest)는 절대 마스킹하지 않는다
 *   (`claude --resume <세션 id>` 복사 기능이 UUID 원문에 의존).
 * - 멱등: `[REDACTED:kind]` 토큰은 어떤 패턴에도 재매칭되지 않는다.
 * - 알려진 한계: 서버 light cap(4000자)과 검색 스니펫은 마스킹 이전 원문을 자르므로,
 *   잘림 경계에 걸친 시크릿은 잔여 조각이 패턴 길이 미달로 노출될 수 있다.
 *
 * detailed 모드(`maskSecrets(text, { detailed: true })`)는 각 hit 에 매치된 원문
 * 조각(value)·오프셋(index)·길이(length)를 함께 반환한다. **호출자는 이 value 를
 * 디스크/로그에 평문으로 기록해서는 안 된다** — 분류·지문(fingerprint) 생성에만 쓰고,
 * 보고/저장 시에는 형식 접두 미리보기와 비가역 해시로만 남겨야 한다.
 *
 * 단일 소스: web(src/lib/secretMask.ts 경유)과 CLI(cli/index.mjs)가 모두 이 파일을
 * import 한다. 패턴 목록은 보안 데이터라 이중 유지하면 드리프트가 곧 누출 버그가
 * 된다 — 수정은 반드시 여기 한 곳에서만.
 */

// ─── 고신뢰 시크릿 패턴 ──────────────────────────────────────────────────────
//
// kind            | 형태
// ────────────────|───────────────────────────────────────────────────────────
// private-key     | -----BEGIN … PRIVATE KEY----- ~ -----END … PRIVATE KEY-----
// slack-webhook   | https://hooks.slack.com/services|workflows|triggers/…
// discord-webhook | https://discord(app).com/api/webhooks/<id>/<token>
// ntfy-topic      | https://ntfy.sh/<topic> (토픽 명 = 곧 발행 권한)
// anthropic-key   | sk-ant- 접두
// openai-key      | sk- 접두
// github-token    | ghp_/gho_/ghu_/ghs_/ghr_ 또는 github_pat_ 접두
// aws-access-key  | AKIA + 대문자/숫자 16
// slack-token     | xoxb-/xoxa-/xoxp-/xoxr-/xoxs- 접두
// google-api-key  | AIza + 35자
// npm-token       | npm_ + 36자
// gitlab-token    | glpat- 접두
// jwt             | eyJ 로 시작하는 3세그먼트
// bearer-token    | `Bearer <토큰>` (jwt 매칭 후 잔여만 — 아래 BEARER_RE 별도 단계)
// auth-token      | `Authorization: token <토큰>` 헤더 값 (BEARER_RE 와 같은 단계)
// url-userinfo    | scheme://user:pass@host 의 userinfo (별도 단계, host 보존)
//
// 순서 의존성 (위에서 아래로 적용):
// - private-key 가 최우선 — PEM 본문(base64)이 다른 패턴에 부분 매칭되기 전에 통째로 처리
// - webhook URL 3종은 키 패턴들보다 먼저 — URL 경로 조각이 토큰 패턴에 부분
//   매칭되기 전에 URL 통째로 처리 (훅 command 표면의 대표 시크릿 형태)
// - anthropic-key(sk-ant-)는 openai-key(sk-)의 부분집합이라 먼저 검사
// - jwt 는 bearer-token 보다 먼저 — `Bearer <jwt>` 는 jwt 로 분류
//   (bearer-token 은 이 배열이 아니라 패턴 루프 뒤 BEARER_RE 단계에서 처리)
//
const SECRET_PATTERNS = [
  { kind: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { kind: 'slack-webhook', re: /\bhttps:\/\/hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9/_-]{8,}/g },
  { kind: 'discord-webhook', re: /\bhttps:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d{5,}\/[A-Za-z0-9_-]{20,}/g },
  // ntfy.sh 는 토픽 명이 곧 발행 권한 — 문서/앱 경로(docs/app/account/settings)는 제외
  { kind: 'ntfy-topic', re: /\bhttps:\/\/ntfy\.sh\/(?!(?:docs|app|account|settings)\b)[A-Za-z0-9_-]{3,64}\b/g },
  { kind: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g },
  { kind: 'openai-key', re: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { kind: 'github-token', re: /\b(?:(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { kind: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'npm-token', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { kind: 'gitlab-token', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g },
]

// ─── bearer-token (별도 단계) ────────────────────────────────────────────────
//
// `Bearer <불투명 토큰>` — SECRET_PATTERNS 루프 뒤에 적용 (jwt 가 먼저 소비).
// 프리픽스 캡처: $1 = `Bearer ` (보존), $2 = 토큰(치환 대상).
// `Bearer` 단어 자체는 보존해야 헤더 형태(`Authorization: Bearer …`)가 읽힌다.
//
// 오탐 가드 (maskSecrets 의 치환 콜백에서 적용):
// - isGuardedValue: 플레이스홀더(`YOUR_ACCESS_TOKEN_HERE_OK` 류)·UUID·순수 hex 제외
// - 토큰에 숫자 1개 이상 요구 — `authentication-mechanism` 같은 하이픈 산문 오탐 제거.
//   트레이드오프: 숫자가 전혀 없는 불투명 토큰은 놓친다 — 고신뢰 우선·미탐 허용 원칙.
//
const BEARER_RE = /(Bearer\s+)([A-Za-z0-9_\-.~+/]{20,}=*)/g

// ─── auth-token (별도 단계) ──────────────────────────────────────────────────
//
// `Authorization: token <값>` 헤더 (GitHub API 등 훅 command 의 curl 헤더 형태).
// 산문의 일반 단어 "token" 오탐을 막기 위해 Authorization 헤더 문맥으로 한정.
// BEARER_RE 와 동일한 가드(isGuardedValue + 숫자 1개 이상)를 적용한다.
//
const AUTH_TOKEN_RE = /(Authorization['"]?\s*[:=]\s*['"]?token\s+)([A-Za-z0-9_\-.~+/]{16,}=*)/gi

// ─── url-userinfo (별도 단계) ────────────────────────────────────────────────
//
// `scheme://user:pass@host` 의 userinfo 전체를 가린다 (scheme/host 는 보존 —
// 어디로 보내는지는 읽혀야 진단이 된다). user 에 ':' '@' 불가, pass 에 '@' 불가.
// 멱등 가드: 치환 결과(`[REDACTED:url-userinfo]`)에는 콜론이 있지만 user 파트
// 패턴이 '['/']' 를 허용하지 않아 재매칭되지 않는다.
//
const URL_USERINFO_RE = /([a-z][a-z0-9+.-]*:\/\/)([^/\s:@[\]]+):([^/\s@[\]]+)@/gi

// ─── credential 할당 휴리스틱 ────────────────────────────────────────────────
//
// `api_key = <값>` / `secret: "<값>"` / JSON `"api_key": "<값>"` 류 할당문에서 값만 가린다.
// 키워드는 대소문자 무관(MY_API_KEY= 도 매칭), 키워드 뒤 `['"]?` 로 JSON 따옴표 키의
// 닫는따옴표를 허용. 값은 16자 이상일 때만.
// 캡처: $1 = 키워드+닫는따옴표?+구분자+여는따옴표?(보존), $2 = 값(치환 대상).
//
const CREDENTIAL_RE =
  /((?:api[_-]?key|apikey|secret|token|password|passwd|client[_-]?secret|access[_-]?key)['"]?\s*[:=]\s*['"]?)([A-Za-z0-9_\-./+]{16,})/gi

// ─── 오탐 방지 가드 — 아래 형태의 값은 절대 마스킹하지 않는다 ────────────────
//
// UUID        | 세션 id 가 UUID — `claude --resume <id>` 복사 기능이 원문에 의존
// 순수 hex    | 40-hex 커밋 SHA, 64-hex digest 등
// 환경변수명  | `API_KEY=YOUR_API_KEY` 같은 이름 참조
// 식별자 체인 | `token = process.env.MY_TOKEN` 같은 코드 참조 (시크릿 값이 아님)
// 경로        | `secret: /run/secrets/x.txt` 같은 절대 경로 (시크릿 위치 참조, 값 아님)
// 플레이스홀더| `${...}`, `<...>`, your/xxx/example 포함 값
//
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const PURE_HEX_RE = /^[0-9a-fA-F]+$/
const ENV_NAME_RE = /^[A-Z][A-Z0-9_]*$/
const CODE_REF_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/

function isGuardedValue(value) {
  if (UUID_RE.test(value)) return true
  if (PURE_HEX_RE.test(value)) return true
  if (ENV_NAME_RE.test(value)) return true
  if (CODE_REF_RE.test(value)) return true
  if (value.startsWith('/')) return true
  if (value.includes('${') || value.startsWith('<')) return true
  const lower = value.toLowerCase()
  if (lower.includes('your') || lower.includes('xxx') || lower.includes('example')) return true
  return false
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * 텍스트에서 고신뢰 시크릿을 `[REDACTED:kind]` 로 치환한다.
 *
 * 입력을 변형하지 않는 순수 함수. 멱등 — 이미 마스킹된 텍스트에 다시 적용해도
 * 결과가 같고 hits 는 빈 배열이다.
 *
 * @param {string} text
 * @param {{ detailed?: boolean }} [opts]
 *   생략 또는 `detailed` falsy → 각 hit 은 `{ kind }` 만 (기본·하위호환).
 *   `detailed: true` → 각 hit 에 `value`(치환된 시크릿 조각), `index`(value 의 문자
 *   오프셋), `length`(value.length)를 추가. bearer/credential 처럼 그룹 캡처로 값만
 *   치환하는 패턴은 전체 매치가 아니라 **실제 마스킹된 조각**을 value 로 준다.
 *   ⚠ detailed 의 value 는 원문 시크릿이다 — 디스크/로그에 평문으로 기록 금지.
 * @returns {{ masked: string, hits: Array<{ kind: string, value?: string, index?: number, length?: number }> }}
 */
export function maskSecrets(text, opts) {
  if (typeof text !== 'string' || text.length === 0) {
    return { masked: typeof text === 'string' ? text : '', hits: [] }
  }
  const detailed = Boolean(opts && opts.detailed)
  const hits = []
  let masked = text
  for (const { kind, re } of SECRET_PATTERNS) {
    masked = masked.replace(re, (match, offset) => {
      hits.push(detailed ? { kind, value: match, index: offset, length: match.length } : { kind })
      return `[REDACTED:${kind}]`
    })
  }
  masked = masked.replace(BEARER_RE, (match, prefix, token, offset) => {
    if (isGuardedValue(token)) return match
    // 숫자 없는 토큰은 산문(`Bearer authentication-mechanism`)일 가능성이 높아 제외
    if (!/[0-9]/.test(token)) return match
    // 치환되는 부분은 token 뿐 — value/index 는 전체 매치가 아니라 token 기준.
    hits.push(
      detailed
        ? { kind: 'bearer-token', value: token, index: offset + prefix.length, length: token.length }
        : { kind: 'bearer-token' },
    )
    return `${prefix}[REDACTED:bearer-token]`
  })
  masked = masked.replace(AUTH_TOKEN_RE, (match, prefix, token, offset) => {
    if (isGuardedValue(token)) return match
    // BEARER 와 동일 — 숫자 없는 값은 산문 가능성이 높아 제외
    if (!/[0-9]/.test(token)) return match
    hits.push(
      detailed
        ? { kind: 'auth-token', value: token, index: offset + prefix.length, length: token.length }
        : { kind: 'auth-token' },
    )
    return `${prefix}[REDACTED:auth-token]`
  })
  masked = masked.replace(CREDENTIAL_RE, (match, prefix, value, offset) => {
    if (isGuardedValue(value)) return match
    // 치환되는 부분은 value 뿐 — index 는 prefix 길이만큼 뒤.
    hits.push(
      detailed
        ? { kind: 'credential', value, index: offset + prefix.length, length: value.length }
        : { kind: 'credential' },
    )
    return `${prefix}[REDACTED:credential]`
  })
  masked = masked.replace(URL_USERINFO_RE, (match, scheme, user, pass, offset) => {
    // 플레이스홀더 비밀번호(`${DB_PASS}` 등)는 그대로 둔다
    if (isGuardedValue(pass)) return match
    const userinfo = `${user}:${pass}`
    hits.push(
      detailed
        ? { kind: 'url-userinfo', value: userinfo, index: offset + scheme.length, length: userinfo.length }
        : { kind: 'url-userinfo' },
    )
    return `${scheme}[REDACTED:url-userinfo]@`
  })
  return { masked, hits }
}
