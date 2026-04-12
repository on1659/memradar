# Codex Handoff

## Current Snapshot

- Promptale is already beyond a concept-only MVP and has a working dashboard/session viewer flow.
- The strongest product hook is still "turn AI coding history into a story you want to revisit and share."
- Claude added roadmap, architecture, and feature spec docs under `docs/`.

## Product Direction Agreed In Thread

- Keep the roadmap broad if implementation cost is acceptable.
- Keep execution order narrow and opinionated.
- Treat `Promptale Wrapped` as the first "wow" feature.
- Treat `search` as the first retention feature that makes Promptale feel like a real archive tool.
- Keep `Session Replay` as a follow-up differentiator, not necessarily the first build after foundation work.

## Roadmap Update Applied By Codex

- Added `2.2 기록 검색` to `docs/ROADMAP.md`.
- Search scope for MVP:
  - Full-text search across sessions/messages
  - Filters for model, tool, project (`cwd`), and date
  - Result snippet/highlight
  - Click-through into session detail
- Explicitly not required for MVP search:
  - Vector search
  - Natural-language semantic retrieval
  - Complex query syntax

## Suggested Build Order

1. Stabilize current app quality:
   text/encoding cleanup, basic polish, lint/build hygiene.
2. Ship `Promptale Wrapped`.
3. Ship `기록 검색`.
4. Ship `세션 리플레이`.
5. Re-evaluate provider expansion and AI insight features after initial product signal.

## Current Notes

- `npm run build` passed during review.
- `npm run lint` was failing on `vite.config.ts` because of `any` usage.
- `src/App.tsx` and `vite.config.ts` already had local modifications before this handoff; do not overwrite them blindly.
