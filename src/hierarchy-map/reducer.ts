import type { TabNode, FrameNode, DocumentNode, IframeNode } from './types';
import type { HierarchyAction } from './actions';

export interface HierarchyState {
  root: TabNode;
  nextTabId: number;
  nextFrameId: number;
  nextDocumentId: number;
  nextIframeId: number;
  nextPageNumber: number;
}

// --- ID scanning helpers ---

function scanMaxIds(root: TabNode): {
  maxTabId: number;
  maxFrameId: number;
  maxDocumentId: number;
  maxIframeId: number;
  maxPageNumber: number;
} {
  let maxTabId = 0;
  let maxFrameId = 0;
  let maxDocumentId = 0;
  let maxIframeId = 0;
  let maxPageNumber = 0;

  const docIdRe = /^doc-(\d+)$/;
  const pageRe = /^https:\/\/page-(\d+)\.example\.com/;

  function visitDocument(doc: DocumentNode) {
    if (doc.documentId) {
      const m = docIdRe.exec(doc.documentId);
      if (m) maxDocumentId = Math.max(maxDocumentId, Number(m[1]));
    }
    if (doc.url) {
      const m = pageRe.exec(doc.url);
      if (m) maxPageNumber = Math.max(maxPageNumber, Number(m[1]));
    }
    if (doc.iframes) {
      for (const iframe of doc.iframes) {
        visitIframe(iframe);
      }
    }
  }

  function visitIframe(iframe: IframeNode) {
    maxIframeId = Math.max(maxIframeId, iframe.iframeId);
    if (iframe.frame) {
      visitFrame(iframe.frame);
    }
  }

  function visitFrame(frame: FrameNode) {
    maxFrameId = Math.max(maxFrameId, frame.frameId);
    if (frame.documents) {
      for (const doc of frame.documents) {
        visitDocument(doc);
      }
    }
  }

  maxTabId = Math.max(maxTabId, root.tabId);
  if (root.frames) {
    for (const frame of root.frames) {
      visitFrame(frame);
    }
  }

  return { maxTabId, maxFrameId, maxDocumentId, maxIframeId, maxPageNumber };
}

export function initState(root: TabNode): HierarchyState {
  const ids = scanMaxIds(root);
  return {
    root,
    nextTabId: ids.maxTabId + 1,
    nextFrameId: ids.maxFrameId + 1,
    nextDocumentId: ids.maxDocumentId + 1,
    nextIframeId: ids.maxIframeId + 1,
    nextPageNumber: ids.maxPageNumber + 1,
  };
}

// --- Tree-walking helpers ---

function mapDocumentsInFrame(
  frame: FrameNode,
  fn: (doc: DocumentNode) => DocumentNode,
): FrameNode {
  if (!frame.documents) return frame;
  const docs = frame.documents.map(fn);
  return docs === frame.documents ? frame : { ...frame, documents: docs };
}

function mapDocumentsInTab(
  tab: TabNode,
  fn: (doc: DocumentNode) => DocumentNode,
): TabNode {
  if (!tab.frames) return tab;
  const frames = tab.frames.map((frame) => {
    const updated = mapDocumentsInFrame(frame, fn);
    // Recurse into iframes inside each document
    if (!updated.documents) return updated;
    const deepDocs = updated.documents.map((doc) => {
      if (!doc.iframes) return doc;
      const iframes = doc.iframes.map((iframe) => {
        if (!iframe.frame) return iframe;
        const innerTab: TabNode = {
          type: 'tab',
          tabId: 0,
          frames: [iframe.frame],
        };
        const mapped = mapDocumentsInTab(innerTab, fn);
        const newFrame = mapped.frames![0];
        return newFrame === iframe.frame ? iframe : { ...iframe, frame: newFrame };
      });
      return iframes === doc.iframes ? doc : { ...doc, iframes };
    });
    return deepDocs === updated.documents
      ? updated
      : { ...updated, documents: deepDocs };
  });
  return frames === tab.frames ? tab : { ...tab, frames };
}

function updateDocumentById(
  root: TabNode,
  documentId: string,
  fn: (doc: DocumentNode) => DocumentNode,
): TabNode {
  return mapDocumentsInTab(root, (doc) => {
    if (doc.documentId === documentId) return fn(doc);
    return doc;
  });
}

// --- Action handlers ---

function addIframe(state: HierarchyState, documentId: string): HierarchyState {
  const iframeId = state.nextIframeId;
  const frameId = state.nextFrameId;
  const docId = state.nextDocumentId;

  const newDoc: DocumentNode = {
    type: 'document',
    documentId: `doc-${docId}`,
    url: 'about:blank',
  };

  const newFrame: FrameNode = {
    type: 'frame',
    frameId,
    documents: [newDoc],
  };

  const newIframe: IframeNode = {
    type: 'iframe',
    iframeId,
    frame: newFrame,
  };

  const root = updateDocumentById(state.root, documentId, (doc) => ({
    ...doc,
    iframes: [...(doc.iframes ?? []), newIframe],
  }));

  return {
    root,
    nextTabId: state.nextTabId,
    nextFrameId: frameId + 1,
    nextDocumentId: docId + 1,
    nextIframeId: iframeId + 1,
    nextPageNumber: state.nextPageNumber,
  };
}

// --- Main reducer ---

export function reduce(
  state: HierarchyState,
  action: HierarchyAction,
): HierarchyState {
  switch (action.type) {
    case 'add-iframe':
      return addIframe(state, action.documentId);
    default:
      return state;
  }
}
