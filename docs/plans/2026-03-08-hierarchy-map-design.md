# Hierarchy Map Component

## Context

We're exploring changing the extension's mental model from frame-based to document-based endpoints. To support that exploration, we need a visual tool that renders the containment hierarchy (tabs, frames, documents, iframe elements) as nested rectangles. This standalone page will help reason about the data structures and relationships, and may eventually be integrated into the extension.

## Files to Create

| File | Purpose |
|------|---------|
| `src/hierarchy-map/types.ts` | Discriminated union types for the nested JSON structure |
| `src/hierarchy-map/HierarchyMap.tsx` | Recursive React component rendering nested rectangles |
| `src/hierarchy-map/HierarchyMap.css` | Styles — colored borders/headers per entity type |
| `src/hierarchy-map/entry.tsx` | Entry point — reads `?data=` URL param, fetches JSON, renders component |
| `hierarchy-map.html` | Standalone HTML page at project root (like `test-arrows.html`) |
| `test/hierarchy-map-sample.json` | Sample JSON demonstrating nested hierarchy |

No changes to `vite.config.ts` needed — Vite serves root-level HTML pages automatically during dev.

## Types (`types.ts`)

Discriminated union on `type` field. Each variant defines its own typed children — no generic `children` property shared across types. All entity types support `stale?`.

- `TabNode` — `tabId`, `label?`, `stale?`, `frames?: FrameNode[]`
- `FrameNode` — `frameId`, `label?`, `stale?`, `documents?: DocumentNode[]`
- `DocumentNode` — `documentId?`, `url?`, `origin?`, `stale?`, `iframes?: IframeNode[]`
- `IframeNode` — `src?`, `id?`, `stale?`, `frame?: FrameNode` (singular — an iframe creates exactly one frame)

Stale semantics:
- **Tab**: e.g., an opened tab that has been closed by the user
- **Frame**: e.g., an iframe element was removed from the parent document
- **iframe**: e.g., the iframe element was removed from the DOM
- **Document**: e.g., a previous document that was navigated away from

`HierarchyNode = TabNode | FrameNode | DocumentNode | IframeNode` union type is still useful for the recursive rendering component.

## Component (`HierarchyMap.tsx`)

Single recursive `NodeBox` component. Each node renders:
1. Outer div with colored border (color determined by `node.type` via CSS class)
2. Header bar — light fill matching border color, contains a type badge and label
3. Body div containing recursively rendered children

`getLabel(node)` function returns display text based on node type (e.g., `Tab 1`, `frame[0]`, URL for documents, `#id src` for iframes).

No MobX — pure React, static JSON input.

## Styling (`HierarchyMap.css`)

CSS custom properties `--node-color` and `--node-bg` set per type class, consumed by border, header, and badge:

| Type | Color | Border Style |
|------|-------|-------------|
| Tab | Purple (`#7B1FA2` / `#F3E5F5`) | Solid |
| Frame | Blue (`#1565C0` / `#E3F2FD`) | Solid |
| Document | Green (`#2E7D32` / `#E8F5E9`) | Solid |
| iframe | Orange (`#E65100` / `#FFF3E0`) | Dashed |

Stale documents: `opacity: 0.5`, neutral gray header.

## Entry Point (`entry.tsx`)

- Reads `?data=` URL parameter
- Fetches the JSON file
- Shows error/loading states
- Renders `<HierarchyMap root={data} />`

Pattern follows `src/test/arrow-catalog.tsx`.

## Sample Data (`hierarchy-map-sample.json`)

Demonstrates: tab with root frame, stale document (old navigation), current document with two iframe children, 3 levels of nesting, distinct origins.

## Implementation Order

1. `types.ts` and `HierarchyMap.css` (independent)
2. `HierarchyMap.tsx` (depends on types + CSS)
3. `entry.tsx`, `hierarchy-map.html`, `hierarchy-map-sample.json` (depend on component)

## Verification

```bash
npm run dev
# Open: http://localhost:5173/hierarchy-map.html?data=test/hierarchy-map-sample.json
npx vitest run  # Ensure nothing broken
```
