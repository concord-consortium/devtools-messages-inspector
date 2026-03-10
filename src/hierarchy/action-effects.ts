import { reduce } from './reducer';
import type { HierarchyState } from './reducer';
import type { HierarchyAction } from './actions';
import type { HierarchyEvent } from './events';
import type { TabNode, FrameNode, DocumentNode, IframeNode } from './types';

export interface ActionResult {
  state: HierarchyState;
  events: HierarchyEvent[];
}

// --- Tree lookup helpers ---

/** Find which tabId contains a given frameId */
function findTabForFrame(roots: TabNode[], frameId: number): number | undefined {
  for (const tab of roots) {
    if (findFrameInTab(tab, frameId)) return tab.tabId;
  }
  return undefined;
}

function findFrameInTab(tab: TabNode, frameId: number): FrameNode | undefined {
  if (!tab.frames) return undefined;
  for (const frame of tab.frames) {
    const found = findFrameInFrame(frame, frameId);
    if (found) return found;
  }
  return undefined;
}

function findFrameInFrame(frame: FrameNode, frameId: number): FrameNode | undefined {
  if (frame.frameId === frameId) return frame;
  if (!frame.documents) return undefined;
  for (const doc of frame.documents) {
    if (!doc.iframes) continue;
    for (const iframe of doc.iframes) {
      if (iframe.frame) {
        const found = findFrameInFrame(iframe.frame, frameId);
        if (found) return found;
      }
    }
  }
  return undefined;
}

/** Find an iframe by iframeId and return it along with the containing tabId and parent frameId */
function findIframeContext(roots: TabNode[], iframeId: number): {
  tabId: number; parentFrameId: number; iframe: IframeNode;
} | undefined {
  for (const tab of roots) {
    const result = findIframeInTab(tab, iframeId);
    if (result) return { tabId: tab.tabId, ...result };
  }
  return undefined;
}

function findIframeInTab(tab: TabNode, iframeId: number): {
  parentFrameId: number; iframe: IframeNode;
} | undefined {
  if (!tab.frames) return undefined;
  for (const frame of tab.frames) {
    const result = findIframeInFrame(frame, iframeId);
    if (result) return result;
  }
  return undefined;
}

function findIframeInFrame(frame: FrameNode, iframeId: number): {
  parentFrameId: number; iframe: IframeNode;
} | undefined {
  if (!frame.documents) return undefined;
  for (const doc of frame.documents) {
    if (!doc.iframes) continue;
    for (const iframe of doc.iframes) {
      if (iframe.iframeId === iframeId) {
        return { parentFrameId: frame.frameId, iframe };
      }
      if (iframe.frame) {
        const nested = findIframeInFrame(iframe.frame, iframeId);
        if (nested) return nested;
      }
    }
  }
  return undefined;
}

/** Find the parent frameId for a document by its documentId */
function findParentFrameForDocument(roots: TabNode[], documentId: string): {
  tabId: number; frameId: number;
} | undefined {
  for (const tab of roots) {
    if (!tab.frames) continue;
    for (const frame of tab.frames) {
      const result = findDocInFrame(frame, documentId);
      if (result != null) return { tabId: tab.tabId, frameId: result };
    }
  }
  return undefined;
}

function findDocInFrame(frame: FrameNode, documentId: string): number | undefined {
  if (!frame.documents) return undefined;
  for (const doc of frame.documents) {
    if (doc.documentId === documentId) return frame.frameId;
    if (!doc.iframes) continue;
    for (const iframe of doc.iframes) {
      if (iframe.frame) {
        const found = findDocInFrame(iframe.frame, documentId);
        if (found != null) return found;
      }
    }
  }
  return undefined;
}

// --- Main function ---

export function applyAction(state: HierarchyState, action: HierarchyAction): ActionResult {
  const newState = reduce(state, action);
  const events = generateEvents(state, newState, action);
  return { state: newState, events };
}

function generateEvents(
  oldState: HierarchyState,
  newState: HierarchyState,
  action: HierarchyAction,
): HierarchyEvent[] {
  switch (action.type) {
    case 'add-iframe': {
      const newFrameId = newState.nextFrameId - 1;
      const context = findParentFrameForDocument(oldState.root, action.documentId);
      return [{
        scope: 'dom',
        type: 'iframeAdded',
        tabId: context?.tabId ?? 0,
        parentFrameId: context?.frameId ?? 0,
        frameId: newFrameId,
        src: 'about:blank',
      }];
    }

    case 'remove-iframe': {
      const context = findIframeContext(oldState.root, action.iframeId);
      return [{
        scope: 'dom',
        type: 'iframeRemoved',
        tabId: context?.tabId ?? 0,
        parentFrameId: context?.parentFrameId ?? 0,
        iframeId: action.iframeId,
      }];
    }

    case 'navigate-frame': {
      const tabId = findTabForFrame(oldState.root, action.frameId);
      const frame = findFrameInTab(newState.root.find(t => t.tabId === tabId)!, action.frameId);
      const newDoc = frame?.documents?.find(d => !d.stale);
      return [{
        scope: 'chrome',
        type: 'onCommitted',
        tabId: tabId ?? 0,
        frameId: action.frameId,
        url: newDoc?.url ?? '',
      }];
    }

    case 'reload-frame': {
      const tabId = findTabForFrame(oldState.root, action.frameId);
      const frame = findFrameInTab(newState.root.find(t => t.tabId === tabId)!, action.frameId);
      const newDoc = frame?.documents?.find(d => !d.stale);
      return [{
        scope: 'chrome',
        type: 'onCommitted',
        tabId: tabId ?? 0,
        frameId: action.frameId,
        url: newDoc?.url ?? '',
        transitionType: 'reload',
      }];
    }

    case 'navigate-iframe': {
      const context = findIframeContext(oldState.root, action.iframeId);
      const newContext = findIframeContext(newState.root, action.iframeId);
      const innerFrame = newContext?.iframe.frame;
      const newDoc = innerFrame?.documents?.find(d => !d.stale);
      return [{
        scope: 'chrome',
        type: 'onCommitted',
        tabId: context?.tabId ?? 0,
        frameId: context?.iframe.frame?.frameId ?? 0,
        url: newDoc?.url ?? '',
      }];
    }

    case 'open-tab': {
      const newTab = newState.root[newState.root.length - 1];
      const newFrame = newTab.frames![0];
      const newDoc = newFrame.documents![0];
      return [
        {
          scope: 'chrome',
          type: 'onCreatedNavigationTarget',
          sourceTabId: action.tabId,
          sourceFrameId: action.frameId,
          tabId: newTab.tabId,
          url: newDoc.url ?? '',
        },
        {
          scope: 'chrome',
          type: 'onCommitted',
          tabId: newTab.tabId,
          frameId: newFrame.frameId,
          url: newDoc.url ?? '',
        },
      ];
    }

    case 'close-tab': {
      return [{
        scope: 'chrome',
        type: 'onTabRemoved',
        tabId: action.tabId,
      }];
    }

    case 'purge-stale':
      return [];

    default:
      return [];
  }
}
