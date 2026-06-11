---
name: release
description: Release a new version of memradar to npm and GitHub in one flow — bumps package.json, runs the full test harness, publishes to npm, then pushes commit + tag to GitHub. Use when the user says "릴리즈", "릴리스", "배포", "새 버전", "publish", "release", or similar in the memradar repo.
---

# memradar Release

This skill releases a new version of `memradar` to npm **and** pushes the version commit + tag to GitHub, in one flow. It is scoped to this repository (`on1659/memradar`).

## Arguments

The skill may receive an argument string. Parse these tokens (any order, all optional):

- Bump level: `patch` | `minor` | `major` | an explicit semver like `0.2.0`
- Flags: `--skip-tests` (skips `npm run test:harness` — use only if tests are already known green)
- Anything else: treat as the release description (one-line commit message suffix)

If bump level is missing, **ask the user** via `AskUserQuestion` with options `patch / minor / major`. Also ask for a one-line description if it isn't in the args. Never guess either.

## npm 인증 (안전 패턴 — 토큰이 로그에 안 남게)

이 레포의 실제 릴리스 경로는 **로컬 `npm publish`** 다 (GitHub Actions `release.yml`은 Actions 정책 차단으로 실패 — `.github/workflows/release.yml` 참고). 로컬 publish에는 npm 자동화 토큰이 필요한데, **과거 릴리스에서 토큰을 `.npmrc`에 평문으로 쓰거나 명령에 인라인해 세션 로그에 평문 유출된 사고**가 있었다. 그래서 인증은 아래 패턴만 쓴다.

**`.npmrc` (리터럴 토큰 미기록):**

`.npmrc`(이미 `.gitignore`됨)에는 토큰 값 대신 환경변수 보간만 적는다. npm 10.9.4+ 가 `${VAR}` 보간을 지원한다.

```
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

이 한 줄이면 충분하다. **실제 토큰 문자열(`npm_...`)을 `.npmrc`에 절대 쓰지 않는다.**

**토큰 주입은 사용자가 자기 터미널에서 직접 (out-of-band):**

토큰은 **사용자만** 자기 셸 환경변수로 주입한다. release 스킬을 실행하기 전에 사용자가 직접:

- PowerShell: `$env:NPM_TOKEN = '<토큰>'`
- bash/zsh: `export NPM_TOKEN=<토큰>`

**Claude 도구 호출(`Bash`/`PowerShell`)로 토큰 값을 절대 전달하지 않는다.** 토큰은 사용자 셸에만 존재하고, 스킬은 그 환경변수가 `npm`에 의해 `${NPM_TOKEN}`으로 읽히게만 한다. 도구 호출이 캡처되는 세션 로그에는 토큰 값이 한 글자도 들어가지 않는다.

**금지 명령 (절대 실행 금지 — Safety rules와 동급):**

- `echo //registry.npmjs.org/:_authToken=npm_... >> .npmrc` 또는 어떤 형태로든 토큰 **값**을 `.npmrc`에 쓰는 명령 — 토큰이 도구 호출 인자로 로그에 박힌다.
- `npm config set //registry.npmjs.org/:_authToken=npm_...` — 동일한 이유로 금지.
- `npm publish --//registry.npmjs.org/:_authToken=npm_...` (또는 `--registry`/`--auth-token` 인라인) — publish 명령에 토큰을 붙이지 않는다.
- `echo $NPM_TOKEN` / `echo $env:NPM_TOKEN` / `cat .npmrc` (또는 `Get-Content .npmrc`) — 토큰 **값**을 stdout으로 출력하는 명령. 존재 확인은 값 노출 없이 boolean으로만 (아래 프리플라이트 참고).

## Preflight (all must pass — run in parallel)

Run these Bash checks together in a single message:

1. `git rev-parse --abbrev-ref HEAD` — must be `master`. If not, STOP and tell the user.
2. `git status --porcelain` — must be empty. If dirty, STOP and list the dirty files; ask the user to commit/stash first. **Never auto-commit.**
3. `git fetch origin master && git rev-list --left-right --count HEAD...origin/master` — local must not be behind origin. If behind, STOP and ask user to pull.
4. **npm 인증 확인** (값을 절대 출력하지 않는다 — "## npm 인증" 패턴):
   - `.npmrc`가 `${NPM_TOKEN}` 보간 형식인지 존재 여부만 확인. 예(boolean만, 토큰 값 미출력): `node -e "const fs=require('fs');const p=require('os').homedir()+'/.npmrc';process.stdout.write(String(fs.existsSync(p)&&/\\$\\{NPM_TOKEN\\}/.test(fs.readFileSync(p,'utf8'))))"` → `true`여야 함. (레포 로컬 `./.npmrc`를 쓰는 구성이면 그 경로로 확인.) **`.npmrc` 내용 전체를 `cat`/`Get-Content`로 찍지 않는다.**
   - `NPM_TOKEN` 환경변수가 설정됐는지 **설정 여부 boolean만** 확인. 예: `node -e "process.stdout.write(String(Boolean(process.env.NPM_TOKEN)))"` → `true`여야 함. **`echo $NPM_TOKEN`처럼 값 자체를 출력하지 않는다.**
   - 위 둘이 true면 `npm whoami` 로 인증 자체를 확인(이건 토큰 값을 노출하지 않고 계정명만 반환 — `radar92`여야 함). 셋 중 하나라도 실패하면 STOP하고, 사용자에게 "## npm 인증 (안전 패턴)" 절차대로 `.npmrc`에 `${NPM_TOKEN}` 한 줄을 두고 **본인 터미널에서** `NPM_TOKEN`을 export하도록 안내한다 (이 스킬은 대신 로그인/토큰 주입하지 않는다).
