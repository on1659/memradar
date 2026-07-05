# goal: precision-quiz-fingerprint-signals

## One-line Goal

Promote the persona quiz retake into a **precision diagnosis** that accumulates answers across runs, and add **four non-time behavioral signals** to the AI Collaboration Fingerprint card.

## Background / Motivation

- The post-calibration button currently reads "다시 진단" (retake) and each run **overwrites** the previous answers with a fresh 9-question quiz (new random seed). The user expects a "정밀 진단" (precision diagnosis): additional questions should **sharpen** the calibration, not reset it. Question variety itself is already fine (25 statements per category, seeded sampling).
- The fingerprint card computes 5 signals but, on real data, only the two time-flavored ones (late-night share, long-session preference) cleared the lift gate — the card reads as "time-of-day only". Adding non-time behavioral signals (how the user collaborates with AI) makes the card meaningful regardless of which signals clear the gate.

User decisions (probed, resolved — not open):

1. Quiz: **accumulate** (option A). Keep a separate "start over" reset affordance.
2. Fingerprint: add **all four** proposed signals: AI-authored share shift, delegation-size shift, multi-project days, model-mix shift.

## In-scope

### W1 — Precision quiz (accumulating calibration)

- **Schema v3** (`PERSONA_QUIZ_VERSION` 2 → 3, new storage key `memradar.personaQuiz.v3`):
  - `runs: Array<{ seed: number; ts: string; answers: Answer[] }>` replaces the single flat run.
  - `seenStatements: string[]` — statement texts already shown, accumulated across runs (dedup). Used for unseen-first sampling. Starts empty on migration (past statements unknown — acceptable).
  - Keep top-level `job`, `ts` (last completed run), `calibration`, `finalDistribution` so **consumer contract is unchanged** (Dashboard / Wrapped read `finalDistribution`/`calibration` via `loadPersonaQuiz` exactly as today).
  - Read-through migration v2 → v3 (wrap existing payload as `runs[0]`), following the existing v1 → v2 pattern in `personaQuizStorage.ts`. v1 payloads keep migrating (v1 → v2 core → v3).
- **Unseen-first sampling**: `generateBalancedPairs` gains an optional `exclude?: ReadonlySet<string>` (statement texts). Per-side sampling draws from the unexcluded subset of the category pool; if that subset is empty, fall back to the full pool. Determinism preserved: same inputs (ids, statements, seed, exclude) → same pairs. Category balance (each category exactly twice, left≠right) unchanged.
- **Refine flow** (`PersonaQuizView.tsx`):
  - When a saved state exists, the view opens in refine mode: job selection is skipped (stored `job` reused), intro shows accumulated context (runs completed, total questions answered) and CTA to answer 9 more; a secondary "처음부터 다시 / Start over" action clears storage and enters the fresh flow.
  - On finish: append the new run, recompute calibration from **merged answers of all runs** (plus current auto raw scores), update `seenStatements`, save v3.
  - `computeCalibration` formula is **unchanged** — appearances grow 2 → 4 → 6 per category as runs accumulate; `pickRate` resolution improves naturally. `MAX_CALIBRATION_WEIGHT` unchanged.
  - Result screen shows a receipt with accumulated sample size (e.g. `n=18문항 · 2회` pattern) — consistent with the anti-Barnum receipts convention.
- **Dashboard button label** (`Dashboard.tsx` ~L1322): post-calibration label "다시 진단"/"Retake quiz" → "정밀 진단"/"Refine diagnosis". Pre-calibration label unchanged.

### W2 — Four non-time fingerprint signals

All follow the existing falsifiable design: id + raw numbers only from the lib (no copy), n= receipts, viable flag shown honestly, provisional thresholds marked `잠정값`. Signal order appends ⑥→⑨ after ⑤ in `FINGERPRINT_SIGNAL_ORDER` (deterministic tie-break preserved). `FINGERPRINT_TOP_COUNT` (3) and card empty-state rule unchanged.

