# Phase 1: Data Model Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the panel data model to represent Tab → Frame → Document → IFrame hierarchy with no UI changes.

**Architecture:** Introduce `Tab` and `IFrame` model classes, replace `Frame.currentDocument` with a `documents[]` array, remove `Frame.currentOwnerElement` and `Frame.iframes`. All existing UI components continue working via computed compatibility getters. The `FrameStore` gains a `tabs` map and `getOrCreateIFrame` method. Connection processing (`processIncomingMessage`, `processRegistration`) is updated to populate the new structures.

**Tech Stack:** TypeScript, MobX (makeAutoObservable), Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-24-phase1-data-model-refactor.md`

---

## File Structure

### New files
- `src/panel/models/Tab.ts` — Tab class
- `src/panel/models/IFrame.ts` — IFrame class

### Modified files
- `src/panel/models/Frame.ts` — Remove `currentDocument` stored property, `currentOwnerElement`, `iframes`; add `documents[]` array + `currentDocument` computed getter
- `src/panel/models/FrameDocument.ts` — Add `iframes: IFrame[]` array
- `src/panel/models/FrameStore.ts` — Add `tabs` map, `getOrCreateTab()`, `getOrCreateIFrame()`; update `processHierarchy()`, `clear()`; update `getOrCreateFrame()` to ensure Tab exists
- `src/panel/models/index.ts` — Export new classes
- `src/panel/connection.ts` — Update `processIncomingMessage()` to create IFrame entities on child messages; update `processRegistration()` to use `frame.documents.push()` and link IFrame→child Frame; remove `currentOwnerElement` logic
- `src/panel/components/EndpointsView/EndpointsView.tsx` — Update `FrameDetailPane` to read iframes from `frame.currentDocument.iframes` instead of `frame.iframes`
- `src/panel/components/shared/FrameDetail.tsx` — Remove `frame?.currentOwnerElement` fallback (owner element only comes from message snapshots or explicit prop)
- `src/panel/frame-model.integration.test.ts` — Update assertions for new model structure, add new test cases

---

## Task 1: Create Tab class

**Files:**
- Create: `src/panel/models/Tab.ts`
- Modify: `src/panel/models/index.ts`

- [ ] **Step 1: Write Tab class**

```typescript
// src/panel/models/Tab.ts
import { makeAutoObservable } from 'mobx';
import type { Frame } from './Frame';

export class Tab {
  readonly tabId: number;
  rootFrame: Frame;
  openerTab: Tab | undefined;
  openedTabs: Tab[] = [];

  constructor(tabId: number, rootFrame: Frame) {
    this.tabId = tabId;
    this.rootFrame = rootFrame;
    this.openerTab = undefined;

    makeAutoObservable(this, {
      tabId: false,
    });
  }
}
```

- [ ] **Step 2: Export from index.ts**

Add to `src/panel/models/index.ts`:
```typescript
export { Tab } from './Tab';
```

- [ ] **Step 3: Commit**

```bash
git add src/panel/models/Tab.ts src/panel/models/index.ts
git commit -m "feat: add Tab model class"
```

---

## Task 2: Create IFrame class

**Files:**
- Create: `src/panel/models/IFrame.ts`
- Modify: `src/panel/models/index.ts`

- [ ] **Step 1: Write IFrame class**

```typescript
// src/panel/models/IFrame.ts
import { makeAutoObservable } from 'mobx';
import type { FrameDocument } from './FrameDocument';
import type { Frame } from './Frame';

export class IFrame {
  domPath: string;
  src: string | undefined;
  id: string | undefined;
  sourceId: string | undefined;
  readonly parentDocument: FrameDocument;
  childFrame: Frame | undefined;

