# goal: coaching-strengths-detail

## One-line Goal
Enrich the prompt-coaching card so it (a) surfaces up to 4 insights by turning the "good side" of the non-firing tip rules into evidence-backed praise cards, and (b) lets the user click any card to expand a detailed breakdown of the exact numbers, thresholds, and formula behind it.

## Background / Motivation
Follow-up to `fix-coaching-accuracy`. On the user's real data only 2 insights fire (long-unstructured tip + improving praise) — not because coaching is thin, but because the user is on the *good* side of the other three tip rules (retry rate 3.7% < 8%, avg 142 words ≫ 10, 7 skills ≫ 1). Forcing the non-firing warning rules to display would print statements contradicting the data ("your prompts are too short" at 142 words) — the exact Barnum/false-advice defect this project just spent a session removing. The user wants a richer coaching section (3rd/4th cards) **and** transparency into the basis for each card.

Chosen approach (user-confirmed 2026-07-04): fill the extra slots with **inverse praise rules** that fire only when the user is measurably strong on an axis, each carrying real numeric evidence. This preserves the firing-condition + evidence contract (no universal praise). Plus a per-card expand showing the derivation.

## In-scope

### 1. Two new inverse-praise rules (`src/lib/promptCoaching.ts`)
- **`low-retry` (praise)** — inverse of `high-retry`. Fires when `retryStats.totalFollowups >= HIGH_RETRY_MIN_FOLLOWUPS` (enough signal to be meaningful) AND `retryStats.retryRate <= LOW_RETRY_MAX_RATE` (**0.05, provisional**). Mutually exclusive with high-retry by construction (0.05 < 0.08). Evidence: `{retryRate, retryCount, totalFollowups}`.
- **`high-skill-variety` (praise)** — inverse of `low-skill-variety`. Fires when there is an eligible Claude month and its `uniqueSkills >= HIGH_SKILL_VARIETY_MIN` (**5, provisional**), gated by the same `skillCurve.length >= LOW_SKILL_MIN_VALID_MONTHS`. Uses the same eligibility (latest eligible hasClaudeSession month) as low-skill-variety. Mutually exclusive with low-skill-variety (5 > 1). Evidence: `{month, uniqueSkills}`.
- Do **not** add a short-prompts inverse: long prompts alone are not unambiguously good (long-unstructured already flags rambling), so there is no clean evidence-backed praise there.
- New thresholds follow the existing named-const + `// 잠정값 — 실측 보정 전` convention.

### 2. Priority + count (`src/lib/promptCoaching.ts`)
- Raise `MAX_INSIGHTS` from 3 to **4**.
- Ordering: tips first (actionable), then praise. Full priority list: `high-retry, long-unstructured, short-prompts, low-skill-variety` (tips) → `improving, low-retry, high-skill-variety` (praise). This yields, on the user's data: long-unstructured, improving, low-retry, high-skill-variety = 4 cards.
- `buildPromptCoaching(growth, now)` still slices to MAX_INSIGHTS after collecting in priority order.

### 3. Copy for the new praise cards (`src/components/growth/GrowthCoaching.tsx`)
- ko/en for `low-retry` and `high-skill-variety`, following the existing praise tone. Insert real numbers only; no universal statements. Examples (final wording is a judgment call for the executor):
  - low-retry ko: `후속 질문 ${totalFollowups}회 중 정정은 ${pct}%뿐이에요 — 한 번에 정확히 지시하는 편이에요.`
  - high-skill-variety ko: `최근 달 slash command ${uniqueSkills}종을 활용했어요 — 도구를 다양하게 씁니다.`

### 4. Per-card "자세히" expand (`src/components/growth/GrowthCoaching.tsx` + `src/index.css`)
- Each insight card gets a click-to-expand affordance (inline accordion — mobile-friendly, no portal). Collapsed by default. Accessible: button with `aria-expanded`, keyboard-operable.
- Expanded content per card, built from the same exported thresholds + `growth` data (never hardcoded — drift risk):
  - The firing condition as **actual vs threshold** (e.g. `구조화 1.9% < 기준 10% ✓`, `평균 142단어 ≥ 기준 50 ✓`).
  - The judged month(s).
  - For score-based (`improving`): the A/B/C proxy breakdown of first vs last month score (`structure / min(avgWords/80,1) / min(uniqueSkills/10,1)`, source-aware average), so the +Npp is auditable.
  - One plain-language "why this fired / why this is a strength" line.
- Consult `docs/DESIGN-GUIDE.md` for card/disclosure styling, spacing, motion tokens.

