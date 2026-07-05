# goal: ai-role-count-label-overflow

> **Status: IMPLEMENTED 2026-06-15** — shipped in `src/components/Dashboard.tsx` (`InteractiveRoleDonutChart`) under a STANDARD triage cycle (Scout inline → Coder → Reviewer PASS). This document is the retroactive spec of record; the Acceptance Criteria below are checked because they are verified, not aspirational.

## One-line Goal

Stop the AI-role card ("코드 리포트") count label from overflowing the card edge by formatting the raw weighted score into a rounded, thousands-separated integer and giving its column enough room.

## Background / Motivation

The "AI role" donut/bar list auto-cycles each row's right-side label between two metric modes every 10 s: `count` and `ratio`. In `count` mode the label rendered `${category.score}회` directly. But `category.score` is **not an integer count** — it is a weighted accumulation (`textScore + toolBonus`) computed in `computeRawAnalysis` (`src/lib/usageProfile.ts`), so values look like `8361.262250820304`. That long floating-point string blew past the fixed-width (`w-12`, 48 px) label column and spilled outside the card's right border (the reported "UI 삐져나감" issue).

A first formatting attempt using the existing `formatTokens` helper (K/M compaction with `toFixed(0)`) fixed the width but introduced a correctness regression: with the real data, `8361` and `8218` both collapse to `"8K"`, and `1424 / 1394 / 1231 / 1063` all collapse to `"1K"` — distinct, ranked roles became visually identical. Because these scores cluster closely, even one-decimal compaction (`8.4K`) still collides (`1424` and `1394` → both `1.4K`). The chosen fix therefore keeps full precision via a thousands separator. (Quality-first: result quality > accuracy > convention > speed — `docs/.. CLAUDE.md`.)

## In-scope

- Round the displayed score and format with a locale thousands separator: `count` label becomes `${Math.round(category.score).toLocaleString()}회` (ko) / `Math.round(category.score).toLocaleString()` (en). Reuses the file's existing `.toLocaleString()` convention (`signal.n.toLocaleString()`, `stats.totalMessages.toLocaleString()`).
- Make the label column robust to digit count: widen `w-12` → `w-16` and add `whitespace-nowrap tabular-nums` so the label never wraps and digits stay column-aligned across the count↔ratio toggle.

## Out-of-scope

- Changing **which** metric is shown. The label still reflects `category.score` (not `sessionCount` / `matchedByCategory`), to keep the number consistent with the bar that is drawn from the same score.
- Any change to the bar-width or ratio math (`barPct`, `sharePct`, `total`, `maxScore`).
- The 10 s auto-toggle behaviour and the `dashboard-cycle-drop` entrance animation.
- Data-model / scoring changes (`usageProfile.ts`, `parser.ts`, `types.ts`) — this is a display-layer fix only.
- Any other dashboard card, Wrapped slide, or CLI surface.

## Acceptance Criteria

- [x] `count`-mode label renders a rounded, thousands-separated integer (`8,361회`), never a raw float (`8361.262250820304회`).
- [x] The label stays inside the card boundary for realistic score magnitudes; structurally, the row is flex with a `flex-1` bar and a `shrink-0` label column, so a longer label shrinks the bar instead of overflowing the card.
- [x] Distinct adjacent scores remain visually distinguishable (no `8K`/`1K` collisions) — full precision retained.
- [x] Bar length and `ratio`-mode `%` are unchanged: both still derive from the unrounded original `category.score`.
- [x] `ratio` mode (`${sharePct}%`), the 10 s auto-toggle, and the drop-in animation behave exactly as before.
- [x] English locale shows the number with no `회` suffix.
- [x] `tsc -b` passes; `tests/memradar.spec.ts` (E2E) does not assert on this label and remains green.

## Related Files / Modules

| File | Role |
|------|------|
| `src/components/Dashboard.tsx` | `InteractiveRoleDonutChart` (~L409–476): the `metricLabel` expression (~L427–430) and the label column `div` (~L462). `formatTokens` (~L105) reference; `ModelIntensityBars` (~L1020) is the sibling pattern that already rounds+formats its label. |
| `src/lib/usageProfile.ts` | `computeRawAnalysis` produces the weighted float `scores[cat.id]` surfaced as `UsageCategoryScore.score` (read-only context — not modified). |

## Must-Preserve

- Bar width / ratio computations use the **unrounded** `category.score` (`barPct`, `sharePct`, `total`, `maxScore`); rounding applies to the displayed label only, so bar ↔ number stay consistent.
- `metricMode` union (`'count' | 'ratio'`) — both branches handled, no third state introduced.
- `UsageCategoryScore` and all `types.ts` signatures unchanged (display-layer only).
- Session data never leaves the machine — no network calls, no new I/O (CLAUDE.md hard constraint).
- Theme/typography conventions (DESIGN-GUIDE) — `tabular-nums` for numeric alignment, no inline color.

## Execution Notes

- Recommended model: **Claude Fable 5 (or Opus 4.8)** for the one judgment item — choosing the number format, which required reasoning about value-collision across the real distribution rather than reaching for the first compaction helper. The mechanical parts (rounding call, className change) are fine on **Sonnet**.
- This document cannot enforce the model — the executing session's `/model` setting decides. If the session model is below the recommendation when a comparable formatting/precision judgment is in play, surface it to the user and confirm before proceeding.
- Triage: STANDARD (localized UI change in a single component). No COMPLEX trigger (no parser/types, slide-count, CLI, or package.json change).

## Open Questions

- None. (A lesson candidate was proposed by Coder and Reviewer: "never bind a weighted-accumulator float directly to a fixed-width UI label — round + `toLocaleString()` for display while keeping the original float for bar/ratio math." Pending the user's decision on adding it to `.claude/knowledge/lessons/`.)
