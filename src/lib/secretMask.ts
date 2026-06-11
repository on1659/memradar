/**
 * secretMask (web 측 진입점)
 *
 * 단일 소스는 cli/lib/secretMask.mjs — 시크릿 패턴은 보안 데이터라 web/CLI
 * 이중 유지 시 드리프트가 곧 누출 버그가 된다. src 쪽 소비자는 전부 이 모듈을
 * 거쳐 import 한다 (깊은 상대 경로를 한 곳으로 모음).
 *
 * 적용 원칙: 마스킹은 표시/직렬화 경계에서만 — 파서·검색 인덱스·통계 계산은
 * 원문 그대로 두고, 렌더 직전 또는 export 직렬화 시점의 문자열에만 적용한다.
 */
import { useMemo } from 'react'
import { maskSecrets } from '../../cli/lib/secretMask.mjs'

export { maskSecrets }
export type { MaskSecretsResult, SecretHit } from '../../cli/lib/secretMask.mjs'

/**
 * 렌더용 마스킹 메모이즈 훅 — 도구 결과처럼 큰 문자열을 매 렌더마다 다시
 * 정규식 스캔하지 않도록 text 기준으로 캐시한다.
 * 리빌(원문 보기) 토글 상태는 호출 컴포넌트의 useState 로 관리한다.
 */
export function useSecretMask(text: string): { masked: string; hitCount: number } {
  return useMemo(() => {
    const { masked, hits } = maskSecrets(text)
    return { masked, hitCount: hits.length }
  }, [text])
}
