# goal: model-attribution-per-message

## One-line Goal
Attribute models per **response** instead of per session, so every model statistic, badge, and export reflects what actually answered — and surface each session's real model composition as a plain fact badge alongside tokens and cost.

## Background / Motivation
Claude Code and Codex transcripts record a model on every assistant line. memradar throws that away: it stamps each session with the **first** model it encounters (Codex: the **last**) and aggregates `modelsUsed` one vote per session.

Measured on the user's own corpus:

| Fact | Value |
|---|---|
| Sessions with model info | 79 |
| Sessions that actually used 2+ models | 38 (48%) |
| Sessions by distinct real models (response-keyed, synthetic excluded) | 1 model: 43 (60%) · 2 models: 22 (31%) · 3 models: 7 (10%) |
| Codex sessions whose `session.model` never answered anything | 4 |
| Sessions whose `session.model` is literally `<synthetic>` | 2 |

Consequence: roughly half the corpus carries a wrong label, the Wrapped "Your Favorite Model" slide and the dashboard model cards are computed on it, and a session that ran Opus 4.8 for 336 lines then Opus 5 for 99 reports only Opus 4.8.

## Design Decisions (panel-settled — do not relitigate during implementation)

The plan below was rewritten by an adversarial planning panel (4 lenses + cross-examination) that **rejected four premises of the original draft** with measurements. Those rejections are recorded so they are not rediscovered.

### Counting unit