  constructor(
    parentDocument: FrameDocument,
    domPath: string,
    src: string | undefined,
    id: string | undefined,
  ) {
    this.parentDocument = parentDocument;
    this.domPath = domPath;
    this.src = src || undefined;
    this.id = id || undefined;
    this.sourceId = undefined;
    this.childFrame = undefined;

    makeAutoObservable(this, {
      parentDocument: false,
    });
  }
}
```

- [ ] **Step 2: Export from index.ts**

Add to `src/panel/models/index.ts`:
```typescript
export { IFrame } from './IFrame';
```

- [ ] **Step 3: Commit**

```bash
git add src/panel/models/IFrame.ts src/panel/models/index.ts
git commit -m "feat: add IFrame model class"
```

---

## Task 3: Refactor Frame — replace currentDocument with documents array

This is the core model change. `Frame.currentDocument` becomes a computed getter over `Frame.documents[]`. Also removes `currentOwnerElement` and `iframes`.

**Note:** After this task, the project will not compile until Tasks 6-8 are completed (connection.ts and UI still reference removed properties). Run only the specific new test in Step 4, not the full build.

**Files:**
- Modify: `src/panel/models/Frame.ts`

- [ ] **Step 1: Write failing test for documents array behavior**

Add to `src/panel/frame-model.integration.test.ts` at the end of the top-level describe block:

```typescript
describe('Frame.documents array', () => {
  it('currentDocument returns the last document in the array', () => {
    const frame = frameStore.getOrCreateFrame(TAB_ID, 5);
    expect(frame.currentDocument).toBeUndefined();
    expect(frame.documents).toHaveLength(0);

    const doc1 = new FrameDocument({ documentId: 'doc-first' });
    frame.documents.push(doc1);
    expect(frame.currentDocument).toBe(doc1);

    const doc2 = new FrameDocument({ documentId: 'doc-second' });
    frame.documents.push(doc2);
    expect(frame.currentDocument).toBe(doc2);
    expect(frame.documents).toHaveLength(2);
  });
});
```

This requires importing `FrameDocument` in the test file — add it to the existing import from `'./models'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/panel/frame-model.integration.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — `frame.documents` does not exist yet.

- [ ] **Step 3: Modify Frame.ts**

Replace `Frame.ts` contents. Key changes:
- Remove `currentDocument: FrameDocument | undefined` stored property
- Remove `currentOwnerElement: OwnerElement | undefined` stored property
- Remove `iframes` array
- Add `documents: FrameDocument[]` observable array
- Add computed `currentDocument` getter returning last element
- Remove `OwnerElement` import

```typescript
// Frame - Stable identity for an iframe, keyed by (tabId, frameId)

import { makeAutoObservable, observable } from 'mobx';
import { FrameDocument } from './FrameDocument';

export interface FrameLookup {
  getFramesByParent(tabId: number, parentFrameId: number): Frame[];
}

export class Frame {
  readonly tabId: number;
  readonly frameId: number;
  parentFrameId: number | undefined;
  documents: FrameDocument[] = [];
  isOpener = false;
  private readonly frameLookup: FrameLookup;

  constructor(tabId: number, frameId: number, frameLookup: FrameLookup, parentFrameId: number | undefined = undefined) {
    this.frameLookup = frameLookup;
    this.tabId = tabId;
    this.frameId = frameId;
    this.parentFrameId = parentFrameId;

    makeAutoObservable<this, 'frameLookup'>(this, {
      tabId: false,
      frameId: false,
      frameLookup: false,
      documents: observable.shallow,
    });
  }

  get currentDocument(): FrameDocument | undefined {
    return this.documents.length > 0 ? this.documents[this.documents.length - 1] : undefined;
  }

  get children(): Frame[] {
    return this.frameLookup.getFramesByParent(this.tabId, this.frameId);
  }

  static key(tabId: number, frameId: number): string {
    return `${tabId}:${frameId}`;
  }

  get key(): string {
    return Frame.key(this.tabId, this.frameId);
  }
}
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `npx vitest run src/panel/frame-model.integration.test.ts --reporter=verbose -t "Frame.documents array" 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/panel/models/Frame.ts src/panel/frame-model.integration.test.ts
git commit -m "refactor: replace Frame.currentDocument with documents array"
```

---

## Task 4: Add iframes array to FrameDocument

**Files:**
- Modify: `src/panel/models/FrameDocument.ts`

- [ ] **Step 1: Add iframes property**

Add to `FrameDocument` class:
- Import `IFrame` type
- Add `iframes: IFrame[] = []` observable array
- Mark with `observable.shallow` in makeAutoObservable

```typescript
// FrameDocument - A specific document loaded in a frame, keyed by documentId

import { makeAutoObservable, observable } from 'mobx';
import type { Frame } from './Frame';
import type { IFrame } from './IFrame';

export class FrameDocument {
  documentId: string | undefined;
  url: string | undefined;
  origin: string | undefined;
  title: string | undefined;
  sourceId: string | undefined;
  frame: Frame | undefined;
  iframes: IFrame[] = [];

