# Node Details Panel for Hierarchy Map

## Goal

Add a collapsible details area to hierarchy map nodes, between the header and body. This lets headers stay compact (short IDs) while providing access to full entity info on demand.

## Header Labels (shortened)

| Type | Before | After |
|------|--------|-------|
| Tab | `Tab 1 (opened by tab[2].frame[0])` | `Tab 1` |
| Frame | `frame[0]` | `frame[0]` (unchanged) |
| Document | `https://app.example.com/dashboard` | `https://app.example.com` (origin, fallback to short doc ID) |
| Iframe | `#widget-iframe https://widget.example.com/embed` | `#widget-iframe` (just `#id`, fallback to `iframe`) |

## Details Content Per Type

| Type | Fields |
|------|--------|
| Tab | `opener: tab[X].frame[Y]` (only when openerTabId is set) |
| Frame | No details — info button hidden |
| Document | `id: <documentId>`, `url: <url>`, `title: <title>` (each only if present) |
| Iframe | `src: <src>`, `id: <element id>` (each only if present) |

## UI Behavior

- An info button (ℹ) appears in the header alongside existing action buttons, only for nodes that have details to show.
- Collapsed by default. Clicking the button toggles a `node-details` div between header and body.
- Details area uses the same `--node-bg` background as the header, separated from the body by a bottom border.
- Key-value layout: label in a muted color, value truncated with ellipsis and `title` attribute for full text on hover.

## Layout

```
┌─────────────────────────────────────────────┐
│ DOC  https://app.example.com  [ℹ][+Iframe] │  ← header
├─────────────────────────────────────────────┤
│  id: doc-current                            │  ← details (expanded)
│  url: https://app.example.com/dashboard     │
│  title: My Dashboard                        │
├─────────────────────────────────────────────┤
│  ┌─ children ─┐                             │  ← body
│  └────────────┘                             │
└─────────────────────────────────────────────┘
```

## Type Change

Add `title?: string` to `DocumentNode`.

## Implementation Approach

Local `useState(false)` in `NodeBox` for expand/collapse — no lifted state needed. A `getDetails()` function returns an array of `{ label, value }` pairs (or empty array if no details). The info button and details div are conditionally rendered based on whether `getDetails()` returns entries.
