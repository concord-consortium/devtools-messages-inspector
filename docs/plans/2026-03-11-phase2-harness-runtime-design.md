# Phase 2: Harness Runtime Design

## Goal

Create a `HarnessRuntime` class that bridges the hierarchy module (`applyAction`) with the test harness (`ChromeExtensionEnv` + harness models). All topology changes flow through hierarchy actions, and the runtime materializes the correct harness objects and fires the correct Chrome events.

This replaces the current approach where `HarnessFrame.addIframe()`, `ChromeExtensionEnv.openPopup()`, and `HarnessFrame.navigate()` each independently create objects and fire events. Instead, a single `dispatch(action)` call does everything:

```
dispatch(action)
  → applyAction(state, action)        // pure: updates hierarchy tree, produces event descriptors
  → for each event:
      materializeForEvent(event)      // create/update harness objects needed for this event
      fireEvent(event)                // fire Chrome/DOM event (if applicable)
```

Materialization and event firing are interleaved per-event, not batched. This matches real browser behavior where each event has its own prerequisites — e.g., for `add-iframe`, the iframe DOM element must exist (and could trigger a MutationObserver) before the frame inside it loads and fires `onCommitted`.

## HarnessRuntime Class

```ts
class HarnessRuntime {
  readonly env: ChromeExtensionEnv;
  hierarchyState: HierarchyState;
  actionLog: Array<{ action: HierarchyAction; events: HierarchyEvent[] }>;

  // ID → harness object mappings
  private tabs: Map<number, HarnessTab>;
  private frames: Map<number, HarnessFrame>;    // frameId → HarnessFrame

  constructor(env: ChromeExtensionEnv);

  /** Materialize an initial tree into harness objects. Call once before dispatch(). */
  materializeTree(tree: TabNode | TabNode[]): void;

  /** Dispatch a hierarchy action: update state, create objects, fire events. */
  dispatch(action: HierarchyAction): ActionResult;

  /** Accessors */
  getTab(tabId: number): HarnessTab | undefined;
  getFrame(frameId: number): HarnessFrame | undefined;
  getWindow(frameId: number): HarnessWindow | undefined;
}
```

## Tree Materialization

`materializeTree()` accepts a hierarchy tree (same format used by the standalone hierarchy map) and creates all corresponding harness objects. This handles initial topology setup declaratively:

```ts
runtime.materializeTree({
  type: 'tab', tabId: 1, frames: [{
    type: 'frame', frameId: 0, documents: [{
      type: 'document', documentId: 'doc-0',
      url: 'https://parent.example.com/',
      iframes: [{
        type: 'iframe', iframeId: 1, src: 'https://child.example.com/',
        frame: {
          type: 'frame', frameId: 1, documents: [{
            type: 'document', documentId: 'doc-1',
            url: 'https://child.example.com/',
          }]
        }
      }]
    }]
  }]
});
```

### Materialization Algorithm

Walk the tree depth-first. For each node type:

