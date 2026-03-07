// Background script connection for Messages Inspector panel

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
  // --- Target ---
  let targetOwnerElement: OwnerElement | undefined = undefined;
  if (msg.target.documentId) {
    const targetDoc = frameStore.getOrCreateDocumentById(msg.target.documentId);
    targetDoc.url = msg.target.url;
    targetDoc.origin = msg.target.origin;
    targetDoc.title = msg.target.documentTitle;

    const targetFrame = frameStore.getOrCreateFrame(msg.target.tabId, msg.target.frameId);
    if (!targetDoc.frame) {
      targetDoc.frame = targetFrame;
      targetFrame.currentDocument = targetDoc;
    }

    targetOwnerElement = targetFrame.currentOwnerElement;
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
    sourceDoc = frameStore.getOrCreateDocumentBySourceId(msg.source.sourceId);
    sourceDoc.origin = msg.source.origin;
  }

  // Link source FrameDocument to a Frame when tabId and frameId are available
  // (e.g., opener/opened messages enriched by background with cross-tab info)
  if (sourceDoc && !sourceDoc.frame && msg.source.tabId != null && msg.source.frameId != null) {
    const sourceFrame = frameStore.getOrCreateFrame(msg.source.tabId, msg.source.frameId);
    sourceDoc.frame = sourceFrame;
    if (!sourceFrame.currentDocument) {
      sourceFrame.currentDocument = sourceDoc;
    }
  }

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

  // --- Parent messages: reference source Frame's currentOwnerElement ---
  if (msg.source.type === 'parent' && msg.source.documentId) {
    const sourceDoc = frameStore.getDocumentById(msg.source.documentId);
    if (sourceDoc?.frame) {
      sourceOwnerElement = sourceDoc.frame.currentOwnerElement;
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
      if (!sourceFrame.children.includes(targetFrame)) {
        sourceFrame.children.push(targetFrame);
      }
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
      if (!targetFrame.children.includes(sourceFrame)) {
        targetFrame.children.push(sourceFrame);
      }
    }
  }
}

function processRegistration(message: Message): void {
  const regData = message.registrationData!;
  const sourceId = message.sourceSourceId!;

  const docByWindow = frameStore.getDocumentBySourceId(sourceId);
  const docByDocId = frameStore.getDocumentById(regData.documentId);

  if (docByWindow && docByDocId && docByWindow !== docByDocId) {
    docByDocId.sourceId = sourceId;
    if (docByWindow.origin && !docByDocId.origin) {
      docByDocId.origin = docByWindow.origin;
    }
    frameStore.documentsBySourceId.set(sourceId, docByDocId);
  } else if (docByWindow && !docByDocId) {
    docByWindow.documentId = regData.documentId;
    frameStore.documents.set(regData.documentId, docByWindow);
  } else if (!docByWindow && docByDocId) {
    docByDocId.sourceId = sourceId;
    frameStore.documentsBySourceId.set(sourceId, docByDocId);
  } else if (!docByWindow && !docByDocId) {
    const doc = new FrameDocument({ documentId: regData.documentId, sourceId });
    frameStore.documents.set(regData.documentId, doc);
    frameStore.documentsBySourceId.set(sourceId, doc);
  }

  const frame = frameStore.getOrCreateFrame(regData.tabId, regData.frameId);
  const doc = frameStore.documents.get(regData.documentId)!;
  doc.frame = frame;
  frame.currentDocument = doc;

  const newOwner = message.sourceOwnerElement;
  if (newOwner) {
    if (!newOwner.equals(frame.currentOwnerElement)) {
      frame.currentOwnerElement = newOwner;
    }
  }

  // After registration links sourceId → Frame, infer parent from the registration target
  // Only for same-tab registrations — cross-tab frames (opener/opened) don't share a hierarchy
  if (frame.parentFrameId === undefined && frame.tabId === message.target.tabId) {
    const targetFrame = frameStore.getFrame(message.target.tabId, message.target.frameId);
    if (targetFrame) {
      frame.parentFrameId = targetFrame.frameId;
      if (!targetFrame.children.includes(frame)) {
        targetFrame.children.push(frame);
      }
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
