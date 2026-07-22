# goal: hooks-analytics

## One-line Goal

Surface Claude Code hook activity from session transcripts — per-conversation hook execution in SessionView and a Dashboard "Hook Activity" card (replacing TopSkills) with recorded-execution frequency and configured-but-unobserved hook detection.

## Background / Motivation

Claude Code session JSONL records rich hook telemetry (`{type:"attachment"}` records with `hookName`/`hookEvent`/`command`/`exitCode`/`stdout`/`stderr`/`durationMs`, plus `{type:"system",subtype:"stop_hook_summary"}` ledgers), but both memradar parsers drop every one of these lines at the `!raw.message?.role` guard (`src/parser.ts:72`, `cli/index.mjs:344`). Users cannot see which hooks ran, blocked, failed, or timed out. This feature captures that telemetry into the data model and surfaces it — locally only.

Feasibility, data shapes, and counting hazards were verified against the real corpus by two recon workflows and a 4-lens adversarial design panel (2026-07-22). All design decisions below are panel-settled.

## In-scope

- Shared hook-record collector (`cli/lib/hookExtract.mjs`) used by BOTH parsers, capturing hook attachments, `stop_hook_summary`, and PreToolUse denial `tool_result` texts before the role-drop guard
- `Session.hookSummary` (payload-free, tier-1, all modes) + `HookExecutionDetail` (tier-2, enriched/server only, never on Session)
- `Stats.hooks: HookStats` via `buildHookStats(sessions)` consuming ONLY `Session.hookSummary`
- Dashboard "훅 활동 / Hook Activity" card replacing TopSkillsCard (user-settled), incl. configured-vs-observed footer popover
- `scanHooks()` config inventory (managed + user + current project + enabled-plugins-only) + `/api/hooks` + `window.__MEMRADAR_HOOKS__`
- SessionView two-tier hook display (meta-row segment + collapsible tally panel; enriched inline `HookEventView` rows)
- secretMask pattern extension (webhook URLs, URL userinfo, bearer headers) in the single source
- Removal: `stats.topSkills` + its computeStats tally + TopSkillsCard JSX + dead `src/components/TopSkills.tsx` (update any tests/CLI references)
- Tests: `tests/hook-events.test.mts` + hazard-encoding fixtures + sentinel leak suite + scanHooks units + Playwright card/empty-state assertions
- Docs sync in same PR: `docs/DESIGN-GUIDE.md` (§3.6, §10.1 carve-out, §12), `docs/ARCHITECTURE.md`

## Out-of-scope

- Wrapped slides (fixed at 8; `ToolsSlide.tsx` import stays banned)
- Cross-project settings scanning via transcript-derived cwd paths (rejected — temporally false findings + UNC egress risk); other projects appear only as telemetry-derived provenance
- Hook timeout misconfiguration linting/fixing (spun off separately)
- `errorRate` metric (rejected — rate over a chattiness-biased sample)
- Hook detail (command/stdout/stderr) in exports v1 — exports carry payload-free summary lines only
- Codex sessions (no hook telemetry exists; collector no-ops)

## Design Decisions (panel-settled — do not relitigate during implementation)

- **D1 Shared collector.** One plain-JS module `cli/lib/hookExtract.mjs` (+ `.d.mts`), re-exported for the browser via `src/lib` (exact `secretMask.mjs` precedent). API: `createHookCollector({includeDetail}) → { collect(raw), finalize(): {summary?, executions?} }`. Both parsers call `collect(raw)` on every parsed line BEFORE their role-drop guard and `finalize()` after the loop; attach `summary` to `Session.hookSummary` (omit when undefined); `executions` only when `includeDetail` (wired to `includeToolDetails`). Per-record try/catch fail-soft. Contract: the plain-JS collector emits the COMPLETE summary shape; `buildHookStats` (TS) consumes `Session.hookSummary` ONLY, never raw records — this keeps static mode (browser-side `computeStats`) correct since `cli/index.mjs` cannot import TypeScript. *(Rejected: per-line pure extractor — cannot pair companion records, dedup summaries, or merge denials.)*