**TabNode:**
1. Create `HarnessTab(tabId)`
2. Register with env via `env.registerTab(tab)` (new method — adds to env's tab map and wires `tab.onCommitted = env.bgOnCommitted`)
3. Store in `this.tabs`

**FrameNode (top-level, parentFrameId = -1):**
1. Find the active (non-stale) document for URL/origin
2. Create `HarnessFrame(tab, frameId, -1)`
3. Create `HarnessDocument(documentId, url, title)`
4. Create `HarnessWindow({ location: { href, origin }, title })`
5. Register frame with tab and store in `this.frames`
6. Fire `env.bgOnCommitted.fire({ tabId, frameId, url })`

**IframeNode (with nested FrameNode):**
1. Find parent frame's HarnessWindow
2. Create child `HarnessFrame(tab, childFrameId, parentFrameId)`
3. Create child `HarnessDocument` and `HarnessWindow` from iframe's frame's document
4. Create proxy pair: `createProxyPair(parentWin, childWin)`
5. Wire proxies: `childWin.setParentProxy()`, `parentWin.registerChildProxy()`
6. Create iframe DOM element: `parentWin.addIframeElement({ src, id, contentWindow: proxy })`
7. Register child frame with tab and store in `this.frames`
8. Fire `env.bgOnCommitted.fire({ tabId, childFrameId, url })`

**TabNode with openerTabId/openerFrameId:**
After creating all frames within the tab:
1. Look up opener frame's HarnessWindow from `this.frames`
2. Create proxy pair: `createProxyPair(openerWin, popupWin)`
3. Wire proxies: `popupWin.setOpenerProxy()`, `openerWin.registerOpenedWindowProxy()`

### Comparison with Current Setup

Current `test-harness-entry.ts`:
```ts
const topFrame = env.createTab({ tabId: 1, url: 'https://parent.example.com/', title: 'Parent Page' });
const childFrame = topFrame.addIframe({ url: 'https://child.example.com/', iframeId: 'child-iframe' });
```

After refactor:
```ts
const runtime = new HarnessRuntime(env);
runtime.materializeTree({
  type: 'tab', tabId: 1, frames: [{
    type: 'frame', frameId: 0, documents: [{
      type: 'document', documentId: 'doc-0',
      url: 'https://parent.example.com/', title: 'Parent Page',
      iframes: [{
        type: 'iframe', iframeId: 1, src: 'https://child.example.com/',
        frame: { type: 'frame', frameId: 1, documents: [{
          type: 'document', documentId: 'doc-1', url: 'https://child.example.com/'
        }]}
      }]
    }]
  }]
});
const parentWin = runtime.getWindow(0)!;
const childWin = runtime.getWindow(1)!;
```

The tree format is more verbose but is the same format used by the hierarchy map, making it possible to share topology definitions between the hierarchy map and the test harness (phase 3 goal).

## Event-Driven Materialization

Each event type has a `materializeForEvent` handler that creates or updates harness objects, then optionally fires a Chrome event. Events are processed sequentially in array order from `applyAction()`.

| Event | Materializes | Fires |
|-------|-------------|-------|
| `dom: iframeAdded` | child Frame + Window, proxy pair, iframe DOM element | (future: MutationObserver) |
| `dom: iframeRemoved` | (future: remove DOM element) | (future: MutationObserver) |
| `chrome: onCommitted` | update frame's document + window.location | `bgOnCommitted` |
| `chrome: onCreatedNavigationTarget` | Tab + Frame + Window, opener proxy pair | `bgOnCreatedNavTarget` |
| `chrome: onTabRemoved` | (none) | `bgOnTabRemoved` |
| `window: message` | (future — phase 4) | (future — phase 4) |

### Per-Event Materialization Details

**`dom: iframeAdded`** `{ tabId, parentFrameId, frameId, src }`
1. Look up parent frame's HarnessWindow from `this.frames` using `parentFrameId`
2. Create child `HarnessFrame(tab, frameId, parentFrameId)`, `HarnessDocument`, `HarnessWindow` (origin from `src`)
3. Create proxy pair: `createProxyPair(parentWin, childWin)`
4. Wire proxies: `childWin.setParentProxy()`, `parentWin.registerChildProxy()`
5. Create iframe DOM element: `parentWin.addIframeElement({ src, contentWindow: proxy })`
6. Register child frame with tab, store in `this.frames`

At this point a MutationObserver (if we add one in the future) would fire. The iframe element exists in the DOM with a functional contentWindow, but the frame hasn't "committed" yet.

**`chrome: onCommitted`** `{ tabId, frameId, url }`
1. Look up HarnessFrame from `this.frames` using `frameId`
2. Look up the frame's current document from the hierarchy state (find the non-stale document)
3. Update `frame.currentDocument` to new `HarnessDocument(documentId, url)`
4. Update `frame.window.location` to `{ href: url, origin }`
5. Fire `env.bgOnCommitted.fire({ tabId, frameId, url })`

For initial frame loads (after `iframeAdded` or `onCreatedNavigationTarget`), step 2-4 confirms the document/location set during the preceding event's materialization. For navigations, steps 2-4 update to the new document and URL.

**`chrome: onCreatedNavigationTarget`** `{ sourceTabId, sourceFrameId, tabId, url }`
1. Create `HarnessTab(tabId)`, register with env via `env.registerTab(tab)`
2. Create `HarnessFrame(tab, 0, -1)` for top frame
3. Create `HarnessDocument` and `HarnessWindow` from URL
4. Register frame with tab, store in `this.frames` and `this.tabs`
5. Look up opener frame's HarnessWindow using `sourceFrameId`
6. Create proxy pair: `createProxyPair(openerWin, popupWin)`
7. Wire proxies: `popupWin.setOpenerProxy()`, `openerWin.registerOpenedWindowProxy()`
8. Fire `env.bgOnCreatedNavTarget.fire({ sourceTabId, sourceFrameId, tabId, url })`

**`chrome: onTabRemoved`** `{ tabId }`
1. Fire `env.bgOnTabRemoved.fire(tabId)`

No harness object changes — the hierarchy state tracks staleness.

**`dom: iframeRemoved`** `{ tabId, parentFrameId, iframeId }`

No-op for now. Could remove the iframe DOM element in the future.

## Action Dispatch

`dispatch(action)` updates hierarchy state, then processes each resulting event through the event-driven materialization loop:

### add-iframe

Events: `iframeAdded` → `onCommitted`

1. **`iframeAdded`** — creates child frame, window, proxy pair, iframe DOM element. The iframe appears in the parent's DOM with a cross-origin URL (either provided or auto-generated).
2. **`onCommitted`** — updates document/location, fires `bgOnCommitted` which triggers content script injection.

### open-tab

Events: `onCreatedNavigationTarget` → `onCommitted`

1. **`onCreatedNavigationTarget`** — creates tab, frame, window, opener proxy pair. Fires `bgOnCreatedNavTarget` which enables message buffering.
2. **`onCommitted`** — updates document/location, fires `bgOnCommitted` which triggers content script injection.

### navigate-frame / navigate-iframe / reload-frame

Events: `onCommitted`

1. **`onCommitted`** — updates frame's document and window.location to the new URL, fires `bgOnCommitted`.

### close-tab

Events: `onTabRemoved`

1. **`onTabRemoved`** — fires `bgOnTabRemoved`. Background cleans up panel connections.

### remove-iframe

Events: `iframeRemoved`

1. **`iframeRemoved`** — no-op for now.

### purge-stale

Events: (none) — pure hierarchy state cleanup.

## Hierarchy Module Changes

### add-iframe action gets optional `url`

Current action type:
```ts
{ type: 'add-iframe'; documentId: string }
```

New action type:
```ts
{ type: 'add-iframe'; documentId: string; url?: string }
```

**Reducer change** (`reducer.ts`): `addIframe()` uses the provided `url` if present, otherwise generates one via `nextPageNumber` (like `navigateFrame` does). The current behavior of always creating `about:blank` iframes is not useful — `about:blank` inherits the parent's origin, making it same-origin and useless for cross-origin testing. Generating a unique URL by default also makes the hierarchy map visualization more meaningful.

```ts
// Before (always about:blank)
const newDoc: DocumentNode = {
  type: 'document',
  documentId: `doc-${docId}`,
  url: 'about:blank',
};

// After (explicit or generated URL)
const url = actionUrl ?? `https://page-${pageNum}.example.com/`;
const newDoc: DocumentNode = {
  type: 'document',
  documentId: `doc-${docId}`,
  url,
  origin: new URL(url).origin,
};
```

**`action-effects.ts`**: No change needed — it already reads the URL from the new state to populate events.

**Hierarchy map UI**: No change needed — the "+" button dispatches `{ type: 'add-iframe', documentId }` without a URL, which now generates a unique cross-origin URL automatically.

**Test harness usage**: Can provide specific URLs for clarity:
```ts
runtime.dispatch({ type: 'add-iframe', documentId: 'doc-0', url: 'https://child.example.com/' });
```

### Files changed

| File | Change |
|------|--------|
| `src/hierarchy/actions.ts` | Add optional `url` to `add-iframe` |
| `src/hierarchy/reducer.ts` | Use provided URL or generate one |
| `src/hierarchy/action-effects.test.ts` | Update expected URLs in add-iframe tests |
| `src/hierarchy/reducer.test.ts` | Update expected URLs in add-iframe tests |

## Changes to ChromeExtensionEnv

Add a `registerTab()` method so the runtime can register externally-created tabs:

```ts
// In ChromeExtensionEnv
registerTab(tab: HarnessTab): void {
  this.tabs.set(tab.id, tab);
  tab.onCommitted = this.bgOnCommitted;
}
```

This is the only change to the existing env. All existing methods (`createTab`, `openPopup`, `connectPanel`) continue working.

## Migration Strategy

### Step 1: Add HarnessRuntime + registerTab

New files:
- `src/test/harness-runtime.ts` — HarnessRuntime class
- `src/test/harness-runtime.test.ts` — unit tests

Modified:
- `src/test/chrome-extension-env.ts` — add `registerTab()` method

Tests verify:
- `materializeTree()` creates correct harness objects
- `dispatch()` for each action type creates objects and fires events
- Integration: runtime + env + background + content scripts work end-to-end

### Step 2: Refactor test-harness-entry.ts

Replace direct harness calls with runtime:

```ts
// Before
const topFrame = env.createTab({ tabId: TAB_ID, url: '...', title: '...' });
const childFrame = topFrame.addIframe({ url: '...', iframeId: 'child-iframe', title: '...' });

// After
const runtime = new HarnessRuntime(env);
runtime.materializeTree(initialTree);
```

Expose `runtime` on `window.harness` alongside existing properties.

### Step 3: Refactor integration tests (optional, can be deferred)

Replace `env.createTab()` + `addIframe()` with `runtime.materializeTree()` in test setup. Test assertions remain unchanged since the harness objects behave identically.

### Backward Compatibility

- `ChromeExtensionEnv.createTab()`, `openPopup()` remain functional
- `HarnessFrame.addIframe()`, `navigate()` remain functional
- Tests can mix direct harness calls with runtime dispatch
- No breaking changes

## File Summary

| File | Change |
|------|--------|
| `src/hierarchy/actions.ts` | Add optional `url` to `add-iframe` action |
| `src/hierarchy/reducer.ts` | Use provided URL or generate via `nextPageNumber` |
| `src/hierarchy/action-effects.test.ts` | Update expected URLs in add-iframe tests |
| `src/hierarchy/reducer.test.ts` | Update expected URLs in add-iframe tests |
| `src/test/harness-runtime.ts` | **New:** HarnessRuntime class |
| `src/test/harness-runtime.test.ts` | **New:** unit tests |
| `src/test/chrome-extension-env.ts` | Add `registerTab()` method |
| `src/test/test-harness-entry.ts` | Refactor to use HarnessRuntime |

## Known Limitations

**Proxy origin staleness:** When a frame navigates, its `CrossOriginWindowProxy._callerOrigin` retains the original origin. This is a pre-existing issue in the current harness (not introduced by the runtime). The content script is re-injected on navigation, so message capture still works correctly — only the `event.origin` in `dispatchMessage()` would be stale if a test manually calls `postMessage` after navigation. Can be addressed separately by updating proxy origins in the navigate materialization step.
