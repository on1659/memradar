import type { ReactNode } from 'react'

/**
 * hover/focus 시 펼쳐지는 도움말 툴팁 — `?`(CircleHelp) 아이콘 옆 설명의 표준 형태.
 *
 * 원래 `Dashboard.tsx:DashboardHoverTooltip` 과 `PersonalityView.tsx:HoverTooltip`
 * 에 **동일한 코드로 두 벌** 존재했다. 상단바에 세 번째 사본을 만드는 대신
 * 여기로 올려 셋이 같은 구현을 쓰게 한다 (skill-candidates C-002 "복제엔 가드").
 *
 * 두 가지 축이 호출부마다 갈린다:
 *
 * - `direction` — 기본 `'up'`(bottom-full). 화면 **상단**에 놓인 트리거는
 *   위로 펼치면 뷰포트 밖으로 잘리므로 `'down'`(top-full)을 준다.
 *   같은 이유로 Dashboard 훅 팝오버도 아래로 펼친다(overflow 클립 박스 안이라).
 * - `hoverClassName` — Tailwind 의 group 변형은 **리터럴 문자열**이어야 JIT 가
 *   클래스를 생성한다. 이름 있는 group(`group/npm`)을 쓰는 호출부는
 *   `'group-hover/npm:opacity-100 group-focus-within/npm:opacity-100'` 처럼
 *   완성된 문자열을 그대로 넘긴다 — 문자열 조합으로 만들면 purge 에 걸려 죽는다.
 *
 * 이름 있는 group 을 권하는 이유: 이름 없는 `group` 을 중첩하면 `group-hover:`
 * 가 조상 중 **아무** `.group` 에나 매칭돼 엉뚱한 곳에 hover 해도 툴팁이 뜬다
 * (`SessionView.tsx:631-635` 주석의 실제 사고 사례).
 */
export function HoverTooltip({
  children,
  title,
  description,
  align = 'center',
  direction = 'up',
  wrapperClassName = 'group relative inline-flex',
  buttonClassName = 'inline-flex',
  tooltipWidthClass = 'w-56',
  hoverClassName = 'group-hover:opacity-100 group-focus-within:opacity-100',
  tooltipLayerClass = 'z-30',
}: {
  children: ReactNode
  title?: string
  description: ReactNode
  align?: 'left' | 'center' | 'right'
  direction?: 'up' | 'down'
  wrapperClassName?: string
  buttonClassName?: string
  tooltipWidthClass?: string
  hoverClassName?: string
  /**
   * 툴팁이 놓일 층. 기본 `z-30` 은 카드 내부에서 충분하다.
   * 같은 스태킹 컨텍스트에 더 높은 형제(상단바 버튼 클러스터 `z-[85]` 등)가
   * 있으면 공유 툴팁 레이어 `'dashboard-tooltip'`(z 95, DESIGN-GUIDE §10.4)을 준다.
   */
  tooltipLayerClass?: string
}) {
  const tooltipPositionClass =
    align === 'left'
      ? 'left-0'
      : align === 'right'
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2'

  const tooltipDirectionClass = direction === 'down' ? 'top-full mt-2' : 'bottom-full mb-2'

  return (
    <span className={wrapperClassName}>
      <button type="button" className={buttonClassName}>
        {children}
      </button>
      <span
        className={`pointer-events-none absolute ${tooltipLayerClass} ${tooltipDirectionClass} ${tooltipWidthClass} rounded-lg border border-border bg-bg-card px-3 py-2 text-left text-[11px] leading-relaxed text-text opacity-0 shadow-xl transition-opacity ${hoverClassName} ${tooltipPositionClass}`}
      >
        {title && <span className="block font-semibold text-text-bright">{title}</span>}
        <span className={title ? 'mt-1 block text-text/75' : 'block text-text'}>
          {description}
        </span>
      </span>
    </span>
  )
}
