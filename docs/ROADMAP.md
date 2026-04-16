# Memradar Roadmap

> 당신의 AI 대화가 들려주는 이야기

## Vision

기존 AI 대화 뷰어는 대부분 **실용적·기능적** 도구. Memradar 는 **스토리텔링과 재미**로 차별화한다. 핵심 전략은 Spotify Wrapped 스타일의 "AI 코딩 연말결산"을 킬러 피처로 삼는 것.

상태 표기:
- ✅ 완료
- 🚧 진행 중
- ⬜ 예정

---

## Phase 1: Foundation

배포 가능하고 안정적인 오픈소스 프로젝트 만들기.

| # | 항목 | 설명 | 상태 |
|---|---|---|---|
| 1.1 | 정적 배포 | Vercel 배포 (memradar.vercel.app), OG 메타 | ✅ |
| 1.2 | 라우팅 | 해시 라우팅 (정적 배포 · `file://` 호환) | ✅ |
| 1.3 | 상태관리 | React 훅 기반 (규모 증가 시 Zustand·IndexedDB 도입 검토) | ✅ |
| 1.4 | Provider 플러그인 | Provider 인터페이스 + 자동 감지 (Claude Code / Codex) | ✅ |
| 1.5 | 견고성 | Error Boundary | ✅ |
| 1.5a | Web Worker 파싱 | 대용량 세션 파싱 분리 | ⬜ |
| 1.6 | i18n | 한/영 지원 + 로케일 자동 감지 | ✅ |
| 1.7 | 오픈소스 필수품 | LICENSE, README, 문서 정비 | ✅ |
| 1.8 | CLI 배포 | `npx memradar` | ✅ |
| 1.9 | 테스트 하네스 | lint + build + CLI smoke + Playwright E2E | ✅ |

---

## Phase 2: 킬러 피처

아무도 안 하는 "재미있는" 기능으로 차별화.

| # | 항목 | 설명 | 상태 |
|---|---|---|---|
| 2.1 | **Memradar Code Report** | Spotify Wrapped 스타일 8장 슬라이드 | ✅ (Intro / Prompts / Model / Hours / Tools / Personality / Usage / Share) |
| 2.1a | 공유 이미지 생성 | html-to-image 기반 PNG + Web Share API + 클립보드 복사 | ✅ |
| 2.1b | 코딩 성격 분석 | 3축(읽기/실행, 깊이/넓이, 마라톤/스프린트) 기반 8유형 | ✅ |
| 2.1c | 사용 카테고리 | AI 사용 패턴 8종 분류 | ✅ |
| 2.2 | 기록 검색 | 풀텍스트 + 모델·툴·프로젝트·날짜 필터 + 스니펫 하이라이트 | 🚧 (기본 검색 동작, 필터 일부 잔여) |
| 2.3 | 세션 리플레이 | 대화를 영상처럼 재생, 타임라인 스크러버 | ⬜ (기획: [SESSION-REPLAY-SPEC.md](./SESSION-REPLAY-SPEC.md)) |
| 2.4 | 코드 진화 트래커 | 파일이 세션 동안 어떻게 변했는지 diff 시각화 | ⬜ |
| 2.5 | 업적·뱃지 | Night Owl / Marathon / Token Whale 등 | ⬜ (기획: [ACHIEVEMENTS.md](./ACHIEVEMENTS.md)) |
| 2.6 | 향상된 시각화 | 비용 계산, 프로젝트별 분류, 복잡도 레이더 | 🚧 (토큰 비용 부분 구현) |
| 2.7 | 테마 시스템 | 배경 4종 × accent 5종 = 20 조합 | ✅ |

---

## Phase 3: 성장

사용자층 확대.

| # | 항목 | 설명 | 상태 |
|---|---|---|---|
| 3.1 | 멀티 Provider | Gemini CLI, Cursor, Copilot, Aider 등 | ⬜ |
| 3.2 | AI 인사이트 | BYOK(Bring Your Own Key) 기반 세션 요약·패턴 분석 | ⬜ |
| 3.3 | 공유 리포트 | 자체 포함 HTML 리포트 내보내기 | ⬜ |
| 3.4 | File System Access API | 드래그 없이 폴더 연결 (Chromium 계열) | ⬜ |

---

## 만들지 않을 것

- ❌ 데스크톱 앱 (CCHV 영역 — [COMPETITIVE-ANALYSIS.md](./COMPETITIVE-ANALYSIS.md) 참고)
- ❌ 백엔드·DB (클라이언트 사이드 유지)
- ❌ 유저 계정·인증
- ❌ 실시간 세션 모니터링 (Memradar 는 회고 도구지 디버거가 아님)
- ❌ 세션 로그를 서버에 업로드하는 모든 기능

## 문서 참조

- 기술 결정: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Wrapped 상세: [WRAPPED-SPEC.md](./WRAPPED-SPEC.md)
- 검색 상세: [SEARCH-SPEC.md](./SEARCH-SPEC.md)
- 경쟁 분석: [COMPETITIVE-ANALYSIS.md](./COMPETITIVE-ANALYSIS.md)
