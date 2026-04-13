# Self SourceId Tracking

## Problem

Each content script instance maintains its own WeakMap from `event.source` to a generated sourceId. When a frame sends a self message (`event.source === window`), the content script assigns a sourceId from its own WeakMap. But the parent frame's content script has already assigned a different sourceId to that same window (via `iframe.contentWindow`). These two sourceIds refer to the same window but are unlinked.

Currently, a self message creates an "unknown document" in the panel because the source's sourceId doesn't match anything in the existing frame hierarchy. The panel has no way to know that the self sourceId belongs to the same FrameDocument as the parent-assigned sourceId.

## Approach

Enrich self messages in the background with the target's frameId/documentId, then let the existing panel source processing handle them generically. Also remove the redundant `FrameDocument.sourceId` field in favor of `sourceIdRecords`, and rename `IFrame.sourceId` to `sourceIdFromParent` for clarity.

No content script or dedicated panel self-message branch needed — background enrichment plus `addSourceIdRecord` with the correct `sourceType` from the message is sufficient.

## Design

### 1. Background enrichment for self messages

In `background-core.ts`, a new block (following the same pattern as the `parent` enrichment block) handles `sourceType === 'self'`:

- Copies `frameId` and `documentId` from the sender info to `enrichedPayload.source`
- The existing multi-type branch already sets `source.tabId` for self messages

After this change, self messages arrive at the panel with full source enrichment (tabId, frameId, documentId) matching the target.

### 2. Remove FrameDocument.sourceId field

The `sourceId` field on `FrameDocument` was redundant with `sourceIdRecords` and got overwritten by the last message that arrived. Removed entirely.

**Replaced with getters:**

- `get label(): string` — returns `url || origin || sourceIdRecords[0]?.sourceId || '(unknown)'`. Used for tree node display in EndpointsView.
- `get stableId(): string` — returns `documentId || sourceIdRecords[0]?.sourceId || String(createdAt)`. Used for React keys.

**Updated write sites in connection.ts:**

- `_processIncomingMessage` source processing: all branches now use `addSourceIdRecord()` with `msg.source.type` as the sourceType. The `documentsBySourceId` map is still updated directly.
- `processRegistration`: removed `sourceId` assignments. The merge case relies on `mergeSourceIdRecords()`. The no-existing-doc-by-sourceId case and the new-doc case both use `addSourceIdRecord()` with sourceType `'child'`.
- `FrameStore.getOrCreateDocumentBySourceId`: constructs `new FrameDocument({})` without sourceId. The caller is responsible for calling `addSourceIdRecord()` since only it knows the sourceType.

### 3. No dedicated panel self-message branch needed

The initial plan called for a separate `if (sourceType === 'self')` branch in `processIncomingMessage`. During implementation we discovered this was unnecessary: once `FrameDocument.sourceId` was removed, the generic `if (msg.source.documentId)` branch handles self messages correctly. It looks up the document by documentId (which background enrichment set to match the target's), calls `addSourceIdRecord()` with the correct sourceType from `msg.source.type`, and sets the `documentsBySourceId` entry. No special-casing required.

### 4. Rename IFrame.sourceId

`IFrame.sourceId` represents the parent content script's sourceId for `iframe.contentWindow`. Renamed to `sourceIdFromParent` for clarity.

`FrameStore.iframesBySourceId` renamed to `iframesBySourceIdFromParent`.

All call sites updated. No structural changes.

### 5. documentsBySourceId map

`FrameStore.documentsBySourceId` keeps its original name. It holds entries for all sourceIds (both parent-assigned and self-assigned) pointing to the corresponding FrameDocument.

No separate map for self sourceIds — the sourceIds are globally unique (random), so a single map works. The distinction between sourceId types lives on the `SourceIdRecord` (which has a `sourceType` field), not on the map.

### 6. EndpointsView and detail panels

- `DocumentNode` label uses the `doc.label` getter.
- React keys use `doc.stableId`.
- `UnknownDocumentNode` uses `doc.sourceIdRecords[0]?.sourceId` instead of `doc.sourceId`.
- `DocumentDetail` no longer shows a separate `sourceId` field. The `sourceIdRecords` section is always shown when records exist (no longer gated behind `showInternal`).
- `FrameDetail.tsx` updated to use `doc.sourceIdRecords` for the sourceId display.

### 7. unknownDocuments

No changes needed beyond the IFrame rename. Self sourceId entries in `documentsBySourceId` point to documents that already have a frame, so they're filtered out by the existing `!doc.frame` check.

## Testing

### Integration test (src/integration.test.ts)

**Self message enrichment:** Verifies that when a window posts to itself, the background enriches the source with the target's frameId, documentId, and tabId.

### Panel model tests (src/panel/frame-model.integration.test.ts)

**Self sourceId linking:** Verifies that a self message's sourceId resolves to the same FrameDocument as the target, and that a sourceIdRecord with sourceType `'self'` is created.

**Self message on registered child frame:** The key regression test — verifies that after a child frame has been established via child message + registration, a subsequent self message on that frame does not break the existing child sourceId tracking, IFrame→document linkage, or create unknown documents. Both the child and self sourceIdRecords coexist on the same document.

## Files changed

- `src/background-core.ts` — self message enrichment
- `src/panel/models/FrameDocument.ts` — removed sourceId field, added label/stableId getters
- `src/panel/models/IFrame.ts` — renamed sourceId to sourceIdFromParent
- `src/panel/models/FrameStore.ts` — renamed iframesBySourceId to iframesBySourceIdFromParent, removed sourceId from FrameDocument constructor calls
- `src/panel/connection.ts` — replaced sourceId assignments with addSourceIdRecord calls
- `src/panel/components/EndpointsView/EndpointsView.tsx` — uses new getters, ungated sourceIdRecords display
- `src/panel/components/shared/FrameDetail.tsx` — uses sourceIdRecords instead of sourceId
- `src/integration.test.ts` — self message enrichment test
- `src/panel/frame-model.integration.test.ts` — self sourceId linking tests, updated existing assertions
- `src/panel/filter.test.ts` — updated for removed sourceId field

## Out of scope

- Content script `init` message for tracking content script startup — can be added later as a separate feature
- Tracking navigations via self sourceId changes — future work that builds on this foundation