New daily aggregation fields on `DailyCollab` (additive, following the `structuredCount` precedent): `userWords`, `aiWords` (via `stripMarkup` + `countWords`, user/assistant messages only — same method as `authorshipRatio.ts`), `projects: Set<string>` (project key = `session.cwd`, fallback to the project directory derived from `filePath`; sessions with neither are excluded from project counting), `models: Set<string>` (per-message `model`, fallback `session.model`).

- **⑥ `ai-share-shift`** — AI-authored word share, recent 30 days vs prior period (window anchored on the max day key, same mechanism as ② structured-shift). `lift` = ratio of shares (capLift), `delta` = recent − prior share. **Bidirectional**: rankScore = max(lift, 1/lift); display copy states direction (delegating more vs writing more yourself). Guard: |delta| ≥ 3%p (provisional const). Viable: recent and prior window user-message counts ≥ `MIN_FINGERPRINT_SIGNAL_N`. Receipts: n = recent window words (user+AI), n2 = prior window words.
- **⑦ `delegation-size-shift`** — average user prompt length (words/message), recent 30 days vs prior. Bidirectional (going brief/delegating vs going detailed/spec-like). Guard: ratio deviation ≥ 15% from 1.0 (provisional const, i.e. rankScore ≥ 1.15 semantics — Coder may express via the shared lift gate if cleaner). Viable: both windows' user-message counts ≥ `MIN_FINGERPRINT_SIGNAL_N`. n/n2 = window user-message counts.
- **⑧ `multi-project-days`** — trait, increase-direction only (consistent with the v1 rank policy for non-shift signals): among active days with ≥2 sessions, observed share of days spanning ≥2 distinct projects vs an independence expectation derived from the user's own overall project distribution: E = mean over qualifying days d of `1 − Σ_j p_j^{k_d}` where `p_j` = overall session share of project j and `k_d` = session count of day d. Viable: qualifying days ≥ `MIN_FINGERPRINT_SIGNAL_N` and expectation > 0 (floor guard, `LONG_SESSION_EXPECTATION_FLOOR` pattern). n = qualifying days.
- **⑨ `model-mix-shift`** — share of active days using ≥2 distinct models, recent 30 days vs prior. Bidirectional. Dual guard like ②: rank gate plus |delta| ≥ 3%p (provisional). Viable: recent and prior active-day counts ≥ a provisional day floor (reuse `MIN_FINGERPRINT_SIGNAL_N`; if that starves the signal on real data, Coder documents the observed values in the receipt rather than lowering silently). n = recent active days, n2 = prior active days.

- **Selection mechanics**: `selectTopSignals` must support bidirectional signals without changing the behavior of the existing five on identical inputs (regression 0). Prefer explicit per-signal metadata (e.g. a `bidirectional` flag or per-signal gate) over special-casing ids inline.
- **Dashboard copy** (`Dashboard.tsx` signal switch blocks ~L770–870): title, narrative and receipt lines for the four new ids, ko/en, direction-branched wording for the three shift signals; all claims carry numbers + n=. Card tooltip (~L1352) updated from "5가지" to the new signal inventory. No new card — these render inside the existing fingerprint card.

## Out-of-scope

- Changing ② `structured-shift` to bidirectional (its original spec chose increase-only; revisiting is a separate decision).
- Changing `FINGERPRINT_TOP_COUNT`, the empty-state rule, or adding a new dashboard card.
- Wrapped slide changes (slide count/order stays 8; PersonalitySlide keeps consuming `finalDistribution` as-is).
- Persona statement bank edits (25/category stands).
- eval-sharpness scripts (`scripts/eval-sharpness.mts`) — quiz logic duplication there is intentional and untouched.

## Acceptance Criteria

