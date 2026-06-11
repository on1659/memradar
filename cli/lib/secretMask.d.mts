/**
 * secretMask 타입 선언 — 구현(단일 소스)은 인접한 secretMask.mjs.
 *
 * src(TS)에서 `import { maskSecrets } from '../../cli/lib/secretMask.mjs'` 로
 * 가져올 때 tsc 가 이 선언 파일을 사용한다.
 */

/**
 * 마스킹된 시크릿 1건 — kind 는 `[REDACTED:kind]` 토큰의 kind 와 동일.
 *
 * value/index/length 는 `maskSecrets(text, { detailed: true })` 에서만 채워진다.
 * value 는 치환된 시크릿 원문 조각이다 — 디스크/로그에 평문 기록 금지 (분류·지문용).
 */
export interface SecretHit {
  kind: string
  /** detailed 모드에서만: 치환된 시크릿 원문 조각 */
  value?: string
  /** detailed 모드에서만: value 의 문자 오프셋 */
  index?: number
  /** detailed 모드에서만: value.length */
  length?: number
}

export interface MaskSecretsResult {
  /** 시크릿이 `[REDACTED:kind]` 로 치환된 텍스트 */
  masked: string
  /** 치환 발생 건수만큼의 hit 목록 (발생 없으면 빈 배열) */
  hits: SecretHit[]
}

/** maskSecrets 옵션 — 생략 시 기본(하위호환) 동작 */
export interface MaskSecretsOptions {
  /** true 면 각 hit 에 value/index/length 를 포함 (원문 노출 주의) */
  detailed?: boolean
}

/**
 * 고신뢰 시크릿을 `[REDACTED:kind]` 로 치환한다. 순수 함수, 멱등.
 * 원본 데이터 불변 — 표시/직렬화 경계 전용.
 *
 * opts 생략 또는 `detailed` falsy 면 각 hit 은 `{ kind }` 만 (기존 호출처 무영향).
 * `detailed: true` 면 각 hit 에 value/index/length 가 추가된다.
 */
export declare function maskSecrets(text: string, opts?: MaskSecretsOptions): MaskSecretsResult
