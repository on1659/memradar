# goal: dashboard-card-reorg

> **Status: IMPLEMENTED 2026-06-15** — shipped on branch `feat/eval-sharpness` across commits `bea0a9a` (reorg) and `73b71d7` (review-gate fixes), with the activity-card decomposition in `160c8f9`/`681a8fd`/`23a64a7`. Built through the project harness (Scout → Coder → Reviewer → independent Codex gate PASS), not via `/goal`. This is the **retroactive spec of record**: every Acceptance Criterion below was re-verified against the shipped code on 2026-06-15 (all checked `[x]` because verified, not aspirational). No gaps were found during verification, so no corrective code changes were required.
>
> Folds in `docs/goal/ai-role-count-label-overflow.md` (R5 below) per request — that standalone doc remains the detailed source of record for the label-overflow fix; this document consolidates it with the dashboard reorg it shipped alongside.

## One-line Goal

Restructure the memradar dashboard so every card holds exactly one piece of information: split the over-stuffed activity area into single-purpose cards, drop the per-card PNG export, add two new "AI usage" metric cards, reorder the analytics rows, and fix the AI-role count label overflow.

## Background / Motivation

The "Coding Rhythm" card (originally a W1 merge of 4 activity cards into 1) had grown to hold four distinct things at once — calendar heatmap, rhythm narrative, summary chips, and a weekday-distribution bar list. The user's guiding principle surfaced through iteration: **one card = one piece of information**, consistent with the dashboard's 1×1 / 2×1 grid-cell system. That principle plus a few follow-up requests (remove PNG export, compact the calendar, surface AI-usage metrics, reorder rows) drove this reorg. The AI-role count label fix (R5) shipped in the same session and is consolidated here.

All computation stays local (pure functions, no network, no LLM) per the CLAUDE.md hard constraint.

## In-scope

### R1 — Activity area: one-info-per-card decomposition

- Replace the single multi-purpose Coding Rhythm card with a 3-card activity row: **Activity Calendar**, **Weekday Distribution**, **Activity by Hour**.
- **Activity Calendar** (narrow, ~240–280px column): heatmap compacted to show roughly the **last 3 months** by default with horizontal **scroll + pointer-drag** for older data (fixed 13px cells, `scrollLeft` initialized to most-recent, legend pinned outside the scroll container). Carries the longest-streak / activity-density sub-stats and the local-vs-UTC date footnote.
- **Weekday Distribution**: the 7-row weekday bar list with a "most active weekday · {day} {share%}" caption (busiest day highlighted).
- **Activity by Hour**: the existing `HourChart` moved up from the analytics grid into the activity row as a single 1-col card (restoring the release-era single-column placement).
- The **Coding Rhythm insight card** (rhythm label + secondary "tendency" narrative) is **removed**; the now-dead label/secondary machinery is deleted from `codingRhythm.ts` (types, thresholds, `RHYTHM_FACET`, `selectSecondarySignal`, narrative functions). `buildCodingRhythm` keeps only the aggregate fields the calendar/weekday cards and the AI Collaboration Fingerprint card depend on.

### R2 — Remove per-card PNG export entirely

- Delete `src/lib/cardImageExport.ts` and remove all per-card PNG export wiring from `Dashboard.tsx` (`CardExportButton`, `handleCardExport`, `cardExportBusy`, `data-export-exclude` markers, `flushSync` and `Download` imports).
- The Wrapped share-slide PNG (`ShareSlide.tsx`, a separate feature) and the `html-to-image` package dependency are **retained**.

### R3 — Two new "AI usage" metric cards (analytics grid)

- **Model usage intensity** (`src/lib/modelIntensity.ts`): per-model average user-turns and average tokens ("which model do I use in long vs short sessions"), rendered as a per-model bar list. Token formula matches `getSessionTotalTokens` (input + output + cachedInput); guards for zero sessions / unknown model / top-N.
- **You vs AI authorship** (`src/lib/authorshipRatio.ts`): share of writing by role, measured as **per-role word count** (`stripMarkup` + `countWords` over user vs assistant messages), rendered as a 2-slice donut. Word count is used deliberately instead of input/output tokens — input tokens include cache reads and the user-message context estimation, which inflate the ratio to a meaningless ~99:1; word count reflects "who actually wrote more" (real data lands ~21:79).

