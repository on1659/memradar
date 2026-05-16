# Memradar Icons Design Notes

## Fixed Rules

The icon set is rebuilt as monochrome SVG. Every component uses `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `strokeWidth={1.75}`, round caps, and round joins. Child shapes do not set color, `strokeWidth`, or arbitrary `data-*` attributes. The set intentionally avoids gradients, hard-coded hex colors, multi-hue segmentation, people, AI-brain, wand, sparkle, flame, rocket, and crown metaphors.

## Category Grammar

| Group | Visual rule |
| --- | --- |
| Personality | Reader types use a circle frame; Executor types use a faceted octagon. The internal mark carries the second/third-axis flavor without adding color. |
| Coding Time | All six use the same clock dial. Time is differentiated by hand angle plus one small day/night cue. |
| AI Role | Roles are represented by work objects and workflows: modules, fault target, lanes, document, layout, pipeline, database, checklist. No human or magic figure is used. |
| Tools | Tool icons show literal tool action: reading, editing, writing, shell, search, file pattern, routing, web, fallback tool, rank marker. |
| System | System marks are sparse status symbols. `toolGlyph` is not its own SVG; it maps to the exact same `WrenchIcon` used by Tools default. |

## Icon Decisions

| Icon | Decision |
| --- | --- |
| DeepDiver | Circle reader frame, text surface, downward arrow, and bottom baseline show depth-first investigation. |
| CodeAppraiser | Circle reader frame, short code lines, and inspection lens show fast code assessment. |
| Librarian | Circle reader frame with vertical shelf strokes and catalog ticks show broad reading. |
| TrendHunter | Circle reader frame with rising line, nodes, and arrow corner show trend tracking. |
| MasterSmith | Faceted executor frame with anvil/workbench strokes shows finish quality without a hammer emoji. |
| LightningFixer | Faceted executor frame with two issue blocks and a direct repair route replaces lightning/bolt imagery. |
| AllroundBuilder | Faceted executor frame with four modules and connecting rails shows multi-surface building. |
| ChaosCreator | Faceted executor frame with central routing node and linked experiment points shows concurrent exploration. |
| NightOwl | Clock dial, night hand position, crescent cue, and single dot mark 02-06. |
| EarlyBird | Clock dial, early hand angle, horizon, sunrise arc, and short rays mark 06-10. |
| MorningWarrior | Clock dial, midday hand position, high sun cue, and stable horizon mark 10-14. |
| AfternoonWarrior | Clock dial, rightward hand, side sun cue, and shorter baseline mark 14-18. |
| EveningCoder | Clock dial, descending hand, horizon arc, and low cue mark 18-22. |
| MoonlightCoder | Clock dial, late hand angle, crescent cue, and single dot mark 22-02. |
| Feature | Three modules, connectors, and plus strokes show feature assembly. |
| Debug | Fault target, crossing marks, and inspection lens show bug isolation without siren imagery. |
| Refactor | Reordered lanes and a turn-back arrow show structural cleanup. |
| Review | Document, folded corner, text lines, and inspection lens show code analysis. |
| Writing | Document, folded corner, text lines, and diagonal edit shape show writing. |
| Design | Layout rectangle, grid division, and crosshair ruler mark show visual adjustment. |
| Devops | Two deployment blocks, pipeline path, and arrow show release flow without rocket imagery. |
| Data | Database cylinder, repeated band, and transform arrow show data work. |
| Test | Checklist panel, checks, and validation circle show QA. |
| Read | Folded document and text rows show file reading. |
| Edit | Folded document plus diagonal edit mark show targeted modification. |
| Write | Folded document plus plus mark show new file/content creation. |
| Bash | Terminal frame, header line, prompt, and cursor line show command execution. |
| Grep | Text lines plus lens show text search. |
| Glob | Folder frame, wildcard points, and connection line show file pattern matching. |
| Agent | Central routing square and four abstract nodes show delegation/orchestration without any body or face. |
| Web | Globe, meridians, equator, and pointer mark represent WebSearch/WebFetch with one shared SVG. |
| Wrench | Reduced line-tool form is the default unknown-tool icon. |
| Rank1 | Round medallion and rank stroke replace crown/trophy imagery. |
| BrandMark | Diamond/radar line mark keeps the Memradar identity as currentColor geometry. |
| EmptySessions | Tray and empty indicator replace the mailbox emoji. |
| Warning | Triangle, vertical stroke, and dot show error/interruption states. |
| toolGlyph | Reuses `WrenchIcon` exactly through `SYSTEM_ICONS.toolGlyph`; there is no `ToolGlyph.tsx`. |

## Rule Changes From The Brief

The proposed category rules were kept with two small refinements. Personality icons use two outer frames instead of one shared frame so the Reader/Executor axis is visible at small sizes. Lightning Fixer deliberately avoids a bolt despite the label, because the brief explicitly rejects `Zap`/lightning as an AI-slop signature.
