# goal: fix-coaching-accuracy

## One-line Goal
Fix the three verified defects in the prompt-coaching pipeline — retry-marker over-matching (~2.4x inflation), partial-month misfiring of latest-month rules, and the factually wrong "improving" copy — using the labeled audit data from `docs/goal/verify-prompt-coaching.md` as the tuning/acceptance basis.

## Background / Motivation
The verification run (2026-07-03, real local data: 285 sessions / 2,140 user messages / 1,859 follow-ups) established:

1. **Retry matching precision is 41%** (64 true corrections of 157 matches; ambiguous 18). Per-marker precision: 아니 63%, 말고 38%, 다시 34%, **수정 18%**. Displayed retry rate 8.45% vs human-judged true rate 3.4–4.4%. Root cause is a **spec-internal contradiction** in `docs/GROWTH-SECTION-SPEC.md`: L114 defines "starts with a correction marker" while L116/L130 define "matched within first 30 chars / contained" — the implementation (`matchRetryMarker`, `src/parser.ts:300`) follows the latter. Pure `startsWith` is not the fix either: precision rises to 78–86% but recall drops to 44% (misses 36 of 64 true corrections).
2. **low-skill-variety tip misfired** from a 2-day-old in-progress month (2026-07, 49 msgs, uniqueSkills 1) while the previous complete month had uniqueSkills 7. `MIN_MONTH_SAMPLES=5` (message count) cannot gate a structurally short accumulation window. Blanket "exclude in-progress month" conflicts with the confirmed policy (spec impl-note #5: first-month users must still get coaching).
3. **improving praise** direction is robust (complete-month endpoint 2026-06 gives +49.8pp, larger than the displayed +33.2pp), but the displayed evidence uses a distorted partial-month endpoint (proxy B saturated by avgWords 513) and the copy claims "structure, length, and skill metrics rose together" (`GrowthCoaching.tsx:71`) which contradicts skills 7→1.
4. **HIGH_RETRY_MIN_RATE 0.15 is calibrated against the inflated metric** — on a corrected metric it would be nearly unreachable (dead rule); on the current metric it is anti-conservative (marker noise alone can cross it).

Labeled ground truth (LOCAL ONLY, must never be committed — session-derived text): `C:/Users/user/AppData/Local/Temp/claude/d--Work-vibe-promptale/dc8c601c-ec1f-465f-85ef-67d584ec5dc0/scratchpad/retry-labeled.jsonl` — 157 items `{i, marker, sw, head, verdict, agreed}`, verdict ∈ correction(64) / not_correction(75) / ambiguous(18). (경로 구분자 `/` 표기 — `\`+16진수 조각은 Tailwind v4 스캐너 빌드 실패 유발, lessons/_common.md L-9)

## In-scope

### 1. Retry-marker matcher redesign (`src/parser.ts`)
- Two-tier `matchRetryMarker`, still operating on `stripMarkup(text).trim().toLowerCase().slice(0, 30)`:
  - **Tier A — start-anchored markers** (longest first): e.g. `그게 아니라, 그거 말고, 아 잠깐, 잠깐만, 틀렸, 아니, 다시, no wait, actually`.
  - **Tier B — guarded in-text patterns**: e.g. `말고` excluding prohibitive `…지 말고/…지말고` and additive `말고도`; optionally a `…가/게/이 아니라` pattern. Exact guard set is **tuned empirically against the labeled data** to meet the acceptance metrics; a candidate pattern that drags precision below target is dropped.
- **Remove `수정` from the dictionary** (18% precision; even start-anchored samples were 0–1/3 true).
- Recalibrate `HIGH_RETRY_MIN_RATE` in `src/lib/promptCoaching.ts` from 0.15 to **0.08 (provisional)** to match the corrected metric scale (user's true rate 3.4–4.4%; threshold sits ~2x above it). Keep the named-const + "잠정값" comment convention.
- Tuning loop runs via a **local, uncommitted eval script** applying the new matcher to the 157 labeled heads. Committed tests use **synthetic fixtures authored fresh** (never user session text).

### 2. Month eligibility for latest-month rules (`src/types.ts` + `src/parser.ts` + `src/lib/promptCoaching.ts`)
- Add `activeDays: number` (count of distinct UTC day keys among that month's user messages) to `GrowthStats.skillCurve` entries in `buildGrowth`.
- `buildPromptCoaching(growth, now?: Date)` (default `new Date()`; injectable for tests). A valid month is **eligible** as the "latest" basis for long-unstructured / short-prompts / low-skill-variety when it is a completed calendar month (monthKey < current UTC monthKey), OR it is the current month with `activeDays >= MIN_ELIGIBLE_ACTIVE_DAYS` (**7, provisional**). First-month users regain coaching after ~a week of activity — policy #5 preserved.
- `improving` uses first valid month → **last eligible month** as endpoints (same eligibility), so praise evidence never rests on a days-old partial month.
- If no eligible month exists, latest-month rules simply don't fire (high-retry unaffected).

### 3. improving copy fix (`src/components/growth/GrowthCoaching.tsx`)
- Remove the false "구조화·길이·스킬 지표가 함께 올라간 추정" claim (both ko/en). Replace with a factual composite description, e.g. ko: "{firstMonth} → {lastMonth} 구간 종합 점수(구조화·길이·스킬 다양성 합성) 기준이에요." — states what the score is, claims nothing about individual proxies.

### 4. Spec + diagnostics + knowledge sync
- `docs/GROWTH-SECTION-SPEC.md`: resolve the L114/L116/L130 contradiction with one operational definition (two-tier matcher) recorded as a new numbered implementation note (spec convention: 본문 원안 유지, 차이는 impl-note에 기록); note the 2026-07 empirical calibration figures.
- `scripts/analyze-coaching.mts`: update its rule board + `buildPromptCoaching` call (now param) so drift guards 1–3 still pass against the new logic.
- Update `tests/growth.test.mts` + `tests/prompt-coaching.test.mts` for the new matcher/eligibility/threshold (synthetic fixtures only), add boundary cases (prohibitive 말고, 말고도, in-progress month with 6 vs 7 active days, no-eligible-month).
- `.claude/knowledge`: add the approved lesson ("derived-state explanation strings in reimplemented boards are only true under a congruence assert") to the appropriate lessons file, and bump the repetition count for the "복제엔 가드" (personality-eval L-6) pattern in `skill-candidates.md`.

## Out-of-scope
- Any change to the GrowthRetry/GrowthComplexity/GrowthSkillCurve chart visuals or the dashboard layout (numbers change only via the corrected metric).
- English marker-dictionary expansion (0 matches in Korean-heavy data = no information; revisit with English-heavy data).
- Wrapped slides, CLI schema, package.json.
- Committing any session-derived text (labeled data stays in the scratchpad).

## Acceptance Criteria
- [ ] On the labeled 157-item set: new matcher **precision ≥ 0.70** (correction / (correction + not_correction) among matched; ambiguous excluded from the denominator) and **recall ≥ 0.60** (matched true corrections / 64).
- [ ] Live run of updated `scripts/analyze-coaching.mts` (exit 0, all 3 drift guards pass): retryRate lands in **[0.03, 0.06]**; **low-skill-variety does NOT fire** (2026-07 has < 7 active days); **improving fires with a complete-month endpoint** (2026-06) and larger delta.
- [ ] `수정` no longer in `RETRY_MARKERS`; prohibitive `…지 말고` and additive `말고도` never match.
- [ ] `buildPromptCoaching` is deterministic under an injected `now`; existing first-month policy holds (current month with ≥ 7 active days fires latest-month rules).
- [ ] improving copy (ko/en) contains no claim that all three proxies rose.
- [ ] Full test harness passes (`tests/growth.test.mts`, `tests/prompt-coaching.test.mts`, remaining chain) + `npx tsc -b` clean.
- [ ] No session-derived text appears in any committed file (tests use synthetic fixtures).
- [ ] Spec contradiction resolved; `docs/GROWTH-SECTION-SPEC.md` impl-notes updated.

## Related Files / Modules
| File | Role |
|------|------|
| `src/parser.ts` | `matchRetryMarker` redesign, `RETRY_MARKERS` tiers, `buildGrowth` activeDays |
| `src/types.ts` | `GrowthStats.skillCurve[].activeDays` |
| `src/lib/promptCoaching.ts` | eligibility selection, `now` param, `HIGH_RETRY_MIN_RATE` recalibration |
| `src/components/growth/GrowthCoaching.tsx` | improving copy fix; passes `new Date()` |
| `src/components/growth/GrowthRetry.tsx` | consumer of retryStats (display only — verify no assumptions break) |
| `src/lib/collabFingerprint.ts` / `src/lib/storyOfDay.ts` | possible consumers of `matchRetryMarker`/`RETRY_MARKERS` — Scout must map and update tests if affected |
| `scripts/analyze-coaching.mts` | rule board + drift guards must track the new logic |
| `tests/growth.test.mts`, `tests/prompt-coaching.test.mts` | boundary coverage for new rules |
| `docs/GROWTH-SECTION-SPEC.md` | single operational definition + impl-note |
| `.claude/knowledge/lessons/*`, `.claude/knowledge/skill-candidates.md` | approved lesson + repetition count |

## Must-Preserve
- **세션 데이터 외부 전송 금지**; labeled audit data never enters the repo.
- Coaching first-month policy (spec impl-note #5): single-valid-month users still receive coaching once eligibility is met.
- Barnum guard: every insight keeps real numeric evidence; no universal advice.
- `retryRate`/`structured`/`score` stay 0–1 fractions (% conversion only in UI — lessons/_common.md L-5).
- Wrapped 8-slide constraint untouched; no CLI/schema changes.
- `scripts/analyze-coaching.mts` drift guards must remain and pass (no deleting asserts to make them pass).
- Session-boundary safety of the follow-up walk (per-session `prevRole` reset) unchanged.

## Execution Notes
- Recommended model: strongest current Claude model (2026-07: Claude Fable 5 — current session model, requirement met) for the judgment-heavy items: marker-rule tuning against labeled data, eligibility semantics, user-facing copy. A cheaper model (e.g. Sonnet) is acceptable for mechanical parts (activeDays plumbing, test boilerplate).
- This document cannot enforce the model — the executing session's `/model` setting decides. If the session model is below the recommendation, surface it to the user and confirm before proceeding.