  constructor(init: {
    documentId?: string;
    url?: string;
    origin?: string;
    title?: string;
    sourceId?: string;
  }) {
    this.documentId = init.documentId;
    this.url = init.url;
    this.origin = init.origin;
    this.title = init.title;
    this.sourceId = init.sourceId;
    this.frame = undefined;

    makeAutoObservable(this, {
      iframes: observable.shallow,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/panel/models/FrameDocument.ts
git commit -m "feat: add iframes array to FrameDocument"
```

---

## Task 5: Update FrameStore — add tabs map, getOrCreateTab, getOrCreateIFrame

**Files:**
- Modify: `src/panel/models/FrameStore.ts`

- [ ] **Step 1: Write failing tests for new FrameStore methods**

Add to `src/panel/frame-model.integration.test.ts`:

```typescript
describe('FrameStore Tab and IFrame management', () => {
  it('getOrCreateTab creates Tab with root frame', () => {
    const tab = frameStore.getOrCreateTab(TAB_ID);
    expect(tab.tabId).toBe(TAB_ID);
    expect(tab.rootFrame).toBeDefined();
    expect(tab.rootFrame.tabId).toBe(TAB_ID);
    expect(tab.rootFrame.frameId).toBe(0);
    // Root frame is also in frames map
    expect(frameStore.getFrame(TAB_ID, 0)).toBe(tab.rootFrame);
  });

  it('getOrCreateTab returns existing Tab on second call', () => {
    const tab1 = frameStore.getOrCreateTab(TAB_ID);
    const tab2 = frameStore.getOrCreateTab(TAB_ID);
    expect(tab1).toBe(tab2);
  });

  it('getOrCreateFrame does not create Tab automatically', () => {
    frameStore.getOrCreateFrame(TAB_ID, 3);
    expect(frameStore.tabs.has(TAB_ID)).toBe(false);
  });

  it('getOrCreateIFrame creates IFrame on document matched by sourceId', () => {
    const doc = new FrameDocument({ documentId: 'doc-parent' });
    const iframe = frameStore.getOrCreateIFrame(doc, 'win-child', {
      domPath: 'body > iframe',
      src: 'https://child.example.com',
      id: 'child-iframe',
    });

    expect(iframe.parentDocument).toBe(doc);
    expect(iframe.sourceId).toBe('win-child');
    expect(iframe.domPath).toBe('body > iframe');
    expect(doc.iframes).toContain(iframe);
  });

  it('getOrCreateIFrame returns existing IFrame when sourceId matches', () => {
    const doc = new FrameDocument({ documentId: 'doc-parent' });
    const iframe1 = frameStore.getOrCreateIFrame(doc, 'win-child', {
      domPath: 'body > iframe',
      src: 'https://child.example.com/v1',
      id: 'child-iframe',
    });
    const iframe2 = frameStore.getOrCreateIFrame(doc, 'win-child', {
      domPath: 'body > div > iframe',
      src: 'https://child.example.com/v2',
      id: 'child-iframe',
    });

    expect(iframe1).toBe(iframe2);
    // Properties updated to latest
    expect(iframe1.domPath).toBe('body > div > iframe');
    expect(iframe1.src).toBe('https://child.example.com/v2');
  });

  it('clear() also clears tabs map', () => {
    frameStore.getOrCreateTab(TAB_ID);
    expect(frameStore.tabs.size).toBe(1);
    frameStore.clear();
    expect(frameStore.tabs.size).toBe(0);
  });
});
```

Import `FrameDocument` at the top of the test file if not already imported.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/panel/frame-model.integration.test.ts --reporter=verbose -t "FrameStore Tab and IFrame" 2>&1 | tail -20`
Expected: FAIL — `getOrCreateTab`, `getOrCreateIFrame`, `tabs` don't exist yet.

- [ ] **Step 3: Implement FrameStore changes**

Update `src/panel/models/FrameStore.ts`:

```typescript
// FrameStore - Manages Frame and FrameDocument instances with reactive MobX maps

import { makeAutoObservable, observable } from 'mobx';
import { Frame, FrameLookup } from './Frame';
import { FrameDocument } from './FrameDocument';
import { IFrame } from './IFrame';
import { Tab } from './Tab';
import type { IframeElementInfo } from '../../types';

export class FrameStore implements FrameLookup {
  // Primary indices
  frames = observable.map<string, Frame>();
  documents = observable.map<string, FrameDocument>();
  // Secondary index for source correlation
  documentsBySourceId = observable.map<string, FrameDocument>();
  currentHierarchyFrameKeys = observable.set<string>();
  tabs = observable.map<number, Tab>();

  constructor() {
    makeAutoObservable(this, {
      frames: false,
      documents: false,
      documentsBySourceId: false,
      currentHierarchyFrameKeys: false,
      tabs: false,
    });
  }

  getDocumentById(documentId: string | undefined): FrameDocument | undefined {
    if (!documentId) return undefined;
    return this.documents.get(documentId);
  }

  getDocumentBySourceId(sourceId: string | undefined | null): FrameDocument | undefined {
    if (!sourceId) return undefined;
    return this.documentsBySourceId.get(sourceId);
  }

  getFrame(tabId: number, frameId: number): Frame | undefined {
    return this.frames.get(Frame.key(tabId, frameId));
  }

  getFramesByParent(tabId: number, parentFrameId: number): Frame[] {
    const result: Frame[] = [];
    for (const frame of this.frames.values()) {
      if (frame.tabId === tabId && frame.parentFrameId === parentFrameId) {
        result.push(frame);
      }
    }
    return result;
  }

  getOrCreateTab(tabId: number): Tab {
    let tab = this.tabs.get(tabId);
    if (!tab) {
      const rootFrame = this.getOrCreateFrame(tabId, 0);
      tab = new Tab(tabId, rootFrame);
      this.tabs.set(tabId, tab);
    }
    return tab;
  }

  getOrCreateFrame(tabId: number, frameId: number, parentFrameId?: number): Frame {
    const key = Frame.key(tabId, frameId);
    let frame = this.frames.get(key);
    if (!frame) {
      frame = new Frame(tabId, frameId, this, parentFrameId);
      this.frames.set(key, frame);
    }
    return frame;
  }

  getOrCreateDocumentById(documentId: string): FrameDocument {
    let doc = this.documents.get(documentId);
    if (!doc) {
      doc = new FrameDocument({ documentId });
      this.documents.set(documentId, doc);
    }
    return doc;
  }

  getOrCreateDocumentBySourceId(sourceId: string): FrameDocument {
    let doc = this.documentsBySourceId.get(sourceId);
    if (!doc) {
      doc = new FrameDocument({ sourceId });
      this.documentsBySourceId.set(sourceId, doc);
    }
    return doc;
  }

  getOrCreateIFrame(
    parentDocument: FrameDocument,
    sourceId: string | undefined,
    iframeInfo: IframeElementInfo | undefined,
  ): IFrame {
    // Match by sourceId if available
    if (sourceId) {
      const existing = parentDocument.iframes.find(i => i.sourceId === sourceId);
      if (existing) {
        // Update mutable properties
        if (iframeInfo) {
          existing.domPath = iframeInfo.domPath;
          existing.src = iframeInfo.src || undefined;
          existing.id = iframeInfo.id || undefined;
        }
        return existing;
      }
    }

    // Create new IFrame
    const iframe = new IFrame(
      parentDocument,
      iframeInfo?.domPath ?? '',
      iframeInfo?.src,
      iframeInfo?.id,
    );
    if (sourceId) {
      iframe.sourceId = sourceId;
    }
    parentDocument.iframes.push(iframe);
    return iframe;
  }

  get hierarchyRoots(): Frame[] {
    const roots: Frame[] = [];
    for (const frame of this.frames.values()) {
      if (frame.parentFrameId === -1) {
        roots.push(frame);
      } else if (frame.parentFrameId !== undefined
        && !this.frames.has(Frame.key(frame.tabId, frame.parentFrameId))) {
        roots.push(frame);
      }
    }
    return roots;
  }

  get nonHierarchyFrames(): Frame[] {
    const result: Frame[] = [];
    for (const frame of this.frames.values()) {
      if (frame.parentFrameId === undefined) {
        result.push(frame);
      }
    }
    return result;
  }

  // Called when hierarchy data arrives from webNavigation.getAllFrames()
  processHierarchy(frames: Array<{
    frameId: number;
    tabId: number;
    documentId?: string;
    sourceId?: string;
    url: string;
    parentFrameId: number;
    title: string;
    origin: string;
    iframes: { src: string; id: string; domPath: string; sourceId?: string }[];
    isOpener?: boolean;
  }>): void {
    this.currentHierarchyFrameKeys.clear();

    for (const frameData of frames) {
      this.currentHierarchyFrameKeys.add(Frame.key(frameData.tabId, frameData.frameId));

      const frame = this.getOrCreateFrame(frameData.tabId, frameData.frameId, frameData.parentFrameId);
      frame.parentFrameId = frameData.parentFrameId;
      frame.isOpener = frameData.isOpener ?? false;

      let doc: FrameDocument | undefined;
      if (frameData.documentId) {
        doc = this.getOrCreateDocumentById(frameData.documentId);
      } else if (frameData.sourceId) {
        doc = this.getOrCreateDocumentBySourceId(frameData.sourceId);
      }

      if (doc) {
        doc.url = frameData.url;
        doc.origin = frameData.origin;
        doc.title = frameData.title;
        doc.frame = frame;
      } else if (frameData.url || frameData.origin || frameData.title) {
        doc = new FrameDocument({
          url: frameData.url || undefined,
          origin: frameData.origin || undefined,
          title: frameData.title || undefined,
        });
      }

      // Add doc to frame.documents if not already present
      if (doc && !frame.documents.includes(doc)) {
        frame.documents.push(doc);
      }

      // Create IFrame entities for each iframe element in this frame's document
      if (doc) {
        for (const iframeData of frameData.iframes) {
          // Match by sourceId if available, otherwise create new
          const childFrame = iframeData.sourceId
            ? this.getDocumentBySourceId(iframeData.sourceId)?.frame
            : undefined;
          const iframe = this.getOrCreateIFrame(doc, iframeData.sourceId, iframeData);
          if (childFrame) {
            iframe.childFrame = childFrame;
          }
        }
      }
    }
  }

  clear(): void {
    this.frames.clear();
    this.documents.clear();
    this.documentsBySourceId.clear();
    this.currentHierarchyFrameKeys.clear();
    this.tabs.clear();
  }
}

// Singleton instance
export const frameStore = new FrameStore();
```

**Important: Tab creation is only done in `getOrCreateTab`.** `getOrCreateFrame` does NOT create Tabs — callers that need a Tab must call `getOrCreateTab` explicitly. This avoids mutual recursion between the two methods.

- [ ] **Step 4: Run the new tests**

Run: `npx vitest run src/panel/frame-model.integration.test.ts --reporter=verbose -t "FrameStore Tab and IFrame" 2>&1 | tail -30`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/panel/models/FrameStore.ts src/panel/frame-model.integration.test.ts
git commit -m "feat: add tabs map, getOrCreateTab, getOrCreateIFrame to FrameStore"
```

---

## Task 6: Update connection.ts — processIncomingMessage and processRegistration

This is the most complex task. The changes:
1. Replace `frame.currentDocument = doc` with `frame.documents.push(doc)` (checking for duplicates)
2. Remove `frame.currentOwnerElement` updates
3. Create IFrame entities on child messages
4. Link IFrame.childFrame in processRegistration
5. Link Tab opener/opened relationships

**Files:**
- Modify: `src/panel/connection.ts`

- [ ] **Step 1: Update processIncomingMessage — target document linking**

In `_processIncomingMessage`, change the target section. Replace:
```typescript
    if (!targetDoc.frame) {
      targetDoc.frame = targetFrame;
      targetFrame.currentDocument = targetDoc;
    }

    targetOwnerElement = targetFrame.currentOwnerElement;
```

With:
```typescript
    if (!targetDoc.frame) {
      targetDoc.frame = targetFrame;
      if (!targetFrame.documents.includes(targetDoc)) {
        targetFrame.documents.push(targetDoc);
      }
    }
```

Remove the `targetOwnerElement = targetFrame.currentOwnerElement;` line entirely (targetOwnerElement stays undefined — it was only used for parent messages which get it from FrameDetail now).

- [ ] **Step 2: Update processIncomingMessage — source document linking**

Replace the block at lines 84-90:
```typescript
  if (sourceDoc && !sourceDoc.frame && msg.source.tabId != null && msg.source.frameId != null) {
    const sourceFrame = frameStore.getOrCreateFrame(msg.source.tabId, msg.source.frameId);
    sourceDoc.frame = sourceFrame;
    if (!sourceFrame.currentDocument) {
      sourceFrame.currentDocument = sourceDoc;
    }
  }
```

With:
```typescript
  if (sourceDoc && !sourceDoc.frame && msg.source.tabId != null && msg.source.frameId != null) {
    const sourceFrame = frameStore.getOrCreateFrame(msg.source.tabId, msg.source.frameId);
    sourceDoc.frame = sourceFrame;
    if (!sourceFrame.documents.includes(sourceDoc)) {
      sourceFrame.documents.push(sourceDoc);
    }
  }
```

- [ ] **Step 3: Update processIncomingMessage — child message IFrame creation**

Replace the child source owner element block (lines 92-106):
```typescript
  // --- Source owner element (child messages) ---
  let sourceOwnerElement: OwnerElement | undefined = undefined;
  if (msg.source.type === 'child') {
    sourceOwnerElement = OwnerElement.fromRaw(msg.source.iframe);

    // Update Frame's currentOwnerElement if it has changed (e.g., due to navigation)
    if (sourceOwnerElement && msg.source.sourceId) {
      const sourceDoc = frameStore.getDocumentBySourceId(msg.source.sourceId);
      if (sourceDoc?.frame) {
        if (!sourceOwnerElement.equals(sourceDoc.frame.currentOwnerElement)) {
          sourceDoc.frame.currentOwnerElement = sourceOwnerElement;
        }
      }
    }
  }
```

With:
```typescript
  // --- Source owner element (child messages) ---
  let sourceOwnerElement: OwnerElement | undefined = undefined;
  if (msg.source.type === 'child') {
    sourceOwnerElement = OwnerElement.fromRaw(msg.source.iframe);

    // Create/update IFrame entity on target's current document
    if (msg.target.documentId && msg.source.sourceId) {
      const targetDoc = frameStore.getDocumentById(msg.target.documentId);
      if (targetDoc) {
        frameStore.getOrCreateIFrame(targetDoc, msg.source.sourceId, msg.source.iframe ?? undefined);
      }
    }
  }
```

- [ ] **Step 4: Remove parent message owner element and targetOwnerElement derivation**

Two things previously read from `Frame.currentOwnerElement` which is being removed:
1. `targetOwnerElement` was set to `targetFrame.currentOwnerElement` (the target frame's own iframe element in its parent's DOM)
2. `sourceOwnerElement` for parent messages was set to `sourceDoc.frame.currentOwnerElement`

Both become `undefined`. This is an acceptable minor regression — the IFrame entities now hold this info and Phase 2 UI will read from them. The message detail view already handles undefined owner elements gracefully.

Replace the parent message block (lines 108-114):
```typescript
  // --- Parent messages: reference source Frame's currentOwnerElement ---
  if (msg.source.type === 'parent' && msg.source.documentId) {
    const sourceDoc = frameStore.getDocumentById(msg.source.documentId);
    if (sourceDoc?.frame) {
      sourceOwnerElement = sourceDoc.frame.currentOwnerElement;
    }
  }
```

With nothing — simply remove this block. Parent messages will have `sourceOwnerElement === undefined`.

- [ ] **Step 5: Update processIncomingMessage — Tab opener/opened linking**

Add after the source document/frame linking block, before the source owner element section:

```typescript
  // --- Link Tab opener/opened relationships ---
  if (msg.source.tabId != null && msg.target.tabId !== msg.source.tabId) {
    if (msg.source.type === 'opener' || msg.source.type === 'opened') {
      const sourceTab = frameStore.getOrCreateTab(msg.source.tabId);
      const targetTab = frameStore.getOrCreateTab(msg.target.tabId);
      if (msg.source.type === 'opener') {
        // Source is opener, target is opened
        if (!targetTab.openerTab) {
          targetTab.openerTab = sourceTab;
          if (!sourceTab.openedTabs.includes(targetTab)) {
            sourceTab.openedTabs.push(targetTab);
          }
        }
      } else {
        // Source is opened, target is opener
        if (!sourceTab.openerTab) {
          sourceTab.openerTab = targetTab;
          if (!targetTab.openedTabs.includes(sourceTab)) {
            targetTab.openedTabs.push(sourceTab);
          }
        }
      }
    }
  }
```

- [ ] **Step 6: Update processRegistration**

Replace the entire `processRegistration` function. Key changes:
- `frame.currentDocument = doc` → `if (!frame.documents.includes(doc)) frame.documents.push(doc)`
- Remove `currentOwnerElement` update block
- Add IFrame→childFrame linking

```typescript
function processRegistration(message: Message): void {
  const regData = message.registrationData!;
  const sourceId = message.sourceSourceId!;

  const docBySourceId = frameStore.getDocumentBySourceId(sourceId);
  const docByDocId = frameStore.getDocumentById(regData.documentId);

  if (docBySourceId && docByDocId && docBySourceId !== docByDocId) {
    docByDocId.sourceId = sourceId;
    if (docBySourceId.origin && !docByDocId.origin) {
      docByDocId.origin = docBySourceId.origin;
    }
    frameStore.documentsBySourceId.set(sourceId, docByDocId);
  } else if (docBySourceId && !docByDocId) {
    // Navigation: same WindowProxy, new documentId. Create fresh document.
    const newDoc = new FrameDocument({ documentId: regData.documentId, sourceId: sourceId });
    if (docBySourceId.origin && !newDoc.origin) {
      newDoc.origin = docBySourceId.origin;
    }
    frameStore.documents.set(regData.documentId, newDoc);
    frameStore.documentsBySourceId.set(sourceId, newDoc);
  } else if (!docBySourceId && docByDocId) {
    docByDocId.sourceId = sourceId;
    frameStore.documentsBySourceId.set(sourceId, docByDocId);
  } else if (!docBySourceId && !docByDocId) {
    const doc = new FrameDocument({ documentId: regData.documentId, sourceId });
    frameStore.documents.set(regData.documentId, doc);
    frameStore.documentsBySourceId.set(sourceId, doc);
  }

  const frame = frameStore.getOrCreateFrame(regData.tabId, regData.frameId);
  const doc = frameStore.documents.get(regData.documentId)!;
  doc.frame = frame;
  if (!frame.documents.includes(doc)) {
    frame.documents.push(doc);
  }

  // Link IFrame entity to this child frame
  // Find IFrame on parent document that has matching sourceId
  if (message.target.documentId) {
    const parentDoc = frameStore.getDocumentById(message.target.documentId);
    if (parentDoc) {
      const iframe = parentDoc.iframes.find(i => i.sourceId === sourceId);
      if (iframe) {
        iframe.childFrame = frame;
      }
    }
  }

  // After registration links sourceId → Frame, infer parent from the registration target
  // Only for same-tab registrations — cross-tab frames (opener/opened) don't share a hierarchy
  if (frame.parentFrameId === undefined && frame.tabId === message.target.tabId) {
    const targetFrame = frameStore.getFrame(message.target.tabId, message.target.frameId);
    if (targetFrame) {
      frame.parentFrameId = targetFrame.frameId;
    }
  }
}
```

- [ ] **Step 7: Remove unused OwnerElement import if no longer needed**

Check if `OwnerElement` is still used in `connection.ts`. It's still used for `OwnerElement.fromRaw()` to create snapshots on child messages, so keep the import.

- [ ] **Step 8: Run all integration tests**

Run: `npx vitest run src/panel/frame-model.integration.test.ts --reporter=verbose 2>&1 | tail -40`

Some existing tests will fail because they assert `frame.currentOwnerElement` or `frame.iframes`. These will be fixed in Task 7.

- [ ] **Step 9: Commit**

```bash
git add src/panel/connection.ts
git commit -m "refactor: update connection.ts for new data model (documents array, IFrame entities)"
```

---

## Task 7: Fix existing integration tests

Many tests assert against `frame.currentOwnerElement` and `frame.iframes` which no longer exist. Update them to use the new model.

**Files:**
- Modify: `src/panel/frame-model.integration.test.ts`

- [ ] **Step 1: Update "registration sets owner element on Frame" test**

This test (`it('registration sets owner element on Frame', ...)`) asserts `frameB.currentOwnerElement`. Replace with checking the IFrame entity on the parent document:

```typescript
it('registration creates IFrame entity on parent document', () => {
  processIncomingMessage(registrationMsg(FRAME_B, FRAME_A));

  const parentDoc = frameStore.getDocumentById(FRAME_A.documentId);
  expect(parentDoc).toBeDefined();
  const iframe = parentDoc!.iframes.find(i => i.sourceId === FRAME_B.sourceId);
  expect(iframe).toBeDefined();
  expect(iframe!.domPath).toBe(FRAME_B.iframe.domPath);
  expect(iframe!.src).toBe(FRAME_B.iframe.src);
  expect(iframe!.id).toBe(FRAME_B.iframe.id);
  expect(iframe!.childFrame).toBeDefined();
  expect(iframe!.childFrame!.frameId).toBe(FRAME_B.frameId);
});
```

- [ ] **Step 2: Update "updated iframe info triggers MobX reaction" test**

Replace the `currentOwnerElement` autorun test with an IFrame property mutation test:

```typescript
it('updated iframe info updates IFrame entity properties', () => {
  processIncomingMessage(childMsg(FRAME_B, FRAME_A));

  const parentDoc = frameStore.getDocumentById(FRAME_A.documentId);
  const iframe = parentDoc!.iframes.find(i => i.sourceId === FRAME_B.sourceId);
  expect(iframe).toBeDefined();
  expect(iframe!.domPath).toBe(FRAME_B.iframe.domPath);

  // Child message from B with different iframe info — updates IFrame
  const FRAME_B_UPDATED_IFRAME = {
    ...FRAME_B,
    iframe: {
      domPath: 'body > div > iframe:nth-of-type(2)',
      src: 'https://child-b.example.com/iframe-v2',
      id: 'iframe-b-updated',
    },
  };
  processIncomingMessage(childMsg(FRAME_B_UPDATED_IFRAME, FRAME_A));

  expect(iframe!.domPath).toBe('body > div > iframe:nth-of-type(2)');
  expect(iframe!.src).toBe('https://child-b.example.com/iframe-v2');
  expect(iframe!.id).toBe('iframe-b-updated');
});
```

- [ ] **Step 3: Update "processHierarchy populates iframes and isOpener" test**

Replace `frame.iframes` assertion with checking `frame.currentDocument.iframes`:

```typescript
it('processHierarchy populates IFrame entities on document and isOpener on Frame', () => {
  const iframes = [{ src: 'https://child.example.com', id: 'iframe1', domPath: 'body > iframe' }];
  store.setFrameHierarchy([
    { frameId: 0, tabId: TAB_ID, url: FRAME_A.url, parentFrameId: -1, title: FRAME_A.title, origin: FRAME_A.origin, iframes },
    { frameId: 0, tabId: OPENER_TAB_ID, url: OPENER_FRAME.url, parentFrameId: -1, title: OPENER_FRAME.title, origin: OPENER_FRAME.origin, iframes: [], isOpener: true },
  ]);

  const frameA = frameStore.getFrame(TAB_ID, 0)!;
  expect(frameA.currentDocument).toBeDefined();
  expect(frameA.currentDocument!.iframes).toHaveLength(1);
  expect(frameA.currentDocument!.iframes[0].domPath).toBe('body > iframe');
  expect(frameA.currentDocument!.iframes[0].src).toBe('https://child.example.com');
  expect(frameA.isOpener).toBe(false);

  const openerFrame = frameStore.getFrame(OPENER_TAB_ID, 0)!;
  expect(openerFrame.isOpener).toBe(true);
});
```

- [ ] **Step 4: Update any tests asserting `frame.currentDocument` assignment**

Search for tests that directly set `frame.currentDocument = ...` — these are in `processHierarchy` and `processRegistration` paths, which are already handled by the connection.ts changes. The test assertions like `expect(frameA!.currentDocument).toBe(docA)` should still work since `currentDocument` is now a computed getter that returns the last document.

Check tests like "does not corrupt parent frame document" — `expect(frameA!.currentDocument).toBe(docA)` should still pass as long as docA is the only document pushed to frameA.documents.

- [ ] **Step 5: Run all integration tests**

Run: `npx vitest run src/panel/frame-model.integration.test.ts --reporter=verbose 2>&1 | tail -50`
Expected: All tests PASS.

If any tests still fail, fix them iteratively.

- [ ] **Step 6: Commit**

```bash
git add src/panel/frame-model.integration.test.ts
git commit -m "test: update integration tests for new data model structure"
```

---

## Task 8: Update UI components

The UI components reference `frame.iframes` and `frame.currentOwnerElement`. Update them to work with the new model.

**Files:**
- Modify: `src/panel/components/EndpointsView/EndpointsView.tsx`
- Modify: `src/panel/components/shared/FrameDetail.tsx`

- [ ] **Step 1: Update FrameDetailPane in EndpointsView.tsx**

Replace `frame.iframes` references (lines 128-139):

```typescript
<div className="frame-iframes">
  <h4>Child iframes ({frame.currentDocument?.iframes.length ?? 0})</h4>
  {!frame.currentDocument?.iframes.length ? (
    <p className="placeholder">No iframes in this frame</p>
  ) : (
    frame.currentDocument.iframes.map((iframe, index) => (
      <div key={index} className="iframe-item">
        <div><strong>src:</strong> {iframe.src || '(empty)'}</div>
        <div><strong>id:</strong> {iframe.id || '(none)'}</div>
        <div><strong>path:</strong> {iframe.domPath}</div>
      </div>
    ))
  )}
</div>
```

- [ ] **Step 2: Update FrameDetail.tsx**

Remove the `frame?.currentOwnerElement` fallback on line 39:

```typescript
const owner = ownerOverride;
```

(Was: `const owner = ownerOverride ?? frame?.currentOwnerElement;`)

This means the owner element section only shows when explicitly passed via prop (from message detail view). In the endpoints detail view, the owner element info is now available via IFrame entities on the parent document — but that's a Phase 2 UI concern.

- [ ] **Step 3: Run vitest**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All unit tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/panel/components/EndpointsView/EndpointsView.tsx src/panel/components/shared/FrameDetail.tsx
git commit -m "refactor: update UI components for new data model (no visual changes)"
```

---

## Task 9: Run full integration test and fix remaining issues

**Files:**
- Potentially any file modified above

- [ ] **Step 1: Run full integration test suite**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -50`

- [ ] **Step 2: Run e2e integration test**

Run: `npx vitest run src/integration.test.ts --reporter=verbose 2>&1 | tail -30`

- [ ] **Step 3: Build the extension**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Run Playwright e2e tests**

Run: `npx playwright test 2>&1 | tail -30`
Expected: All e2e tests PASS.

- [ ] **Step 5: Fix any failures**

If any tests fail, diagnose and fix. Common issues:
- TypeScript errors from removed `currentOwnerElement` or `iframes` references in files not yet updated
- MobX reactivity issues from `observable.shallow` vs deep observation
- Test assertions that assume `currentDocument` is a stored property rather than computed

- [ ] **Step 6: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: resolve remaining test failures from data model refactor"
```

---

## Task 10: Verify and clean up

- [ ] **Step 1: Search for any remaining references to removed properties**

Search for `currentOwnerElement` and `frame.iframes` (not `document.iframes`) across all source files. Any remaining references are compilation errors or dead code to remove.

Run: `grep -rn 'currentOwnerElement\|frame\.iframes' src/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '.test.'`

- [ ] **Step 2: Run final full test suite**

Run: `npx vitest run && npx playwright test`
Expected: All tests PASS.

- [ ] **Step 3: Final commit if needed**

```bash
git add -A
git commit -m "chore: clean up remaining references to removed Frame properties"
```
