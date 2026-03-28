// Integration tests for the frame model: processIncomingMessage → FrameStore
//
// Tests call processIncomingMessage() with IMessage objects matching what the
// background script produces, then verify the resulting FrameStore state and
// Message computed properties.
//
// Test frame hierarchy:
//   A (top frame, frameId=0)       — https://parent.example.com
//   └── B (child of A, frameId=1)  — https://child-b.example.com
//       └── C (child of B, frameId=2) — https://child-c.example.com

import { describe, it, expect, beforeEach } from 'vitest';
import { autorun } from 'mobx';
import { store } from './store';
import { processIncomingMessage } from './connection';
import { frameStore, Frame, FrameDocument } from './models';
import type { IMessage } from '../types';

const TAB_ID = 42;
const OPENER_TAB_ID = 99;

// --- Frame definitions ---

const FRAME_A = {
  frameId: 0,
  documentId: 'doc-A',
  url: 'https://parent.example.com/page',
  origin: 'https://parent.example.com',
  title: 'Parent Page',
};

const FRAME_B = {
  frameId: 1,
  documentId: 'doc-B',
  url: 'https://child-b.example.com/iframe',
  origin: 'https://child-b.example.com',
  title: 'Child B',
  sourceId: 'win-B',
  iframe: {
    domPath: 'body > iframe:nth-of-type(1)',
    src: 'https://child-b.example.com/iframe',
    id: 'iframe-b',
  },
};

const FRAME_C = {
  frameId: 2,
  documentId: 'doc-C',
  url: 'https://child-c.example.com/nested',
  origin: 'https://child-c.example.com',
  title: 'Child C',
  sourceId: 'win-C',
  iframe: {
    domPath: 'body > iframe:nth-of-type(1)',
    src: 'https://child-c.example.com/nested',
    id: 'iframe-c',
  },
};

const OPENER_FRAME = {
  frameId: 0,
  documentId: 'doc-opener',
  url: 'https://opener.example.com/page',
  origin: 'https://opener.example.com',
  title: 'Opener Page',
};

// --- Message factories ---
// These build IMessage objects matching what the background script sends to the panel.

let msgId = 0;

/**
 * Child sends postMessage to parent.
 *
 * Captured by the parent's content script. Background enriches target with
 * sender.documentId and sender.frameId (both are the parent's). Source only
 * has the sourceId assigned by the parent's content script and iframe element info.
 */
function childMsg(
  source: typeof FRAME_B,
  target: typeof FRAME_A,
  data: Record<string, unknown> = { type: 'test-event' },
): IMessage {
  return {
    id: `msg-${++msgId}`,
    timestamp: Date.now() + msgId,
    target: {
      url: target.url,
      origin: target.origin,
      documentTitle: target.title,
      frameId: target.frameId,
      tabId: TAB_ID,
      documentId: target.documentId,
    },
    source: {
      type: 'child',
      origin: source.origin,
      sourceId: source.sourceId,
      iframe: source.iframe,
    },
    data,
  };
}

/**
 * Parent sends postMessage to child.
 *
 * Captured by the child's content script. Background enriches source with the
 * parent's frameId and documentId (looked up via webNavigation).
 */
function parentMsg(
  source: typeof FRAME_A,
  target: typeof FRAME_B,
  data: Record<string, unknown> = { type: 'test-response' },
): IMessage {
  return {
    id: `msg-${++msgId}`,
    timestamp: Date.now() + msgId,
    target: {
      url: target.url,
      origin: target.origin,
      documentTitle: target.title,
      frameId: target.frameId,
      tabId: TAB_ID,
      documentId: target.documentId,
    },
    source: {
      type: 'parent',
      origin: source.origin,
      sourceId: null,
      iframe: null,
      frameId: source.frameId,
      documentId: source.documentId,
    },
    data,
  };
}

/**
 * Cross-tab message routed to the opened window's panel.
 *
 * When the opened window sends a message to the opener, the opener's content script
 * captures it and the background routes a copy to the opened window's panel.
 * The target is the opener (a different tab), the source is the opened window (current tab).
 */
function crossTabOpenedToOpenerMsg(
  data: Record<string, unknown> = { type: 'hello-opener' },
): IMessage {
  return {
    id: `msg-${++msgId}`,
    timestamp: Date.now() + msgId,
    target: {
      url: OPENER_FRAME.url,
      origin: OPENER_FRAME.origin,
      documentTitle: OPENER_FRAME.title,
      frameId: OPENER_FRAME.frameId,
      tabId: OPENER_TAB_ID,
      documentId: OPENER_FRAME.documentId,
    },
    source: {
      type: 'opened',
      origin: FRAME_A.origin,
      sourceId: 'win-opened',
      iframe: null,
      tabId: TAB_ID,
    },
    data,
  };
}

