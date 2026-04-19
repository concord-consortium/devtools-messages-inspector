# Filter Help Panel Design

## Overview

Add a help button (`?`) to the filter bar that opens a dropdown panel showing filter syntax documentation rendered from a markdown file. This gives users a quick in-panel reference for the liqe-based filter language.

## Components

### 1. Markdown Document: `docs/filter-syntax.md`

A standalone reference document covering:

- **Basic syntax**: `field:value` format, requirement for field prefixes
- **Message data fields**: `data.*` (any property path into message data), `messageType` (shortcut for `data.type`)
- **Endpoint fields**: `source.origin`, `target.origin`, `sourceType` (parent, child, self, opener, opened, top)
- **Identity fields**: `documentId` (matches source or target), `frames` (matches source or target frame)
- **Operators**: negation (`-` prefix or `NOT`), `OR`, `AND`, grouping with parentheses
- **Wildcards**: `*` suffix matching (e.g., `data.source:react-devtools*`)
- **Regex**: `/pattern/flags` syntax (e.g., `data.type:/click|hover/i`)
- **Examples**: practical filter queries

Content is derived from the CLAUDE.md filter syntax section and the `filter` entries in `field-info.ts`.

### 2. Help Button

- A `?` icon button inside `filter-input-wrapper`, positioned to the left of the existing clear button
- Styled as a small circular button matching DevTools aesthetic (similar size/opacity to the clear button)
- Toggles the dropdown open/closed on click
- Uses `aria-label="Filter syntax help"` for accessibility

### 3. Dropdown Panel

- **Position**: Absolutely positioned below the `filter-bar` div, anchored to the right side with an `8px` offset
- **Width**: `max-width: 500px`, shrinks with viewport
- **Height**: `max-height: calc(100vh - offset)` where offset accounts for the filter bar position, with `overflow-y: auto`
- **Z-index**: 1001 (consistent with existing popups like FieldInfoPopup)
- **Dismiss**: Click outside (document click listener via `useEffect`) or click help button again
- **Content**: `react-markdown` rendering the imported markdown file via Vite `?raw` import
- **Styling**: Markdown content styles scoped under `.filter-help-panel` in `panel.css`, reusing the same patterns as the hierarchy map's `.about-content` (font sizes, heading margins, code backgrounds)

### 4. State Management

- `helpOpen` boolean as local React state in `FilterBar.tsx` — no store involvement needed
- Help button and dropdown both rendered inside `FilterBar.tsx`

## Files Changed

| File | Change |
|------|--------|
| `docs/filter-syntax.md` | New — filter syntax reference document |
| `src/panel/components/LogView/FilterBar.tsx` | Add help button, dropdown panel, local state, outside-click handler |
| `src/panel/panel.css` | Add `.filter-help-button`, `.filter-help-panel` styles |

## Existing Patterns Followed

- **Markdown rendering**: Same `react-markdown` + `?raw` import pattern used in `src/hierarchy-map/entry.tsx`
- **Popup positioning**: Similar absolute/fixed positioning with z-index 1001 as `FieldInfoPopup`
- **Icon button styling**: Matches existing `.filter-clear-button` patterns (opacity, sizing, cursor)
- **Click-outside dismiss**: Standard `useEffect` + document event listener pattern
