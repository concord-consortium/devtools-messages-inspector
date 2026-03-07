# Plan: Show All Known Frames in Sources View and Frame Focus Dropdown

## Context

Currently the Sources view and Frame Focus dropdown only show frames returned by the `get-frame-hierarchy` request (which calls `chrome.webNavigation.getAllFrames`). Frames discovered through messages — stored in `frameStore.frames` — are not shown in these UI elements. This means frames that sent/received messages but were destroyed before a hierarchy refresh, or cross-tab frames, are invisible in the UI.

The goal is to show **all known frames**: frames with known parent-child relationships in a tree, plus any remaining frames whose position in the hierarchy is unknown.

## Approach

Replace `store.frameHierarchy` (a `FrameInfo[]` array used for display) with computed properties that read directly from `frameStore`. The hierarchy request still runs and populates Frame objects via `processHierarchy`, but the UI renders `Frame` model objects instead of `FrameInfo` plain objects. Parent-child relationships are established from both hierarchy responses AND message processing, so frames can appear in the tree even without a hierarchy refresh.

## Steps

### 1. Update Frame model

**File:** `src/panel/models/Frame.ts`

- Change `parentFrameId` from `number` (default `-1`) to `number | undefined` (default `undefined`). This distinguishes root frames (`-1`), child frames (positive number), and frames with unknown parents (`undefined`).
- Add `iframes: Array<{src: string; id: string; domPath: string; sourceId?: string}>` (default `[]`)
- Add `isOpener: boolean` (default `false`)

`iframes` and `isOpener` are currently only on `FrameInfo` but needed for display. Populated during `processHierarchy`.

### 2. Add hierarchy tracking and computed properties to FrameStore

**File:** `src/panel/models/FrameStore.ts`

- Add `currentHierarchyFrameKeys = observable.set<string>()` — tracks which frames were in the latest hierarchy response. Not used by `hierarchyRoots` initially; reserved for future use to indicate which frames are currently active on the page.
- In `processHierarchy`: populate `currentHierarchyFrameKeys` with all frame keys, populate `frame.iframes` and `frame.isOpener` from the input data, rebuild `children` arrays for all frames with known `parentFrameId` (not just hierarchy response frames)
- Add computed `get hierarchyRoots(): Frame[]` — all frames in the store with `parentFrameId === -1`. Since destroyed frames retain their `parentFrameId`, they remain visible in the tree.
- Add computed `get nonHierarchyFrames(): Frame[]` — frames with `parentFrameId === undefined` (parent relationship unknown)

### 3. Infer parentFrameId from message processing

**File:** `src/panel/connection.ts`

When processing incoming messages, infer parent-child relationships from `sourceType`:

- `sourceType === 'child'`: the source frame is a child of the target frame → set `sourceFrame.parentFrameId = targetFrame.frameId` if not already set
- `sourceType === 'parent'`: the target frame is a child of the source frame → set `targetFrame.parentFrameId = sourceFrame.frameId` if not already set

