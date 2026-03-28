# Frame State in the Panel: Analysis

This document analyzes how frame state is tracked, stored, and displayed in the panel.

## Frame Data Sources

### 1. Frame Hierarchy (from `webNavigation`)

A snapshot of live frames populated by an on-demand request:

- **Triggered by:** Endpoints view becoming active, FrameFocusDropdown mounting, or manual refresh
- **Flow:** Panel sends `get-frame-hierarchy` → Background calls `chrome.webNavigation.getAllFrames(tabId)` → For each frame, sends `get-frame-info` to that frame's content script → Content script responds with title, origin, child iframes, and (for the main frame only) opener info (origin, sourceId) → Background assembles and sends `frame-hierarchy` back to panel
- **Processed by:** `frameStore.processHierarchy()`, which updates Frame objects in place, sets `parentFrameId` and `isOpener`, and creates/updates IFrame entities on each frame's current FrameDocument
- **Tracked by:** `frameStore.currentHierarchyFrameKeys` — a set of frame keys that were present in the most recent hierarchy response

### 2. Frame Models (`frameStore`)

MobX-observable `Frame`, `FrameDocument`, `Tab`, `IFrame`, and `OwnerElement` instances, built incrementally:

- **Updated by:** Every incoming message (`processIncomingMessage`) and registration messages (`processRegistration`)
- **Also updated by:** Hierarchy data (via `frameStore.processHierarchy()`)
- **Stored in:** `frameStore.frames` (by `tabId:frameId`), `frameStore.documents` (by documentId), `frameStore.documentsBySourceId` (by sourceId), `frameStore.tabs` (by tabId)

## Unified Frame Access

All UI components now read frame data from `frameStore` computed properties, exposed via `PanelStore`:

| Computed property | Source | Description |
|---|---|---|
| `store.hierarchyRoots` | `frameStore.hierarchyRoots` | Frames with `parentFrameId === -1` (top-level frames confirmed by webNavigation), plus frames whose parent is set but that parent frame isn't in the store (e.g., opener frames in another tab) |
| `store.nonHierarchyFrames` | `frameStore.nonHierarchyFrames` | Frames with `parentFrameId === undefined` (discovered via messages, not yet placed in hierarchy) |

### `parentFrameId` semantics

`Frame.parentFrameId` is `number | undefined`:

| Value | Meaning |
|---|---|
| `undefined` | Frame discovered via messages; parent relationship unknown |
| `-1` | Root frame (confirmed by hierarchy) |
| `N` (frame ID) | Child of frame N (set by hierarchy or inferred from messages) |

### Parent inference from messages

`inferParentFrameId()` in `connection.ts` builds parent-child relationships from message flow:

- **Parent → child message:** The target frame's parent is the source frame
- **Child → parent message:** The source frame's parent is the target frame

This only sets `parentFrameId` when it's currently `undefined`, so hierarchy data takes precedence.

## UI Components

### Endpoints View (`EndpointsView.tsx`)

Displays two sections:
1. **Hierarchy frames** — tree built from `store.hierarchyRoots`, rendered with indentation via `Frame.children`
2. **"Other known frames"** — flat list from `store.nonHierarchyFrames`, shown when frames exist that aren't in the hierarchy

Uses `Frame` objects directly, reading `currentDocument` for URL/origin/title and `currentDocument.iframes` for child iframe details.

### Frame Focus Dropdown (`FrameFocusDropdown.tsx`)

Shows both hierarchy and non-hierarchy frames in a unified dropdown:
- Hierarchy frames in tree order (indented by depth)
- Separator, then non-hierarchy frames

Auto-requests hierarchy when messages arrive but no hierarchy roots exist yet.

### Message properties

Message computed properties (`sourceFrame`, `targetFrame`, `sourceDocument`, `targetDocument`) read from `frameStore`. Messages also carry immutable `sourceOwnerElement` and `targetOwnerElement` snapshots set at creation time.

## Data Flow Detail

### When a message arrives (`processIncomingMessage` in `connection.ts`)

**Target side:**
- Always has `documentId` (from `sender.documentId` in the background)
- Creates/updates a FrameDocument keyed by documentId
- Creates/updates a Frame keyed by `tabId:frameId`
- Links them bidirectionally

**Source side:**
- If `documentId` is available (parent messages): creates FrameDocument by documentId
- If only `sourceId` is available (child messages): creates FrameDocument by sourceId
- If `tabId` and `frameId` are available: creates Frame and links to FrameDocument
- For child messages, `frameId` is usually unknown until registration

**Parent inference:**
- After processing source and target, `inferParentFrameId()` checks the message's `sourceType` to set parent-child relationships on frames whose `parentFrameId` is still `undefined`

**Owner element snapshots:**
- `sourceOwnerElement`: For child messages, snapshot from `msg.source.iframe` (the iframe element properties as seen by the parent). For parent messages, derived via `frameStore.findOwnerIFrame(sourceFrame)` when the parent frame is itself hosted in an iframe. Not set for other source types.
- `targetOwnerElement`: For any message where the target frame is hosted in an iframe, derived by looking up the IFrame entity via `frameStore.findOwnerIFrame(targetFrame)` and snapshotting its properties. Only available if the IFrame entity and its `childFrame` link have been established (via prior child messages, registration, or hierarchy).

### When registration arrives (`processRegistration` in `connection.ts`)