### 5. Diagnostics + tests + spec sync
- `scripts/analyze-coaching.mts`: extend the rule board to the 6 rules (add low-retry, high-skill-variety), keep drift guard 3 (`board.filter(eligible).slice(0, MAX_INSIGHTS) == buildPromptCoaching ids`) passing with MAX_INSIGHTS=4.
- `tests/prompt-coaching.test.mts`: add fire/no-fire boundary cases for the two new rules (retryRate 0.05 vs 0.051; uniqueSkills 4 vs 5; mutual exclusion with the tip counterpart), and assert new priority order + MAX_INSIGHTS=4 slicing. Synthetic fixtures only.
- `docs/GROWTH-SECTION-SPEC.md`: new impl-note (#7) documenting the praise rules, the raised MAX_INSIGHTS, and the detail-expand; update header test counts.

## Out-of-scope
- No change to the metric math in `buildGrowth`/`parser.ts` (activeDays, matcher, score all stay as fixed in `fix-coaching-accuracy`).
- No new proxies or new data collection; praise rules reuse existing `retryStats`/`skillCurve` fields.
- No change to GrowthComplexity / GrowthRetry / GrowthSkillCurve chart cards or dashboard layout.
- Wrapped slides, CLI schema, package.json untouched.
- English marker expansion; committing session-derived text.

## Acceptance Criteria
- [ ] Live `npx tsx scripts/analyze-coaching.mts` (exit 0, all drift guards pass incl. guard 3 at MAX_INSIGHTS=4): on the user's data **4 insights fire** — long-unstructured, improving, low-retry, high-skill-variety — each with real evidence; high-retry / short-prompts / low-skill-variety stay silent.
- [ ] `low-retry` and `high-skill-variety` are each mutually exclusive with their tip counterpart (no data can fire both) — proven by unit tests at the shared boundary.
- [ ] Every praise card still carries numeric evidence (Barnum guard); no card renders universal advice.
- [ ] Each card expands to show actual-vs-threshold (and A/B/C breakdown for improving); expanded numbers are read from exported thresholds + `growth`, not hardcoded.
- [ ] Expand is keyboard-operable and `aria-expanded` correct; collapsed by default.
- [ ] `buildPromptCoaching` deterministic under injected `now`; existing eligibility / first-month policy unchanged.
- [ ] Full test harness passes + `npx tsc -b` clean; no session-derived text in committed files.
- [ ] `docs/GROWTH-SECTION-SPEC.md` impl-note added; header counts updated.

## Related Files / Modules
| File | Role |
|------|------|
| `src/lib/promptCoaching.ts` | new praise rules, thresholds, MAX_INSIGHTS=4, priority order |
| `src/components/growth/GrowthCoaching.tsx` | new-card copy (ko/en) + expand UI, reads thresholds/growth for detail |
| `src/index.css` | disclosure/accordion styling per DESIGN-GUIDE |
| `scripts/analyze-coaching.mts` | 6-rule board, drift guard 3 at MAX_INSIGHTS=4 |
| `tests/prompt-coaching.test.mts` | boundary + mutual-exclusion + ordering tests (synthetic) |
| `docs/GROWTH-SECTION-SPEC.md` | impl-note #7 + header counts |
| `docs/DESIGN-GUIDE.md` | source for card/disclosure visual tokens (read-only) |

## Must-Preserve
- Barnum guard: every insight (tip and praise) fires only on a met numeric condition and shows real evidence.
- Eligibility + matcher + score math from `fix-coaching-accuracy` unchanged.
- `retryRate`/`structured`/`score` stay 0–1 fractions; % conversion in UI only.
- Drift guards 1–3 in `scripts/analyze-coaching.mts` remain and pass (do not weaken asserts to pass).
- Wrapped 8-slide constraint; no CLI/schema/package.json changes.
- 세션 데이터 외부 전송 금지; tests use synthetic fixtures only.
- No hardcoded threshold values in the detail view — import the exported consts (drift risk = the exact `_common.md` L-10 congruence lesson).

## Execution Notes
- Recommended model: strongest current Claude model (2026-07: Claude Fable 5 tops the Opus tier; session is currently on Opus 4.8 [1m] — **below the recommendation for the judgment-heavy items**: praise-copy tone, threshold choice, detail-view information design. Surface this to the user and confirm before the judgment-heavy steps, or accept Opus 4.8 for the mechanical parts). Mechanical parts (accordion plumbing, test boilerplate, board extension) are fine on Opus 4.8 / Sonnet.
- This document cannot enforce the model — the executing session's `/model` setting decides. If the session model is below the recommendation, surface it to the user and confirm before proceeding.

## Open Questions
- None blocking. Final praise-card wording and the exact expanded-detail layout are executor judgment within the constraints above; if the copy tone needs the user's voice, surface a draft before finalizing.