This allows frames to appear in the hierarchy tree even before a hierarchy refresh occurs. Only set `parentFrameId` if it is currently `undefined` (don't overwrite values from hierarchy responses).

When setting `parentFrameId`, also add the frame to its parent's `children` array to keep the tree consistent without waiting for the next `processHierarchy` call.

### 4. Update store to use Frame objects instead of FrameInfo

**File:** `src/panel/store.ts`

- Remove `frameHierarchy: FrameInfo[]` property
- Update `setFrameHierarchy`: still receives `FrameInfo[]` from the background, still calls `frameStore.processHierarchy`, but no longer stores the array
- Replace `buildFrameTree()` → delegate to `frameStore.hierarchyRoots`
- Add `get nonHierarchyFrames()` → delegate to `frameStore.nonHierarchyFrames`
- Update `selectedFrame` getter: look up from `frameStore.getFrame()` instead of searching `frameHierarchy`
- Update `frameKey()`: accept `Frame` (or keep accepting both via duck typing on `tabId`/`frameId`)

### 5. Update SourcesView to render Frame objects

**File:** `src/panel/components/SourcesView/SourcesView.tsx`

- Update `FrameRow` to accept `Frame` instead of `FrameInfo`:
  - `frame.url` → `frame.currentDocument?.url || ''`
  - `frame.origin` → `frame.currentDocument?.origin || ''`
  - `frame.title` → `frame.currentDocument?.title || ''`
  - `frame.children` is already `Frame[]`
  - `frame.isOpener` is now on Frame
- Add a section below the hierarchy tree for non-hierarchy frames (flat list, no tree nesting since parent is unknown)
- Update `FrameDetailPane`: already uses `FrameDetail` with Frame objects, but update the iframes list to read from `frame.iframes` instead of `frameInfo.iframes`
- Update `selectedFrame` usage to work with Frame type

### 6. Update FrameFocusDropdown to include non-hierarchy frames

**File:** `src/panel/components/LogView/FrameFocusDropdown.tsx`

- After the tree options, add non-hierarchy frame options (flat, no indentation)
- Could add a separator/optgroup to distinguish them
- Update to work with Frame objects instead of FrameInfo

### 7. Update tests

**File:** `src/panel/frame-model.integration.test.ts`

- Update `buildFrameTree with opener` tests: `buildFrameTree()` returns `Frame[]` now, so check `frame.currentDocument?.origin` instead of `frame.origin`, `frame.isOpener` instead of FrameInfo's `isOpener`
- Add test: frame created by message but not in hierarchy appears in `nonHierarchyFrames`
- Add test: after hierarchy refresh, frame moves from `nonHierarchyFrames` to `hierarchyRoots` tree
- Add test: message with `sourceType === 'child'` sets `parentFrameId` on source frame
- Add test: message with `sourceType === 'parent'` sets `parentFrameId` on target frame

### 8. Add "Remove" button to test page dynamic iframes

**File:** `test/test-page.html`

- Add a "Remove Last Dynamic Iframe" button in the Dynamic Iframe Testing controls
- Removes the most recently added dynamic iframe (and its label) from the DOM
- Enables manual verification that destroyed frames remain visible in the Sources view hierarchy

### 9. Clean up unused FrameInfo references

- `store.frameKey()` may need to be updated or simplified since it currently handles FrameInfo's `frameId: number | string` union
- Remove `FrameInfo` import from components that no longer need it
- Keep `FrameInfo` type in `types.ts` since it's still used as the wire format from background → panel

## Key Files

| File | Change |
|------|--------|
| `src/panel/models/Frame.ts` | Change `parentFrameId` to optional, add `iframes`, `isOpener` |
| `src/panel/models/FrameStore.ts` | Add `currentHierarchyFrameKeys`, computed `hierarchyRoots`, `nonHierarchyFrames` |
| `src/panel/connection.ts` | Infer `parentFrameId` from `sourceType` during message processing |
| `src/panel/store.ts` | Remove `frameHierarchy`, update `buildFrameTree`, `selectedFrame`, `frameKey` |
| `src/panel/components/SourcesView/SourcesView.tsx` | Render Frame objects, add non-hierarchy section |
| `src/panel/components/LogView/FrameFocusDropdown.tsx` | Include non-hierarchy frames |
| `src/panel/frame-model.integration.test.ts` | Update existing tests, add new tests |
| `test/test-page.html` | Add "Remove" button for dynamic iframes |

## Verification

1. `npx vitest run` — unit tests pass
2. `npx playwright test` — e2e tests pass
3. Manual: open extension on a page with iframes, verify Sources view shows hierarchy tree
4. Manual: send messages from a frame, destroy the frame, verify it still appears in Sources view under its parent
5. Manual: verify Frame Focus dropdown includes both hierarchy and non-hierarchy frames
6. Manual: verify that messages with child/parent sourceType cause frames to appear in hierarchy tree without needing a hierarchy refresh
