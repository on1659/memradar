# Harness

`promptale` now has a deterministic harness inspired by the stricter setup used in LAMDiceBot.

## Commands

- `npm run test:cli`
  Builds a standalone HTML artifact from fixture logs and verifies the bundle is embedded correctly.
- `npm run test:e2e`
  Runs Playwright smoke coverage against `vite preview`.
- `npm run test:harness`
  Runs lint, build, CLI smoke, and browser smoke in one pass.

## Fixture Model

- Browser tests inject parsed fixture sessions before app boot.
- CLI tests point `MEMRADAR_PROJECTS_DIR` at `tests/fixtures/logs`.
- `MEMRADAR_OUTPUT_HTML` lets the harness write to a disposable output path.

## Why This Is Stricter

- Tests no longer depend on the real `~/.claude/projects` directory.
- Browser coverage runs against an actual local server instead of `file://` only.
- CLI packaging and browser rendering now fail independently with clearer signals.

## Import Classification

Imported directly from the validated LAMDiceBot-style harness:

- deterministic fixture-driven tests
- one-shot `lint -> build -> cli smoke -> e2e` entrypoint
- browser smoke against a real preview server
- failure artifacts from Playwright
- CI-ready environment variables for the CLI

Partially imported and adapted for `promptale`:

- hook thinking became test design rather than shell guards
- mobile and UI checks became Playwright assertions instead of write-time warnings
- staged pipeline ideas were compressed into a single app-focused harness command

Intentionally not imported:

- project-specific security and fairness guards
- agent orchestration rules like Scout/Coder/Reviewer/QA pipelines
- `/build` and `/meeting` command frameworks
- Playwright MCP operational docs that assume a multiplayer game QA flow