### R4 — Analytics grid row order swap

- Top row: **자주 쓴 스킬 (skills) · 세션 길이 (session length) · 자주 쓴 단어 (words, span 2)**.
- Bottom row: **사용한 모델 (model) · 사용한 언어 (language) · 모델별 사용 강도 (model intensity) · 나 vs AI 글 비중 (authorship)**.
- Implemented by DOM reorder (so mobile stacking and focus order follow) plus grid-column assignment; responsive at 1024 (4-col) / 768 (matching shape) / mobile (single-column stack).

### R5 — AI-role count label overflow fix (folded from `ai-role-count-label-overflow.md`)

- In `InteractiveRoleDonutChart`, format the `count`-mode label as `Math.round(category.score).toLocaleString()` (+ `회` suffix in ko) instead of binding the raw weighted float (`8361.262…회`), and widen the label column to `w-16 whitespace-nowrap tabular-nums` so it never overflows the card edge.
- Full precision via thousands separator (not K/M compaction) so closely-clustered scores stay distinguishable. Bar width and `ratio`-mode `%` keep using the **unrounded** `category.score`.

## Out-of-scope

- Re-documenting the earlier W1–W4 "AI collaboration fingerprint" cards (covered by `docs/goal/collab-fingerprint-cards.md`).
- Any change to scoring/data models (`usageProfile.ts`, `parser.ts`, `types.ts`) — `types.ts` and `parser.ts` were not modified; the new metrics read existing fields only.
- Wrapped slides (fixed at 8), `ToolsSlide.tsx`, CLI surface, growth section.
- A combined multi-card share/export builder (the per-card export is removed, not replaced).

## Acceptance Criteria

- [x] Activity row is exactly 3 single-purpose cards: Activity Calendar, Weekday Distribution, Activity by Hour (no Coding Rhythm insight card).
- [x] Activity Calendar shows ~3 recent months in a narrow column and scrolls/drags horizontally to older data; the legend stays fixed (outside the scroll container); `.heatmap-cell` selector preserved.
- [x] All per-card PNG export is gone (`cardImageExport.ts` deleted; zero `CardExportButton` / `handleCardExport` / `data-export-exclude` references); `html-to-image` still imported by `ShareSlide.tsx`; Wrapped stays 8 slides.
- [x] Model usage intensity card renders per-model avg turns/tokens with zero-data guard; token formula equals `getSessionTotalTokens`.
- [x] You-vs-AI authorship uses per-role **word count** (not tokens); real data yields a meaningful ratio (≈21% / 79%), not ~99:1; fractions 0–1 in the data layer, `%` only in UI.
- [x] Analytics grid: top row = skills/session-length/words(span 2); bottom row = model/language/model-intensity/authorship — at 1024 and 768; mobile stacks in the same DOM order.
- [x] All three activity cards and both new cards render an empty state (Activity by Hour guards on a nonzero hourly bucket); no assertive-verdict copy anywhere (facts/figures only), ko + en.
- [x] R5: AI-role `count` label renders a rounded, thousands-separated integer that stays inside the card; bar length and `ratio` `%` still derive from the unrounded score; en locale omits `회`.
- [x] `CodingRhythm` retains only aggregate fields; `collabFingerprint.ts` (uses `hourBandShares.night`, `totalMessages`, `NIGHT_BAND_HOURS`) is unaffected.
- [x] `npm run test:harness` fully green (unit incl. `model-intensity` 6 + `authorship` 6; coding-rhythm label/secondary tests removed, aggregate 16 kept; e2e 16/16; PNG e2e cases removed).
- [x] Independent Codex review gate PASS over the combined diff; the 3 actionable findings (hour empty state, authorship comments, 768 layout) fixed, 2 (LineChart, eslint-disable) confirmed false positives.
- [x] `docs/` updated in the same change (ARCHITECTURE lib tree, DESIGN-GUIDE grid/PNG removal, goal AC notes); stop-docs-check hook passes.