- **D2 Execution-identity data model.** Execution identity = `(sessionId, toolUseID, command)`. Terminal outcomes ONLY: `'success' | 'denied' | 'blocking_error' | 'non_blocking_error' | 'cancelled'`. `hook_system_message` / `hook_additional_context` are companion payload records of the SAME execution (corpus: 603 verified pairs) — merged onto the toolUseID group as `hasSystemMessage` / `additionalContextCount`, NEVER counted as executions, never in denominators; in multi-command groups where the payload record has no command, increment a `(hookName, commandKey:'unknown')` row. Types in `src/types.ts`:
  - `Session.hookSummary?: SessionHookSummary = { rows: HookSummaryRow[]; firstSeen; lastSeen }`
  - `HookSummaryRow = { hookName, hookEvent, commandKey (sha256-8 of raw command; 'unknown' when unattributable), counts: { success, denied, blockingError, nonBlockingError, cancelled, timedOut, summaryOnly }, durationMsSum, durationMsCount, lastSeen, hasSystemMessage, additionalContextCount, encodingDamaged? }` — NO command/stdout/stderr/content fields (structural privacy: static embed stringifies whole Sessions)
  - `HookExecutionDetail` (enriched tier only, NEVER assigned to Session) = `{ hookName, hookEvent, commandKey, command, outcome, exitCode?, durationMs?, timedOut?, timestamp, toolUseID, stdout?, stderr?, additionalContext?: string[] }`
  - `Stats.hooks: HookStats = { hasHookData, totalObserved, deniedTotal, failureTotal, sessionsWithHooks, eligibleSessions, uniqueHooks, byHook (aggregated by hookName+hookEvent+commandKey, same counts + avgDurationMs (null when durationMsCount=0) + lastSeen) }` — NO errorRate anywhere. *(Rejected: flat HookOutcome union incl. system_message/additional_context — inflates counts ~2x.)*

- **D3 Stop reconciliation.** Inside the collector: join `stop_hook_summary` to Stop attachments by exact `(sessionId, toolUseID)` equality (verified deterministic on real data; NO timestamp windows). Within a matched summary, attribute attachments to `hookInfos` entries by exact `durationMs` first, exact command second, ASCII-skeleton command third (skeleton = strip non-ASCII + U+FFFD runs — cp949 mojibake tolerance). Unmatched `hookInfos` entries become `summaryOnly` executions (commandKey = sha256-8 of skeleton, `encodingDamaged=true` when skeleton≠original, included in duration sums, excluded from denied/failure totals). A parsed denial `tool_result` sharing toolUseID with a `hook_blocking_error` attachment counts ONCE (attachment wins). Non-Stop events count from attachments + denials only. *(Rejected: timestamp-window + command join — ambiguous under duplicate commands, defeated by mojibake.)*

- **D4 scanHooks scope + matching.** Reads ONLY: managed settings, user `settings.json`, CURRENT project `settings.json` + `settings.local.json` (project root = CLI/server invocation root, NEVER transcript-derived cwd), and enabled-plugins-only `hooks.json` (`installed_plugins.json` ∩ `enabledPlugins` — bkit trap). Read gates: reject UNC paths, realpath containment, 1MB cap, extract ONLY the `hooks` key, errors report `{filePath, errorCode}` only. Matching entry↔telemetry: same event AND (matcher match OR commandKey match). Matcher semantics: `null`/`''`/`'*'` = match-all; else full-string `new RegExp` against the resolved segment after `':'`, try/catch with literal-equality fallback on SyntaxError. Command match: sha256-8 of config command (expand `${CLAUDE_PLUGIN_ROOT}`; keep `$CLAUDE_PROJECT_DIR` literal), else sha256-8 of ASCII skeleton. Current-project entries match only telemetry whose normalized cwd equals project root; managed/user/plugin entries match corpus-wide. Event-level-only evidence → confidence `'event'` (badge "이벤트 수준 추정"); commandKey match → `'command'`. Outputs: `/api/hooks` → `{event, matcher, command: maskSecrets(command).masked, source, filePath, observed, confidence}`; static `window.__MEMRADAR_HOOKS__` (escapeScript) → `{event, matcher, sourceLabel, observed, confidence, commandKey}` — NO command text, NO filePath, NO timeout. UI label: **"기록된 실행 없음"** (never "미사용") + tooltip covering the silent-allow blind spot and temporal window. *(Rejected: cwd-derived cross-project scanning + raw command/filePath in static embed.)*

