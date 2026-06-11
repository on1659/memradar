import { Eye, EyeOff } from 'lucide-react'

interface SecretMaskToggleProps {
  /** maskSecrets hits 건수 — 0 이면 아무것도 렌더하지 않는다 */
  hitCount: number
  revealed: boolean
  onToggle: () => void
}

/**
 * 마스킹된 시크릿 리빌 토글 버튼.
 *
 * Truncate(src/components/tools/Truncate.tsx)의 더 보기/접기 버튼 패턴을 따른다.
 * 서버 모드에서만 의미가 있다 — 정적 HTML 은 임베드 시점에 마스킹되어 원문이
 * 없으므로(hits 0) 이 버튼이 나타나지 않는 것이 의도된 동작이다.
 */
export function SecretMaskToggle({ hitCount, revealed, onToggle }: SecretMaskToggleProps) {
  if (hitCount === 0) return null
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-1 flex items-center gap-1 text-[11px] text-text/40 hover:text-text/70 transition-colors"
    >
      {revealed
        ? <><EyeOff className="h-3 w-3" /> 숨기기</>
        : <><Eye className="h-3 w-3" /> 마스킹된 시크릿 {hitCount}건 — 표시</>}
    </button>
  )
}