- **The unit is a response: Claude = distinct `requestId`, Codex = one assistant `response_item`.** — Neither raw JSONL lines nor merged blocks. *(Rejected: merged blocks — requests-per-block runs 4.05 for haiku to 15.23 for opus-5, a 3.76× spread that systematically under-counts models used for deep agentic work. Rejected: raw lines — one response averages 1.78 lines on Claude and 1.00 on Codex, so line-counting lets a provider's logging style decide the ranking.)*
- **Coverage is complete.** Of main-chain assistant lines, all non-`<synthetic>` lines carry a `requestId`; the only lines missing one are `<synthetic>` (28), which are excluded from aggregation anyway. Verified independently of the panel.
- **Response counts are computed in the pre-merge `rawMessages` loop and carried on the session.** `computeStats` only sums per-session totals. — Merging is irreversible (11,141 lines collapse to 869 blocks), so the count cannot be recovered from `session.messages`. *(Rejected: counting inside `computeStats` — it only sees merged blocks, so it can never return the chosen unit.)*
- **Cross-file `requestId` de-duplication is out of scope.** Per-session distinct sums to 7,029 vs 6,268 globally — 522 ids appear in 2+ files because resume/fork copies prior history into a new `.jsonl`, a 12% inflation. This inflation already exists identically in `totalMessages` and token totals, so this change neither creates nor worsens it. Removing it would require serializing identifiers into shared output, which conflicts with the privacy rule below.

### Contracts

- **`Session.model` keeps its current meaning and is frozen** (legacy display + pricing fallback). A new optional `Session.modelResponses?: Record<string, number>` carries the truth; "dominant" is derived from it by one pure function. *(Rejected: redefining `Session.model` — 8 sites read it as a single contract value. `tokenPricing.ts:108` prices every model-less message with it, and a first→dominant flip moves one session from `$3/$15` to `$15/$75`. `sessionExport.ts:367/823/1192` bakes it into on-disk artifacts, so old and new exports of the same session would name different models. All four panel lenses opposed this independently.)*
- **`modelResponses` is emitted whenever non-empty, including single-model sessions.** Consumers fall back to `session.messages[].model` block-approximation when the field is absent. — Size is not a reason to omit: ~6KB for 200 single-model sessions against 23.1KB of per-message model strings already in the payload. Omitting it on single-model sessions would make `absent` mean two different things ("one model" vs "parser not yet updated").
- **Model normalization, response counting, and dominant derivation live in one module: `cli/lib/modelAttribution.mjs` (+ `.d.mts`), re-exported from `src/lib/`.** All four parsers call it. — There are **two parsers**, and the one the product actually runs is the CLI one: `cli/index.mjs:333` `parseClaudeJsonl`, `:469` `parseCodexJsonl`, used by the static path (`cli/index.mjs:870`) and the server light cache (`:675`). `src/parser.ts` only serves drag-and-drop upload (`src/App.tsx:129`) and SessionView re-parse (`SessionView.tsx:361`). Fixing only `src/parser.ts` would leave `npx memradar` entirely unfixed. The repo already mandates this pattern: `docs/ARCHITECTURE.md:171`, `cli/lib/hookExtract.mjs`, `cli/lib/secretMask.mjs`, and `src/types.ts:5-13` ("이중 정의 금지"). Evidence the two parsers have already drifted: `cli/index.mjs:373` folds cache-write into `cachedInput` and never emits `cacheWriteInput`, while `src/parser.ts:110-111` keeps them separate.
- **`RawMessage` gains `requestId?: string`; the value itself is never serialized into a `Session`.** Aggregate output carries model names and integers only. — Static HTML is a single shareable file (`src/types.ts:178-189` privacy note); transition timing is already fully expressed by `ParsedMessage.timestamp`.
- **Codex moves to the same module in a separate commit.** Codex is last-wins (`src/providers/codex.ts:115` overwrites on every `turn_context`, no guard), not first-wins as the draft assumed. Measured: 164 sessions, 8 change model mid-session, 7 have first ≠ last, 4 have a `session.model` that no assistant message ever used. *(Rejected: fixing Claude only — `Dashboard.tsx:1568` renders one key space with no provider split, so last-wins `gpt-*` would sit in the same chart as dominant `claude-*`.)* Also note `codex.ts:66-87` does not sum `tokens` on merge while `src/parser.ts:130-139` does; either reconcile it in that commit or state explicitly that Codex per-model token metrics are out of scope.

### `<synthetic>` and contamination

- **`<synthetic>` is excluded from the model axis only — never from parsing or transcript rendering.** One exported predicate defines the test; no scattered string comparisons. — The 42 real occurrences carry the *reason a model switched*: "You've reached your Fable 5 limit…", "You've hit your session limit · resets 4:20am (Asia/Seoul)", "Prompt is too long". *(Rejected: dropping them at parser input — it would delete those messages from transcripts and cut `messageCount.assistant` by 35 across 22 sessions. Rejected: per-consumer string comparisons — the next polluted value will be missed somewhere.)* Note `requestId` presence cannot be used as the discriminator: 14 of the 42 have one.
- **The real justification for excluding it is badge and chart pollution, not signal ⑨.** Two sessions have `session.model === '<synthetic>'` and render as a "Synthetic" badge via `modelNames.ts:2` in `Dashboard.tsx:1723`, `SessionView.tsx:459`, and all three `sessionExport.ts` sites.
- **`storyOfDay.ts:181` gains a `msg.role === 'assistant'` gate; the session fallback stays.** — Measured cause of the multi-model-day inflation: 21 days currently → 19 with the role gate → 18 with synthetic also excluded. Two of the three inflated days come from the role bug, one from synthetic. *(Rejected: the draft's claim that `<synthetic>` contaminates signal ⑨ — excluding it alone changes the count by exactly zero days.)* Do not describe this commit as "fixing ⑨ contamination"; that would send the next maintainer looking for the wrong cause.
- **Signal ⑨'s definition and weighting are untouched.** `collabFingerprint.ts:446` requires `recentActiveDays >= 30` while the window is 30 calendar days (`:41`), so it demands 30 consecutive fully-active days plus 30 more before them. With 31 total active days across a 46-day span it is structurally non-viable, meaning ⑨ changes have zero observable UI effect on real data and can only be validated with synthetic fixtures.
- **`search.ts:57` gains a role gate; `search.ts:189` (`if (s.model) models.add(s.model)`) is removed.** — User messages have never carried a model (measured: 0), so today every user record is tagged with the first-wins session model and `search.ts:138` filters on it: **the model filter returns user prompts that model never answered.** The facet line is not dead code — on the 4 Codex sessions above it injects a model that never answered as a selectable filter option. Search currently has **no test coverage at all**, so this commit must add one.

### Scope exclusions

- **`modelIntensity` keeps its session scope; only the grouping key changes** from `session.model` to derived dominant. *(Rejected: re-keying it by response — `avgUserTurns` loses its denominator entirely since user turns belong to no model, `avgTokens` rides the `input+output+cachedInput` axis this repo already rejected as cache-inflated in `authorshipRatio.ts:11-14`, and double-counting mixed sessions would make the card's printed "N sessions" label exceed the real session count.)*
- **Merged blocks are not split.** `ParsedMessage.models?: string[]` (distinct models in appearance order, emitted only when 2+) records intra-block transitions instead. *(Rejected: splitting on model change — it affects only 5 of 869 blocks but moves `messageCount`, `totalMessages`, `avgMessagesPerSession`, `sessionLengthDist`, `longestSession`, and `search.ts:44` `messageIndex`, which flows into UI state via `App.tsx:317-319`. Unanimous panel opposition.)*
- **Sidechain/subagent exclusion stays, and the resulting gap is documented in the UI.** Excluded assistant lines (16,747) outnumber included ones; distinct excluded responses 9,258 vs 6,268 main. Ranking does not flip, but the **gap is badly distorted**: main-only shows opus-4-8 ahead of fable-5 by 88.7%, while including subagents makes it a 3.1% dead heat. Policy stays because `parser.ts:76-79`, `cli/index.mjs:113/349-350`, hook aggregation, pricing, and search all share this boundary — opening it for the model axis alone would split the denominator between cards. *(Rejected: keeping the exclusion silent — that advertises "accurate model attribution" while leaving the largest error untouched.)*
- **`tokenPricing.ts:101-120` is untouched.** It already prices per-message and is the reference implementation. Freezing `Session.model` makes this automatic.
- **`Stats.modelsUsed` is renamed to `Stats.modelResponses`.** `Stats` is computed at runtime and never serialized (`Dashboard.tsx:1378`, `WrappedView.tsx:36`), so renaming costs nothing — and leaving the name while changing the unit from session-votes to response-counts would hide a contract change from the diff.
- **`modelNames.ts` two-segment handling is included here**, because this change *increases exposure*: `:20`'s `/^(\w+)-(\d+)-(\d+)$/` requires three segments, so `claude-fable-5`, `claude-opus-5`, `claude-sonnet-5` leak through as lowercase raw text, and `MODEL_MAP` stops at 4.6. Response-unit counting lifts `opus-5` from 6th (31) to 3rd (472), raising its exposure in the `ModelSlide` hero and the shared PNG. Correct casing is in the data, not guesswork: the CLI itself prints "You've reached your **Fable 5** limit".

### UI — session model composition (supersedes the transition-marker design)

The user reviewed a transition-marker mock-up and redirected: **do not annotate "the model changed here." State what the session is, the same way tokens and cost are stated.**

- **Both the Dashboard session list and the SessionView header show the session's model composition as a fact badge**, matching the existing token/cost badge pattern: compact value on the badge, full breakdown on hover. Max 3 distinct models per session in real data, so names are listed rather than counted.
  - Badge: `Opus 4.8 · Fable 5 · Opus 5` (descending response count)
  - Hover: per-model response count and share, plus a normalized switch-reason line when one exists
- **Switch reasons appear as normalized categories only** ("사용량 한도", "컨텍스트 초과") — never raw text, because the source strings embed a timezone (`resets 4:20am (Asia/Seoul)`) and would be frozen into `sessionExport` HTML.
- **Per-response model stays available on hover** in SessionView. This is the question that started the work ("which model answered *this*?") and the badge alone cannot answer it.
- **No new color is introduced.** Use the neutral badge token (`DESIGN-GUIDE.md:408`). The palette is saturated: green is quadruple-booked (user bubble `SessionView.tsx:643`, user token badge `:684`, hook success `HookEventView.tsx:31`, hook confidence chip `Dashboard.tsx:1327`), violet = hooks, amber = Claude source + block + highlight ring, rose = failure, cyan = insight.
- **Named-group refactor is a blocking prerequisite.** `SessionView.tsx:637` puts `group` on the message div and `:682` puts `group` on the token badge span; Tailwind's `group-hover:` matches *any* ancestor `.group`, so the token tooltip already fires on hover anywhere in the message. Adding a third hover affordance on top would show three tooltips at once. Split into `group/msg`, `group/token`, `group/model` first.
- **Header badge and body derive from the same source (`messages`).** Server mode re-parses the body via `/api/session-content` (`SessionView.tsx:348-372`) while the header still reads the CLI-parsed light session; static mode has no re-parse at all (`cli/index.mjs:865-880` never sets `filePath`, so the `SessionView.tsx:352` guard blocks it). The composition badge must therefore work from what the CLI parser leaves behind.

## In-scope
- Shared attribution module used by all four parsers; response-unit counting before merge
- `Session.modelResponses`, `ParsedMessage.models`, `RawMessage.requestId` (all optional)
- `Stats.modelsUsed` → `Stats.modelResponses`, computed by summing per-session counts
- `<synthetic>` exclusion from the model axis via one predicate
- `storyOfDay` role gate; `search.ts` role gate + facet fix (with new test coverage)
- `modelIntensity` grouping key → derived dominant
- Codex last-wins → dominant (separate commit)
- `modelNames.ts` two-segment model names
- Dashboard source filter reaching the model donut
- Session model composition badge (list + SessionView header) with hover breakdown
- Per-response model hover in SessionView; named-group refactor as prerequisite
- `ModelSlide` unit footnote + "main conversation only (subagents excluded)" disclosure

## Out-of-scope
- Splitting merged messages; any change to `messageCount` / `messageIndex` contracts
- Redefining `Session.model`; changing `tokenPricing` inputs
- Including sidechain/subagent activity in any aggregate
- Signal ⑨'s definition, weighting, or viability threshold
- Cross-file `requestId` de-duplication
- Transition markers between messages (explicitly dropped by the user)
- `ModelSlide` i18n and `getModelLabel` copy — `ModelSlide.tsx` is the only Wrapped slide without `useI18n`, and `personality.ts:275-279` is Korean-only with opus/sonnet/haiku branches, so English users see one Korean slide and both `gpt-5.5` and `claude-fable-5` fall to the generic label. Not worsened by this change (hero is unchanged); tracked separately.
- **Codex per-message token loss on merge.** `src/providers/codex.ts` `mergeConsecutiveMessages` does not sum `tokens` while `src/parser.ts:130-139` does, so when two consecutive Codex assistant messages each carry an `event_msg` delta, the second one's tokens are dropped. `Session.totalTokens` is unaffected (it comes from the running cumulative total, not from summing messages), but `calculateSessionCost` takes the per-message path when `hasPerMessageTokens` is true (`tokenPricing.ts:103`) and would under-count. This is a **cost** defect, not a model-attribution one: fixing it changes money figures, a different blast radius than this goal, so it is deliberately excluded rather than folded in. Consequently **Codex per-model token metrics are out of scope** — this goal counts responses, not tokens, so it neither depends on nor worsens the defect.
- The model badge's correct color — code hardcodes green (`Dashboard.tsx:1724`, `SessionView.tsx:460`) while `DESIGN-GUIDE.md:429` says it should reuse `sessionSourceColor`. Pre-existing doc/code drift; the composition badge uses the neutral token regardless.

## Acceptance Criteria
- [ ] `npm run test:harness` green at every commit boundary
- [ ] Identical fixture yields identical model attribution from `src/parser.ts` and `cli/index.mjs` — asserted in `tests/model-attribution.test.mts` (parity section generates the static HTML end-to-end and compares against the src parse; registered in `test:harness`). `tests/harness-cli.mjs` carries a pointer comment. *(Original wording placed the assert in harness-cli.mjs; the parity test needed its own file because it also covers the shared module and computeStats.)*
- Known measurement caveats (recorded by the verification workflow, deliberately not "fixed": both would trade a real property for a nominal one):
  - A thinking-only single-line response (no text, no tool_use) is skipped by the empty-content guard before the counter — 2 of 6,715 responses (0.03%). Counting them would create badge-vs-transcript inconsistency, since those lines don't render either.
  - A switch notice merged into an assistant run longer than 200 chars escapes `switchReasonCounts` (1 of 11 notices in the real corpus; the affected session still detects its other notice, and the badge only renders reason presence).
- [ ] **Invariants (corpus-independent) — these are the real criteria.** Absolute totals below are a moving target: the corpus grows every session, and this work's own planning agents wrote sessions to disk mid-flight. Assert relationships, not counts.
  - [ ] Block-keyed and response-keyed rankings disagree — the 3.76× per-model fold bias is observable, not theoretical (measured 2026-08-03: `haiku` is 3rd by block but 4th by response, displaced by `claude-opus-5`)
  - [ ] `claude-opus-5` ranks materially higher under response-keying than block-keying (measured: 4th → 3rd)
  - [ ] `claude-opus-4-7` sits outside the donut top-5 under response-keying
  - [ ] No `<synthetic>` key appears in any `modelResponses`
  - [ ] Mixed-session count **drops** versus a naive raw scan, because synthetic-induced false mixing is removed (measured: 38/79 raw → 29/72 real)
- [ ] Point checks that held exactly across two independent measurements (panel snapshot and post-implementation): **5** merged blocks contain 2+ real models; **2** sessions have `session.model === '<synthetic>'`
- [ ] Wrapped hero is unchanged by the unit switch (session-vote, block, and response units agree on the top model)
- [ ] The 2 sessions whose badge reads "Synthetic" lose it in all 5 render sites
- [ ] The 4 Codex sessions lose their ghost badge and ghost facet
- [ ] `day.models` multi-model days 21 → 18 with active days fixed at 31; `messageCount` and bubble counts byte-identical
- [ ] Model filter no longer returns user prompts; facets no longer list never-answering models
- [ ] Composition badge shows all distinct models (max 3 observed) with hover breakdown, in both list and SessionView header
- [ ] Token tooltip fires only on the token badge; the model tooltip only on the model affordance
- [ ] No new color token; badge row keeps `gap-x-1.5 gap-y-1`

## Related Files / Modules
| File | Role |
|---|---|
| `cli/lib/modelAttribution.mjs` (new) | Single source: synthetic predicate, response counting, dominant derivation |
| `cli/index.mjs:333,469` | The parsers the product actually runs (static + server) |
| `src/parser.ts:98,105,144,637-645,725` | Upload/re-parse parser + `computeStats` |
| `src/providers/codex.ts:66-87,115,166,187` | Codex parser (last-wins; merge drops tokens) |
| `src/types.ts:22-44,69-98,120-139` | `RawMessage` / `ParsedMessage` / `Session` / `Stats` |
| `src/lib/storyOfDay.ts:181` | `day.models` — role gate |
| `src/lib/collabFingerprint.ts:214,221` | Consumes `day.models`; injected design, do not re-walk sessions |
| `src/lib/search.ts:57,138,189` | Record tagging + filter + facets |
| `src/lib/modelIntensity.ts:43` | Grouping key |
| `src/lib/modelNames.ts:2,20` | Display names; `<synthetic>` map entry |
| `src/lib/sessionExport.ts:367,823,1192` | On-disk artifacts |
| `src/components/SessionView.tsx:459,637,658,682,688` | Header badge, nested `group` bug, tooltip pattern |
| `src/components/Dashboard.tsx:1456,1568,1723` | Source filter, donut, session list pill |
| `src/components/wrapped/slides/ModelSlide.tsx` | Hero + bars; 3-column width budget is full |
| `tests/collab-fingerprint.test.mts:218-228,674-721`, `tests/story-of-day.test.mts:314-320`, `tests/model-intensity.test.mts:82,97,99`, `tests/harness-cli.mjs` | Fixtures that encode impossible shapes |

## Must-Preserve
- `cli/lib/*.mjs` single source + TS re-export (`docs/ARCHITECTURE.md:171`, `src/types.ts:5-13`)
- New fields optional, `absent = no-data` tolerated (`src/parser.ts:198-199` pattern). The reason is **not** old-embed compatibility — static HTML inlines its own JS bundle (`cli/index.mjs:966-968`) so version skew is impossible — but server-mode parser lag and the `cli/index.mjs:952-958` `_truncated` fallback, which already violates the `Session` contract (no `totalTokens`, `messageCount`, or `startTime`) and would throw in `parser.ts:704` and `modelIntensity.ts:16`
- `ParsedMessage.model` stays in the static embed — static mode never re-parses, so it is the only basis for per-response attribution and for the `modelResponses` fallback
- Sidechain exclusion boundary shared by hooks, pricing, and search
- `<synthetic>` parsed leniently and rendered in transcripts; excluded only from aggregation
- `storyOfDay.ts:92` intent — "미기록 (분모 오염 방지)"; add the role gate, do not remove the fallback
- `collabFingerprint`'s injected design (header comment 20-23) — fix in `buildDailyCollab` only
- `tokenPricing.ts:101-120` per-message pricing path
- Merge rule and everything derived from it: `messageCount`, `totalMessages`, `avgMessagesPerSession`, `sessionLengthDist`, `longestSession`, `search.ts:44` `messageIndex`
- Wrapped fixed at 8 slides, `ToolsSlide` unimported, `ModelSlide` internal changes only — its bars are a full `w-32` label + bar + `w-10` percent budget, so added information must change the label, not add a row
- `DESIGN-GUIDE.md:408` neutral badge token and `:455-462` badge row `gap-x-1.5 gap-y-1`
- No identifiers, paths, or timestamps added to the static embed — model names and integers only

## Execution Notes
- Recommended model: **Claude Opus 5 or Fable 5** for the parser/contract commits (②, ④, ⑤) and the composition-badge design (⑧) — these carry cross-parser invariants, a frozen public contract, and measured expected values that a weaker model will silently approximate. **Sonnet 5** is acceptable for ① (fixture mechanics), ⑦ (named-group rename), and the display-name portion of ⑥.
- This document cannot enforce the model — the executing session's `/model` setting decides. If the session model is below the recommendation, surface it to the user and confirm before proceeding.
- Commit order is a risk-isolation boundary, not a speed optimization. Each step is independently revertible and ① touches no `src/` or `cli/` code, so every later diff reads as a number change.

### Commit boundaries

| # | Scope | Verification |
|---|---|---|
| ① | Fixture correction only. `tests/collab-fingerprint.test.mts:218-228` and `tests/story-of-day.test.mts:314-320` attach `model` to **user** messages to manufacture multi-model days — a shape that cannot exist (measured: 0). Correct to assistant-carries-model; add mixed-session, single-`<synthetic>`, mid-change Codex, and block-dominant ≠ response-dominant fixtures. Assert the **current (wrong) numbers**. | `npm run test:harness` green; zero diff in `src/` and `cli/` |
| ② | `cli/lib/modelAttribution.mjs` + `.d.mts`; `src/lib` re-export; new optional type fields; wire all four parsers; count pre-merge | `tests/harness-cli.mjs` asserts src↔cli parity on one fixture; expected values above; UI unchanged |
| ③ | `<synthetic>` excluded from the model axis via the shared predicate; `storyOfDay` role gate; resolve the `modelNames.ts:2` map entry | Synthetic badge gone from 5 sites; multi-model days 21→18, active days 31; `messageCount` byte-identical |
| ④ | `Stats.modelResponses` rename + response-unit aggregation; `ModelSlide` unit footnote and subagent disclosure; Dashboard donut label; source filter reaches the donut; `WRAPPED-SPEC.md` update | Hero unchanged; opus-5 6th→3rd; opus-4-7 out of top-5; synthetic 3.7%→0.2% |
| ⑤ | **Mostly subsumed by ③.** `displayModel` prefers dominant, so Codex's last-wins ghost badges disappear with no Codex-specific code. What remains is the facet (moved to ⑥) and the token-loss decision (documented as out-of-scope above) | Measured after ③: Codex 164 sessions / **1,329** assistant blocks (matches the panel figure exactly); the ghost `session.model="gpt-5.1-codex-mini"` now renders as `gpt-5.2-codex`, the model that actually answered; all 3 last-wins ≠ dominant sessions display dominant |
| ⑥ | `modelIntensity` key; `search.ts` role gate + facet removal; `sessionExport` display policy | Fixture updates; **new search test required** and registered in `test:harness` |
| ⑦ | Named-group split: `group/msg`, `group/token` | Token tooltip fires only on the token badge; CopyButton still appears on message hover |
| ⑧ | `SessionModelBadge` (list + SessionView header) with hover breakdown; per-response model folded into the **existing** token tooltip rather than a third hover affordance; normalized switch-reason categories | Verified in-browser on the mixed fixture: badge reads `Sonnet 4 · Opus 4.1`; hover gives `Sonnet 4 — 4 응답 (66.7%) / Opus 4.1 — 2 응답 (33.3%) / 모델 2종 · 총 6 응답 / 전환 사유: 사용량 한도`; per-message tooltip reads `모델: Sonnet 4`, and `모델: Opus 4.1 → Sonnet 4` on the block with an internal switch. No raw notice text, no new color, no marker. **Caveat:** the per-message model line rides on the token tooltip, so an assistant block with no token data shows no model line — acceptable because real transcripts carry usage on assistant lines, and the session badge still states the composition. |
