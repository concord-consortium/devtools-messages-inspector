# Action-Centric Hierarchy Framework

## Why This Exists

Chrome's frame hierarchy (tabs, frames, documents, iframes, opened windows) produces a complex set of events across multiple layers: Chrome extension APIs (`webNavigation.onCommitted`, `tabs.onRemoved`, etc.), DOM mutations (iframe elements appearing/disappearing), and window-level events (`postMessage`). Understanding which events fire for a given user action — and in what order — is essential for both the extension and its test harness.

Rather than encoding this knowledge separately in the extension code, the hierarchy map UI, and the test harness, we define it once as a shared action framework.

## Design

### Actions and Effects

Each thing that can happen to a frame hierarchy is modeled as an **action** (e.g., `add-iframe`, `navigate-frame`, `open-tab`). The `applyAction` function takes the current hierarchy state and an action, and returns the updated state plus a list of **events** that the action would produce:

```ts
function applyAction(state: HierarchyState, action: HierarchyAction): {
  state: HierarchyState;
  events: HierarchyEvent[];
}
```

The state update is a pure reducer — it transforms the immutable tree of `TabNode`/`FrameNode`/`DocumentNode`/`IframeNode` values. The events are descriptors tagged with a `scope` indicating which layer produces them (`chrome`, `dom`, or `window`).

### Event-Driven Materialization

The test harness uses a `HarnessRuntime` that dispatches actions through `applyAction` and then **materializes** each returned event into the corresponding harness object mutation. For example:

- An `onCommitted` event creates a new `HarnessDocument` and `HarnessWindow` on the target frame
- An `iframeAdded` event creates a child `HarnessFrame`, wires cross-origin proxy pairs, and adds an `<iframe>` element to the parent window's DOM
- An `onCreatedNavigationTarget` event wires opener/opened proxy relationships between windows

This means the harness doesn't need its own logic for "what happens when an iframe is added" — it just responds to the same events that the real Chrome extension would see. Every harness mutation is traceable to a real browser event, which keeps the simulation honest. So far, there has always been a legitimate event of some kind that would normally fire which we can use to trigger the changes in the harness models.

### Convenience Layer: HarnessActions

`HarnessActions` provides a high-level API (`createTab`, `addIframe`, `openPopup`, `navigate`) that constructs the right action object and dispatches it through the runtime. Tests and the browser-based test harness use this API rather than constructing actions directly.

### Actions

Each action and its browser triggers/Chrome events are documented in [hierarchy-actions.md](hierarchy-actions.md).

## File Structure

```
src/hierarchy/
  actions.ts          — action type definitions
  types.ts            — TabNode/FrameNode/DocumentNode/IframeNode
  events.ts           — HierarchyEvent type definitions
  action-effects.ts   — applyAction(): state + action → new state + events
  reducer.ts          — pure tree-update functions
src/test/
  harness-runtime.ts  — materializes events into harness objects
  harness-actions.ts  — convenience API over runtime.dispatch()
  harness-models.ts   — HarnessTab, HarnessFrame, HarnessDocument, HarnessWindow
  chrome-extension-env.ts — wires content scripts, background, and panel together
src/hierarchy-map/
  HierarchyMap.tsx    — UI component (imports from src/hierarchy/)
  entry.tsx           — standalone page entry point
```

The `src/hierarchy/` module is pure data transformation — no React, no Chrome APIs, no test harness dependencies.

## Consumers

### Test Harness

`HarnessRuntime` interprets event descriptors to create harness objects (tabs, frames, windows, proxy pairs) and fire mock Chrome events. `HarnessActions` provides the high-level API used by tests and the browser-based test page.

### Standalone Hierarchy Map

Calls `applyAction()` to update the tree. The action log shows both the action and resulting event descriptors, serving as interactive documentation of what Chrome does for each action.

### Future: Playwright Chrome Verification

Playwright drives a real browser to perform an action, collects actual Chrome events via the extension, and compares against the event descriptors from `applyAction()`. This would validate that the action-to-event mapping stays accurate across Chrome versions.

## Remaining Phases

Phases 1 and 2 are complete.

**Phase 3: Integrate hierarchy map into test.html.** Add hierarchy map to left sidebar, wire action buttons to harness runtime.

**Phase 4: Add message-send buttons.** Add `send-message` action type and wire buttons to harness runtime.

**Phase 5: Clean up broken harness behaviors.**
- **Navigation should replace HarnessWindow, not mutate it.** When `navigate-frame` fires, the hierarchy reducer creates a new `DocumentNode`, but `materializeOnCommitted` only updates the existing `HarnessWindow`'s location and document. This leaves old iframe elements, child proxy registrations, and message listeners intact. In a real browser, navigation replaces the entire document and window context. The fix: `materializeOnCommitted` should create a new `HarnessWindow` and `HarnessDocument` for the frame (mirroring the new `DocumentNode` in the hierarchy), replacing the old window entirely. This naturally clears child iframes, proxies, and listeners.