5. `git remote get-url origin` — must contain `on1659/memradar`. If not, STOP (wrong repo).
6. `node -p "require('./package.json').version"` — read current version for the confirmation prompt.

If any check fails, report concisely and stop. Do not attempt to auto-remediate.

## Confirmation

Before making any changes, show the user:
```
Current:     <current version>
Target:      <new version>  (<bump level>)
Description: <description>
Branch:      master @ <short sha>
npm user:    <whoami>
Tests:       <run | skip>
```

Ask for explicit approval via `AskUserQuestion` (options: `Proceed` / `Cancel`). Do not proceed on ambiguity.

## Flow (stop immediately on any failure)

1. **Tests** (unless `--skip-tests`):
   `npm run test:harness`
   — this is lint + build + CLI smoke + Playwright e2e. Takes a few minutes.

2. **Version bump + commit + tag** (atomic, via npm):
   `npm version <level> -m "%s — <description>"`
   — creates commit `0.2.0 — <description>` and annotated tag `v0.2.0`, matching existing commit style (see `git log`).
   — If an explicit semver was passed instead of a level, use `npm version <version> -m "%s — <description>"`.

3. **Publish to npm**:
   `npm publish --access public`
   — `npm version` already ran the build via tests or we rely on the publish script. If `files: ["dist","cli"]` requires `dist/` present, ensure `npm run build` has run. When `--skip-tests` is used, run `npm run build` explicitly before publish.

4. **Push to GitHub** (commit + tag together):
   `git push origin master --follow-tags`

## Post-verify (run in parallel)

- `npm view memradar version` — must equal the new version (npm registry propagation is usually instant but can take ~30s).
- Print these URLs for the user:
  - `https://www.npmjs.com/package/memradar/v/<new version>`
  - `https://github.com/on1659/memradar/releases/tag/v<new version>` (note: a GitHub Release object is not created automatically by this flow — only the git tag. Mention this.)
- Suggest `npx memradar@<new version>` for smoke verification.

- **누출 자체검증 (필수)**: 이번 release를 진행한 **현재 세션 로그를 시크릿 스캐너로 스캔**해 토큰이 평문으로 남지 않았는지 확인한다. `npm run scan:secrets` (스크립트: `scripts/scan-secrets.mts` — G2 산출물, 마스킹 단일 소스 `cli/lib/secretMask.mjs` 재사용)를 돌려 `npm-token` 으로 분류된 **real** 건수가 **0**인지 확인한다. (스캐너는 읽기 전용·네트워크 I/O 0·리포트에 원문 미기록.) **real이 1건이라도 검출되면 즉시 사용자에게 경고**하고: 해당 토큰을 npmjs.com에서 폐기(revoke)하고 새 토큰을 "## npm 인증 (안전 패턴)" 절차로 재설정하도록 안내한다 (유출된 토큰은 유효한 한 위험). `scripts/scan-secrets.mts`가 아직 없으면(G2 미완) 그 사실을 보고하고, 위 "## npm 인증" 패턴을 따랐으니 이번 세션 로그에 토큰이 안 들어갔음을 근거로 통과 처리한다.

## Safety rules (hard)

- Never force-push.
- Never skip git hooks (`--no-verify` forbidden).
- Never run `git push` without `--follow-tags` in this flow — tag and commit must land together.
- Never run `npm unpublish` — if the user wants to revert, advise publishing a patch version instead (npm disallows unpublish after 72h anyway).
- If `npm publish` succeeds but `git push` fails, STOP and tell the user: the npm registry has the new version but GitHub doesn't. They must resolve (usually `git push origin master --follow-tags` after fixing the cause). Do not try to unpublish.
- If tests fail, STOP. Don't offer `--skip-tests` as an escape hatch unless the user explicitly asks.
- **npm 토큰을 도구 호출에 절대 넣지 않는다.** `.npmrc`에 토큰 값을 쓰는 명령(`echo ... >> .npmrc`, `npm config set ...:_authToken=...`), publish에 토큰을 인라인하는 명령, 토큰 값을 stdout으로 찍는 명령(`echo $NPM_TOKEN`, `cat .npmrc`)은 전부 금지. 인증은 "## npm 인증 (안전 패턴)"의 `${NPM_TOKEN}` + 사용자 셸 주입만 쓴다. (과거 평문 유출 사고의 직접 원인.)

## Rollback hints (only if the user asks)

- **Before `npm publish`** (bump committed + tagged locally but nothing pushed/published yet):
  `git tag -d v<new version> && git reset --hard HEAD~1`
- **After `npm publish`, before `git push`**: do NOT unpublish. Just retry the push.
- **After both succeed**: publish a fixed patch version; do not try to rewrite history.

## What this skill does NOT do

- Does not commit uncommitted working-tree changes (preflight stops on dirty tree).
- Does not create a GitHub Release object — only pushes the git tag. The repo's GitHub Actions release workflow (`.github/workflows/release.yml`) is **currently inactive**: Actions 정책이 "on1659 소유 actions만 허용"으로 잠겨 `actions/checkout` 등 표준 액션이 차단돼 checkout 단계부터 실패하고, `NPM_TOKEN` repo secret도 미등록 상태다. 따라서 태그를 push해도 CI 자동 publish는 일어나지 않는다(이 로컬 flow가 실제 릴리스 경로). **단** 사용자가 나중에 Actions 정책을 풀고 `NPM_TOKEN` secret을 등록하면, 태그 push가 중복 publish를 유발할 수 있으니 그때는 이 로컬 flow OR 워크플로 중 하나만 쓰도록 경고할 것.
- Does not run `npm login`.
- Does not modify changelogs or docs — user handles those in their own commits before invoking this skill.
