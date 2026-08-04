import type { Session } from '../types'
import { shortModelName } from '../lib/modelNames'
import {
  displayModels,
  displayModelCounts,
  switchReasonCounts,
  SWITCH_REASON_USAGE_LIMIT,
  SWITCH_REASON_CONTEXT_OVERFLOW,
} from '../lib/modelAttribution'

/**
 * 세션 모델 구성 배지 — "이 대화가 어떤 모델들을 얼마나 썼는가"를 사실로 적는다.
 *
 * 토큰·비용 배지와 같은 패턴이다: 배지에는 압축된 값, hover 에 전체 내역.
 * 메시지 사이에 "여기서부터 모델이 바뀜" 마커를 넣지 않는다 — 사용자가 명시적으로
 * 마커 대신 현재 대화의 상태 기술을 선택했다.
 *
 * 단위는 **응답** 수 (Claude=distinct requestId, Codex=assistant response_item).
 * 실측상 세션당 모델은 최대 3종(1종 60% / 2종 31% / 3종 10%)이라 이름을 모두 나열해도
 * 배지 폭이 넘치지 않는다. 방어적으로 4종 이상이면 상위 2종 + "외 N" 으로 접는다.
 *
 * 색은 중립 배지 토큰(DESIGN-GUIDE.md:408)이다 — 명세 확정 결정. green 은 이미
 * user 말풍선·user 토큰 배지·훅 성공·훅 신뢰도 칩에 4중 예약된 의미 축이라 쓰지 않는다.
 * (기존 단일 모델 배지의 green ↔ sessionSourceColor 드리프트는 범위 밖 미결로 유지.)
 */
interface Props {
  session: Session
  /** 툴팁 방향 — 세션 목록처럼 아래 공간이 없으면 'top' */
  placement?: 'top' | 'bottom'
}

const NAME_LIMIT = 3

export function SessionModelBadge({ session, placement = 'bottom' }: Props) {
  const models = displayModels(session)
  if (models.length === 0) return null

  const counts = displayModelCounts(session)
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0

  const label =
    models.length <= NAME_LIMIT
      ? models.map(shortModelName).join(' · ')
      : `${models.slice(0, 2).map(shortModelName).join(' · ')} 외 ${models.length - 2}`

  // 내역: 모델별 응답 수 + 비중. counts 가 없으면(구 서버 캐시 등) 이름만 나열한다.
  const detailLines: string[] = counts
    ? models.map((m) => {
        const n = counts[m] ?? 0
        const share = total > 0 ? Math.round((n / total) * 1000) / 10 : 0
        return `${shortModelName(m)} — ${n.toLocaleString()} 응답 (${share}%)`
      })
    : models.map((m) => shortModelName(m))

  const summaryLines: string[] = []
  if (models.length >= 2 && total > 0) {
    summaryLines.push(`모델 ${models.length}종 · 총 ${total.toLocaleString()} 응답`)
  }

  // 전환 사유는 정규화된 분류만 — 원문에 타임존·리셋 시각이 들어 있어 노출하지 않는다.
  const reasons = switchReasonCounts(session.messages)
  const reasonLabels: string[] = []
  if (reasons[SWITCH_REASON_USAGE_LIMIT]) reasonLabels.push('사용량 한도')
  if (reasons[SWITCH_REASON_CONTEXT_OVERFLOW]) reasonLabels.push('컨텍스트 초과')
  if (models.length >= 2 && reasonLabels.length > 0) {
    summaryLines.push(`전환 사유: ${reasonLabels.join(', ')}`)
  }

  const tooltipPosition =
    placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'

  return (
    <span className="group/model relative cursor-default rounded-full border border-border/70 bg-bg-card px-2 py-0.5 text-[10px] font-medium text-text/65">
      {label}
      <span
        className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 ${tooltipPosition} whitespace-nowrap rounded-lg border border-border bg-bg-card px-3 py-2 text-left text-[10px] leading-5 text-text/80 opacity-0 shadow-xl transition-opacity group-hover/model:opacity-100`}
      >
        {detailLines.map((line, i) => (
          <span key={i} className="block">
            {line}
          </span>
        ))}
        {summaryLines.map((line, i) => (
          <span
            key={`s-${i}`}
            className={`block ${i === 0 ? 'mt-1 border-t border-border pt-1 text-text-bright' : ''}`}
          >
            {line}
          </span>
        ))}
      </span>
    </span>
  )
}
