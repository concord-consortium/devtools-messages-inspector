# Global Filter Design

## Overview

Add a persistent, toggleable "global filter" that applies across all panel instances. Useful for always filtering out noise (e.g., react-devtools messages) without manually re-entering the filter each time.

## Behavior

- The global filter uses the same liqe syntax as the toolbar filter.
- When enabled and non-empty, it is ANDed with the toolbar filter — messages must pass both.
- Stored in `chrome.storage.local` via the existing `Settings` object, so it persists across sessions and panel instances.
- Has an `enabled` boolean so the filter expression can be preserved while temporarily disabled.

## Changes

### Settings type (`src/panel/types.ts`)

Add to the `Settings` interface:

```ts
globalFilter: string;         // liqe filter expression (default: '')
globalFilterEnabled: boolean;  // toggle without losing the expression (default: true)
```

### Store (`src/panel/store.ts`)

- Update `settings` default to include `globalFilter: ''` and `globalFilterEnabled: true`.
- In `filteredMessages`, when `globalFilterEnabled` is true and `globalFilter` is non-empty, parse it and require messages to pass both the global filter and the toolbar filter.
- Parse the global filter once per change (same pattern as toolbar filter).

### Settings UI (`src/panel/components/App.tsx`)

Add a "Global filter" section below existing settings:

- Enable/disable checkbox
- Text input for the liqe expression (same styling as toolbar filter input)
- Input disabled when checkbox is unchecked

### Filter bar indicator (`src/panel/components/LogView/FilterBar.tsx`)

When the global filter is enabled and non-empty, show a chip to the left of the filter input:

- Text: "Global filter"
- Clicking toggles `globalFilterEnabled`
- Muted style (gray background, small text)
- Visual distinction when disabled (e.g., strikethrough or dimmed)

### CSS (`src/panel/panel.css`)

- `.global-filter-chip` — small inline badge within `.filter-bar` flex layout
- `.settings-filter-input` — text input in settings view, matching `.filter-input` style
