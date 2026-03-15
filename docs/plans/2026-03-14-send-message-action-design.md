# Phase 4: Send-Message Action Design

## Problem

The hierarchy map and test harness can create and manipulate frame topology (add iframes, navigate, open tabs) but cannot trigger postMessage communication between frames. To use the hierarchy map as a message simulator, we need a `send-message` action that flows through the same action/event pipeline as structural actions.

## Solution

Add a `send-message` action type with a `direction` field that specifies the relationship between source and target. `applyAction` resolves source/target frame and tab IDs by walking the hierarchy tree, increments a message sequence counter, and emits a `window` scope `message` event. The harness runtime materializes this event by calling `dispatchMessage` on the target window.

The hierarchy map UI adds `DirectionIcon`-based buttons to document nodes, with the set of available buttons determined by the document's position in the hierarchy (root, child, or opened tab).

## Action Type

Added to the `HierarchyAction` union in `actions.ts`:

```ts
| {
    type: 'send-message';
    tabId: number;
    frameId: number;
    direction: 'self' | 'self->parent' | 'parent->self' | 'self->opener' | 'opener->self';
  }
```

The `tabId` and `frameId` together identify the document's parent frame — the reference point ("self") for all directions. The `tabId` is needed because the hierarchy can contain multiple tabs, and `applyAction` needs to know which tab to look in for frame resolution.

## Direction Resolution

`applyAction` resolves `frameId` + `direction` into source and target frame/tab IDs:

| Direction | Source | Target |
|-----------|--------|--------|
| `self` | frameId | frameId |
| `self->parent` | frameId | parentFrameId |
| `parent->self` | parentFrameId | frameId |
| `self->opener` | frameId | openerFrameId |
| `opener->self` | openerFrameId | frameId |

For parent resolution: within the given tab, walk the hierarchy tree to find the frame that owns the iframe containing the given frameId. The parent frame is in the same tab, so `tabId` applies to both source and target.

For opener resolution: read the tab's `openerTabId`/`openerFrameId`. The opener is in a different tab, so the target tabId comes from `openerTabId`.

### Error Handling

If the resolution fails (e.g., `self->parent` on a root frame, or `self->opener` on a tab with no opener), `applyAction` returns the state unchanged with an empty events array. The UI prevents these cases via button visibility rules, but `applyAction` handles them defensively since actions can be dispatched programmatically in tests.

## Event Type Update

The existing `message` event in `events.ts` gains `sourceTabId` and `targetTabId` fields:

```ts
{
  scope: 'window';
  type: 'message';
  sourceTabId: number;
  sourceFrameId: number;
  targetTabId: number;
  targetFrameId: number;
  data: any;
  origin: string;
}
```

This matches the pattern of `onCreatedNavigationTarget` which already carries cross-tab IDs.

Note: `HierarchyEvent` is internal to the `src/hierarchy/` module and is only consumed by the harness runtime. It is unrelated to the content script's `PostMessageCapturedMessage` type or the panel's `Message` type. The `message` event variant was defined in the original design but has not been used until now — adding fields is not a breaking change.

## State and Payload

The only state change is incrementing `nextMessageSeq` in `HierarchyState`. No hierarchy tree nodes are added, removed, or modified.

`HierarchyState` gains a new `nextMessageSeq` field (initialized to 1 in `initState`, like the other `next*` fields). Each `send-message` action increments it.

The message payload uses this counter:

```ts
{ type: 'test-message', seq: 1 }
```

The `origin` field is read from the source frame's active (non-stale) document's `origin` property.

## Harness Runtime Materialization

New `materializeMessage` handler in `harness-runtime.ts`:

1. Look up source `HarnessWindow` via `sourceTabId`/`sourceFrameId`
2. Look up target `HarnessWindow` via `targetTabId`/`targetFrameId`
3. Call `targetWindow.dispatchMessage(data, origin, sourceWindow)`

`HarnessWindow.dispatchMessage` already handles proxy resolution automatically — when given a raw `HarnessWindow` as the source, it checks whether the source has a registered proxy as seen by the target (via `_childProxies`, `_parentProxy`, `_openedWindowProxies`, `_openerProxy`) and substitutes the correct proxy in the dispatched event. No manual proxy lookup is needed in `materializeMessage`.

For **self→self**, source and target are the same window.

For **parent↔child**, the proxy pair was created by `materializeIframeAdded`.

For **opener↔opened**, the proxy pair was created by `materializeOnCreatedNavigationTarget`.

The content script's message listener on the target window captures the dispatched message and forwards it through the normal extension pipeline (content → background → panel), so the message appears in the Messages Inspector UI.

## UI: Message Buttons on Document Nodes

### Button-to-Icon Mapping

Each button reuses the existing `DirectionIcon` component. The document where the button lives is treated as "self" (the focused frame):

| Button | sourceType | focusPosition |
|--------|-----------|---------------|
| self→self | `self` | `both` |
| self→parent | `child` | `source` |
| parent→self | `parent` | `target` |
| self→opener | `opened` | `source` |
| opener→self | `opener` | `target` |

Colors are applied via the existing `dir-{sourceType}` CSS classes (e.g., `dir-child`, `dir-parent`) which set `color` on the parent element. `DirectionIcon` uses `currentColor` for its strokes, so it inherits automatically.

### Button Visibility Rules

- **Every document**: `self` button
- **Child document** (frame with `parentFrameId !== 0`): also `self→parent` and `parent→self`
- **Opened tab's root document** (tab has `openerTabId`/`openerFrameId`): also `self→opener` and `opener→self`

### FrameContext

To determine which buttons to show, `NodeActions` needs context about the frame's position. A `FrameContext` object is passed down through the recursive `NodeBox` rendering:

```ts
interface FrameContext {
  tabId: number;
  frameId: number;
  isRootFrame: boolean;   // parentFrameId === 0
  hasOpener: boolean;      // tab has openerTabId/openerFrameId
}
```

`FrameContext` includes `tabId` (already available in `NodeActions` via the existing prop) and adds frame-level context. It is built during the recursive `NodeBox` rendering: frame nodes provide `frameId`, their position relative to the tab determines `isRootFrame`, and the tab node provides opener info. The context is passed through to `NodeActions` alongside the existing props.

### Layout

Message buttons appear after the structural buttons (e.g., `+ Iframe`) with a visual separator between them. Buttons render the `DirectionIcon` SVG inside the existing `ActionButton` wrapper pattern.

## Action Log

Message-send actions appear in the action log like any other action, with their `window` scope events listed. No special visual treatment — the `scope: 'window'` tag distinguishes them from `chrome`/`dom` events.

## File Summary

| File | Change |
|------|--------|
| `src/hierarchy/actions.ts` | Add `send-message` to `HierarchyAction` union |
| `src/hierarchy/events.ts` | Add `sourceTabId`, `targetTabId` to `message` event |
| `src/hierarchy/action-effects.ts` | Add `send-message` case: resolve frame/tab IDs, emit `message` event |
| `src/hierarchy/reducer.ts` | Add `nextMessageSeq` to `HierarchyState`, initialize in `initState` |
| `src/test/harness-runtime.ts` | Add `materializeMessage` handler |
| `src/hierarchy-map/HierarchyMap.tsx` | Add message icon buttons to document nodes, pass `FrameContext` |
| `src/panel/components/shared/DirectionIcon.tsx` | No changes (reuse as-is) |