Registration messages merge the sourceId-keyed FrameDocument with the documentId-keyed FrameDocument, creating the link between the content-script-assigned sourceId and the browser-assigned documentId/frameId.

### When hierarchy is requested (`getFrameHierarchy` in `background-core.ts`, `processHierarchy` in `FrameStore.ts`)

Each `FrameInfo` entry combines data from two sources:
1. **`webNavigation.getAllFrames(tabId)`** — provides `frameId`, `parentFrameId`, `documentId`, `url` for each frame in the inspected tab. `documentId` is always present for these frames.
2. **Content script `get-frame-info` response** — provides `title`, `origin`, and `iframes` (child iframe DOM elements with `sourceId` from `contentWindow` identity, plus `domPath`, `src`, `id`).

For **opener frames** (cross-tab), the background constructs a synthetic `FrameInfo` with data from:
- The inspected tab's content script (`opener.sourceId`, `opener.origin`)
- `webNavigation.getFrame()` on the opener's tab (may provide `documentId` and `url`, but can fail if opener tab is closed)
- The opener's content script (`title`, but can fail if content script isn't injected)

Opener frames always have `sourceId` (from the inspected tab's content script) but may lack `documentId` if the cross-tab `getFrame()` call fails.

`processHierarchy` then processes each `FrameInfo`:
- Gets or creates a Frame by `tabId:frameId`
- Gets or creates a FrameDocument by documentId (or sourceId)
- Updates url, origin, title on the FrameDocument
- Sets `parentFrameId` from hierarchy data
- Creates/updates IFrame entities from the content script's iframe list
- Marks previously-known iframes absent from the current refresh as `removedFromHierarchy`

After processing all frames:
- Updates `currentHierarchyFrameKeys` to track which frames are in the current hierarchy

`Frame.children` is a computed getter that derives from `parentFrameId` — it queries `frameStore.getFramesByParent()` for all frames in the same tab whose `parentFrameId` matches. This avoids the interface via a `FrameLookup` interface to prevent circular dependencies. Because `children` is derived, it automatically includes frames discovered via messages even after hierarchy refreshes.

## Edge Cases

| Scenario | What happens |
|----------|-------------|
| Frame destroyed before hierarchy refresh | Frame persists in `frameStore` with messages; shown in "Other known frames" section with `parentFrameId === undefined` |
| Popup window sends messages | Opener frame exists in `frameStore` for the popup's tab; parent-child inferred from message flow; appears in hierarchy if opener enrichment succeeds |
| User navigates iframe, then refreshes hierarchy | Old FrameDocument persists in `frameStore` (with old URL), new one created by hierarchy; Frame's `currentDocument` updated to new one |
| Content script not injected in a frame | Hierarchy includes the frame (from webNavigation) but with limited info; messages from that frame can't be captured |
| Messages arrive before any hierarchy request | Frames appear in "Other known frames"; FrameFocusDropdown auto-triggers hierarchy request |
| Hierarchy frame missing both documentId and sourceId | Frame is created but no FrameDocument is linked. Logs a warning. This shouldn't happen: `getAllFrames` entries always have `documentId`, and opener frames always have `sourceId` from the content script. |
| Iframe element missing sourceId in hierarchy data | The iframe is skipped (no IFrame entity created). Logs a warning. This shouldn't happen: all iframe elements have a `contentWindow`, so the content script should always be able to assign a `sourceId`. |

## Key Files

| File | Role |
|------|------|
| [store.ts](../src/panel/store.ts) | `hierarchyRoots`, `nonHierarchyFrames` (delegating to frameStore) |
| [connection.ts](../src/panel/connection.ts) | `processIncomingMessage()`, `processRegistration()`, `inferParentFrameId()`, `requestFrameHierarchy()` |
| [FrameStore.ts](../src/panel/models/FrameStore.ts) | `frames`, `documents`, `hierarchyRoots`, `nonHierarchyFrames`, `getFramesByParent()`, `currentHierarchyFrameKeys`, `processHierarchy()` |
| [Frame.ts](../src/panel/models/Frame.ts) | Frame model (`parentFrameId?: number`, `documents`, `isOpener`, computed `children`, `currentDocument`) |
| [FrameDocument.ts](../src/panel/models/FrameDocument.ts) | FrameDocument model (documentId, sourceId, url, origin, title, `iframes: IFrame[]`) |
| [Tab.ts](../src/panel/models/Tab.ts) | Tab model (tabId, rootFrame, opener/opened tab relationships) |
| [IFrame.ts](../src/panel/models/IFrame.ts) | IFrame model (DOM element info: domPath, src, id, sourceId; links parentDocument ↔ childFrame; `removedFromHierarchy` flag) |
| [Message.ts](../src/panel/Message.ts) | Computed: `sourceFrame`, `targetFrame`, `sourceDocument`, `targetDocument`; snapshots: `sourceOwnerElement`, `targetOwnerElement` |
| [EndpointsView.tsx](../src/panel/components/EndpointsView/EndpointsView.tsx) | Endpoints tab — shows hierarchy tree + non-hierarchy frames |
| [FrameFocusDropdown.tsx](../src/panel/components/LogView/FrameFocusDropdown.tsx) | Frame focus selector — unified dropdown with all known frames |
| [background-core.ts](../src/background-core.ts) | `getFrameHierarchy()` — calls webNavigation + content scripts |
