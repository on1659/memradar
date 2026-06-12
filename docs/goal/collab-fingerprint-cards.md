# goal: collab-fingerprint-cards

## One-line Goal

Replace the dashboard's two dead zones (4 overlapping activity cards, peak-token-day trivia card) with three lift-based "AI collaboration fingerprint" cards plus a shared receipts/PNG-export pattern, per the approved design doc.

## Background / Motivation

Source of truth: `docs/design/kim-feat-eval-sharpness-design-20260612-013324.md` (Status: APPROVED 2026-06-12, adversarial-reviewed). The user identified that the activity cards repeat the same "when did I work" answer and the peak-token-day card is dateline trivia. Approved direction: every new card shows deviation from the user's own baseline (lift) with falsifiable receipts (real numbers, `n=` denominators), so output differs per person — share-diversity is the point (anti-homogenization, see `docs/design/prelaunch-goaldoc.md` G3). All computation stays local (pure functions, no LLM, no network).

Work items W1–W4 below are sequential implementation units. Each W is expected to be a COMPLEX (W1–W3) or STANDARD~COMPLEX (W4) triage cycle under `.claude/rules/harness.md`.

## In-scope

### W1 — Coding Rhythm card (merge 4 activity cards into 1)

- Merge heatmap + streak + activity density + weekday pattern (currently 4 cards in `dashboard-activity-grid`) into one card: compact calendar (reuse heatmap base) + one-line rhythm narrative + receipts (weekday distribution, density, longest streak as collapsed/secondary rows).
- Rhythm label derived from the user's own time-distribution deviation (weekday lift, hour-band lift). Provisional dictionary of 6–8 labels; hedged tone only (Korean "~형으로 보여요" style, never assertive verdicts), ko/en copy.
- **Day boundary = local date.** Introduce `toLocalDayKey` for all new per-day aggregation (existing `dayKey` is UTC `toISOString().slice(0,10)`; KST users' 00–09h activity currently lands on the previous day). The replaced cards remove the old UTC surface; the 24h hourly bar already uses local `getHours()`. Month buckets (`toMonthKey`, UTC) stay untouched (growth section's concern); note the day/month basis difference in receipt tooltips.
- Hourly activity (24h bar) card is NOT merged — it stays as-is.
- Empty state: fewer than 7 active days → show calendar + numbers only, no rhythm label (threshold is a provisional named const).

### W2 — Story of the Day card (replace peak-token-day)

