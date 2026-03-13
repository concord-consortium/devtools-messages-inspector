# Remove Direct Harness Mutations — HarnessActions Design

## Problem

The harness models (`HarnessFrame`, `ChromeExtensionEnv`) have direct mutation methods (`addIframe()`, `navigate()`, `createTab()`, `openPopup()`) that bypass the hierarchy state. When `HarnessRuntime` manages the topology, calling these methods causes `runtime.hierarchyState` to silently diverge from the actual harness state. Any code reading the hierarchy (including the phase 3 hierarchy map) would see stale data.

## Solution

1. Create a `HarnessActions` class that provides ergonomic convenience methods, each delegating to `runtime.dispatch()`.
2. Add a `create-tab` hierarchy action and `onTabCreated` event to model independent tab creation.
3. Delete the direct mutation methods from harness models and ChromeExtensionEnv.
4. Migrate all call sites (integration tests, test harness entry, dev console API).

## HarnessActions Class

New file: `src/test/harness-actions.ts`

```ts
class HarnessActions {
  constructor(private runtime: HarnessRuntime) {}

  /** Create an independent tab. Returns the top HarnessFrame. */
  createTab(config: { url: string; title?: string }): HarnessFrame

  /** Add an iframe to a parent frame's active document. Returns the child HarnessFrame. */
  addIframe(parentFrame: HarnessFrame, config: { url: string; iframeId?: string; title?: string }): HarnessFrame

  /** Open a popup from a source frame. Returns the popup's top HarnessFrame. */
  openPopup(sourceFrame: HarnessFrame, config: { url: string; title?: string }): HarnessFrame

  /** Navigate a frame to a new URL. */
  navigate(frame: HarnessFrame, url: string, title?: string): void
}
```

Each method:
1. Constructs the appropriate `HierarchyAction`
2. Calls `runtime.dispatch(action)`
3. Returns the relevant `HarnessFrame` from the runtime (looked up after dispatch)

**`iframeId` handling:** The `iframeId` config option is a DOM element `id` attribute, not a hierarchy concept. It doesn't flow through the hierarchy action or events. Instead, `HarnessActions.addIframe` sets the `id` attribute on the iframe DOM element as a post-dispatch step (via the parent window's iframe container).

## Hierarchy Changes

### New action type: `create-tab`

Added to `actions.ts`:
```ts
{ type: 'create-tab'; url: string; title?: string }
```

Both `tabId` and `frameId` are auto-assigned by the reducer (via `nextTabId` and `nextFrameId`), matching `open-tab`'s convention. No `openerTabId`/`openerFrameId`.

**Reducer:** Assigns `tabId` from `state.nextTabId`, creates a new `TabNode` with a single `FrameNode` (frameId 0) containing one `DocumentNode` with the provided url/title.

**Events produced:** `[onTabCreated, onCommitted]`

This models a tab opened independently (new tab button, address bar) — distinct from `open-tab` which models a tab opened from a monitored page.

### New event type: `onTabCreated`

Added to `events.ts`. Models `chrome.tabs.onCreated` from the real Chrome API.

```ts
{ scope: 'chrome'; type: 'onTabCreated'; tabId: number }
```

**Materialization (`materializeOnTabCreated`):** Creates a `HarnessTab`, registers it with the env via `env.registerTab(tab)`, stores in runtime's tab map.

### Updated `open-tab` action

`open-tab` now also produces `onTabCreated` as its first event:
`[onTabCreated, onCreatedNavigationTarget, onCommitted]`

This means `materializeOnCreatedNavTarget` no longer creates the `HarnessTab` — that's handled by `materializeOnTabCreated` which runs first. The split:

- **`materializeOnTabCreated`** (new): Creates `HarnessTab`, registers with env, creates `HarnessFrame` (frameId 0, parentFrameId -1), `HarnessDocument`, `HarnessWindow`, registers frame with tab, stores in runtime maps.
- **`materializeOnCreatedNavTarget`** (refactored): Looks up the already-created popup frame and opener frame, creates proxy pair, wires `setOpenerProxy`/`registerOpenedWindowProxy`, fires `bgOnCreatedNavTarget`.

### How `HarnessActions` finds the frame after dispatch

After `dispatch()` returns, the new tab's `TabNode` is in `runtime.hierarchyState.root`. `HarnessActions` reads the auto-assigned `tabId` from the new state (e.g., comparing `root` before and after, or reading `state.nextTabId - 1`) and retrieves the top frame from the runtime's frame map to return it to the caller.

### Event comparison

| Scenario | Chrome events | Background behavior |
|----------|--------------|-------------------|
| `create-tab` (independent) | `onTabCreated` → `onCommitted` | No buffering — tab is unrelated |
| `open-tab` (from monitored page) | `onTabCreated` → `onCreatedNavigationTarget` → `onCommitted` | Buffering enabled if source monitored |

`create-tab` takes an explicit `url` so tests can assert against specific origins. Both `create-tab` and `open-tab` auto-assign `tabId` — callers read it back from the returned frame via `frame.tab.id`. `open-tab` currently auto-generates a URL via `nextPageNumber` — adding an optional `url` to `open-tab` is out of scope but would be a natural follow-up.