- [ ] After completing a quiz once, the dashboard button reads "정밀 진단" (en: "Refine diagnosis"); clicking it opens refine mode without re-asking the job, and completing 9 more questions **increases** per-category appearances (2 → 4) in the saved state instead of overwriting.
- [ ] "처음부터 다시 / Start over" clears storage and runs the fresh flow (job selection shown again).
- [ ] Refine runs prefer statements not in `seenStatements`; when a category's pool is exhausted, sampling falls back to the full pool without error.
- [ ] v2 (and v1) localStorage payloads load and migrate to v3 transparently; corrupted/unknown payloads still return null defensively.
- [ ] `buildDailyCollab` exposes `userWords`, `aiWords`, `projects`, `models` with tests; existing fields byte-identical on same inputs.
- [ ] `buildCollabFingerprint` returns 9 signals in the fixed order; each new signal has unit tests covering: viable gating, guard thresholds, direction handling (both directions for ⑥⑦⑨), zero-denominator caps, and determinism.
- [ ] Existing 5 signals produce identical output on identical inputs (regression tests).
- [ ] Fingerprint card renders new signals with ko/en copy, n= receipts, direction-branched narrative; receipts list all 9 signals including non-viable ones.
- [ ] `npm run test:harness` passes (lint, build, all test suites, e2e).
- [ ] No session data leaves the machine (quiz state stays in localStorage; all analysis local).

## Related Files / Modules

| File | Role |
|------|------|
| `src/lib/personaQuiz.ts` | version bump, v3 `QuizState`, `generateBalancedPairs` exclude param |
| `src/lib/personaQuizStorage.ts` | v3 key + parse + v2→v3 (and v1 chain) migration |
| `src/components/PersonaQuizView.tsx` | refine mode, start-over, accumulated receipts |
| `src/components/Dashboard.tsx` | button label, 4 new signal copy blocks, tooltip |
| `src/lib/storyOfDay.ts` | `DailyCollab` additive fields (`userWords`, `aiWords`, `projects`, `models`) |
| `src/lib/collabFingerprint.ts` | signals ⑥–⑨, bidirectional rank support, constants |
| `src/lib/authorshipRatio.ts` | word-count method reference (unchanged) |
| `tests/persona-quiz.test.mts` | accumulation, migration, unseen-first tests |
| `tests/collab-fingerprint.test.mts` | new signal + regression tests |
| `tests/story-of-day.test.mts` | new `DailyCollab` field tests |

## Must-Preserve

- `loadPersonaQuiz()` consumer contract: returns an object exposing `finalDistribution`, `calibration`, `job` — consumers are `Dashboard.tsx` (~L1273) and `WrappedView.tsx` (~L54, feeding UsageSlide's `calibration` prop; PersonalitySlide does NOT consume it). Both keep working untouched.
- `computeCalibration` formula and `MAX_CALIBRATION_WEIGHT` semantics.
- `generateBalancedPairs` invariants: each category exactly 2 appearances per run, left≠right, deterministic per seed.
- Existing 5 fingerprint signals: identical numbers on identical inputs; `FINGERPRINT_SIGNAL_ORDER` prefix ①–⑤ unchanged.
- Injection design: fingerprint reuses the same `dailyCollab`/`rhythm` instances (no independent recalculation, no cross-card numeric drift); TZ-sensitive day keying stays inside `buildDailyCollab` (`offsetMinutes` injectable for tests).
- Fractions are 0–1 raw in libs; % conversion in UI only (lessons/_common.md L-5).
- Anti-Barnum rules (lessons/personality-eval.md L-1): no single-label verdicts, always-on "추정" subtitle, every claim carries n=.
- Wrapped slides fixed at 8; `ToolsSlide.tsx` never imported.
- No session data leaves the machine.

## Execution Notes

- Recommended model: **Claude Fable 5** (top-tier as of 2026-07) for the judgment-heavy parts — signal expectation models (⑧ independence baseline), bidirectional selection design, user-facing ko/en copy tone, and the COMPLEX-triage orchestration. A cheaper model (e.g. Sonnet) is acceptable for mechanical parts: test boilerplate, storage validators, copy plumbing.
- This document cannot enforce the model — the executing session's `/model` setting decides. If the session model is below the recommendation, surface it to the user and confirm before proceeding.
