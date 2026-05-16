# Lucide Verdicts

| File | Icon | Decision | Rationale | Replacement target |
| --- | --- | --- | --- | --- |
| `src/components/Dashboard.tsx` | `BarChart3` | a 유지 | Neutral metric/chart symbol; not an AI or magic metaphor. | - |
| `src/components/Dashboard.tsx` | `Brain` | c 교체 | Direct AI-brain signature and too literal for product tone. | Remove icon or use metric/chart treatment. |
| `src/components/Dashboard.tsx` | `Code2` | c 교체 | User feedback called out code glyphs as over-literal AI-role decoration. | Text header or role-specific custom icon if needed. |
| `src/components/Dashboard.tsx` | `Flame` | b 치환 | Streak flame reads like reward/emoji language. | `TrendingUp` or `Timer` depending on metric. |
| `src/components/Dashboard.tsx` | `Terminal` | c 교체 | In the skills card it is a metaphor, not a literal terminal control. | `ToolDefaultIcon` or text-only header. |
| `src/components/Dashboard.tsx` | `Zap` | b 치환 | Bolt imagery overlaps with the banned lightning/Zap signature. | `BarChart3`, `Timer`, or `TrendingUp`. |
| `src/components/replay/ReplayView.tsx` | `Wrench` | c 교체 | Tool-use display should use the Memradar tool glyph. | `ToolDefaultIcon`. |
| `src/components/SessionView.tsx` | `Bot, User` | c 교체 | `Bot` is an AI-slop cue; sender labels already carry identity. | Text labels or neutral chips. |
| `src/components/updates/ProductUpdates.tsx` | `Sparkles` | c 교체 | Sparkles is explicitly banned as magic/AI decoration. | Neutral category/action icon. |
| `src/components/updates/ProductUpdates.tsx` | `Wrench` | c 교체 | Workflow/tool category should share the custom tool glyph. | `ToolDefaultIcon`. |
| `src/components/search/SearchResults.tsx` | `User, Bot` | c 교체 | Search result role is already textual; `Bot` carries the wrong tone. | Text role chip or neutral dot. |
| `src/components/search/SearchBar.tsx` | `User, Bot` | c 교체 | Filter options do not need pictograms; `Bot` is too AI-branded. | Text-only segmented buttons. |
| `src/components/tools/ToolCallView.tsx` | `Wrench` | c 교체 | Tool-call cards are a primary use of the custom tool system. | `ToolDefaultIcon`. |
| `src/components/DropZone.tsx` | `Terminal` | a 유지 | Literal terminal command instruction; functional rather than decorative. | - |
| `src/components/ThemeSwitcher.tsx` | `Sparkles` | b 치환 | Night/theme identity can be represented without sparkle/magic language. | `MoonStar`. |
| `src/theme/themePresets.ts` | `Sparkles` | b 치환 | Same theme preset issue as `ThemeSwitcher`. | `MoonStar`. |