/**
 * Opener sends postMessage to opened window (popup).
 *
 * Captured by the popup's content script. Background enriches source with the
 * opener's tabId and frameId from the openedTabs mapping. No documentId is
 * available for the source (cross-tab, no webNavigation lookup for opener).
 * This message is routed to the popup's panel (TAB_ID = popup tab).
 */
function openerToOpenedMsg(
  data: Record<string, unknown> = { type: 'init-from-opener' },
): IMessage {
  return {
    id: `msg-${++msgId}`,
    timestamp: Date.now() + msgId,
    target: {
      url: FRAME_A.url,
      origin: FRAME_A.origin,
      documentTitle: FRAME_A.title,
      frameId: FRAME_A.frameId,
      tabId: TAB_ID,
      documentId: FRAME_A.documentId,
    },
    source: {
      type: 'opener',
      origin: OPENER_FRAME.origin,
      sourceId: 'win-opener',
      iframe: null,
      tabId: OPENER_TAB_ID,
      frameId: OPENER_FRAME.frameId,
    },
    data,
  };
}

/**
 * Child sends registration postMessage to parent.
 *
 * This is a regular child→parent message whose data payload carries the child's
 * frameId and tabId. The background enriches target with sender.documentId, which
 * is the PARENT's documentId (the frame whose content script captured the message).
 */
function registrationMsg(
  source: typeof FRAME_B,
  target: typeof FRAME_A,
): IMessage {
  return childMsg(source, target, {
    type: '__messages_inspector_register__',
    frameId: source.frameId,
    tabId: TAB_ID,
    documentId: source.documentId,
  });
}

/**
 * Opened window sends registration postMessage to opener.
 *
 * Captured by the opener's content script. Background enriches source type to
 * 'opened' and adds tabId/frameId of the opened window. The target is the
 * opener frame (different tab). Data payload carries the opened frame's
 * frameId, tabId, and documentId.
 */
function crossTabRegistrationMsg(): IMessage {
  return {
    id: `msg-${++msgId}`,
    timestamp: Date.now() + msgId,
    target: {
      url: OPENER_FRAME.url,
      origin: OPENER_FRAME.origin,
      documentTitle: OPENER_FRAME.title,
      frameId: OPENER_FRAME.frameId,
      tabId: OPENER_TAB_ID,
      documentId: OPENER_FRAME.documentId,
    },
    source: {
      type: 'opened',
      origin: FRAME_A.origin,
      sourceId: 'win-opened',
      iframe: null,
      tabId: TAB_ID,
    },
    data: {
      type: '__messages_inspector_register__',
      frameId: FRAME_A.frameId,
      tabId: TAB_ID,
      documentId: FRAME_A.documentId,
    },
  };
}

// --- Tests ---