## Related Files / Modules

| File | Role |
|------|------|
| `src/components/Dashboard.tsx` | Activity grid (3 cards), analytics grid (row swap + 2 new cards), `InteractiveRoleDonutChart` (R5 label), `ModelIntensityBars`; PNG export wiring removed |
| `src/components/Heatmap.tsx` | Fixed 13px cells, ~3-month default + scroll/drag, legend moved outside scroll container; `.heatmap-cell` preserved |
| `src/lib/modelIntensity.ts` | New — per-model avg turns/tokens (R3) |
| `src/lib/authorshipRatio.ts` | New — per-role word-count ratio (R3); `stripMarkup` + `countWords` |
| `src/lib/codingRhythm.ts` | Shrunk to aggregate-only (`buildCodingRhythm` signature unchanged); label/secondary machinery removed |
| `src/lib/cardImageExport.ts` | **Deleted** (R2) |
| `src/index.css` | Activity grid (240px+1fr+1fr) and analytics grid (row swap) layouts, responsive 1024/768/mobile |
| `tests/model-intensity.test.mts`, `tests/authorship-ratio.test.mts` | New unit tests |
| `tests/coding-rhythm.test.mts` | Label/secondary tests removed, aggregate tests kept |
| `tests/memradar.spec.ts` | PNG export e2e cases removed; heatmap-cell / 24-bar tests kept |
| `docs/goal/ai-role-count-label-overflow.md` | Standalone source of record for R5 |

## Must-Preserve

- Session data never leaves the machine — pure functions, no network/telemetry; new metrics read already-parsed fields only.
- Wrapped fixed at 8 slides; `ToolsSlide.tsx` not imported; `src/components/wrapped/` untouched; `ShareSlide` PNG + `html-to-image` dependency retained.
- `CodingRhythm` aggregate fields (`localDailyCounts`, `weekdayDistribution`, `longestStreak`, `densityRatio`, `activeDayCount`, `observedDayCount`, `hourBandShares`, `totalMessages`) and `buildCodingRhythm` signature — the AI Collaboration Fingerprint card injects `rhythm` and depends on `hourBandShares.night` / `totalMessages`.
- `types.ts` / `parser.ts` unchanged (display + lib-aggregation only); existing `Stats` consumers unaffected.
- Fractions stay 0–1 in the data layer; `%` conversion only in the UI (`fmtPct0`).
- No raw prompt text rendered — cards show numbers + dictionary words only.
- R5: bar-width / ratio math uses the unrounded `category.score`; `metricMode` union stays `'count' | 'ratio'`.
- Theme tokens only (`var(--color-*)`, `tabular-nums`), no inline hex (DESIGN-GUIDE §5.8); `.heatmap-cell` selector kept for e2e.

## Execution Notes

- This is a retroactive spec; the work is already shipped and verified. For any follow-up edits:
- Recommended model: **Claude Opus 4.8** for judgment-heavy items — the authorship metric definition (why word count beats tokens), the calendar 3-month/scroll behavior, and COMPLEX triage all needed model judgment. Mechanical items (PNG-removal cleanup, grid-column swap, R5 rounding/className) are fine on **Sonnet**.
- This document cannot enforce the model — the executing session's `/model` setting decides. If the session model is below the recommendation when a comparable judgment is in play, surface it to the user and confirm before proceeding.
- Triage was COMPLEX (multi-file: layout + new metrics + dead-code removal + docs + e2e changes); R5 alone was STANDARD.

## Open Questions

- None. Lesson candidates raised during the work (pending the user's decision on adding to `.claude/knowledge/lessons/`): (1) word-count vs token measures for "authorship" — input tokens are confounded by cache/context estimation; (2) `flushSync` add/remove flips the React-compiler `react-hooks/set-state-in-effect` rule, so its `eslint-disable` directive comes and goes; (3) `git add -A` can sweep an adjacent session's working-tree change (the R5 fix) into an unrelated commit — verify staged scope before committing; (4) the R5 carry-over: never bind a weighted-accumulator float directly to a fixed-width UI label.
