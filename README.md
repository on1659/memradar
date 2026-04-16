# Memradar

> 당신의 AI 대화가 들려주는 이야기

[![npm version](https://img.shields.io/npm/v/memradar.svg)](https://www.npmjs.com/package/memradar)
[![license](https://img.shields.io/npm/l/memradar.svg)](./LICENSE)
[![ci](https://github.com/on1659/memradar/actions/workflows/harness.yml/badge.svg)](https://github.com/on1659/memradar/actions/workflows/harness.yml)

Claude Code와 Codex 세션 로그를 로컬에서 시각화·회고하는 웹 도구. 한 줄이면 바로 대시보드가 열리고, 마지막엔 Spotify Wrapped 스타일의 **Code Report**로 자신의 코딩 스타일을 되돌아볼 수 있다.

- 세션 로그는 **브라우저 안에서만 파싱**된다. 서버 업로드, 계정, 로그인 모두 없음.
- 지원 로그: `~/.claude/projects/**/*.jsonl`, `~/.codex/sessions/**/*.jsonl`.
- 웹 URL: https://memradar.vercel.app

---

## Quick Start

```bash
npx memradar
```

로컬 세션 폴더를 자동으로 스캔하고 기본 브라우저로 대시보드가 열린다. 기기 밖으로 데이터가 나가지 않는다.

### 직접 파일 업로드

https://memradar.vercel.app 에서 `.jsonl` 파일이나 `~/.claude/projects/` 폴더를 드래그해도 된다.

---

## Features

- **활동 히트맵** — GitHub 스타일 일별 활동
- **시간대별 차트** — 언제 가장 활발히 코딩했는지 한눈에
- **워드 클라우드** — 자주 사용한 단어·키워드
- **세션 브라우저** — 대화 내역 탐색·검색
- **토큰·모델 통계** — 사용량·비용 추이
- **Code Report** — 8장 슬라이드 기반 AI 코딩 회고 (공유 이미지 생성)
- **코딩 성격 분석** — 3축(읽기/실행, 깊이/넓이, 마라톤/스프린트) 기반 8유형

---

## CLI

```bash
npx memradar
```

환경 변수:

| 변수 | 기본값 | 설명 |
|---|---|---|
| `MEMRADAR_PROJECTS_DIR` | `~/.claude/projects` | Claude 세션 루트 경로 |
| `MEMRADAR_CODEX_DIR` | `~/.codex/sessions` | Codex 세션 루트 경로 |
| `MEMRADAR_OUTPUT_HTML` | OS 임시 디렉터리 | 생성 HTML 저장 경로 |
| `MEMRADAR_NO_OPEN` | `0` | `1`로 설정 시 브라우저 자동 열기 비활성화 |

---

## 지원 Provider

| Provider | 자동 감지 경로 | 상태 |
|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` | ✅ |
| Codex | `~/.codex/sessions/**/*.jsonl` | ✅ |
| Gemini CLI / Cursor / Copilot / Aider | — | ⬜ (로드맵 Phase 3) |

---

## 개발

```bash
npm install
npm run dev
```

### 테스트

```bash
npm run test:harness
```

하네스는 다음 순서를 한 번에 실행한다: lint → 프로덕션 빌드 → CLI 결정론적 스모크 → `vite preview` 대상 Playwright 브라우저 스모크.

개별 실행:

```bash
npm run lint
npm run build
npm run test:cli
npm run test:e2e
```

---

## Tech Stack

React 19 · TypeScript · Vite 8 · Tailwind CSS v4 · Framer Motion · Lucide Icons · date-fns · html-to-image

번들 예산은 ~250KB gzipped. 자세한 아키텍처는 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) 참고.

---

## 문서

| 문서 | 내용 |
|---|---|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 기술 결정·디렉터리 구조·데이터 흐름 |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | Phase 1~3 개발 로드맵 |
| [docs/DESIGN-GUIDE.md](./docs/DESIGN-GUIDE.md) | 디자인 토큰·테마·컴포넌트 패턴 |
| [docs/UI-UX-PRINCIPLES.md](./docs/UI-UX-PRINCIPLES.md) | UI/UX 운영 원칙 |
| [docs/WRAPPED-SPEC.md](./docs/WRAPPED-SPEC.md) | Code Report 슬라이드 상세 기획 |
| [docs/SEARCH-SPEC.md](./docs/SEARCH-SPEC.md) | 검색 MVP 기획 |
| [docs/SESSION-REPLAY-SPEC.md](./docs/SESSION-REPLAY-SPEC.md) | 세션 리플레이 기획 (Phase 2) |
| [docs/ACHIEVEMENTS.md](./docs/ACHIEVEMENTS.md) | 업적·뱃지 시스템 기획 (Phase 2) |
| [docs/COMPETITIVE-ANALYSIS.md](./docs/COMPETITIVE-ANALYSIS.md) | 경쟁 제품 분석 |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) | 배포 가이드 |
| [docs/harness.md](./docs/harness.md) | 테스트 하네스 |

---

## 기여

이슈·PR 환영. 기여 전에 다음을 확인:

1. `npm run test:harness`가 통과하는지
2. 새 UI 변경은 [docs/DESIGN-GUIDE.md](./docs/DESIGN-GUIDE.md) 규칙을 따르는지
3. 새 Provider 추가는 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md#provider-인터페이스) Provider 인터페이스를 따르는지

버그 리포트 시 가능하면 Provider·OS·Node 버전을 함께 적어주면 재현이 빠르다.

---

## License

MIT. [LICENSE](./LICENSE) 참고.