describe('Frame model integration', () => {
  beforeEach(() => {
    frameStore.clear();
    store.clearMessages();
    store.setTabId(TAB_ID);
    store.isRecording = true;
    msgId = 0;
  });

  // ===================================================================
  // Registration disabled — no registration messages arrive, so child
  // sources are only known by sourceId and cannot resolve to a Frame.
  // ===================================================================
  describe('registration disabled', () => {
    it('child→parent: creates target doc+frame, source doc by sourceId only', () => {
      processIncomingMessage(childMsg(FRAME_B, FRAME_A));

      // Target FrameDocument: created by documentId with full info
      const targetDoc = frameStore.getDocumentById(FRAME_A.documentId);
      expect(targetDoc).toBeDefined();
      expect(targetDoc!.url).toBe(FRAME_A.url);
      expect(targetDoc!.origin).toBe(FRAME_A.origin);
      expect(targetDoc!.title).toBe(FRAME_A.title);

      // Target Frame: created and linked to document
      const targetFrame = frameStore.getFrame(TAB_ID, FRAME_A.frameId);
      expect(targetFrame).toBeDefined();
      expect(targetDoc!.frame).toBe(targetFrame);
      expect(targetFrame!.currentDocument).toBe(targetDoc);

      // Source FrameDocument: created by sourceId, no documentId or frame link
      const sourceDoc = frameStore.getDocumentBySourceId(FRAME_B.sourceId);
      expect(sourceDoc).toBeDefined();
      expect(sourceDoc!.origin).toBe(FRAME_B.origin);
      expect(sourceDoc!.documentId).toBeUndefined();
      expect(sourceDoc!.frame).toBeUndefined();

      // Message: sourceFrame unresolvable without registration
      const msg = store.messages[0];
      expect(msg.sourceFrame).toBeUndefined();
      expect(msg.source.frameId).toBeUndefined();
      expect(msg.sourceDocument).toBe(sourceDoc);

      // Owner element snapshot captured from iframe info
      expect(msg.sourceOwnerElement).toBeDefined();
      expect(msg.sourceOwnerElement!.domPath).toBe(FRAME_B.iframe.domPath);
      expect(msg.sourceOwnerElement!.src).toBe(FRAME_B.iframe.src);
      expect(msg.sourceOwnerElement!.id).toBe(FRAME_B.iframe.id);
    });

    it('parent→child: source doc created by documentId with native frameId', () => {
      processIncomingMessage(parentMsg(FRAME_A, FRAME_B));

      // Source FrameDocument created by documentId
      const sourceDoc = frameStore.getDocumentById(FRAME_A.documentId);
      expect(sourceDoc).toBeDefined();
      expect(sourceDoc!.origin).toBe(FRAME_A.origin);

      // Message has native source.frameId from webNavigation enrichment
      const msg = store.messages[0];
      expect(msg.source.frameId).toBe(FRAME_A.frameId);
      expect(msg.sourceDocument).toBe(sourceDoc);
    });

    it('multiple messages from same child reuse source FrameDocument', () => {
      processIncomingMessage(childMsg(FRAME_B, FRAME_A, { type: 'event-1' }));
      processIncomingMessage(childMsg(FRAME_B, FRAME_A, { type: 'event-2' }));

      expect(store.messages[0].sourceDocument).toBe(store.messages[1].sourceDocument);
      expect(store.messages[0].sourceDocument)
        .toBe(frameStore.getDocumentBySourceId(FRAME_B.sourceId));
    });

    it('messages from different children create separate FrameDocuments', () => {
      processIncomingMessage(childMsg(FRAME_B, FRAME_A));
      processIncomingMessage(childMsg(FRAME_C, FRAME_A));

      const docB = store.messages[0].sourceDocument;
      const docC = store.messages[1].sourceDocument;
      expect(docB).not.toBe(docC);
      expect(docB!.origin).toBe(FRAME_B.origin);
      expect(docC!.origin).toBe(FRAME_C.origin);
    });
  });

  // ===================================================================
  // Registration enabled — registration messages link a child's sourceId
  // to its (tabId, frameId), enabling source frame resolution.
  // ===================================================================
  describe('registration enabled', () => {
    it('child message then registration: source.frameId resolves reactively', () => {
      // Child message arrives first — source only known by sourceId
      processIncomingMessage(childMsg(FRAME_B, FRAME_A));
      const msg = store.messages[0];

      expect(msg.sourceFrame).toBeUndefined();
      expect(msg.source.frameId).toBeUndefined();

      // Registration arrives — links sourceId to Frame
      processIncomingMessage(registrationMsg(FRAME_B, FRAME_A));

      // The SAME message's computed properties now resolve
      expect(msg.sourceFrame).toBeDefined();
      expect(msg.sourceFrame!.frameId).toBe(FRAME_B.frameId);
      expect(msg.source.frameId).toBe(FRAME_B.frameId);

      // Parent's FrameDocument must not be corrupted
      const parentDoc = frameStore.getDocumentById(FRAME_A.documentId);
      expect(parentDoc!.frame!.frameId).toBe(FRAME_A.frameId);
    });

    it('late registration triggers MobX reaction for sourceFrame', () => {
      // Child message arrives first
      processIncomingMessage(childMsg(FRAME_B, FRAME_A));
      const msg = store.messages[0];

      // Track sourceFrame changes via autorun (simulates observer component)
      const sourceFrames: (typeof msg.sourceFrame)[] = [];
      const dispose = autorun(() => {
        sourceFrames.push(msg.sourceFrame);
      });

      // autorun fires immediately with current value
      expect(sourceFrames).toHaveLength(1);
      expect(sourceFrames[0]).toBeUndefined();

      // Registration arrives — should trigger the autorun again
      processIncomingMessage(registrationMsg(FRAME_B, FRAME_A));

      expect(sourceFrames).toHaveLength(2);
      expect(sourceFrames[1]).toBeDefined();
      expect(sourceFrames[1]!.frameId).toBe(FRAME_B.frameId);
      expect(sourceFrames[1]!.tabId).toBe(TAB_ID);

      dispose();
    });

    it('registration then child message: source.frameId resolves immediately', () => {
      // Registration arrives first
      processIncomingMessage(registrationMsg(FRAME_B, FRAME_A));

      // Child message arrives — source should already be linked
      processIncomingMessage(childMsg(FRAME_B, FRAME_A));
      const msg = store.messages[1];

      expect(msg.sourceFrame).toBeDefined();
      expect(msg.sourceFrame!.frameId).toBe(FRAME_B.frameId);
      expect(msg.source.frameId).toBe(FRAME_B.frameId);

      // Parent's FrameDocument must not be corrupted
      const parentDoc = frameStore.getDocumentById(FRAME_A.documentId);
      expect(parentDoc!.frame!.frameId).toBe(FRAME_A.frameId);
    });

    // -----------------------------------------------------------------
    // Complex: a frame appears as both source (by sourceId) and target
    // (by documentId) before registration merges the two FrameDocuments.
    //
    // Timeline:
    //   1. B→A message: B is source → FrameDocument created by sourceId
    //   2. C→B message: B is target → FrameDocument created by documentId
    //   3. Registration for B → should merge the two into one
    // -----------------------------------------------------------------
    describe('frame is both source and target before registration', () => {
      it('merges two FrameDocuments when registration arrives', () => {
        // Step 1: B→A — creates source FrameDocument for B by sourceId
        processIncomingMessage(childMsg(FRAME_B, FRAME_A));

        const docBByWindow = frameStore.getDocumentBySourceId(FRAME_B.sourceId);
        expect(docBByWindow).toBeDefined();
        expect(docBByWindow!.documentId).toBeUndefined();

        // Step 2: C→B — creates target FrameDocument for B by documentId
        processIncomingMessage(childMsg(FRAME_C, FRAME_B));

        const docBByDocId = frameStore.getDocumentById(FRAME_B.documentId);
        expect(docBByDocId).toBeDefined();
        expect(docBByDocId!.url).toBe(FRAME_B.url);

        // Confirm: two separate FrameDocuments for B
        expect(docBByWindow).not.toBe(docBByDocId);

        // Step 3: Registration for B — merges them
        processIncomingMessage(registrationMsg(FRAME_B, FRAME_A));

        // Both lookups now return the same merged document
        const mergedByWindow = frameStore.getDocumentBySourceId(FRAME_B.sourceId);
        const mergedByDocId = frameStore.getDocumentById(FRAME_B.documentId);
        expect(mergedByWindow).toBe(mergedByDocId);

        // Merged document has all properties
        const merged = mergedByDocId!;
        expect(merged.documentId).toBe(FRAME_B.documentId);
        expect(merged.sourceId).toBe(FRAME_B.sourceId);
        expect(merged.url).toBe(FRAME_B.url);
        expect(merged.origin).toBe(FRAME_B.origin);

        // Linked to B's Frame
        expect(merged.frame).toBeDefined();
        expect(merged.frame!.frameId).toBe(FRAME_B.frameId);

        // B→A message's sourceFrame now resolves
        expect(store.messages[0].sourceFrame!.frameId).toBe(FRAME_B.frameId);
      });

      it('does not corrupt parent frame document', () => {
        processIncomingMessage(childMsg(FRAME_B, FRAME_A));
        processIncomingMessage(childMsg(FRAME_C, FRAME_B));
        processIncomingMessage(registrationMsg(FRAME_B, FRAME_A));

        // A's FrameDocument: url, origin, frame link all unchanged
        const docA = frameStore.getDocumentById(FRAME_A.documentId);
        expect(docA!.url).toBe(FRAME_A.url);
        expect(docA!.origin).toBe(FRAME_A.origin);
        expect(docA!.frame!.frameId).toBe(FRAME_A.frameId);

        // A's Frame still points to A's document
        const frameA = frameStore.getFrame(TAB_ID, FRAME_A.frameId);
        expect(frameA!.currentDocument).toBe(docA);
        expect(frameA!.currentDocument!.origin).toBe(FRAME_A.origin);
      });
    });

    it('late registration triggers MobX reaction for Frame.currentDocument', () => {
      // Pre-create frame B (e.g., from hierarchy data) — no document yet
      const frameB = frameStore.getOrCreateFrame(TAB_ID, FRAME_B.frameId);

      // Track currentDocument changes via autorun (simulates observer component)
      const docs: (typeof frameB.currentDocument)[] = [];
      const dispose = autorun(() => {
        docs.push(frameB.currentDocument);
      });

      // autorun fires immediately with current value
      expect(docs).toHaveLength(1);
      expect(docs[0]).toBeUndefined();

      // Registration arrives — processRegistration sets frame.currentDocument
      processIncomingMessage(registrationMsg(FRAME_B, FRAME_A));

      expect(docs).toHaveLength(2);
      expect(docs[1]).toBeDefined();
      expect(docs[1]!.documentId).toBe(FRAME_B.documentId);

      dispose();
    });

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
  });

  // ===================================================================
  // Cross-tab targets — when a message is routed to a panel in a
  // different tab than the one that captured it, the target frame
  // belongs to the capturing tab, not the panel's inspected tab.
  // ===================================================================
  describe('cross-tab target', () => {
    it('target frame is created with the target tabId, not the panel tabId', () => {
      processIncomingMessage(crossTabOpenedToOpenerMsg());

      // Target frame should be in the opener's tab, not the current tab
      const targetFrame = frameStore.getFrame(OPENER_TAB_ID, OPENER_FRAME.frameId);
      expect(targetFrame).toBeDefined();
      expect(targetFrame!.tabId).toBe(OPENER_TAB_ID);

      // Should NOT exist under the current tab
      const wrongFrame = frameStore.getFrame(TAB_ID, OPENER_FRAME.frameId);
      expect(wrongFrame === undefined || wrongFrame !== targetFrame).toBe(true);

      // Message's targetFrame should point to the cross-tab frame
      const msg = store.messages[0];
      expect(msg.targetFrame).toBe(targetFrame);
      expect(msg.targetFrame!.tabId).toBe(OPENER_TAB_ID);
    });

    it('frame filter matches cross-tab target by tab and frame', () => {
      processIncomingMessage(crossTabOpenedToOpenerMsg());

      // Filter with explicit tab should match the target (liqe searches frames array)
      store.setFilter(`frames:"tab[${OPENER_TAB_ID}].frame[${OPENER_FRAME.frameId}]"`);
      expect(store.filteredMessages).toHaveLength(1);

      // liqe uses substring matching, so frames:"frame[0]" also matches
      // "tab[99].frame[0]". To exclude cross-tab matches, use the full
      // tab-qualified form or a negative filter.
      store.setFilter(`frames:"frame[${OPENER_FRAME.frameId}]"`);
      expect(store.filteredMessages).toHaveLength(1);
    });
  });

  // ===================================================================
  // Opener messages — when the opener sends a message to the opened
  // window, source has tabId and frameId but no documentId. The panel
  // should still resolve sourceFrame so tab/frame info is displayed.
  // ===================================================================
  describe('opener source', () => {
    it('opener→opened: sourceFrame resolves from source.tabId and source.frameId', () => {
      processIncomingMessage(openerToOpenedMsg());

      const msg = store.messages[0];

      // Source FrameDocument should exist (created by sourceId)
      expect(msg.sourceDocument).toBeDefined();
      expect(msg.sourceDocument!.origin).toBe(OPENER_FRAME.origin);

      // Source Frame should be created and linked
      expect(msg.sourceFrame).toBeDefined();
      expect(msg.sourceFrame!.tabId).toBe(OPENER_TAB_ID);
      expect(msg.sourceFrame!.frameId).toBe(OPENER_FRAME.frameId);

      // source.frameId should also resolve
      expect(msg.source.frameId).toBe(OPENER_FRAME.frameId);
    });
  });

  // ===================================================================
  // FrameStore hierarchy computeds
  // ===================================================================
  describe('FrameStore hierarchy computeds', () => {
    it('hierarchyRoots returns frames with parentFrameId === -1', () => {
      store.setFrameHierarchy([
        { frameId: 0, tabId: TAB_ID, url: FRAME_A.url, parentFrameId: -1, title: FRAME_A.title, origin: FRAME_A.origin, iframes: [] },
        { frameId: 1, tabId: TAB_ID, url: FRAME_B.url, parentFrameId: 0, title: FRAME_B.title, origin: FRAME_B.origin, iframes: [] },
      ]);

      const roots = frameStore.hierarchyRoots;
      expect(roots).toHaveLength(1);
      expect(roots[0].frameId).toBe(0);
      expect(roots[0].children).toHaveLength(1);
      expect(roots[0].children[0].frameId).toBe(1);
    });

    it('frame created by message with unknown parent appears in nonHierarchyFrames', () => {
      frameStore.getOrCreateFrame(TAB_ID, 5);

      expect(frameStore.nonHierarchyFrames).toHaveLength(1);
      expect(frameStore.nonHierarchyFrames[0].frameId).toBe(5);
      expect(frameStore.hierarchyRoots).toHaveLength(0);
    });

    it('orphaned frame whose parent is missing appears in hierarchyRoots', () => {
      // Frame 3 claims parentFrameId=99, but frame 99 doesn't exist
      const frame = frameStore.getOrCreateFrame(TAB_ID, 3, 99);
      expect(frame.parentFrameId).toBe(99);

      // Should appear as a root since its parent is missing
      expect(frameStore.hierarchyRoots).toHaveLength(1);
      expect(frameStore.hierarchyRoots[0].frameId).toBe(3);
      expect(frameStore.nonHierarchyFrames).toHaveLength(0);
    });

    it('frame moves from nonHierarchyFrames to hierarchy after hierarchy refresh', () => {
      frameStore.getOrCreateFrame(TAB_ID, 1);
      expect(frameStore.nonHierarchyFrames).toHaveLength(1);

      store.setFrameHierarchy([
        { frameId: 0, tabId: TAB_ID, url: FRAME_A.url, parentFrameId: -1, title: FRAME_A.title, origin: FRAME_A.origin, iframes: [] },
        { frameId: 1, tabId: TAB_ID, url: FRAME_B.url, parentFrameId: 0, title: FRAME_B.title, origin: FRAME_B.origin, iframes: [] },
      ]);

      expect(frameStore.nonHierarchyFrames).toHaveLength(0);
      expect(frameStore.hierarchyRoots).toHaveLength(1);
      expect(frameStore.hierarchyRoots[0].children).toHaveLength(1);
    });

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

    it('processHierarchy rebuilds children for all frames including message-discovered ones', () => {
      const frame1 = frameStore.getOrCreateFrame(TAB_ID, 1);
      expect(frame1.parentFrameId).toBeUndefined();

      store.setFrameHierarchy([
        { frameId: 0, tabId: TAB_ID, url: FRAME_A.url, parentFrameId: -1, title: FRAME_A.title, origin: FRAME_A.origin, iframes: [] },
        { frameId: 1, tabId: TAB_ID, url: FRAME_B.url, parentFrameId: 0, title: FRAME_B.title, origin: FRAME_B.origin, iframes: [] },
      ]);

      const frame0 = frameStore.getFrame(TAB_ID, 0)!;
      expect(frame0.children).toContain(frame1);
      expect(frame1.parentFrameId).toBe(0);
    });

    it('currentHierarchyFrameKeys tracks frames from latest hierarchy response', () => {
      store.setFrameHierarchy([
        { frameId: 0, tabId: TAB_ID, url: FRAME_A.url, parentFrameId: -1, title: FRAME_A.title, origin: FRAME_A.origin, iframes: [] },
      ]);

      expect(frameStore.currentHierarchyFrameKeys.has(Frame.key(TAB_ID, 0))).toBe(true);
      expect(frameStore.currentHierarchyFrameKeys.size).toBe(1);
    });
  });

  // ===================================================================
  // parentFrameId inference from messages
  // ===================================================================
  describe('parentFrameId inference from messages', () => {
    it('child message sets parentFrameId on source frame when registration resolves it', () => {
      processIncomingMessage(childMsg(FRAME_B, FRAME_A));
      processIncomingMessage(registrationMsg(FRAME_B, FRAME_A));

      const frameB = frameStore.getFrame(TAB_ID, FRAME_B.frameId)!;
      expect(frameB.parentFrameId).toBe(FRAME_A.frameId);

      const frameA = frameStore.getFrame(TAB_ID, FRAME_A.frameId)!;
      expect(frameA.children).toContain(frameB);
    });

    it('parent message sets parentFrameId on target frame', () => {
      processIncomingMessage(parentMsg(FRAME_A, FRAME_B));

      const frameB = frameStore.getFrame(TAB_ID, FRAME_B.frameId)!;
      expect(frameB.parentFrameId).toBe(FRAME_A.frameId);

      const frameA = frameStore.getFrame(TAB_ID, FRAME_A.frameId)!;
      expect(frameA.children).toContain(frameB);
    });

    it('does not overwrite parentFrameId already set by hierarchy', () => {
      store.setFrameHierarchy([
        { frameId: 0, tabId: TAB_ID, url: FRAME_A.url, parentFrameId: -1, title: FRAME_A.title, origin: FRAME_A.origin, iframes: [] },
        { frameId: 1, tabId: TAB_ID, url: FRAME_B.url, parentFrameId: 0, title: FRAME_B.title, origin: FRAME_B.origin, iframes: [] },
      ]);

      const frameB = frameStore.getFrame(TAB_ID, FRAME_B.frameId)!;
      expect(frameB.parentFrameId).toBe(0);

      processIncomingMessage(parentMsg(FRAME_A, FRAME_B));
      expect(frameB.parentFrameId).toBe(0);
    });

    it('child message without registration does not set parentFrameId (source frame unknown)', () => {
      processIncomingMessage(childMsg(FRAME_B, FRAME_A));

      const frameA = frameStore.getFrame(TAB_ID, FRAME_A.frameId)!;
      expect(frameA.parentFrameId).toBe(undefined);
    });
  });

  // ===================================================================
  // Cross-tab registration — when an opened window sends a registration
  // to its opener, processRegistration should NOT set parentFrameId
  // because the frames are in different tabs.
  // ===================================================================
  describe('cross-tab registration does not set parentFrameId', () => {
    it('opened frame stays in nonHierarchyFrames after cross-tab registration', () => {
      // Simulate viewing the opener tab's panel
      store.setTabId(OPENER_TAB_ID);

      // Cross-tab registration arrives: opened window → opener
      processIncomingMessage(crossTabRegistrationMsg());

      // The opened frame should be created
      const openedFrame = frameStore.getFrame(TAB_ID, FRAME_A.frameId);
      expect(openedFrame).toBeDefined();

      // parentFrameId must remain undefined — cross-tab frames don't have
      // a parent in the same tab
      expect(openedFrame!.parentFrameId).toBeUndefined();

      // Frame should appear in nonHierarchyFrames (visible in Endpoints pane)
      expect(frameStore.nonHierarchyFrames).toContain(openedFrame);
    });

    it('opened frame survives hierarchy refresh after cross-tab registration', () => {
      store.setTabId(OPENER_TAB_ID);

      // Cross-tab registration arrives
      processIncomingMessage(crossTabRegistrationMsg());

      const openedFrame = frameStore.getFrame(TAB_ID, FRAME_A.frameId);
      expect(openedFrame).toBeDefined();

      // Simulate switching away from Endpoints and back — triggers hierarchy refresh
      // Hierarchy only includes opener tab's frames
      store.setFrameHierarchy([
        { frameId: 0, tabId: OPENER_TAB_ID, url: OPENER_FRAME.url, parentFrameId: -1,
          title: OPENER_FRAME.title, origin: OPENER_FRAME.origin, iframes: [] },
      ]);

      // Opened frame must still be visible — either in hierarchy or nonHierarchy
      const inHierarchy = frameStore.hierarchyRoots.some(
        f => f.tabId === TAB_ID && f.frameId === FRAME_A.frameId
      );
      const inNonHierarchy = frameStore.nonHierarchyFrames.some(
        f => f.tabId === TAB_ID && f.frameId === FRAME_A.frameId
      );
      expect(inHierarchy || inNonHierarchy).toBe(true);
    });
  });

  // ===================================================================
  // buildFrameTree — opener frame should not be dropped when its
  // frameId collides with a regular frame's frameId
  // ===================================================================
  describe('buildFrameTree with opener', () => {
    it('includes opener frame even when its frameId matches a regular frame', () => {
      store.setFrameHierarchy([
        { frameId: 0, tabId: OPENER_TAB_ID, url: OPENER_FRAME.url, parentFrameId: -1, title: OPENER_FRAME.title, origin: OPENER_FRAME.origin, iframes: [], isOpener: true },
        { frameId: 0, tabId: TAB_ID, url: FRAME_A.url, parentFrameId: -1, title: FRAME_A.title, origin: FRAME_A.origin, iframes: [] },
      ]);

      const tree = store.buildFrameTree();
      expect(tree).toHaveLength(2);

      const openerNode = tree.find(f => f.isOpener);
      expect(openerNode).toBeDefined();
      expect(openerNode!.currentDocument?.origin).toBe(OPENER_FRAME.origin);

      const regularNode = tree.find(f => !f.isOpener);
      expect(regularNode).toBeDefined();
      expect(regularNode!.currentDocument?.origin).toBe(FRAME_A.origin);
    });

    it('can select the regular frame without also selecting opener', () => {
      store.setFrameHierarchy([
        { frameId: 0, tabId: OPENER_TAB_ID, url: OPENER_FRAME.url, parentFrameId: -1, title: OPENER_FRAME.title, origin: OPENER_FRAME.origin, iframes: [], isOpener: true },
        { frameId: 0, tabId: TAB_ID, url: FRAME_A.url, parentFrameId: -1, title: FRAME_A.title, origin: FRAME_A.origin, iframes: [] },
      ]);

      const tree = store.buildFrameTree();
      const regularNode = tree.find(f => !f.isOpener)!;

      store.selectFrame(store.frameKey(regularNode));

      expect(store.selectedFrame).toBeDefined();
      expect(store.selectedFrame!.isOpener).toBeFalsy();
      expect(store.selectedFrame!.currentDocument?.origin).toBe(FRAME_A.origin);
    });
  });

  // ===================================================================
  // Navigation — when an iframe navigates, old messages should preserve
  // the original document's properties (origin, URL) rather than being
  // mutated by the new document.
  // ===================================================================
  describe('navigation preserves old document', () => {
    const FRAME_B_NAV = {
      frameId: 1,
      documentId: 'doc-B2',
      url: 'https://other.example.com/page2',
      origin: 'https://other.example.com',
      title: 'Other Page',
      sourceId: 'win-B', // same WindowProxy as FRAME_B
      iframe: {
        domPath: 'body > iframe:nth-of-type(1)',
        src: 'https://other.example.com/page2',
        id: 'iframe-b',
      },
    };

    it('registration after navigation preserves old document', () => {
      // Message from B before navigation — creates doc by sourceId
      processIncomingMessage(childMsg(FRAME_B, FRAME_A));
      const oldDoc = frameStore.getDocumentBySourceId(FRAME_B.sourceId);
      expect(oldDoc).toBeDefined();
      expect(oldDoc!.origin).toBe(FRAME_B.origin);

      // Registration with new documentId for same sourceId (navigation happened)
      processIncomingMessage(registrationMsg(FRAME_B_NAV, FRAME_A));

      // Old document should be untouched
      expect(oldDoc!.origin).toBe(FRAME_B.origin);
      expect(oldDoc!.documentId).toBeUndefined(); // was never assigned a documentId

      // New document should exist under the new documentId
      const newDoc = frameStore.getDocumentById(FRAME_B_NAV.documentId);
      expect(newDoc).toBeDefined();
      expect(newDoc).not.toBe(oldDoc);
      expect(newDoc!.documentId).toBe(FRAME_B_NAV.documentId);
      expect(newDoc!.sourceId).toBe(FRAME_B.sourceId);
    });

    it('source origin change creates new document instead of mutating old one', () => {
      // Message from B with origin A
      processIncomingMessage(childMsg(FRAME_B, FRAME_A));
      const oldDoc = frameStore.getDocumentBySourceId(FRAME_B.sourceId);
      expect(oldDoc!.origin).toBe(FRAME_B.origin);

      // Message from same sourceId but different origin (navigation)
      processIncomingMessage(childMsg(FRAME_B_NAV, FRAME_A));
      const msg2 = store.messages[1];

      // Old FrameDocument object was NOT mutated — still has original origin
      expect(oldDoc!.origin).toBe(FRAME_B.origin);

      // New message has a different FrameDocument with the new origin
      const newDoc = msg2.sourceDocument;
      expect(newDoc).not.toBe(oldDoc);
      expect(newDoc!.origin).toBe(FRAME_B_NAV.origin);

      // sourceId mapping now points to the new document
      expect(frameStore.getDocumentBySourceId(FRAME_B.sourceId)).toBe(newDoc);

      // Note: msg1.sourceDocument will also resolve to newDoc because it uses
      // the sourceSourceId fallback (known limitation documented in the design)
    });

    it('new document after navigation gets correct properties from registration', () => {
      // Pre-navigation message
      processIncomingMessage(childMsg(FRAME_B, FRAME_A));

      // Registration after navigation
      processIncomingMessage(registrationMsg(FRAME_B_NAV, FRAME_A));

      // New document is linked to the frame and has correct properties
      const newDoc = frameStore.getDocumentById(FRAME_B_NAV.documentId);
      expect(newDoc).toBeDefined();
      expect(newDoc!.frame).toBeDefined();
      expect(newDoc!.frame!.frameId).toBe(FRAME_B_NAV.frameId);

      // sourceId mapping now points to new document
      const docBySourceId = frameStore.getDocumentBySourceId(FRAME_B.sourceId);
      expect(docBySourceId).toBe(newDoc);
    });
  });

  // ===================================================================
  // Frame.documents array
  // ===================================================================
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

  // ===================================================================
  // FrameStore Tab and IFrame management
  // ===================================================================
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
});
