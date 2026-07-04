# goal: verify-prompt-coaching

## One-line Goal
Empirically verify that the prompt-coaching card (`buildPromptCoaching` → `GrowthCoaching`) gives appropriate, evidence-backed advice against the user's real local session data, and audit its rules for false positives and threshold calibration.

## Background / Motivation
The coaching feature ships 5 rules (high-retry / long-unstructured / short-prompts / low-skill-variety / improving) whose 9 thresholds are all marked "잠정값 — 실측 보정 전" (provisional, pre-calibration). Unit tests (`tests/prompt-coaching.test.mts`, 21 cases) cover rule boundaries with synthetic fixtures, but **no verification against real usage data exists**. The user asked: "does the usage-based advice actually advise correctly?"

Recon already surfaced one spec-vs-impl drift to quantify: `docs/GROWTH-SECTION-SPEC.md` defines retry as a follow-up that **starts with** a correction marker, while `matchRetryMarker` (`src/parser.ts:300`) uses substring `includes` on the first 30 chars — e.g. "보다시피" contains "다시", and "수정해줘" (a fresh edit request, not a correction) matches "수정".

## In-scope
- New read-only diagnostic script `scripts/analyze-coaching.mts` following the `scripts/analyze-my-data.mts` pattern (load real Claude sessions from `~/.claude/projects` and Codex sessions from `~/.codex/sessions`, run analysis, print a console report). It must print:
  1. Fired coaching insights with their full `evidence` payloads.
  2. **All five rules' status** — fired or not, with actual value vs threshold margin (e.g. `retryRate 0.11 vs threshold 0.15 → not fired, margin -0.04`), so near-misses are visible.
  3. Retry audit: per-marker match counts, and a sample (~30) of matched follow-up heads (post-`stripMarkup`, secret-masked via `src/lib/secretMask.ts`, truncated to ~80 chars) for manual true/false-positive classification.
  4. Distributions backing the other rules: monthly `avgWords`, `structured` rate, `uniqueSkills`, `skillCurve` scores, valid-month counts.
- Run the script on the user's real local data.
- Claude classifies the sampled retry matches (true correction vs false positive), estimates a false-positive rate, and reports a per-rule appropriateness verdict plus threshold-calibration observations.

## Out-of-scope
- Any change to coaching rules, thresholds, markers, copy, parser, or UI — this task is verification only. Findings that warrant fixes are reported for separate approval (harness re-triage rule: 확인과 수정은 별개).
- Network calls or writing session data anywhere outside the console.

## Acceptance Criteria
- [ ] `npx tsx scripts/analyze-coaching.mts` runs to completion (exit 0) reading only local session directories.
- [ ] Report shows all 5 rules with fired/not-fired status and numeric margin against each threshold.
- [ ] Sampled retry-match texts are secret-masked and truncated before printing.
- [ ] No file under `src/` is modified; no repo or user file is mutated by the script.
- [ ] Final user-facing report answers: (a) which advice fires on the user's real data and whether its evidence is factually sound, (b) estimated retry-marker false-positive rate from the sample, (c) threshold calibration observations, (d) any spec-vs-impl drift confirmed.

## Related Files / Modules
| File | Role |
|------|------|
| `src/lib/promptCoaching.ts` | Rules + thresholds under verification (`buildPromptCoaching`) |
| `src/components/growth/GrowthCoaching.tsx` | Copy layer that renders the insights (read-only reference) |
| `src/parser.ts` | `buildGrowth`, `matchRetryMarker`, `RETRY_MARKERS`, `stripMarkup`, `parseJsonl` |
| `src/providers/codex.ts` | Codex session parsing (`codexProvider.parse`) |
| `scripts/analyze-my-data.mts` | Established pattern for local-data diagnostic scripts |
| `src/lib/secretMask.ts` | Masking for any printed prompt text |
| `tests/prompt-coaching.test.mts` | Existing synthetic-boundary coverage (gap this task fills empirically) |
| `docs/GROWTH-SECTION-SPEC.md` | Spec of the growth metrics and coaching policy |

## Must-Preserve
- **세션 데이터 외부 전송 금지** — everything runs locally; no network I/O in the script.
- Coaching behavior unchanged: no edits to `src/` in this task.
- The diagnostic script is read-only with respect to session files and the repo.
- Printed prompt excerpts must pass secret masking and truncation (no raw prompt dumps).

## Execution Notes
- Recommended model: strongest current Claude model (Claude Opus 4.8+; session is on Claude Fable 5, which exceeds it) for judgment-heavy items — audit methodology, true/false-positive classification of retry samples, and per-rule verdicts. A cheaper model (e.g. Sonnet) is acceptable for the mechanical script boilerplate (file walking, console formatting) that mirrors `analyze-my-data.mts`.
- This document cannot enforce the model — the executing session's `/model` setting decides. If the session model is below the recommendation, surface it to the user and confirm before proceeding.
