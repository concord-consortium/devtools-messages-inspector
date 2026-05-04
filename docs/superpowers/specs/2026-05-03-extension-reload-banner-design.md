# Extension Reload Recovery — Design

## Problem

When the extension is reloaded or updated while a Messages panel is open, three things break in ways that aren't visible to the user:

1. The DevTools panel page is still running JS from the old extension context. Its `chrome.runtime` is invalidated and it can no longer talk to the new background script.
2. The new background script has lost all in-memory state (panel connections, buffering-enabled tabs, injection tracking).
3. Content scripts already injected into monitored pages keep listening for `message` events but their `chrome.runtime` is also invalidated. They become silent orphans — they capture nothing and can't report errors.

Today, the only signal the user gets is that messages stop appearing. There's no way for them to know the panel and DevTools must be reopened, or that the page itself must be reloaded to get a working content script.

## Goals

- Show a clear, persistent banner in the panel telling the user to close and reopen DevTools when the extension has been reloaded.
- Detect, after the user reopens DevTools, whether the inspected page still has a stale orphan content script, and show a per-frame banner telling the user to reload the page.
- No false positives in normal operation (panel open, extension not reloaded, page just navigated, etc.).

## Non-Goals

- Auto-recovery — automatically reloading the panel, reinjecting working content scripts, or reloading monitored pages. The roadmap item is the banner; auto-recovery is a separate, larger investigation.
- Recovery for tabs that were being monitored only for buffering (e.g. tabs opened via `window.open` from a monitored tab). After an extension reload the new SW has no record of them, so they revert to unmonitored. When the user eventually opens DevTools on one, the standard sentinel check (below) will fire.

## Design

Two banners, two triggers.

### 1. Panel-level banner: "Extension was reloaded"

Triggered from the panel when the existing port to background dies and reconnection fails because the panel's own runtime is invalidated.

**Detection.** The panel's connection module already auto-reconnects on `port.onDisconnect` (see [src/panel/connection.ts:31-34](src/panel/connection.ts#L31-L34)). After an extension reload the reconnect attempt fails — either `chrome.runtime.connect` throws `Extension context invalidated`, or `chrome.runtime.id` becomes `undefined`. Either signal indicates the panel itself is from a dead extension version and cannot recover.

**Behavior on detection.**
- Stop the reconnect loop.
- Set a flag on the panel store: `extensionContextInvalidated = true`.
- Render a persistent banner at the top of the panel: **"The Messages Inspector extension was reloaded. Close and reopen DevTools to continue capturing."**
- The banner is not dismissible — there is no recovery path from this panel context.

### 2. Frame-level banner: "Page needs reload"

Triggered when the user has reopened DevTools (so a fresh panel is now talking to the new background) and the new content script detects, on injection, that a stale orphan from a previous extension lifetime is still in the page.

