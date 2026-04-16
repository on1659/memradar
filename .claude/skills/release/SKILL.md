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

## Preflight (all must pass — run in parallel)

Run these Bash checks together in a single message:

1. `git rev-parse --abbrev-ref HEAD` — must be `master`. If not, STOP and tell the user.
2. `git status --porcelain` — must be empty. If dirty, STOP and list the dirty files; ask the user to commit/stash first. **Never auto-commit.**
3. `git fetch origin master && git rev-list --left-right --count HEAD...origin/master` — local must not be behind origin. If behind, STOP and ask user to pull.
4. `npm whoami` — must succeed. If it fails, STOP and tell the user to run `npm login` (this skill does not log in for them).
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

## Safety rules (hard)

- Never force-push.
- Never skip git hooks (`--no-verify` forbidden).
- Never run `git push` without `--follow-tags` in this flow — tag and commit must land together.
- Never run `npm unpublish` — if the user wants to revert, advise publishing a patch version instead (npm disallows unpublish after 72h anyway).
- If `npm publish` succeeds but `git push` fails, STOP and tell the user: the npm registry has the new version but GitHub doesn't. They must resolve (usually `git push origin master --follow-tags` after fixing the cause). Do not try to unpublish.
- If tests fail, STOP. Don't offer `--skip-tests` as an escape hatch unless the user explicitly asks.

## Rollback hints (only if the user asks)

- **Before `npm publish`** (bump committed + tagged locally but nothing pushed/published yet):
  `git tag -d v<new version> && git reset --hard HEAD~1`
- **After `npm publish`, before `git push`**: do NOT unpublish. Just retry the push.
- **After both succeed**: publish a fixed patch version; do not try to rewrite history.

## What this skill does NOT do

- Does not commit uncommitted working-tree changes (preflight stops on dirty tree).
- Does not create a GitHub Release object — only pushes the git tag. If the repo's GitHub Actions release workflow (`.github/workflows/release.yml`) is active with `NPM_TOKEN` set up, pushing the tag would cause a duplicate publish attempt. **Warn the user** before pushing if they have that workflow enabled and `NPM_TOKEN` is registered — in that case this skill is redundant and they should use either this local flow OR the workflow, not both.
- Does not run `npm login`.
- Does not modify changelogs or docs — user handles those in their own commits before invoking this skill.
