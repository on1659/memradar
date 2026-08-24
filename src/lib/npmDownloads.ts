import { useEffect, useState } from 'react'
import type { NpmDownloadStats } from '../types'

/**
 * npm 공개 다운로드 집계를 읽어오는 훅 — 상단바의 "지금까지 N번" 한 줄용.
 *
 * 세 모드를 모두 관용 처리한다 (훅 활동 카드가 확립한 패턴과 동일):
 *
 * | 모드 | 출처 | 값 |
 * |---|---|---|
 * | 정적 HTML | `window.__MEMRADAR_NPM__` (CLI 가 구워 넣음) | 객체 또는 `null` |
 * | 서버(`--server`) | `GET /api/npm-stats` | 객체 또는 `null` |
 * | 업로드(웹)·구버전 산출물 | 없음 | `null` |
 *
 * `null` 은 "표시할 수치 없음"이며 호출부는 줄 자체를 숨긴다 — 조회 실패나
 * `--no-update-check` 를 0 으로 착각해 "0번 불려나왔어요"를 띄우면 안 된다.
 *
 * 브라우저는 api.npmjs.org 를 **직접 부르지 않는다.** 값은 CLI 가 받아 넘긴
 * 것만 쓴다 — 남이 공유한 정적 HTML 을 여는 제3자가 외부 요청을 일으키지
 * 않게 하려는 것이고, `file://` 에서 CORS 로 죽지 않게 하려는 것이기도 하다.
 */

/** 모듈 수준 캐시 — 대시보드 ↔ 성향 화면을 오갈 때 같은 값을 다시 받지 않는다. */
let cached: NpmDownloadStats | null | undefined
let inflight: Promise<NpmDownloadStats | null> | null = null

function readEmbedded(): NpmDownloadStats | null | undefined {
  // 정적 전역은 앱 JS 보다 먼저 주입되므로 첫 렌더에 이미 확정돼 있다.
  return typeof window === 'undefined' ? null : window.__MEMRADAR_NPM__
}

async function fetchFromServer(): Promise<NpmDownloadStats | null> {
  try {
    const res = await fetch('/api/npm-stats')
    if (!res.ok) return null
    const data: unknown = await res.json()
    if (!data || typeof data !== 'object') return null
    const stats = data as Partial<NpmDownloadStats>
    // 업로드(웹) 모드에선 이 경로가 SPA 폴백 HTML 을 줄 수 있어 형태를 확인한다.
    if (typeof stats.total !== 'number' || !Number.isFinite(stats.total)) return null
    return { total: stats.total, since: String(stats.since ?? ''), until: String(stats.until ?? '') }
  } catch {
    return null
  }
}

export function useNpmDownloads(): NpmDownloadStats | null {
  const [stats, setStats] = useState<NpmDownloadStats | null>(() => {
    const embedded = readEmbedded()
    if (embedded !== undefined) return embedded
    return cached ?? null
  })

  useEffect(() => {
    if (readEmbedded() !== undefined) return // 정적 모드 — 이미 확정
    if (cached !== undefined) return // 이미 받아둠

    let alive = true
    inflight ??= fetchFromServer()
    inflight.then((result) => {
      cached = result
      if (alive) setStats(result)
    })

    return () => {
      alive = false
    }
  }, [])

  return stats
}
