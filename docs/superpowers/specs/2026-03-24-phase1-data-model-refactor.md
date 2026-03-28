# Phase 1: Data Model Refactoring

## Overview

Refactor the panel's data model to represent the Tab → Frame → Document → IFrame hierarchy described in the [endpoints hierarchy design](2026-03-17-endpoints-hierarchy-design.md). No UI changes — the existing EndpointsView and LogView continue working against the updated model. Existing integration and e2e tests validate that behavior is preserved.

## New Entities

### Tab

Lightweight entry point into a tab's frame tree.

```typescript
class Tab {
  tabId: number
  rootFrame: Frame           // frameId 0 for this tab
  openerTab: Tab | undefined
  openedTabs: Tab[]
}
```

Created by `FrameStore.getOrCreateTab(tabId)`. The root Frame (frameId 0) is created alongside the Tab.

`openerTab` and `openedTabs` are populated during message processing when opener/opened source types are encountered — the background script already resolves cross-tab relationships and provides the source tabId. When a message with `source.type === 'opener'` or `'opened'` arrives and both tabs exist, the Tab entities are linked.

### IFrame

Mutable entity representing an iframe element within a document. Links a parent document to a child frame.

```typescript
class IFrame {
  domPath: string
  src: string | undefined
  id: string | undefined
  sourceId: string | undefined      // tracks which WindowProxy lives here
  parentDocument: FrameDocument     // back-reference
  childFrame: Frame | undefined     // linked when registration arrives
}
```

- All DOM-derived properties (`domPath`, `src`, `id`) are mutable and update over time (e.g., iframe moved in DOM changes domPath, `src` attribute changed).
- `sourceId` is set when a child message arrives from this iframe, enabling later linking to a Frame when registration provides the frameId.
- Separate from `OwnerElement`, which remains an immutable per-message snapshot.

## Modified Entities

### Frame

- **Remove** `currentDocument` stored property → replace with `documents: FrameDocument[]` (append-order, newest last).
- **Add** computed `currentDocument` getter → `documents[documents.length - 1]`.
- **Remove** `currentOwnerElement` → the IFrame entity that owns this frame holds that info.
- `children` **unchanged** — still uses `parentFrameId` lookup via FrameStore. Phase 2 may switch to IFrame-based traversal.
- **Remove** `iframes` raw array → redundant with `FrameDocument.iframes: IFrame[]`. Hierarchy data that currently populates `Frame.iframes` will populate IFrame entities on the frame's current document instead.
- `tabId`, `frameId`, `parentFrameId`, `isOpener` — unchanged.

### FrameDocument

- **Add** `iframes: IFrame[]` — the iframe elements found within this document.
- Existing properties unchanged: `documentId`, `sourceId`, `url`, `origin`, `title`, `frame`.

### OwnerElement

Unchanged. Stays as immutable snapshot on Message instances.

## FrameStore Changes

### New index

- `tabs: Map<number, Tab>` — keyed by tabId.

### New methods

- `getOrCreateTab(tabId): Tab` — creates Tab and its root Frame (frameId 0) if they don't exist.
- `getOrCreateIFrame(parentDocument, sourceId?, iframeInfo?): IFrame` — finds an existing IFrame on the document or creates a new one. Matching is done by `sourceId` when available (from child messages — stable across DOM moves); hierarchy data (including child `frameId`) is used to populate `childFrame` and update mutable properties, but not as a lookup key. `domPath`, `src`, and `id` are updated as mutable properties, not used as match keys.

### Modified methods

- `getOrCreateFrame(tabId, frameId, parentFrameId?)` — creates or retrieves the Frame for the given tab/frameId. It does not call `getOrCreateTab(tabId)` internally; callers are responsible for ensuring the Tab exists (via `getOrCreateTab`) before invoking this.
- `processHierarchy()` — creates/updates IFrame entities from hierarchy data, linking parent Documents to child Frames through IFrames.

### Unchanged

- `frames`, `documents`, `documentsBySourceId` maps — same keys and usage.
- `hierarchyRoots`, `nonHierarchyFrames` — still return `Frame[]`.
- `clear()` — also clears the new `tabs` map.

## Connection Processing Changes

### processIncomingMessage()

- When processing a child message with iframe info: create/update an IFrame entity on the target's current document via `frameStore.getOrCreateIFrame(targetDocument, iframeInfo)` (where `iframeInfo` is the raw `IframeElementInfo` from the message). Set `iframe.sourceId = msg.source.sourceId` (the child window's WindowProxy identity).
- OwnerElement snapshots on Message instances are still captured as before.

### processRegistration()

- The existing multi-case document merging logic in `processRegistration` is preserved (handles: both docById and docBySourceId exist, only one exists, neither exists, navigation detected). The key change is that `frame.currentDocument = doc` assignments become `frame.documents.push(doc)`.
- Navigation detection (same sourceId, new documentId): create new FrameDocument and append to `frame.documents[]`. Old document stays earlier in the array.
- Link IFrame to child Frame: find the IFrame on the parent document where `iframe.sourceId` matches the registering document's sourceId, then set `iframe.childFrame = frame`.
- Remove `Frame.currentOwnerElement` update logic — IFrame entity handles this.

### inferParentFrameId()

Unchanged.

## What Stays the Same

- **Message class** — still uses OwnerElement snapshots, computed properties (`sourceFrame`, `targetFrame`, `frames`) work as before.
- **All UI components** — no changes to EndpointsView, LogView, FrameDetail, etc.
- **Frame.children** — still derived from parentFrameId lookup.
- **hierarchyRoots / nonHierarchyFrames** — still return Frames.
- **Unknown Documents** — implicitly identified by `frameDocument.frame === undefined` (no explicit modeling).

## Test Strategy

### Existing tests to update

- Tests asserting `frame.currentDocument = ...` (setter) → update to use `frame.documents` append.
- Tests asserting `frame.currentOwnerElement` → update to check IFrame entity on the parent document.
- Tests calling `processIncomingMessage` with child messages → verify IFrame entities are created.

### New tests to add

- Tab creation and linking via `getOrCreateTab`.
- IFrame entity creation, sourceId tracking, childFrame linking on registration.
- `Frame.documents[]` history — multiple documents appended, `currentDocument` returns the last one.
- IFrame property mutation (e.g., `src` changes between messages).

### Validation

All existing integration tests (`frame-model.integration.test.ts`, `integration.test.ts`), filter tests, and Playwright e2e tests must pass after the refactor.