- **D5 Dashboard card.** Replaces TopSkillsCard in the same analytics-grid slot. Rename `.dashboard-analytics-card-skills` → `.dashboard-analytics-card-hooks` keeping grid-column rules and **min-height 13rem** (`src/index.css:264-267`). Title "훅 활동" / "Hook Activity"; ALL strings isKorean ternaries with BOTH branches. Two zones: (1) header = title + CircleHelp `DashboardHoverTooltip` (silent-allow caveat + metric definition) + chips "관측 N" always, "차단 N" amber / "실패 N" rose only when >0, sub-caption "기록이 남은 실행 기준"; (2) top-5 rows by recorded-execution count: single accent-color count bar + compact per-row outcome chips + hover tooltip full breakdown (incl. timedOut, summaryOnly, avgDurationMs scoped "기록 있는 실행 기준", lastSeen). Row label = hookName; multiple commandKeys under one hookName → sub-rows "스크립트 A/B" (static) or masked command via `/api/hooks` (server); never merge durations across commandKeys. Stop rows get a "전체 집계" tooltip marker. Footer pill "설정 N개 · 관측 M개" opens an Escape-closable popover (theme-picker layer precedent) listing sanitized entries with provenance + confidence badges; pill hidden in upload mode. Empty states: (a) hook data → full card; (b) config + Claude sessions + zero observations → config summary + "기록된 실행 없음" explainer; (c) no Claude sessions OR no config source → `hasHookData` empty state with mode-appropriate copy. Same PR removals: `stats.topSkills`, computeStats skill tally, TopSkillsCard JSX, dead `src/components/TopSkills.tsx`. Keep violet accent for slot continuity. NO stacked bar segments in v1. *(Rejected: 3-zone card with 4-segment stacked bars + inline disclosure.)*

- **D6 SessionView two-tier.** Tier 1 (all modes) consumes `Session.hookSummary` only: extend the existing meta-row to "도구 호출 N개 · 훅 실행 M회" — hook segment OMITTED entirely when absent or M=0; existing "모두 펼치기" keeps tool-card scope; clicking the hook segment toggles an inline collapsible per-hook tally panel. No per-event rows in tier 1. Tier 2 (server re-parse with `includeToolDetails`): collector `executions` held in SessionView LOCAL STATE, never assigned to Session. A "훅 표시" toggle reveals: tool-scoped events nested inside their matching `ToolCallView` by toolUseID join (PreToolUse above input, PostToolUse below result, collapsed); session-scoped events (SessionStart/Stop/…) as standalone collapsed rows positioned by timestamp between message blocks. `HookEventView` row: outcome badge (amber 차단 / rose 실패 / neutral 취소 + 시간초과 detail), exitCode, durationMs, command/stdout/stderr/additionalContext rendered maskSecrets-FIRST then Truncate; copy affordances serialize the masked form. Upload mode: `Provider.parse` stays optionless — hookSummary computed unconditionally so uploads get tier 1 with zero Provider changes; tier 2 is server-only. *(Rejected: full hookEvents[] on light tier + global timestamp interleave + second sibling meta-bar.)*

- **D7 Structural privacy.** (1) `SessionHookSummary` has no payload fields BY TYPE; commandKey is a non-reversible sha256-8 digest. (2) `HookExecutionDetail` never assigned to Session. (3) stdout/stderr/additionalContext capture gated inside the extractor on `includeDetail` (light path may read strings transiently for digests/regex but never stores them). (4) Masked surfaces: `HookEventView` render+copy via `useSecretMask`; `/api/hooks` command via maskSecrets at serialization; static `__MEMRADAR_HOOKS__` carries no commands. Mask-before-truncate everywhere. (5) `sessionExport` v1: payload-free hook summary lines only. (6) `hook_additional_context.content` is tier-2 payload, never summary metadata. *(Rejected: raw-in-model/mask-at-display for hook fields — collapses in static mode where the model IS the serialization.)*

