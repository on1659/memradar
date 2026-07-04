# goal: coaching-threshold-live-calibration

## One-line Goal
Make the coaching/growth metrics the user actually sees (live dashboard) and the metrics used to tune thresholds (diagnostic script) agree, so length-dependent thresholds are calibrated against the real user-facing values instead of a divergent full-text pipeline.

## Background / Motivation
QA of `coaching-strengths-detail` (2026-07-04) surfaced a structural divergence, now recorded as `lessons/parser.md` L-005:

- **Diagnostic path** — `scripts/analyze-coaching.mts` parses full message text via `src/parser.ts` → 2026-06 `avgWords ≈ 136`.
- **Live path** — `cli/index.mjs` truncates each message to 4000 chars (`applyTextCap` / `buildLightCache(4000)`) before the browser runs `buildGrowth` → same month `avgWords ≈ 124`.

Length-dependent metrics (`avgWords`, `structured`, skill-curve `score`, and therefore the `long-unstructured` / `short-prompts` / `improving` firings) differ between the two paths. `retryRate` and the retry markers are unaffected (matched on the first-30-char head, which truncation doesn't reach). The coaching thresholds fixed in `fix-coaching-accuracy` (e.g. `LONG_PROMPT_MIN_AVG_WORDS`, the skill-curve normalizers) were tuned on the **diagnostic** numbers, so at a threshold boundary a real user could see a different fire/no-fire result than the calibration predicted.

This is a pre-existing dual-pipeline property (the 4000-char cap predates coaching work — see `lessons/parser.md` L-003), not a regression, but it undermines the "calibrated against real data" claim.

## In-scope (pending the Open Questions decision)
- Make the diagnostic and live paths produce the same length-dependent growth metrics, by whichever direction the user chooses (see Open Questions):
  - **Option A** — give `analyze-coaching.mts` (and any calibration script) an opt-in that applies the same 4000-char cap the server uses, so tuning happens on the user-facing numbers. Cheapest, no user-visible change; the diagnostic becomes "what the user sees."
  - **Option B** — raise or remove the server cap for the growth aggregation specifically (keep it for payload/display), so the live dashboard counts full text. Changes user-visible numbers; must weigh payload/perf cost of un-capped aggregation.
  - **Option C** — keep both paths but re-tune thresholds against the live (capped) path and document that the diagnostic over-reports by the cap delta.
- Whichever path: re-verify the `fix-coaching-accuracy` thresholds against the chosen source of truth and adjust if a boundary flips; update `lessons/parser.md` L-005's "회피" with the resolved approach.
- Add a guard/annotation so the divergence can't silently reappear (e.g. the diagnostic prints both capped and uncapped `avgWords`, or an assert that the two agree when the cap is applied).

## Out-of-scope
- Changing the retry-marker logic or any head-based metric (truncation-invariant).
- Coaching rule set / copy / UI (done in the prior two goals).
- The 4000-char cap's role in *display* (session detail view) — only its effect on *aggregation* is in question.

## Acceptance Criteria
- [ ] Diagnostic and live paths report the same `avgWords`/`structured`/`score` for the same month (within rounding), OR the diagnostic explicitly prints both values with the delta labeled.
- [ ] Coaching length-thresholds are re-verified against the chosen source-of-truth path; any boundary flip is resolved and noted.
- [ ] A guard prevents silent re-divergence (assert or dual-print).
- [ ] Full test harness passes; no session-derived text committed.
- [ ] `lessons/parser.md` L-005 회피 updated with the decision.

## Related Files / Modules
| File | Role |
|------|------|
| `cli/index.mjs` | `applyTextCap` / `buildLightCache(4000)` — the cap source |
| `scripts/analyze-coaching.mts` | diagnostic path; would gain cap option / dual-print |
| `src/parser.ts` | `buildGrowth`, `CLI_TRUNCATION_MARKER` |
| `src/lib/promptCoaching.ts` | length thresholds under re-verification |
| `docs/GROWTH-SECTION-SPEC.md` | record the resolved pipeline definition |
| `lessons/parser.md` | L-003 (cap marker), L-005 (this divergence) |

## Must-Preserve
- 세션 데이터 외부 전송 금지; local-only analysis.
- Retry/head-based metrics unchanged.
- The cap's payload/display purpose (don't remove it wholesale without accounting for why it exists).
- Drift guards in `analyze-coaching.mts` remain and pass.

## Execution Notes
- Recommended model: strongest current Claude model (2026-07: Claude Fable 5) for the judgment-heavy call — which path is the source of truth, and whether any threshold boundary flip changes user-facing advice. Mechanical parts (adding a cap option, dual-print) are fine on a cheaper model.
- This document cannot enforce the model — the executing session's `/model` setting decides. If below the recommendation, surface and confirm before the judgment-heavy step.

## Open Questions
- **Which path is the source of truth?** A (tune on capped/live), B (un-cap aggregation so live shows full text), or C (re-tune on live + document delta). This is a product+perf judgment (does the user want word-count metrics to reflect full prompts or the capped view?) and should be decided with the user before implementation. This goal stays a spec until then.
