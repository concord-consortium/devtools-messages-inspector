# Action-Centric Hierarchy Framework

## Goal

Unify the hierarchy map and test harness around a shared action framework. Each action type defines what can happen to a frame hierarchy, what tree changes result, and what observable events fire at each layer (Chrome extension, DOM, window).

This serves three purposes:
1. **Interactive documentation** — the standalone hierarchy map shows which events each action produces
2. **Test harness** — the harness uses the same action definitions to fire correct mock events
3. **Future Chrome verification** — Playwright tests compare real Chrome events against the action-defined expectations

## Core Module: `src/hierarchy/action-effects.ts`

A pure function that takes tree state + action and returns the updated tree + a list of event descriptors:

```ts
interface ActionResult {
  state: HierarchyState;
  events: HierarchyEvent[];
}

function applyAction(state: HierarchyState, action: HierarchyAction): ActionResult
```

### Event Descriptors

Each event has an explicit `scope` indicating which layer produces it:

```ts
type HierarchyEvent =
  | { scope: 'chrome'; type: 'onCommitted'; tabId: number; frameId: number; url: string; transitionType?: string }
  | { scope: 'chrome'; type: 'onCreatedNavigationTarget'; sourceTabId: number; sourceFrameId: number; tabId: number; url: string }
  | { scope: 'chrome'; type: 'onTabRemoved'; tabId: number }
  | { scope: 'dom'; type: 'iframeAdded'; tabId: number; parentFrameId: number; frameId: number; src: string }
  | { scope: 'dom'; type: 'iframeRemoved'; tabId: number; parentFrameId: number; frameId: number }
  | { scope: 'window'; type: 'message'; sourceFrameId: number; targetFrameId: number; data: any; origin: string }
```

### Action-to-Events Mapping

| Action | Tree Change | Events |
|--------|------------|--------|
| `add-iframe` | Appends IframeNode + FrameNode + DocumentNode | `dom: iframeAdded` |
| `remove-iframe` | Marks iframe stale | `dom: iframeRemoved` |
| `navigate-iframe` | New DocumentNode in iframe's frame | `chrome: onCommitted` |
| `navigate-frame` | New DocumentNode, marks old stale | `chrome: onCommitted` |
| `reload-frame` | New DocumentNode (same URL) | `chrome: onCommitted` (transitionType: 'reload') |
| `open-tab` | New TabNode + FrameNode + DocumentNode | `chrome: onCreatedNavigationTarget` then `chrome: onCommitted` |
| `close-tab` | Marks tab stale | `chrome: onTabRemoved` |
| `purge-stale` | Removes stale nodes | (none) |
| `send-message` | (none) | `window: message` |

## File Structure

```
src/hierarchy/
  actions.ts          — action type definitions (moved from hierarchy-map/)
  types.ts            — TabNode/FrameNode/etc (moved from hierarchy-map/)
  events.ts           — HierarchyEvent type definitions
  action-effects.ts   — applyAction(): state + action → new state + events
  reducer.ts          — tree-update logic (extracted from current reducer)
src/hierarchy-map/
  HierarchyMap.tsx    — UI component (imports from src/hierarchy/)
  HierarchyMap.css
  entry.tsx           — standalone page entry point
```

The `src/hierarchy/` module is pure data transformation — no React, no Chrome APIs, no test harness dependencies.

## Consumers

### Standalone Hierarchy Map

Calls `applyAction()` instead of the old `reduce()`. The action log shows both the action and resulting event descriptors, serving as interactive documentation.

### Test Harness (future phases)

A runtime layer interprets event descriptors to fire mock Chrome events, trigger DOM mutations, and dispatch messages. The details of this integration will be designed when we have concrete `action-effects` to work with.

### Future Playwright Chrome Verification

Playwright drives a real browser to perform an action, collects actual Chrome events via the extension, and compares against the event descriptors from `applyAction()`.

## Layout in test.html (future phases)

Hierarchy map on the left sidebar, panel message table on the right. Topology buttons (add iframe, navigate, etc.) modify the tree and fire mock events. Message-send buttons on child/opened frames trigger postMessage flow through the content script mock into the panel.

### Message-Send Buttons

| Button | On which node | Effect |
|--------|--------------|--------|
| `↓ msg` | Child frame | Parent sends canned message to this child |
| `↑ msg` | Child frame | This child sends canned message to parent |
| `↓ msg` | Opened tab's frame | Opener sends canned message to this window |
| `↑ msg` | Opened tab's frame | This window sends canned message to opener |

## Phasing

**Phase 1: Extract shared module.** Move types/actions/reducer into `src/hierarchy/`. Add event types and `action-effects.ts`. Hierarchy map and test harness continue working unchanged.

**Phase 2: Refactor test harness.** Create a runtime layer that uses `action-effects.ts` to fire mock events. Refactor `HarnessFrame.addIframe()`, `ChromeExtensionEnv.openPopup()`, etc. to dispatch through the shared module.

**Phase 3: Integrate hierarchy map into test.html.** Add hierarchy map to left sidebar, wire action buttons to harness runtime.

**Phase 4: Add message-send buttons.** Add `send-message` action type and wire buttons to harness runtime.
