import type { ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { useI18n } from '../i18n'
import { HoverTooltip } from './HoverTooltip'
import { useNpmDownloads } from '../lib/npmDownloads'

/**
 * "지금까지 N번 불려나왔어요" + `?` 도움말 한 줄.
 *
 * 대시보드 전용이 아니다 — 사용자가 처음 만나는 화면은 코드 리포트(Wrapped)와
 * 페르소나 퀴즈라 그 둘에도 얹는다. 화면마다 배경·정렬이 달라 트리거 스타일만
 * prop 으로 받고, 문구·툴팁·데이터 경로는 여기서 한 번만 정의한다.
 *
 * 집계가 없으면(`--no-update-check`, 조회 실패, 업로드(웹) 모드, 구버전 산출물)
 * **`prefix` 까지 통째로 렌더하지 않는다** — 호출부에 구분점만 덩그러니 남는 것을
 * 막기 위해 구분점을 이 컴포넌트가 소유한다. 0 으로 폴백하지 않는 이유는
 * "0번 불려나왔어요"가 사실과 다른 말이기 때문.
 */
export function NpmDownloadsNote({
  prefix,
  align = 'left',
  wrapperClassName = 'group/npm relative inline-flex items-center gap-1',
  buttonClassName = 'inline-flex items-center gap-1 text-text/55 transition-colors hover:text-text',
}: {
  /** 집계가 있을 때만 함께 렌더되는 앞선 요소 (예: 구분점 `·`) */
  prefix?: ReactNode
  align?: 'left' | 'center' | 'right'
  wrapperClassName?: string
  buttonClassName?: string
}) {
  const { t } = useI18n()
  const npm = useNpmDownloads()

  if (!npm) return null

  return (
    <>
      {prefix}
      {/* direction="down": 세 호출부 모두 화면 상단이라 위로 펼치면 잘린다.
          tooltipLayerClass: 같은 스태킹 컨텍스트의 더 높은 형제(상단바 버튼
          클러스터 z-[85], Wrapped chrome)를 넘기 위해 공유 툴팁 레이어(z 95).
          hoverClassName 은 이름 있는 group 이라 리터럴 문자열이어야 한다
          (조합하면 Tailwind JIT 가 클래스를 생성 못 해 hover 가 죽는다). */}
      <HoverTooltip
        direction="down"
        align={align}
        tooltipWidthClass="w-72"
        tooltipLayerClass="dashboard-tooltip"
        wrapperClassName={wrapperClassName}
        buttonClassName={buttonClassName}
        hoverClassName="group-hover/npm:opacity-100 group-focus-within/npm:opacity-100"
        title={t('dashboard.npmDownloads.help.title')}
        description={t('dashboard.npmDownloads.help.body')}
      >
        <span>{t('dashboard.npmDownloads', { count: npm.total.toLocaleString() })}</span>
        <CircleHelp className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
      </HoverTooltip>
    </>
  )
}
