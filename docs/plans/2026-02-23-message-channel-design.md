# MessageChannel Support Design

## Goal

Capture MessageChannel/MessagePort communication in the Frames Inspector, providing the same visibility for port-to-port messages as currently exists for `window.postMessage`.

## Scope

- MessageChannel creation, port transfer, and port-to-port messaging
- BroadcastChannel is **deferred** (same-origin only, less relevant to the cross-origin focus)

## Architecture: Main-World Script + CustomEvents

The extension currently captures `window` `message` events from the isolated world. MessagePort messages fire only on port objects in the page's main world, so a new main-world script is needed.

**Communication pattern:**

```
Main World                    Isolated World              Background
────────────                  ──────────────              ──────────
main-world.ts                 content.ts                  background.ts
  patches APIs                  listens for CustomEvents    enriches & routes
  emits CustomEvents ──────►    forwards via runtime.msg ─► to panel
```

The main-world script is a thin observer layer. All routing and enrichment logic stays in the existing isolated-world and background scripts.

## Main-World Interception (`main-world.ts`)

### What gets patched

1. **`MessageChannel` constructor** — wraps `new MessageChannel()` to:
   - Assign a unique `channelId` to each channel
   - Store `port1 <-> port2` pairing in a `WeakMap`
   - Add `message` event listeners to both ports (captures received messages)
   - Emit `channel-created` CustomEvent

2. **`MessagePort.prototype.postMessage`** — wraps to:
   - Capture message data and transferables
   - Look up channel membership via WeakMap
   - Determine port side (1 or 2)
   - Emit `port-message-sent` CustomEvent

3. **`window.postMessage`** (invasive send-side capture) — wraps to:
   - Capture outgoing data before it's sent
   - Check transferables for `MessagePort` instances
   - When a port is transferred, look up its pair in the WeakMap
   - Emit `port-transferred` CustomEvent

### Cross-world communication

```javascript
window.dispatchEvent(new CustomEvent('__frames_inspector__', {
  detail: {
    type: 'channel-created' | 'port-message-sent' | 'port-message-received' | 'port-transferred',
    // ... event-specific data
  }
}));
```

The isolated-world content script listens for `__frames_inspector__` events and forwards them to the background service worker via `chrome.runtime.sendMessage`.

## Invasive Mode Toggle

A new setting in the panel (alongside "Preserve Log" and "Show Registration Messages"):

- **Off by default** — current non-invasive behavior unchanged
- **When enabled** — panel sends message to background, which injects `main-world.js` into all frames via:
  ```javascript
  chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: 'MAIN',
    files: ['main-world.js']
  })
  ```
- **Persists per-session** (resets on browser restart)
- **Late injection notice** — if enabled after page load, shows "Channels created before this point are not tracked. Reload to capture all channels."

## Data Model

### New message event types

| Event | Source | Key Data |
|-------|--------|----------|
| `channel-created` | Constructor patch | `channelId`, creating frame info |
| `port-message-sent` | `postMessage` patch | `channelId`, `portSide`, `data`, `sequenceNum` |
| `port-message-received` | Port event listener | `channelId`, `portSide`, `data`, `sequenceNum` |
| `port-transferred` | `window.postMessage` patch | `channelId`, `portSide`, transfer target |

### Extended `IMessage`

```typescript
interface IMessage {
  // ... existing fields ...

  channel?: {
    type: 'message-channel';
    id: string;             // generated channelId
    portSide?: 1 | 2;       // which port sent/received
    direction: 'sent' | 'received';
  };
}
```

### Channel tracking (background service worker)

The background maintains a `Map<channelId, ChannelInfo>` tracking:
- Which frame created the channel
- Which frame holds port1, which holds port2
- Updated when `port-transferred` events arrive

### Deduplication

Each port message gets a `channelId + sequenceNum` pair (assigned by the main-world script). The `sent` and `received` events for the same message are deduplicated — prefer the `sent` event. Short timeout window (~100ms); if only one side arrives, show it.

## UI Changes

### Table

- New **Channel** column: shows `MC#<short-id>:port1->port2` (or `port2->port1`), empty for regular postMessages
- **Source Type** column gains `port` value for MessagePort messages
- When a `postMessage` transfers a port, the row shows an indicator linking to the channel

### Detail Pane (Context tab)

New "Channel" section for port messages:
- Channel type: MessageChannel
- Channel ID
- Port side (1 or 2)
- Creating frame
- Port locations (which frame holds port1, which holds port2)

### Filter syntax additions

- `channel:MC#<id>` — messages for a specific MessageChannel
- `sourceType:port` — all MessagePort messages

## Edge Cases

- **Port re-transfer:** Tracked via successive `port-transferred` events. Background updates channel map.
- **Port close:** Deferred. Could patch `port.close()` later to show channel teardown.
- **Multiple listeners:** Our listener coexists with page listeners via `addEventListener`. Added at construction time (before page can use the port).
- **Structured clone limits:** `CustomEvent.detail` uses structured clone. If port message data isn't clonable, fall back to string preview.
- **Cleanup:** Patches persist until page reload (same as current content script behavior). Acceptable since patches are thin wrappers calling originals.
