# Competitive Analysis

> 시장 조사 · 포지셔닝 메모. 별 수·지원 범위 같은 수치는 작성 시점의 공개 정보 기준이며, 주기적 갱신이 필요함.
>
> 작성 시점: **2026-04-19 · memradar v0.2.12**. 경쟁 제품 서술은 과거 확인분 기준이며 항목별로 "(unverified — last confirmed …)" 힌트를 달아둔다.

## 시장 현황

AI 코딩 어시스턴트 대화 히스토리 뷰어 생태계는 이미 활발하다. 대부분은 **실용적·기능적** 분석 도구고, "재미있는 회고" 영역은 상대적으로 비어 있다.

---

## 주요 제품

### 1. CCHV (claude-code-history-viewer)

- **기술**: Rust + Tauri v2 (데스크톱 앱)
- **강점**: 다중 Provider 지원, 헤드리스 서버 모드, 풍부한 토큰·비용 분석
- **약점**: 데스크톱 설치 필요, 스토리텔링·공유 요소 부재
- (unverified — last confirmed 2026-04-19)

### 2. Claude Inspector

- **강점**: 브라우저에서 세션 실행·재개, SQLite 인덱싱, 실시간 스트리밍
- **약점**: Claude 전용, 통계·분석 기능은 제한적
- (unverified — last confirmed 2026-04-19)

### 3. claude-history

- **강점**: 터미널 TUI, 강력한 퍼지 검색, 세션 Fork
- **약점**: GUI 없음, 터미널 사용자 한정
- (unverified — last confirmed 2026-04-19)

### 4. SpecStory

- **강점**: 크로스 플랫폼(Cursor, Copilot, Claude), 자동 마크다운 저장, 공유 URL
- **약점**: 분석 기능 제한적, VS Code 확장에 기능 집중
- (unverified — last confirmed 2026-04-19)

### 5. 기타

- **claude-devtools** — DevTools 스타일 세션 분석
- **claude-JSONL-browser** — 웹 기반 JSONL → 마크다운 변환
- 개인 개발자들의 단일 페이지 타임라인 도구들

---

## 기능 비교 매트릭스

> 경쟁 제품(CCHV/Inspector/claude-history/SpecStory) 셀은 2026-04-19 이전 확인분 기준 (unverified).

| 기능 | CCHV | Inspector | claude-history | SpecStory | **Memradar** |
|---|---|---|---|---|---|
| 세션 브라우징 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 토큰·비용 통계 | ✅ | ✅ | ❌ | ❌ | ✅ |
| 활동 히트맵 | ✅ | ❌ | ❌ | ❌ | ✅ |
| 다중 Provider | ✅ | ❌ | ❌ | ✅ | ✅ (Claude·Codex) |
| 실시간 세션 | ❌ | ✅ | ❌ | ❌ | ❌ (범위 밖) |
| 전체 텍스트 검색 | ❌ | ✅ | ✅ | ❌ | ✅ |
| 워드 클라우드 / Top 스킬 | ❌ | ❌ | ❌ | ❌ | ✅ |
| 언어 프로필 (28종 감지) | ❌ | ❌ | ❌ | ❌ | ✅ |
| **퍼스널리티 (3축 / 8유형)** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Code Report (회고)** | ❌ | ❌ | ❌ | ❌ | ✅ (8 슬라이드) |
| **세션 리플레이** | ❌ | ❌ | ❌ | ❌ | ⬜ (Phase 2) |
| **업적·뱃지** | ❌ | ❌ | ❌ | ❌ | ⬜ (Phase 2) |
| **코드 진화 트래커** | ❌ | ❌ | ❌ | ❌ | ⬜ (Phase 2) |
| 공유 이미지 | ❌ | ❌ | ❌ | ✅ (URL) | ✅ (PNG · html-to-image) |
| 로컬 CLI 실행 (`npx`) | ❌ | ❌ | ❌ | ❌ | ✅ (`npx memradar`, 포트 3939, `--static`) |
| 웹 데모 | ❌ | ✅ | ❌ | ✅ | ✅ (Vercel) |

---

## Memradar 포지셔닝

```
  실용적 분석 ◄──────────────────────► 감성적 회고
  CCHV / Inspector / claude-history / SpecStory
                                            ↑
                                         Memradar
```

### 핵심 차별화 포인트

1. **Code Report** — Spotify Wrapped 패러다임을 AI 코딩 회고에 적용. 8 슬라이드(퍼스널리티 포함) + PNG 공유. SNS 공유 친화적.
2. **퍼스널리티 시스템** — 3축(Work Style / Scope / Rhythm) 기반 8유형. 회고 서사를 만든다.
3. **언어 프로필** — 28개 언어 자동 감지로 실제 코딩 스택을 가시화.
4. **세션 리플레이 (Phase 2)** — 대화를 영상처럼 재생 (기획: [SESSION-REPLAY-SPEC.md](./SESSION-REPLAY-SPEC.md)).
5. **업적·뱃지 (Phase 2)** — 게이미피케이션 (기획: [ACHIEVEMENTS.md](./ACHIEVEMENTS.md)).
6. **코드 진화 트래커 (Phase 2)** — 파일이 세션 동안 어떻게 변했는지.
7. **웹 + CLI** — 설치 없이 Vercel 데모로 확인 가능, 동시에 `npx memradar` 한 줄 실행(로컬 포트 3939, `--static` export) 지원.

---

## 시장 갭

| 갭 | 중요도 | Memradar 대응 |
|---|---|---|
| 재미있는 시각화·게이미피케이션 | 높음 | Code Report + 퍼스널리티 ✅ · 업적·리플레이 ⬜ (Phase 2) |
| 공유 가능한 보고서·이미지 | 높음 | Code Report PNG 캡처(html-to-image) ✅ |
| 세션 리플레이·타임라인 | 중간 | Phase 2 |
| 코드 진화 추적 | 중간 | Phase 2 |
| AI 기반 인사이트 | 낮음 | Phase 3 (BYOK) |

---

## 업데이트 주기

이 문서는 분기에 한 번 정도 수치(별 수·Provider 지원)를 재확인한다. 경쟁 제품을 언급할 때는 존중하는 톤을 유지하고, 약점 서술은 사실 기반으로만 쓴다.
