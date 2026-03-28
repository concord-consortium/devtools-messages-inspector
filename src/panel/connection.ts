// Background script connection for Messages Inspector panel

import { runInAction } from 'mobx';
import { store } from './store';
import { Message } from './Message';
import { frameStore, Frame, FrameDocument, OwnerElement } from './models';
import { CapturedMessage, FrameInfo, IMessage } from './types';

let port: chrome.runtime.Port | null = null;

export function connect(): void {
  const tabId = chrome.devtools.inspectedWindow.tabId;
  store.setTabId(tabId);

  port = chrome.runtime.connect({ name: 'postmessage-panel' });
  port.postMessage({ type: 'init', tabId });

  port.onMessage.addListener((msg: { type: string; payload?: CapturedMessage | FrameInfo[] }) => {
    if (msg.type === 'message' && msg.payload) {
      processIncomingMessage(msg.payload as IMessage);
    } else if (msg.type === 'clear') {
      store.clearMessages();
    } else if (msg.type === 'frame-hierarchy' && msg.payload) {
      store.setFrameHierarchy(msg.payload as FrameInfo[]);
    }
  });

  port.onDisconnect.addListener(() => {
    setTimeout(connect, 1000);
  });
}

// Process a raw IMessage from the background script:
// 1. Create/update Frame and FrameDocument instances in the FrameStore
// 2. Snapshot owner elements
// 3. Create a Message model instance
// 4. Handle registration if applicable
// 5. Push to the store
export function processIncomingMessage(msg: IMessage): void {
  runInAction(() => _processIncomingMessage(msg));
}

function _processIncomingMessage(msg: IMessage): void {
  // --- Target ---
  if (msg.target.documentId) {
    const targetDoc = frameStore.getOrCreateDocumentById(msg.target.documentId);
    targetDoc.url = msg.target.url;
    targetDoc.origin = msg.target.origin;
    targetDoc.title = msg.target.documentTitle;

    const targetFrame = frameStore.getOrCreateFrame(msg.target.tabId, msg.target.frameId);
    if (!targetDoc.frame) {
      targetDoc.frame = targetFrame;
      if (!targetFrame.documents.includes(targetDoc)) {
        targetFrame.documents.push(targetDoc);
      }
    }
  }

  // Snapshot the target's owner element (iframe hosting the target frame)
  let targetOwnerElement: OwnerElement | undefined = undefined;
  const targetFrame = frameStore.getFrame(msg.target.tabId, msg.target.frameId);
  if (targetFrame) {
    const ownerIFrame = frameStore.findOwnerIFrame(targetFrame);
    if (ownerIFrame) {
      targetOwnerElement = new OwnerElement(ownerIFrame.domPath, ownerIFrame.src, ownerIFrame.id);
    }
  }

  // --- Source ---
  let sourceDoc: InstanceType<typeof FrameDocument> | undefined;
  if (msg.source.documentId) {
    sourceDoc = frameStore.getOrCreateDocumentById(msg.source.documentId);
    sourceDoc.origin = msg.source.origin;
    if (msg.source.sourceId) {
      sourceDoc.sourceId = msg.source.sourceId;
      frameStore.documentsBySourceId.set(msg.source.sourceId, sourceDoc);
    }
  } else if (msg.source.sourceId) {
    const existing = frameStore.getDocumentBySourceId(msg.source.sourceId);
    if (existing && existing.origin && msg.source.origin && existing.origin !== msg.source.origin) {
      // Navigation detected — new document for same WindowProxy
      sourceDoc = new FrameDocument({ sourceId: msg.source.sourceId, origin: msg.source.origin });
      frameStore.documentsBySourceId.set(msg.source.sourceId, sourceDoc);
    } else {
      sourceDoc = frameStore.getOrCreateDocumentBySourceId(msg.source.sourceId);
      sourceDoc.origin = msg.source.origin;
    }
  }

  // Link source FrameDocument to a Frame when tabId and frameId are available
  // (e.g., opener/opened messages enriched by background with cross-tab info)
  if (sourceDoc && !sourceDoc.frame && msg.source.tabId != null && msg.source.frameId != null) {
    const sourceFrame = frameStore.getOrCreateFrame(msg.source.tabId, msg.source.frameId);
    sourceDoc.frame = sourceFrame;
    if (!sourceFrame.documents.includes(sourceDoc)) {
      sourceFrame.documents.push(sourceDoc);
    }
  }

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

  // --- Source owner element ---
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
  } else if (msg.source.type === 'parent' && msg.source.frameId != null) {
    // Parent is itself hosted in an iframe — look up its owner element
    const sourceTabId = msg.source.tabId ?? msg.target.tabId;
    const sourceFrame = frameStore.getFrame(sourceTabId, msg.source.frameId);
    if (sourceFrame) {
      const ownerIFrame = frameStore.findOwnerIFrame(sourceFrame);
      if (ownerIFrame) {
        sourceOwnerElement = new OwnerElement(ownerIFrame.domPath, ownerIFrame.src, ownerIFrame.id);
      }
    }
  }

  // --- Create Message ---
  const message = new Message(msg, targetOwnerElement, sourceOwnerElement);

  // --- Handle registration ---
  if (message.isRegistrationMessage && message.sourceSourceId) {
    processRegistration(message);
  }

  // --- Infer parent-child relationships ---
  inferParentFrameId(msg);

  store.addMessage(message);
}

function inferParentFrameId(msg: IMessage): void {
  if (msg.source.type === 'parent' && msg.source.frameId != null) {
    // Parent → child: target frame is a child of source frame
    // Parent is always in the same tab as child; source.tabId may not be set
    const sourceTabId = msg.source.tabId ?? msg.target.tabId;
    const targetFrame = frameStore.getFrame(msg.target.tabId, msg.target.frameId);
    const sourceFrame = frameStore.getOrCreateFrame(sourceTabId, msg.source.frameId);
    if (targetFrame && targetFrame.parentFrameId === undefined) {
      targetFrame.parentFrameId = sourceFrame.frameId;
    }
  }

  if (msg.source.type === 'child') {
    // Child → parent: source frame is a child of target frame
    let sourceFrame: Frame | undefined;
    if (msg.source.tabId != null && msg.source.frameId != null) {
      sourceFrame = frameStore.getFrame(msg.source.tabId, msg.source.frameId);
    }

    const targetFrame = frameStore.getFrame(msg.target.tabId, msg.target.frameId);
    if (sourceFrame && targetFrame && sourceFrame.parentFrameId === undefined) {
      sourceFrame.parentFrameId = targetFrame.frameId;
    }
  }
}

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

export function sendPreserveLog(value: boolean): void {
  if (port) {
    port.postMessage({ type: 'preserveLog', tabId: store.tabId, value });
  }
}

export function requestFrameHierarchy(): void {
  if (port) {
    port.postMessage({ type: 'get-frame-hierarchy', tabId: store.tabId });
  }
}