- **D8 Tests encode the verified hazards.** `tests/hook-events.test.mts` (mini-runner) + `test:hooks` in the `test:harness` chain. Fixtures (`tests/fixtures/logs/sample-project/session-hooks.jsonl` + `fixtureSessions.ts` mirror) with exact-count assertions: paired success+system_message → 1 execution; success+additional_context → totalObserved 1; duplicate-command stop_hook_summary + toolUseID-equal attachment → durationMs-first attribution, no double count; cp949-mojibake command → skeleton attribution + `encodingDamaged` + config NOT flagged unobserved; denial tool_result → 1 'denied' with hookName+command extracted AND prose-lookalike NOT counted; multi-command toolUseID group → two rows, no duration merge; `timedOut` distinct from cancelled; malformed record skipped fail-soft; `]:`-in-command pins the denial regex. Sentinel leak suite: static HTML from a fixture with sentinel secrets in hook command/stdout → sentinels absent AND no `command`/`stdout` keys under hookSummary; `/api/hooks` with fake `env.SECRET` settings fixture → secret/env absent, command masked; exports sentinel-free. scanHooks units: `'*'` and invalid regex don't throw; disabled plugin excluded; UNC rejected. Playwright: hooks-card visibility + all three empty states via `addInitScript`; NO stats-grid `nth()` changes (1:1 slot swap).

- **D9 Scope guards + version tolerance.** Wrapped stays 8 slides; all analysis local (D4 gates make transcript-derived reads impossible — no-egress by construction). Codex: collector no-ops → hookSummary absent; `eligibleSessions` counts Claude sessions only; `sessionsWithHooks/eligibleSessions` is the only permitted ratio. Version tolerance: absent `Session.hookSummary` and absent `window.__MEMRADAR_HOOKS__` render as no-data (old artifacts/uploads never error); SessionView hook segment omitted, never "훅 0회".

- **D10 Denial extraction.** In the collector, scan ONLY structured `tool_result` content blocks with `is_error===true` in user-role messages; match `/^(\w+(?::[^\s\]]+)?) hook error: \[([\s\S]+?)\]:\s/` — group 1 = resolved hookName, group 2 = clean command (non-greedy to first `]:` + whitespace). Emit outcome `'denied'`, commandKey = sha256-8(command), toolUseID from `tool_use_id`. NEVER scan plain prose (corpus contains textual copies of hook-error strings). Multiple denials on one toolUseID from different hooks count once per (hookName, command). Dedup against `hook_blocking_error` per D3. Tier-1 safe (these lines already survive every mode). *(Rejected: counting blocks solely from hook_blocking_error — structurally blind to every PreToolUse denial: corpus has 4/4 for Stop only.)*

- **D11 secretMask extension.** In the single source `cli/lib/secretMask.mjs`: add Slack webhook URLs, Discord webhook URLs, ntfy.sh topics, URL userinfo (`scheme://user:pass@host`), Authorization Bearer/token header values in command strings. Unit tests in the existing suite. Ships in the same PR, before any hook surface renders commands. *(Rejected: hook-surface-only ad-hoc masking — dual-maintenance drift.)*

- **D12 Docs sync in same PR.** `docs/DESIGN-GUIDE.md`: §3.6 violet reference → hooks card; §12 index TopSkills row replaced; §10.1 explicit carve-out (훅 실행 기록 관측 ≠ 도구 사용 분석) so the settled slot decision cannot be relitigated. `docs/ARCHITECTURE.md`: hookExtract collector, tier model, `__MEMRADAR_HOOKS__`, `/api/hooks`, static-mode-never-heavy-parses invariant.

- **Cross-exam additions (binding):** matcher compilation must never throw (`'*'`/invalid regex → fallback, try/catch mandatory); `hook_cancelled.timedOut`/`timeoutMs` tracked as a distinct `timedOut` tally (timeout vs user-interrupt diagnostics); the mjs/TS seam contract (D1) is explicit; the denial regex + negative fixture are pinned (D8/D10); absence-tolerance chrome (D9); command-less companion records in multi-command groups land on `(hookName, 'unknown')` — never guess an owner.

## Acceptance Criteria