## Deleted Methods

**From `HarnessFrame`:**
- `addIframe()` — replaced by `HarnessActions.addIframe()`
- `navigate()` — replaced by `HarnessActions.navigate()`
- `_navCount` private field — no longer needed

**From `HarnessTab`:**
- `nextFrameId()` — no longer needed; hierarchy state manages ID assignment

**From `ChromeExtensionEnv`:**
- `createTab()` — replaced by `HarnessActions.createTab()`
- `openPopup()` — replaced by `HarnessActions.openPopup()`

## Kept Methods

**On `HarnessRuntime`:**
- `materializeTree()` — retained for seeding complex multi-tab initial trees in a single call (used by HarnessRuntime's own tests). Not used by integration tests or test-harness-entry after migration.


**On `HarnessTab`:**
- `addFrame()` — internal bookkeeping for the tab's frame registry, called by runtime during materialization. Needed by Chrome API mocks (`executeScript`, `getAllFrames`).
- `getFrame()`, `getAllFrames()` — read-only accessors used by Chrome API mocks.

**On `ChromeExtensionEnv`:**
- `registerTab()` — internal, used by runtime
- `connectPanel()` — not a topology mutation
- `createBackgroundChrome()`, `createContentChrome()` — infrastructure

## Call Site Migration

### Integration tests (`integration.test.ts`)

Before:
```ts
let env: ChromeExtensionEnv;
beforeEach(() => {
  env = new ChromeExtensionEnv(initContentScript);
  initBackgroundScript(env.createBackgroundChrome());
});

function setupTwoFrames() {
  const topFrame = env.createTab({ tabId: TAB_ID, url: '...', title: '...' });
  const childFrame = topFrame.addIframe({ url: '...', iframeId: 'child-iframe', title: '...' });
  return { topFrame, childFrame, parentWin: topFrame.window!, childWin: childFrame.window! };
}
```

After:
```ts
let env: ChromeExtensionEnv;
let actions: HarnessActions;
beforeEach(() => {
  env = new ChromeExtensionEnv(initContentScript);
  initBackgroundScript(env.createBackgroundChrome());
  const runtime = new HarnessRuntime(env);
  actions = new HarnessActions(runtime);
});

function setupTwoFrames() {
  const topFrame = actions.createTab({ url: '...', title: '...' });
  const childFrame = actions.addIframe(topFrame, { url: '...', title: '...' });
  return { topFrame, childFrame, parentWin: topFrame.window!, childWin: childFrame.window! };
}
```

Tab IDs are auto-assigned. Tests that need the ID read it from the frame: `topFrame.tab.id`.

- `env.connectPanel(TAB_ID)` → `env.connectPanel(topFrame.tab.id)`
- `env.openPopup(topFrame, { tabId: N, ... })` → `actions.openPopup(topFrame, { ... })`
- `topFrame.navigate(url)` → `actions.navigate(topFrame, url)`

### Test harness entry (`test-harness-entry.ts`)

Replace `runtime.materializeTree(...)` with `actions.createTab(...)` + `actions.addIframe(...)` calls. Expose `actions` and `runtime` on `window.harness`.

### HarnessBanner examples

Before: `harness.topFrame.addIframe({ url: "https://other.com/" })`
After: `harness.actions.addIframe(harness.runtime.getFrame(0), { url: "https://other.com/" })`

### Dev console API (`window.harness`)

```ts
harness.actions   // HarnessActions — createTab(), addIframe(), openPopup(), navigate()
harness.runtime   // HarnessRuntime — for inspecting hierarchyState, getFrame(), getWindow()
```

## File Summary

| File | Change |
|------|--------|
| `src/hierarchy/actions.ts` | Add `create-tab` action type |
| `src/hierarchy/reducer.ts` | Handle `create-tab` — create TabNode + FrameNode + DocumentNode |
| `src/hierarchy/action-effects.ts` | `create-tab` produces `[onTabCreated, onCommitted]`; `open-tab` adds `onTabCreated` |
| `src/hierarchy/events.ts` | Add `onTabCreated` event type |
| `src/hierarchy/reducer.test.ts` | Tests for `create-tab` reducer |
| `src/hierarchy/action-effects.test.ts` | Tests for `create-tab` events; update `open-tab` tests for `onTabCreated` |
| `src/test/harness-actions.ts` | **New:** HarnessActions class |
| `src/test/harness-actions.test.ts` | **New:** Tests for HarnessActions |
| `src/test/harness-runtime.ts` | Add `materializeOnTabCreated` handler; refactor `materializeOnCreatedNavTarget` to only wire proxies |
| `src/test/harness-models.ts` | Delete `addIframe()`, `navigate()`, `_navCount` from HarnessFrame; delete `nextFrameId()` from HarnessTab |
| `src/test/chrome-extension-env.ts` | Delete `createTab()`, `openPopup()` |
| `src/integration.test.ts` | Migrate to HarnessActions |
| `src/test/test-harness-entry.ts` | Migrate to HarnessActions; expose `actions` on `window.harness` |
| `src/test/HarnessBanner.tsx` | Update example strings |
