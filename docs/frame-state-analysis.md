# Frame State in the Panel: Analysis

This document analyzes how frame state is tracked, stored, and displayed in the panel.

## Frame Data Sources

### 1. Frame Hierarchy (from `webNavigation`)

A snapshot of live frames populated by an on-demand request:

- **Triggered by:** Endpoints view becoming active, FrameFocusDropdown mounting, or manual refresh
- **Flow:** Panel sends `get-frame-hierarchy` → Background calls `chrome.webNavigation.getAllFrames(tabId)` → For each frame, sends `get-frame-info` to that frame's content script → Content script responds with title, origin, child iframes → Background assembles and sends `frame-hierarchy` back to panel
- **Processed by:** `frameStore.processHierarchy()`, which updates Frame objects in place, sets `parentFrameId`, and populates `iframes`/`isOpener` fields
- **Tracked by:** `frameStore.currentHierarchyFrameKeys` — a set of frame keys that were present in the most recent hierarchy response

### 2. Frame Models (`frameStore`)

MobX-observable `Frame`, `FrameDocument`, and `OwnerElement` instances, built incrementally:

- **Updated by:** Every incoming message (`processIncomingMessage`) and registration messages (`processRegistration`)
- **Also updated by:** Hierarchy data (via `frameStore.processHierarchy()`)
- **Stored in:** `frameStore.frames` (by `tabId:frameId`), `frameStore.documents` (by documentId), `frameStore.documentsBySourceId` (by sourceId)

## Unified Frame Access

All UI components now read frame data from `frameStore` computed properties, exposed via `PanelStore`:

| Computed property | Source | Description |
|---|---|---|
| `store.hierarchyRoots` | `frameStore.hierarchyRoots` | Frames with `parentFrameId === -1` (top-level frames confirmed by webNavigation) |
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

Uses `Frame` objects directly, reading `currentDocument` for URL/origin/title and `iframes` for child iframe details.

### Frame Focus Dropdown (`FrameFocusDropdown.tsx`)

Shows both hierarchy and non-hierarchy frames in a unified dropdown:
- Hierarchy frames in tree order (indented by depth)
- Separator, then non-hierarchy frames

Auto-requests hierarchy when messages arrive but no hierarchy roots exist yet.

### Message properties

Message computed properties (`sourceFrame`, `targetFrame`, `sourceDocument`, `targetDocument`) read from `frameStore` — unchanged.

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

**Owner element:**
- Child messages: snapshot from `msg.source.iframe` (the iframe element properties as seen by the parent)
- Parent messages: reference from `sourceDoc.frame.currentOwnerElement`

### When registration arrives (`processRegistration` in `connection.ts`)

Registration messages merge the sourceId-keyed FrameDocument with the documentId-keyed FrameDocument, creating the link between the content-script-assigned sourceId and the browser-assigned documentId/frameId.

### When hierarchy is requested (`processHierarchy` in `FrameStore.ts`)

For each frame returned by `webNavigation.getAllFrames`:
- Gets or creates a Frame by `tabId:frameId`
- Gets or creates a FrameDocument by documentId (or sourceId)
- Updates url, origin, title on the FrameDocument
- Sets `parentFrameId` from hierarchy data
- Copies `iframes` and `isOpener` onto the Frame

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

## Key Files

| File | Role |
|------|------|
| [store.ts](../src/panel/store.ts) | `hierarchyRoots`, `nonHierarchyFrames` (delegating to frameStore) |
| [connection.ts](../src/panel/connection.ts) | `processIncomingMessage()`, `processRegistration()`, `inferParentFrameId()`, `requestFrameHierarchy()` |
| [FrameStore.ts](../src/panel/models/FrameStore.ts) | `frames`, `documents`, `hierarchyRoots`, `nonHierarchyFrames`, `getFramesByParent()`, `currentHierarchyFrameKeys`, `processHierarchy()` |
| [Frame.ts](../src/panel/models/Frame.ts) | Frame model (`parentFrameId?: number`, `iframes`, `isOpener`, computed `children`) |
| [FrameDocument.ts](../src/panel/models/FrameDocument.ts) | FrameDocument model (documentId, sourceId, url, origin, title) |
| [Message.ts](../src/panel/Message.ts) | Computed properties: `sourceFrame`, `targetFrame`, `sourceDocument`, `targetDocument` |
| [EndpointsView.tsx](../src/panel/components/EndpointsView/EndpointsView.tsx) | Endpoints tab — shows hierarchy tree + non-hierarchy frames |
| [FrameFocusDropdown.tsx](../src/panel/components/LogView/FrameFocusDropdown.tsx) | Frame focus selector — unified dropdown with all known frames |
| [background-core.ts](../src/background-core.ts) | `getFrameHierarchy()` — calls webNavigation + content scripts |