- [ ] `npm test` (test:harness chain incl. new test:hooks) passes; new suite asserts every D8 hazard case with exact counts
- [ ] Sentinel leak suite proves: static HTML, `/api/hooks`, and exports contain no hook command/stdout text or sentinel secrets
- [ ] Static, server, and upload modes all show tier-1 hook data (meta-row segment + Dashboard card); server mode additionally shows tier-2 inline hook rows
- [ ] Paired success+system_message records count as ONE execution (no ~2x inflation); Stop counts reconcile summary↔attachments with zero double-counting
- [ ] PreToolUse denials appear as `denied` (promptale corpus shows non-zero denied for the triage guard)
- [ ] Configured-but-unobserved popover lists user/project/enabled-plugin hooks with provenance + confidence badges, labeled "기록된 실행 없음"; disabled plugins (bkit) excluded
- [ ] TopSkillsCard fully removed (JSX + `stats.topSkills` + computeStats tally + dead `TopSkills.tsx`); no orphaned references; Playwright green with no stats-grid nth() shifts
- [ ] Old static artifacts / uploads without hookSummary render without errors (version tolerance)
- [ ] Codex-only corpus shows the correct empty state; mixed corpus shows Claude hook data
- [ ] `tsc`/build clean; docs updated per D12

## Related Files / Modules

| File | Role |
|------|------|
| `cli/lib/hookExtract.mjs` (+`.d.mts`) | NEW — shared stateful hook collector (single source) |
| `src/lib/hookExtract.ts` | NEW — browser re-export (secretMask precedent) |
| `src/types.ts` | `SessionHookSummary`, `HookSummaryRow`, `HookExecutionDetail`, `HookStats`, `Session.hookSummary`; REMOVE `topSkills` |
| `src/parser.ts` | collector wiring before role guard; `buildHookStats`; REMOVE skill tally |
| `cli/index.mjs` | collector wiring; `scanHooks()`; `/api/hooks`; `window.__MEMRADAR_HOOKS__` injection |
| `vite.config.ts` | dev-middleware `/api/hooks` mirror |
| `src/components/Dashboard.tsx` | hooks card (replaces TopSkillsCard); popover; empty states |
| `src/components/SessionView.tsx` | meta-row segment; tally panel; tier-2 toggle + interleave |
| `src/components/tools/HookEventView.tsx` | NEW — collapsible hook row (ToolCallView pattern) |
| `src/components/TopSkills.tsx` | DELETE (already-dead code) |
| `src/index.css` | `.dashboard-analytics-card-hooks` rename; popover/card styles |
| `cli/lib/secretMask.mjs` | D11 pattern extension |
| `src/lib/sessionExport.ts` | payload-free hook summary lines |
| `tests/hook-events.test.mts`, `tests/fixtures/**` | NEW suite + hazard fixtures |
| `package.json` | `test:hooks` script (COMPLEX trigger acknowledged) |
| `docs/DESIGN-GUIDE.md`, `docs/ARCHITECTURE.md` | D12 sync |

## Must-Preserve

- Wrapped slide count/order fixed at 8; `ToolsSlide.tsx` import banned
- Session data never leaves the machine (no egress; D4 read gates structural)
- Existing parse output for non-hook data byte-identical (messages, tokens, stats other than removed `topSkills`)
- `secretMask` single-source invariant (no surface-local masking)
- `Provider.parse` signature unchanged (upload path optionless)
- Playwright stats-grid positional selectors unchanged
- Static embed size discipline: hookSummary is bounded per session (rows, not events)
- Mini-runner test convention (`npx tsx`, no new test frameworks)

## Execution Notes

- Recommended model: **Claude Fable 5** for the collector/reconciliation logic (D1–D3, D10 — judgment-heavy counting semantics with verified-hazard fixtures), the Dashboard card, and the Reviewer/QA passes. Sonnet acceptable for mechanical items only (CSS rename, docs §12 index row, fixture mirroring).
- This document cannot enforce the model — the executing session's `/model` setting decides. If the session model is below the recommendation, surface it to the user and confirm before proceeding.
- Harness triage: **COMPLEX** (parser.ts+types.ts co-change, new metric, package.json edit, docs multi-file) → Coder → Reviewer → QA. Scout phase satisfied by the two recon workflows + panel (2026-07-22, this document is their synthesis).
- Implementation order for reviewability: (1) hookExtract collector + types + fixtures/tests → (2) parser wiring + buildHookStats → (3) scanHooks + endpoints/injection → (4) Dashboard card + TopSkills removal → (5) SessionView tiers → (6) secretMask patterns + sentinel suite → (7) docs. Each step leaves the build green.
