# Memradar Design Guide

## Dashboard layout rules

- Use shared dashboard tokens from `src/index.css` for spacing, card radius, row height, and overlay layers.
- Keep cards visually separate. Do not fake grouping by letting borders visually merge.
- Equal-height cards may share a row, but content alignment depends on card type.
- Tool analytics are hidden from the main dashboard and Wrapped flow unless there is a dedicated advanced analytics surface.

## Card content alignment

- Data visualization cards should center the main graphic within the available body area.
- Summary cards should anchor content near the title instead of vertically centering the whole block.
- Compact side cards such as `연속 기록` and `요일별 패턴` should use a small fixed top offset under the title.
- Avoid large empty space between the title and the first metric in compact cards.

## Compact side card pattern

- Title margin under header: about `12px`.
- Body offset from title: about `8px`.
- Metrics inside compact cards should be stacked with tight spacing and keep the first metric visible near the top.
- Dividers inside compact cards should separate groups without forcing the whole card into vertical center alignment.

## Overlay and tooltip rules

- Large panels such as theme pickers must render above the app shell via portal or equivalent top-level layering.
- Small tooltips may stay local to the component, but they must follow the shared dashboard tooltip layer.

## Theme rules

- Keep theme color definitions centralized in `src/theme/themePresets.ts`.
- `index.css` may keep CSS variable fallbacks, but new theme colors should be added to the preset file first.
- Wrapped uses an independent dark story palette. Do not let Wrapped text or cards inherit light/paper theme colors.
- Avoid changing theme application logic and color definitions in the same patch unless doing a dedicated theme refactor.

## Motion affordance rules

- Buttons that need a stronger click cue may use a subtle periodic animation.
- Prefer soft border glow or icon nudge over large movement.
- Keep the loop calm enough that the interface still feels stable at rest.
- Respect reduced motion settings and disable non-essential affordance animation there.

## Axis label rules

- Time and month labels should stay horizontal.
- Reuse a shared axis label style for charts and heatmaps instead of component-specific writing rules.

## When updating dashboard UI

1. Adjust shared tokens or shared classes first.
2. Only add one-off utility classes when the component truly breaks the shared pattern.
3. After each layout change, verify card top spacing, equal-height rows, overlay stacking, and chart label consistency.
