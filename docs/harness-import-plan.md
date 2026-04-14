# Harness Import Plan

This is the import split used while adapting the validated LAMDiceBot harness ideas into `promptale`.

## 가져올 것

- deterministic fixtures
- single command harness entrypoint
- Playwright smoke tests against `vite preview`
- CLI smoke test with disposable output path
- GitHub Actions execution with Playwright artifact upload

## 부분 이식할 것

- hook-style quality gates
  In `promptale`, these are better expressed as tests and lint rules than shell write guards.
- mobile validation
  Keep the idea, but enforce it in Playwright viewport coverage rather than project-wide guard scripts.
- phased pipeline thinking
  Keep the checklist mindset, but collapse it into one repo-local harness because this project is smaller.

## 버릴 것

- socket security guards
- fairness guards tied to game-result randomness
- `/build` and `/meeting` command ecosystems
- multiplayer/browser-MCP QA flows specific to LAMDiceBot

## Applied Result

- local: `npm run test:harness`
- CI: `.github/workflows/harness.yml`
- docs: `docs/harness.md`
