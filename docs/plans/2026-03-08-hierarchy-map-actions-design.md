# Hierarchy Map Actions

## Context

The hierarchy map is currently a static visualization of a JSON structure. We want to make it interactive so users can build up hierarchy structures by performing browser-like operations (open tabs, add/remove iframes, navigate). This serves two purposes:

1. **Education/exploration** — understand how browser frame hierarchies evolve over time
2. **Extension testing** — the actions will eventually drive simulated chrome events to exercise the extension's frame tracking code, with a side-by-side comparison of ground truth vs. extension's internal model

## Architecture: Action-Log Pattern

Each user operation is represented as a typed action object. A pure reducer function applies actions to produce new hierarchy state. This gives us:

- Clean separation of "what happened" from rendering
- An action log that maps naturally to chrome events in the future
- Easy testing — pure functions in, state out
- Undo capability if needed later

```
User clicks [+ Iframe] on Document
  → dispatches { type: 'add-iframe', documentId: 'doc-1' }
  → reducer produces new hierarchy with iframe + frame + about:blank doc
  → React re-renders
  → (future) action also generates chrome.webNavigation.onCommitted etc.
```

## Actions

| Action | Target | Effect |
|--------|--------|--------|
| `open-tab` | TabNode (by tabId) | Creates new tab with opener relationship, new frame[0], new document |
| `close-tab` | TabNode (by tabId) | Marks tab and all descendants stale |
| `add-iframe` | DocumentNode (by documentId) | Adds iframe (with synthetic iframeId) + new frame + about:blank document |
| `remove-iframe` | IframeNode (by iframeId) | Marks iframe and its frame subtree stale |
| `navigate-iframe` | IframeNode (by iframeId) | New document in iframe's frame, old doc goes stale |
| `navigate-frame` | FrameNode (by frameId) | New document in frame (self-navigation), old doc + nested iframes go stale |
| `reload-frame` | FrameNode (by frameId) | New document with same URL, old doc + nested iframes go stale |
| `purge-stale` | (global) | Removes all stale nodes from the tree |

**Navigation cascading:** When a frame navigates (or reloads), all iframes nested inside the old document are destroyed — they and their frame subtrees go stale. The new document starts with no iframes.

## State Shape

```typescript
interface HierarchyState {
  root: TabNode;
  nextTabId: number;
  nextFrameId: number;
  nextDocumentId: number;
  nextIframeId: number;
  nextPageNumber: number;  // for auto-generated URLs
}
```

Initial state is built from sample JSON or a minimal default (single tab, one frame, one document). The `next*` counters start after the highest existing ID in the initial data.

## ID & URL Generation

- **IDs:** Auto-incrementing integers per entity type, matching browser conventions for tabs/frames. Iframes get a synthetic `iframeId` (browsers don't assign these, but we need stable references).
- **URLs:** Auto-generated origins like `https://page-1.example.com/`, `https://page-2.example.com/`. Each navigation gets a unique URL. Reload reuses the existing URL.

## Type Changes

Add `iframeId: number` to `IframeNode`. This is the only change to existing types.

## UI: Inline Buttons

When `onAction` is provided, each node type shows action buttons in its header:

| Node type | Buttons |
|-----------|---------|
| Tab | `New Tab` · `Close` |
| Frame | `Navigate` · `Reload` |
| Document | `+ Iframe` |
| Iframe | `Remove` · `Navigate` |

- Buttons are small, compact, right-aligned in the header bar
- Text labels (not icons) for discoverability
- Stale nodes show no buttons
- When `onAction` is omitted, no buttons render (read-only mode)

```
<HierarchyMap root={data} />                     // read-only
<HierarchyMap root={data} onAction={dispatch} />  // interactive
```

## Files

**New:**
- `src/hierarchy-map/actions.ts` — Action type union and action creator helpers
- `src/hierarchy-map/reducer.ts` — Pure reducer function + ID counter logic
- `src/hierarchy-map/reducer.test.ts` — Unit tests for the reducer

**Modified:**
- `src/hierarchy-map/types.ts` — Add `iframeId` to `IframeNode`
- `src/hierarchy-map/HierarchyMap.tsx` — Add optional `onAction`, render buttons per node type
- `src/hierarchy-map/HierarchyMap.css` — Button styling
- `src/hierarchy-map/entry.tsx` — Hold state via `useReducer`, wire up dispatch
- `test/hierarchy-map-sample.json` — Add `iframeId` values to existing iframes

## Testing

Reducer gets thorough unit tests: one test per action type, plus edge cases like navigating a frame with deeply nested iframes (cascading stale). The `purge-stale` action tested with mixed stale/non-stale trees.