**Sentinel.** Replace the current boolean guard
```ts
if (win.__postmessage_devtools_content__) return;
win.__postmessage_devtools_content__ = true;
```
in [src/content-core.ts:43-46](src/content-core.ts#L43-L46) with a per-SW-startup random ID:

- Background generates `swStartupId` once when the service worker starts.
- Every `chrome.scripting.executeScript` call in [background-core.ts](src/background-core.ts) passes `swStartupId` via `args`.
- Content script reads `window.__pm_devtools_sw_id__` and compares to the passed-in ID:
  - **Missing** → fresh init: store the ID, register listeners, business as usual.
  - **Equal to passed ID** → already initialized this SW lifetime: return silently. Same as today's idempotency guard.
  - **Different value** → orphan from a previous extension lifetime is still attached to this window.

**Behavior on mismatch.** The new content script:
1. Sends `{ type: 'stale-frame', tabId, frameId }` to background via `chrome.runtime.sendMessage` (its runtime is fresh, this works).
2. Returns without registering listeners. The orphan's `message` listeners are still firing on the page — adding a second set would double-process every event, and we're going to ask the user to reload anyway.

**Routing.** Background receives `stale-frame`, finds the panel connection for `tabId`, and forwards `{ type: 'stale-frame', frameId }`. Panel receives it and adds `frameId` to a `staleFrames` set on the store.

**UI.** Render a banner near the top of the panel: **"This page has stale content scripts from a previous extension version. Reload the page to resume capturing."** If multiple frames are stale, list them or just say "this page" — a single banner per tab is sufficient because the user reloads the whole page anyway.

**Clearing.** When a frame navigates, the page reload destroys the orphan, and the new content script (re-injected by the existing `webNavigation.onCommitted` handler) sees no sentinel and fresh-inits. To make this observable, the content script sends a new `{ type: 'content-script-ready', tabId, frameId }` message at the end of fresh init. Background tracks a per-tab `staleFrames` set; when `content-script-ready` arrives from a frame that was in the set, background removes it and forwards `{ type: 'stale-frame-cleared', frameId }` to the panel. Panel removes the frame from its own `staleFrames`; when the set empties, the banner disappears.

## Components and Data Flow

```
extension reload
      │
      ├─► old panel: port dies → reconnect → throws → show "reopen DevTools" banner
      │
      └─► new SW: starts with fresh swStartupId
              │
              user reopens DevTools
              │
              new panel ──init──► new SW ──executeScript(args:[swStartupId])──► page
                                                                          │
                                                                          ▼
                                                              new content script
                                                                          │
                                                          window.__pm_devtools_sw_id__?
                                                              │
                                                missing ──┘  ├── equal ──► return
                                                  │           │
                                                  ▼           ▼
                                              fresh init    different ──► sendMessage('stale-frame')
                                                                                    │
                                                                                    ▼
                                                                          background → panel
                                                                                    │
                                                                                    ▼
                                                                          panel banner: "reload page"
```

## Affected Files

- [src/content-core.ts](src/content-core.ts) — replace the boolean guard with sentinel-ID logic; add `stale-frame` send path; do not register listeners on mismatch.
- [src/background-core.ts](src/background-core.ts) — generate `swStartupId` at module init; pass via `args` in every `executeScript` call; route `stale-frame` messages from content to the appropriate panel port.
- [src/panel/connection.ts](src/panel/connection.ts) — detect `Extension context invalidated` / missing `chrome.runtime.id` on reconnect attempts; set store flag; stop reconnect loop. Handle incoming `stale-frame` and `stale-frame-cleared` routing into the store.
- [src/panel/store.ts](src/panel/store.ts) — add `extensionContextInvalidated: boolean` and `staleFrames: Set<number>` (observable).
- [src/panel/panel.tsx](src/panel/panel.tsx) (or a new `components/Banners.tsx`) — render the two banners based on store state.
- [src/types.ts](src/types.ts) — add `stale-frame`, `stale-frame-cleared`, and `content-script-ready` to the message-type unions; add `swStartupId: string` to whatever args struct the content script reads at init.

## Testing

- **Unit:** content-core test that simulates pre-existing orphan (`window.__pm_devtools_sw_id__` already set to a different value) and asserts the new content script sends `stale-frame` and registers no `message` listeners.
- **Unit:** content-core test for the same-ID idempotency case (no message sent, no double registration).
- **Unit:** background-core test that `swStartupId` is included in `executeScript` args and that `stale-frame` is routed to the matching panel port.
- **Unit:** panel store/connection tests for `extensionContextInvalidated` flag and `staleFrames` set lifecycle (added on `stale-frame`, removed on `stale-frame-cleared`).
- **Manual:** load the extension, open the panel on a test page with iframes, click "Reload" on the extension card in `chrome://extensions/`, confirm the panel banner appears. Reopen DevTools, confirm the per-page banner appears. Reload the page, confirm the per-page banner clears.

## Open Questions

None at this time.
