# Opener Support Improvements

## Problem

The extension has partial opener/popup support with several gaps:

1. **No cross-tab message routing.** Messages captured in the opener's tab aren't sent to the opened tab's panel, and vice versa. The background script only routes to the panel for the tab where the message was captured.

2. **Messages from opened windows labeled as `unknown`.** The content script's `getSourceRelationship` doesn't recognize windows opened via `window.open` or `target=_blank rel=opener`. They fall through to `unknown` because they're not in `win.frames` (that's iframes only).

3. **Registration message data not used by background.** The opened window sends `__frames_inspector_register__` to the opener, and the opener's panel processes it in the FrameStore. But the background script doesn't extract the identity mapping, so it can't set `source.tabId` on subsequent messages or route them cross-tab.

4. **No source tab ID in context pane.** When a message comes from a different tab, the context pane shows `frame[0]` which is ambiguous (both tabs have a `frame[0]`).

5. **Test page can't exercise opener scenarios.** When test-page.html is opened via `target=_blank rel=opener`, it has no buttons to send messages back to the opener. Neither page can respond to received messages.

## Design

### Approach: Opener-Relationship Registry

The background script maintains two data structures for cross-tab routing:

- **`openerRelationships`** — populated immediately from `onCreatedNavigationTarget`, only when the source tab is monitored (panel open or buffering enabled). Maps each tab to its related tab(s). Used for routing `opener`-type messages (each tab has at most one opener, so lookup is unambiguous).

- **`openeeWindowToTab`** — populated from registration messages where `targetType === 'opener'`. Maps `${capturingTabId}:${windowId}` to the opened tab's `{ tabId, frameId }`. Used for routing `openee`-type messages (the opener may have opened multiple tabs, so windowId is needed to disambiguate).

### 1. New Source Type: `openee`

Add an `openee` source type to represent "a window that this window opened" (the reverse of `opener`).

**Content script (`content-core.ts`):**
- Maintain a WeakSet of opened windows, populated when registration messages arrive with `targetType: 'opener'` — `event.source` is the opened window.
- In `getSourceRelationship`, check this WeakSet before returning `unknown`.

**Direction icon:** `→` (mirroring opener's `←`).

### 2. Cross-Tab Message Routing (Background)

**`openerRelationships` from `onCreatedNavigationTarget`:**
- Only recorded when `panelConnections.has(sourceTabId)` or `bufferingEnabledTabs.has(sourceTabId)`.
- Bidirectional: `sourceTabId -> newTabId` and `newTabId -> sourceTabId`.
- Cleaned up when a tab is removed.

**`openeeWindowToTab` from registration messages:**
- When the background sees a `postmessage-captured` message where `payload.data.type === '__frames_inspector_register__'` and the registration was sent to the opener (targetType check), it stores: `openeeWindowToTab[${capturingTabId}:${source.windowId}] = { tabId: data.tabId, frameId: data.frameId }`.
- Only stores openee registrations (not parent/child).

**Routing logic in `onMessage` handler:**
- After sending to the capturing tab's panel (existing behavior), determine if there's a related tab to also forward to:
  - `source.type === 'opener'`: look up `openerRelationships[targetTabId]` to find the opener tab. Forward to opener tab's panel.
  - `source.type === 'openee'`: look up `openeeWindowToTab[targetTabId:source.windowId]` to find the opened tab. Forward to opened tab's panel.
- For other source types (parent, child, self, top): no cross-tab routing needed.

**Pre-registration gap:** `openee` messages that arrive before their registration message will not be forwarded cross-tab. This is acceptable for now — the registration happens early (500ms after injection). Can be addressed later with buffering if needed.

### 3. New Fields on IMessage

Add `tabId` to the existing `source` and `target` sub-objects:

```typescript
target: {
  ...existing fields...
  tabId: number;    // always known (sender.tab.id)
};
source: {
  ...existing fields...
  tabId?: number;   // set by background:
                    //   - parent/self/top: same as target.tabId
                    //   - opener: from openerRelationships
                    //   - openee: from openeeWindowToTab (after registration)
                    //   - child: from registration (if received)
                    //   - undefined if not yet determined
};
```

### 4. Context Pane — Source Tab ID

In `FrameDetail.tsx`, when `frame.tabId !== store.tabId`, display `tab[T].frame[N]` instead of `frame[N]`. When the source is in the same tab, continue showing just `frame[N]`.

This is consistent with the existing filter syntax `frame:tab[T].frame[N]`.

### 5. Test Page Changes

**`test-page.html`:**
- Detect `window.opener` and show a section with "Send ping to opener" and "Send data to opener" buttons (similar to popup.html).
- Add a "respond to last message" capability: store `event.source` from the last received message, show what was received, and provide a button to send a response back.
- Add a log area showing received messages.

**No changes to `popup.html`** — it already has the right buttons.

## Out of Scope

- Buffering for pre-registration `openee` messages (punt to later).
- Showing openee pseudo-frames in the hierarchy view.
- Changes to popup.html.
