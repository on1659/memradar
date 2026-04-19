# Deployment Guide

Memradar (v0.2.12) 배포 레퍼런스. 배포 모델은 이중 구조다.

1. **주 배포 (Primary)** — `npx memradar` 로컬 러너. 사용자의 PC 에서 직접 `~/.claude/projects/` (및 선택적으로 `~/.codex/sessions/`) 를 스캔한다.
2. **보조 배포 (Secondary)** — Vercel 정적 사이트 (예: memradar.vercel.app). URL 공유·소개용. 사용자는 브라우저에서 로컬 `.jsonl` 파일을 직접 불러오거나, 정적 HTML export 를 공유해 사용한다.

어느 경우에도 세션 로그는 서버로 업로드되지 않는다.

운영 URL: https://memradar.vercel.app

---

## 배포 방식 비교

| 방식 | 설치 | 보안 부담 | 현재 적합도 |
|---|---|---|---|
| **정적 웹 (Vercel 등)** | 없음 | 낮음 | ⭐ 매우 높음 (기본안) |
| 정적 웹 + File System Access API | 없음 | 낮음 | 높음 (차기 UX 개선) |
| GitHub raw URL 로드 | 없음 | 중간~높음 | 낮음 (샘플 데모 한정) |
| 백엔드 업로드형 | 높음 | 높음 | 낮음 (제품 방향과 불일치) |
| 데스크톱 앱 (Tauri/Electron) | 있음 | 중간 | 중간 (필요 시 재평가) |

**기본안**: Vercel 정적 배포. 그 외 옵션은 목적이 명확할 때만 검토한다.

---

## Vercel 배포 절차

Memradar 저장소에는 이미 `vercel.json` 과 Vercel 프리셋이 세팅돼 있다.

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

1. GitHub 저장소에 푸시
2. Vercel 에서 저장소 Import
3. Framework preset 이 `Vite` 로 감지되는지 확인
4. Build command: `npm run build`
5. Output directory: `dist`
6. 배포 완료 → URL 공유

---

## 배포 시나리오

### A. 오픈소스 공개 (기본)

1. GitHub 공개 저장소에 코드 푸시
2. Vercel 자동 배포
3. 사용자에게 URL 공유
4. 사용자는 `npx memradar` 또는 직접 파일 업로드로 접근

### B. 정적 HTML Export 공유

`npx memradar --static` 을 실행하면 세션 JSON 이 임베드된 단일 self-contained HTML 이 생성된다. 기본 출력 경로는 OS 임시 디렉터리의 `memradar.html` 이며, `MEMRADAR_OUTPUT_HTML` 환경 변수로 경로를 지정할 수 있다. 별도 서버 없이 파일 하나만 주고받으면 되므로 공유·아카이브 용도에 유용하다. 단, **실제 개인 로그가 그대로 HTML 에 포함**되므로 공개 공유 전 내용을 반드시 검토한다.

### C. File System Access API 기반 개선

정적 배포를 유지하면서 "폴더 연결" 버튼을 추가하는 차기 UX 개선. 사용자가 한 번 권한을 허용하면 재접속 시 브라우저가 폴더 핸들을 기억해 자동 로드한다. Chromium 계열에서 우선 지원.

---

## 사용자 안내 문구 예시

배포된 페이지 또는 README 에서 사용할 수 있는 사용자 안내:

```
Memradar 는 브라우저에서 AI 코딩 세션 로그를 분석합니다.
로그는 서버로 업로드되지 않으며, 여러분의 PC 에서 직접 불러와 브라우저 안에서 처리됩니다.

로그 폴더 기본 경로:
  macOS / Linux: ~/.claude/projects/
  Windows:       %USERPROFILE%\.claude\projects\

이 폴더의 .jsonl 파일을 선택하거나 드래그해 시작하세요.
또는 터미널에서 `npx memradar` 한 줄로 바로 실행할 수 있습니다.
```

---

## CLI 레퍼런스 (`npx memradar`)

CLI 엔트리는 `cli/index.mjs` (ESM). `package.json` 의 `bin.memradar = ./cli/index.mjs` 로 등록된다. 기본 동작은 로컬 HTTP 서버를 띄우고 브라우저를 자동으로 연 뒤 `dist/` 정적 번들과 `/api/sessions`, `/api/session-content`, `/api/skills` 엔드포인트를 서빙한다. 스캔 대상은 `~/.claude/projects/` 및 (존재 시) `~/.codex/sessions/`.

### 플래그

| 플래그 | 동작 |
|---|---|
| `--version`, `-v` | 설치된 memradar 버전을 출력하고 종료 |
| `--static` | 서버를 띄우지 않고 세션 JSON 이 임베드된 단일 HTML 파일을 export |

### 환경 변수

| 변수 | 기본값 | 용도 |
|---|---|---|
| `MEMRADAR_PORT` | `3939` | 로컬 서버 포트 |
| `MEMRADAR_NO_OPEN` | (미설정) | `1` 로 설정 시 브라우저 자동 오픈 억제 |
| `MEMRADAR_OUTPUT_HTML` | `<os.tmpdir>/memradar.html` | `--static` 모드 HTML 출력 경로 |
| `MEMRADAR_PROJECTS_DIR` | `~/.claude/projects` | Claude 세션 스캔 루트 |
| `MEMRADAR_CODEX_DIR` | `~/.codex/sessions` | Codex 세션 스캔 루트 (선택) |

---

## npm 배포

CLI(`memradar` 패키지)는 GitHub Actions 의 `release.yml` 워크플로가 담당한다. `v*` 태그 푸시 → 하네스 통과 → `npm publish --provenance --access public` 흐름으로 자동화돼 있다.

수동 배포가 필요한 경우:

```bash
npm version patch          # 0.1.x → 0.1.(x+1)
git push --follow-tags
```

태그가 푸시되면 CI 가 자동으로 테스트 후 npm 에 공개한다.

---

## 운영상 주의

- 개인 실제 로그를 공개 GitHub 저장소에 올려서 사용하지 않는다.
- 초기 단계에 백엔드 업로드형으로 확장하지 않는다 — 현재 제품 철학과 어긋난다.
- 배포 도메인 설정·환경 변수는 Vercel 프로젝트 설정에서 관리한다.
