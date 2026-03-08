import type { TabNode, FrameNode, DocumentNode, IframeNode } from './types';
import type { HierarchyAction } from './actions';

export interface HierarchyState {
  root: TabNode[];
  nextTabId: number;
  nextFrameId: number;
  nextDocumentId: number;
  nextIframeId: number;
  nextPageNumber: number;
}

// --- ID scanning helpers ---

function scanMaxIds(roots: TabNode[]): {
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

  for (const root of roots) {
    maxTabId = Math.max(maxTabId, root.tabId);
    if (root.frames) {
      for (const frame of root.frames) {
        visitFrame(frame);
      }
    }
  }

  return { maxTabId, maxFrameId, maxDocumentId, maxIframeId, maxPageNumber };
}

export function initState(root: TabNode | TabNode[]): HierarchyState {
  const roots = Array.isArray(root) ? root : [root];
  const ids = scanMaxIds(roots);
  return {
    root: roots,
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

// --- Stale marking helpers ---

function markFrameStale(frame: FrameNode): FrameNode {
  return {
    ...frame,
    stale: true,
    documents: frame.documents?.map(markDocumentStale),
  };
}

function markDocumentStale(doc: DocumentNode): DocumentNode {
  return {
    ...doc,
    stale: true,
    iframes: doc.iframes?.map(markIframeStale),
  };
}

function markIframeStale(iframe: IframeNode): IframeNode {
  return {
    ...iframe,
    stale: true,
    frame: iframe.frame ? markFrameStale(iframe.frame) : undefined,
  };
}

function markTabStale(tab: TabNode): TabNode {
  return {
    ...tab,
    stale: true,
    frames: tab.frames?.map(markFrameStale),
  };
}

// --- Iframe tree-walking helper ---

function mapIframesInFrame(
  frame: FrameNode,
  fn: (iframe: IframeNode) => IframeNode,
): FrameNode {
  if (!frame.documents) return frame;
  const docs = frame.documents.map((doc) => {
    if (!doc.iframes) return doc;
    const iframes = doc.iframes.map((iframe) => {
      const mapped = fn(iframe);
      // Recurse into nested frames
      if (mapped.frame) {
        const innerFrame = mapIframesInFrame(mapped.frame, fn);
        if (innerFrame !== mapped.frame) {
          return { ...mapped, frame: innerFrame };
        }
      }
      return mapped;
    });
    return iframes === doc.iframes ? doc : { ...doc, iframes };
  });
  return docs === frame.documents ? frame : { ...frame, documents: docs };
}

function mapIframesInTab(
  tab: TabNode,
  fn: (iframe: IframeNode) => IframeNode,
): TabNode {
  if (!tab.frames) return tab;
  const frames = tab.frames.map((frame) => mapIframesInFrame(frame, fn));
  return frames === tab.frames ? tab : { ...tab, frames };
}

// --- Frame tree-walking helper ---

function mapFramesInDocument(
  doc: DocumentNode,
  fn: (frame: FrameNode) => FrameNode,
): DocumentNode {
  if (!doc.iframes) return doc;
  const iframes = doc.iframes.map((iframe) => {
    if (!iframe.frame) return iframe;
    const mappedFrame = fn(iframe.frame);
    // Recurse into nested documents
    const deepFrame = mapFramesInFrame(mappedFrame, fn);
    return deepFrame === iframe.frame ? iframe : { ...iframe, frame: deepFrame };
  });
  return iframes === doc.iframes ? doc : { ...doc, iframes };
}

function mapFramesInFrame(
  frame: FrameNode,
  fn: (frame: FrameNode) => FrameNode,
): FrameNode {
  if (!frame.documents) return frame;
  const docs = frame.documents.map((doc) => mapFramesInDocument(doc, fn));
  return docs === frame.documents ? frame : { ...frame, documents: docs };
}

function mapFramesInTab(
  tab: TabNode,
  fn: (frame: FrameNode) => FrameNode,
): TabNode {
  if (!tab.frames) return tab;
  const frames = tab.frames.map((frame) => {
    const mapped = fn(frame);
    const deep = mapFramesInFrame(mapped, fn);
    return deep === frame ? frame : deep;
  });
  return frames === tab.frames ? tab : { ...tab, frames };
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

  const root = state.root.map(tab => updateDocumentById(tab, documentId, (doc) => ({
    ...doc,
    iframes: [...(doc.iframes ?? []), newIframe],
  })));

  return {
    root,
    nextTabId: state.nextTabId,
    nextFrameId: frameId + 1,
    nextDocumentId: docId + 1,
    nextIframeId: iframeId + 1,
    nextPageNumber: state.nextPageNumber,
  };
}

function removeIframe(state: HierarchyState, iframeId: number): HierarchyState {
  const root = state.root.map(tab => mapIframesInTab(tab, (iframe) => {
    if (iframe.iframeId === iframeId) {
      return markIframeStale(iframe);
    }
    return iframe;
  }));
  return { ...state, root };
}

function replaceFrameDocument(
  state: HierarchyState,
  frameId: number,
  makeDoc: (frame: FrameNode, docId: number) => DocumentNode,
): { root: TabNode[]; nextDocumentId: number } {
  const docId = state.nextDocumentId;
  let docCreated = false;

  const root = state.root.map(tab => mapFramesInTab(tab, (frame) => {
    if (frame.frameId !== frameId) return frame;
    const staleDocs = (frame.documents ?? []).map((doc) =>
      doc.stale ? doc : markDocumentStale(doc),
    );
    docCreated = true;
    return { ...frame, documents: [...staleDocs, makeDoc(frame, docId)] };
  }));

  return { root, nextDocumentId: docCreated ? docId + 1 : docId };
}

function navigateFrame(state: HierarchyState, frameId: number): HierarchyState {
  const pageNum = state.nextPageNumber;

  const { root, nextDocumentId } = replaceFrameDocument(state, frameId, (_frame, docId) => ({
    type: 'document',
    documentId: `doc-${docId}`,
    url: `https://page-${pageNum}.example.com/`,
    origin: `https://page-${pageNum}.example.com`,
  }));

  return {
    ...state,
    root,
    nextDocumentId,
    nextPageNumber: pageNum + 1,
  };
}

function reloadFrame(state: HierarchyState, frameId: number): HierarchyState {
  const { root, nextDocumentId } = replaceFrameDocument(state, frameId, (frame, docId) => {
    // Find the most recent non-stale document to copy URL/origin from
    const docs = frame.documents ?? [];
    const currentDoc = [...docs].reverse().find((d) => !d.stale);
    return {
      type: 'document',
      documentId: `doc-${docId}`,
      url: currentDoc?.url,
      origin: currentDoc?.origin,
    };
  });

  return {
    ...state,
    root,
    nextDocumentId,
  };
}

function navigateIframe(state: HierarchyState, iframeId: number): HierarchyState {
  const pageNum = state.nextPageNumber;
  const docId = state.nextDocumentId;
  const newUrl = `https://page-${pageNum}.example.com/`;
  const newOrigin = `https://page-${pageNum}.example.com`;
  let docCreated = false;

  const root = state.root.map(tab => mapIframesInTab(tab, (iframe) => {
    if (iframe.iframeId !== iframeId) return iframe;
    if (!iframe.frame) return iframe;

    const staleDocs = (iframe.frame.documents ?? []).map((doc) =>
      doc.stale ? doc : markDocumentStale(doc),
    );

    const newDoc: DocumentNode = {
      type: 'document',
      documentId: `doc-${docId}`,
      url: newUrl,
      origin: newOrigin,
    };

    docCreated = true;
    return {
      ...iframe,
      src: newUrl,
      frame: { ...iframe.frame, documents: [...staleDocs, newDoc] },
    };
  }));

  return {
    ...state,
    root,
    nextDocumentId: docCreated ? docId + 1 : docId,
    nextPageNumber: docCreated ? pageNum + 1 : pageNum,
  };
}

function openTab(state: HierarchyState): HierarchyState {
  const tabId = state.nextTabId;
  const frameId = state.nextFrameId;
  const docId = state.nextDocumentId;
  const pageNum = state.nextPageNumber;

  const newDoc: DocumentNode = {
    type: 'document',
    documentId: `doc-${docId}`,
    url: `https://page-${pageNum}.example.com/`,
    origin: `https://page-${pageNum}.example.com`,
  };

  const newFrame: FrameNode = {
    type: 'frame',
    frameId,
    documents: [newDoc],
  };

  const newTab: TabNode = {
    type: 'tab',
    tabId,
    frames: [newFrame],
  };

  return {
    root: [...state.root, newTab],
    nextTabId: tabId + 1,
    nextFrameId: frameId + 1,
    nextDocumentId: docId + 1,
    nextIframeId: state.nextIframeId,
    nextPageNumber: pageNum + 1,
  };
}

function closeTab(state: HierarchyState, tabId: number): HierarchyState {
  const root = state.root.map(tab => {
    if (tab.tabId === tabId) {
      return markTabStale(tab);
    }
    return tab;
  });
  return { ...state, root };
}

// --- Main reducer ---

export function reduce(
  state: HierarchyState,
  action: HierarchyAction,
): HierarchyState {
  switch (action.type) {
    case 'open-tab':
      return openTab(state);
    case 'close-tab':
      return closeTab(state, action.tabId);
    case 'add-iframe':
      return addIframe(state, action.documentId);
    case 'remove-iframe':
      return removeIframe(state, action.iframeId);
    case 'navigate-iframe':
      return navigateIframe(state, action.iframeId);
    case 'navigate-frame':
      return navigateFrame(state, action.frameId);
    case 'reload-frame':
      return reloadFrame(state, action.frameId);
    default:
      return state;
  }
}
