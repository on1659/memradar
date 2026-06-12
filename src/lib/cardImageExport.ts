/**
 * cardImageExport — 대시보드 카드 단독 PNG export.
 *
 * ShareSlide.tsx(§8.5 Share Card 캡처 규격)와 **의도적 중복** — `src/components/wrapped/`
 * 는 수정 금지 영역이라 공유 유틸로 합치지 않는다. ShareSlide 쪽 캡처 규격
 * (`toPng(..., { pixelRatio: 2, cacheBust: true })`)이 바뀌면 여기도 같이 동기화할 것 (동기화 가드).
 *
 * 배경: ShareSlide 선례를 따라 `backgroundColor` 미지정 — 캡처 노드의 자체 배경
 * (`bg-bg-card`, var() computed 값)이 현재 테마 그대로 찍히고, 라운드 코너 바깥은
 * 투명 PNG 가 된다. 의식적 결정이다 (테마별 카드 공유가 의도된 동작).
 *
 * 시크릿 마스킹 (defense-in-depth): 신규 카드 3장(리듬·이야기·지문)은 수치 + 고정
 * 사전 단어만 렌더하므로 정상 경로에서 maskSecrets hit 은 0 (no-op) 이지만, 캡처 전
 * 텍스트 노드를 전수 스캔해 hit 이 있는 노드만 임시 치환하고 finally 에서 원복한다.
 * cleanClaudeText 는 적용하지 않는다 — DOM 텍스트는 이미 렌더된 표시 문자열이라
 * .jsonl 노이즈 제거 대상이 아니다 (maskSecrets 만, src/lib/secretMask.ts 단일 소스).
 *
 * 네트워크 I/O 0 — toPng 는 로컬 data URL 을 만들고, 다운로드는 a[download] + data URL
 * (ShareSlide triggerDownload 패턴 — Object URL 이 아니므로 revoke 불필요).
 */
import { toPng } from 'html-to-image'
import { maskSecrets } from './secretMask'

/** export 산출물에서 제외할 요소 마커 (export 버튼/토글 pill 이 PNG 에 안 찍히게) */
export const CARD_EXPORT_EXCLUDE_ATTR = 'data-export-exclude'

interface TextNodeRestore {
  node: Text
  original: string
}

/**
 * 캡처 전 마스킹 가드 — node 서브트리의 텍스트 노드를 순회해 시크릿 hit 이 있는
 * 노드만 마스킹 문자열로 임시 치환한다. 반환된 목록으로 캡처 후 반드시 원복할 것.
 */
function maskTextNodesInPlace(node: HTMLElement): TextNodeRestore[] {
  const restores: TextNodeRestore[] = []
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  while (current !== null) {
    const textNode = current as Text
    const original = textNode.data
    if (original.trim().length > 0) {
      const { masked, hits } = maskSecrets(original)
      if (hits.length > 0) {
        textNode.data = masked
        restores.push({ node: textNode, original })
      }
    }
    current = walker.nextNode()
  }
  return restores
}

/**
 * 카드 DOM 노드 1개를 PNG 로 캡처해 즉시 다운로드한다.
 * 실패 시 throw — busy/disabled 상태 처리는 호출부(Dashboard) 책임.
 */
export async function exportCardPng(node: HTMLElement, fileName: string): Promise<void> {
  // React 가 관리하는 텍스트 노드를 직접 치환하므로, 캡처 동안 리렌더가 끼어들지 않게
  // 호출부는 busy 가드로 동시 진입을 막는다. finally 원복으로 화면 상태는 항상 복구된다.
  const restores = maskTextNodesInPlace(node)
  try {
    const dataUrl = await toPng(node, {
      pixelRatio: 2,
      cacheBust: true,
      filter: (domNode) => !(domNode instanceof Element && domNode.hasAttribute(CARD_EXPORT_EXCLUDE_ATTR)),
    })
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = fileName
    // 문서에 부착 후 클릭 — 미부착 anchor 의 click() 은 브라우저별 다운로드 동작이
    // 불안정할 수 있다 (Chromium 외 이식성).
    document.body.appendChild(link)
    try {
      link.click()
    } finally {
      link.remove()
    }
  } finally {
    for (const restore of restores) {
      restore.node.data = restore.original
    }
  }
}
