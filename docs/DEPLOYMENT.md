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

CLI 엔트리는 `cli/index.mjs` (ESM). `package.json` 의 `bin.memradar = ./cli/index.mjs` 로 등록된다. 기본 동작은 세션 JSON 이 임베드된 단일 HTML 파일을 생성해 기본 브라우저로 여는 것이다. `--server` 플래그를 주면 로컬 HTTP 서버를 띄우고 `dist/` 정적 번들과 `/api/sessions`, `/api/session-content`, `/api/skills` 엔드포인트를 서빙한다. 스캔 대상은 `~/.claude/projects/` 및 (존재 시) `~/.codex/sessions/`.

### 플래그

| 플래그 | 동작 |
|---|---|
| `--version`, `-v` | 설치된 memradar 버전을 출력하고 종료 |
| `--static` | 서버를 띄우지 않고 세션 JSON 이 임베드된 단일 HTML 파일을 export (기본 동작과 동일 — 명시용) |
| `--server` | 로컬 HTTP 서버 모드로 실행 (`localhost:3939`) |
| `--host <addr>` | 서버 바인딩 인터페이스 지정 (기본 `127.0.0.1`, `0.0.0.0` 지정 시 LAN 노출) |
| `--no-update-check` | 시작 시 npm 최신 버전 확인 생략 |

### 환경 변수

| 변수 | 기본값 | 용도 |
|---|---|---|
| `MEMRADAR_PORT` | `3939` | 로컬 서버 포트 |
| `MEMRADAR_NO_OPEN` | (미설정) | `1` 로 설정 시 브라우저 자동 오픈 억제 |
| `MEMRADAR_OUTPUT_HTML` | `<os.tmpdir>/memradar.html` | `--static` 모드 HTML 출력 경로 |
| `MEMRADAR_PROJECTS_DIR` | `~/.claude/projects` | Claude 세션 스캔 루트 |
| `MEMRADAR_CODEX_DIR` | `~/.codex/sessions` | Codex 세션 스캔 루트 (선택) |
| `MEMRADAR_SKIP_UPDATE_CHECK` | (미설정) | `1` 로 설정 시 시작 시 npm 최신 버전 확인 생략 (`--no-update-check` 와 동일) |

---

## npm 배포

CLI(`memradar` 패키지)의 **실제 릴리스 경로는 로컬 `npm publish`** 다.

저장소에 `.github/workflows/release.yml`(`v*` 태그 푸시 → 하네스 → `npm publish --provenance --access public`)이 들어 있긴 하지만, **현재 비활성 상태**다 — 저장소 Actions 정책이 "소유자 actions만 허용"으로 잠겨 `actions/checkout` 등 표준 액션이 차단돼 checkout 단계부터 실패하고, `NPM_TOKEN` repo secret 도 미등록이다. 따라서 `v*` 태그를 푸시해도 CI 자동 publish 는 일어나지 않는다. (CI 복구는 Settings → Actions 정책 변경 + `NPM_TOKEN` secret 등록이 필요한 별도 작업.)

### 로컬 publish 절차 (권장)

릴리스는 `release` 스킬(`.claude/skills/release/SKILL.md`)이 프리플라이트·버전 bump·테스트·publish·태그 push 를 한 번에 처리한다. 핵심 흐름:

```bash
npm version patch          # 0.x.y → 0.x.(y+1)  (commit + tag 생성)
npm publish --access public
git push origin master --follow-tags   # commit + tag 동시 push
```

### npm 인증 (안전 패턴 — 토큰 평문 유출 방지)

`npm publish` 에는 npm 자동화 토큰이 필요하다. **토큰을 `.npmrc` 에 평문으로 쓰거나 명령에 인라인하면 안 된다** (과거 릴리스에서 토큰이 셸 명령으로 세션 로그에 평문 유출된 사고가 있었다). 대신:

1. `.npmrc`(이미 `.gitignore` 됨)에는 **보간 형식 한 줄만** 기록한다 (npm 10.9.4+ 가 `${VAR}` 보간 지원):

   ```
   //registry.npmjs.org/:_authToken=${NPM_TOKEN}
   ```

2. 실제 토큰은 **자기 터미널에서 환경변수로 직접 주입**한다 — `$env:NPM_TOKEN='...'`(PowerShell) / `export NPM_TOKEN=...`(bash). 토큰 값을 어떤 명령 인자로도 넘기지 않는다 (Claude 도구 호출에 토큰 미전달).

npm 발행 계정은 `radar92` 이며 2FA 가 걸려 있어 publish 권한을 가진 granular automation token 이 필요하다. 자세한 안전 절차·금지 명령은 `.claude/skills/release/SKILL.md` "## npm 인증 (안전 패턴)" 을 따른다.

---

## 운영상 주의

- 개인 실제 로그를 공개 GitHub 저장소에 올려서 사용하지 않는다.
- 초기 단계에 백엔드 업로드형으로 확장하지 않는다 — 현재 제품 철학과 어긋난다.
- 배포 도메인 설정·환경 변수는 Vercel 프로젝트 설정에서 관리한다.