- Remove the existing max/min token-day card entirely, including its min/max toggle and pin interaction (min-token-day data is dropped, not even kept as a receipt).
- Pick the day with the highest **narrative score**, not the highest tokens. Combining structure is fixed (weights provisional): normalize each term to 0–1, weighted sum of ① token anomaly (day tokens / personal daily mean, capped), ② session density (session count + first-to-last message time span that day), ③ retry recovery (first-half vs second-half retry-rate drop within the day), ④ work variety (distinct skills + languages that day).
- Missing terms are excluded and remaining weights renormalized (e.g. 0 follow-ups that day → drop ③; Codex-only day → drop the skill-count half of ④, keep languages). Skill counts are `<command-name>`-based and Claude-only — follow the source-aware exclusion pattern of `buildGrowth` proxy C so Codex-heavy users are not systematically penalized.
- Minimum sample guards: days with < 10 user messages are not candidates; retry-recovery term only counts when that day has ≥ 10 follow-ups; receipts must print denominators ("28%→9% (n=32)").
- Output: date + pattern summary + click-through: scroll to session list with a date filter applied (one lightweight new state; reuse the existing search/filter pattern — exact wiring is Scout's call in the implementation cycle).
- Requires a new per-day aggregation builder (working name `buildDailyCollab`) — `GrowthStats.retryStats` is a whole-period single aggregate and cannot be reused for per-day stats. Promote `matchRetryMarker` (currently module-private in `src/parser.ts`) to an export. Reusable as-is: `RETRY_MARKERS`, `isStructured`, `stripMarkup`, `countWords`, `CLI_TRUNCATION_MARKER` handling.
- Empty state: fewer than 7 active days → "story collecting" empty state.

### W3 — AI Collaboration Fingerprint card (new identity card)

- New card in the top overview grid. NOT a single archetype label — show the top 2–3 lifts as a distribution ("patterns that stand out vs your baseline"), with an explicit "estimate" subtitle (Barnum-avoidance rule; see `.claude/knowledge/lessons/personality-eval.md` L-1).
- Boundary vs existing identity cards (state in code comments/copy review): personality card = "what kind of person (work style)", AI-role donut = "what you ask AI to do (topics)", fingerprint = "how you collaborate (interaction behavior)". Fingerprint uses interaction-behavior signals only.
- v1 signal candidates with explicit numerator/denominator (from the design doc's lift table): weekend focus (weekend vs weekday daily session mean), structured-prompt shift (last 30 days vs prior period, in %p), plan-request-after-correction (rate after retry markers vs overall rate), late-night share (22–02h local vs uniform expectation), long-session preference (21+ turn share vs personal median expectation).
- "Plan request" detection needs a NEW fixed marker dictionary (like `RETRY_MARKERS`; e.g. "계획", "plan", "어떻게 할지", "방향") — it does not exist in the codebase. If the dictionary's discrimination is poor, drop that signal; the card ships if ≥ 3 of the 5 signals are viable.
- Per-signal minimum sample: denominator n < 30 → exclude signal. Fewer than 2 viable signals → "fingerprint collecting" empty state. Receipts print `n=`.
- Baselines are personal-history only (other-period / overall-average comparisons). NO external or synthetic-corpus baselines in this goal (that belongs to prelaunch-goaldoc G3 / the future full-lift conversion).

### W4 — Receipts pattern + per-card PNG export

- Shared pattern for the three new cards: claim sentence with inline measured numbers (ratios always with `n=` denominator), detail numbers collapsed (receipts).
- Per-card single-PNG export button reusing the existing `html-to-image` path (`ShareSlide` `toPng`). Render through secret masking before capture (`maskSecrets` order per existing Dashboard pattern). Note: new cards display only aggregate numbers and dictionary words — never raw prompt text — so the masking surface stays zero; the masking pass on export is defense-in-depth.

## Execution Notes

- **Recommended model: Claude Fable 5** for W1–W3 — these are judgment-heavy COMPLEX cycles (baseline definitions, hedged-tone ko/en copy, missing-term renormalization) where model judgment quality directly shows in the output. W4 (receipts + PNG export, the most mechanical item) may run on Opus 4.8 if usage limits are a concern.
- This document cannot enforce the model — the executing session's `/model` setting decides. **If the session model is below Fable 5 when starting W1–W3, surface it to the user and confirm before proceeding.**
- Codex (gpt-5.x) is the review-gate model only (see Review Gates), never the implementation model — the project's guardrails (triage hooks, lessons, masking/tone invariants) live in the Claude Code harness and do not apply to Codex runs.

## Review Gates (per work item)

Each W runs the project's harness pipeline (triage → Scout → Coder → Reviewer → QA per `.claude/rules/harness.md`), **then an independent Codex review before the W is considered done**:

1. After the harness Reviewer/QA pass for a W, run `codex review` (or `codex exec` cold-read) on that W's diff — read-only sandbox, with the standard boundary preamble (do not read `.claude/`, `agents/`).
2. Blocker/major findings must be fixed and re-reviewed; minor findings may be recorded and deferred with a one-line rationale.
3. After W4, run one final Codex review over the whole feature diff (all four W's combined) as the closing gate.
4. Codex disagreements with harness decisions are surfaced to the user, not silently resolved (cross-model agreement is a recommendation, not a decision).

## Out-of-scope

- Full dashboard lift conversion (Approach B) — deferred until prelaunch-goaldoc G3 (classifier lift) lands and W1–W4 patterns are validated.
- Multi-card composition share builder (Approach C) — only per-card export ships.
- Outcome-proxy signals ("successful session" detection) — definition unresolved, explicitly excluded.
- Quoting raw user prompt text in any card (secret-masking surface expansion is forbidden).
- External/synthetic-corpus baselines.
- Any Wrapped slide change.
- CLI flags/API changes.

## Acceptance Criteria

- [ ] `dashboard-activity-grid`'s 4 cards (heatmap, streak, density, weekday) are replaced by one Coding Rhythm card; hourly 24h bar card unchanged.
- [ ] Max/min token-day card and its toggle/pin interaction are gone; Story of the Day card renders in that slot with date + summary + working session-list jump (date filter applied).
- [ ] Fingerprint card shows 2–3 lift statements with `n=` receipts and an estimate-disclaimer subtitle; zero assertive-verdict copy across all new cards (manual copy review, ko + en).
- [ ] All new per-day aggregation uses local-date keys (`toLocalDayKey`); a unit test covers the KST late-night boundary case (00–09h local lands on the local date, not the UTC previous day).
- [ ] Divergence test: two different fixture datasets (synthetic personas) produce visibly different rhythm labels, story days, and fingerprint top-lifts (anti-homogenization regression, automated with fixtures under `tests/`).
- [ ] Codex-only fixture: no card collapses to zero/garbage (source-aware exclusions verified).
- [ ] Minimum-sample guards: low-data fixtures hit each empty state ("rhythm label hidden", "story collecting", "fingerprint collecting").
- [ ] All thresholds/weights are named consts annotated as provisional (`// 잠정값` convention per `docs/AI-ROLE-SCORING-REDESIGN.md` §2).
- [ ] Per-card PNG export works for the three new cards; export path applies secret masking before render.
- [ ] No network calls, no `@anthropic-ai/sdk` import; all new logic is pure functions under `src/lib/` or `src/parser.ts` following existing patterns.
- [ ] Existing `Stats` field signatures unchanged (additive only); `src/components/wrapped/` untouched; slide count stays 8.
- [ ] `npm run test:harness` fully green, including new unit tests for `toLocalDayKey`, narrative score (combination + renormalization + guards), fingerprint lifts, and plan-request marker matching.
- [ ] Codex review gate passed for each W's diff and for the final combined diff (see Review Gates); zero unresolved blocker/major findings, deferred minors recorded with rationale.
- [ ] `docs/` updated in the same change (ARCHITECTURE tree, design doc status note) — stop-docs-check hook passes.

## Related Files / Modules

| File | Role |
|------|------|
| `docs/design/kim-feat-eval-sharpness-design-20260612-013324.md` | Approved design — source of truth for card specs, lift table, policies |
| `src/components/Dashboard.tsx` | Card grids to modify: activity grid (~L1534–1592), token-day card (~L1115), overview grid (~L1230) |
| `src/parser.ts` | `dayKey` (UTC, ~L414), `RETRY_MARKERS` (L268), `matchRetryMarker` (L277, promote to export), `stripMarkup`/`isStructured`/`countWords`, new `toLocalDayKey` + `buildDailyCollab` |
| `src/types.ts` | Additive types for per-day stats and fingerprint results (`GrowthStats` precedent) |
| `src/lib/` | New pure-function modules (rhythm label, narrative score, fingerprint lifts, plan-request markers) — `usageProfile.ts`/`promptCoaching.ts` patterns |
| `src/lib/secretMask.ts` | Masking before PNG render |
| `src/components/wrapped/slides/ShareSlide.tsx` | `html-to-image` `toPng` reference for per-card export |
| `src/index.css` | Grid class changes for merged/added cards |
| `tests/` | New `.test.mts` files per the `node:assert/strict` mini-runner pattern; persona fixtures for divergence test |
| `cli/index.mjs` | Read-only reference: 4000-char cap marker (`CLI_TRUNCATION_MARKER` drift guard already exists) |

## Must-Preserve

- Session data never leaves the machine — no network calls, no telemetry, analysis is local pure functions only (CLAUDE.md hard constraint).
- Wrapped is fixed at 8 slides; `ToolsSlide.tsx` must not be imported.
- Existing `Stats`/`GrowthStats` field signatures (additive changes only); consumers: Dashboard, WrappedView, PersonalityView.
- CLI contract: port 3939, existing flags, `/api/light-sessions` / `/api/session-content` / `/api/skills` endpoints.
- Parser invariants: jsonl line streaming, `isMeta`/`isSidechain`/`file-history-snapshot` skips, consecutive-role merge, token estimation logic.
- Fractions stay 0–1 in data layer; %-conversion only at UI (lessons `_common.md` L-5).
- Raw prompt text never rendered in new cards (only aggregate numbers + fixed dictionary words); `maskSecrets(cleanClaudeText(...))` order on any text surface.
- Theme tokens only (`var(--color-*)`), no inline hex (DESIGN-GUIDE §5.8); SVG charts follow `vectorEffect="non-scaling-stroke"` + HTML-overlay-dots pattern (lessons `_common.md` L-7).
- UI smoke testing of data-dependent cards uses `node cli/index.mjs --server`, not `npm run dev` (lessons `qa-browser.md` L-2).

## Open Questions

- Rhythm/fingerprint label dictionary wording (ko/en) — settle in copy review during W1/W3.
- Narrative-score weight values — provisional consts first, calibrate on real data after W2 lands.
- Receipts placement for demoted numbers (in-card collapse vs tooltip) — Scout's recommendation in W1.
- Plan-request marker dictionary discrimination — if weak in W3, ship with the signal dropped (card needs ≥ 3 viable signals).
