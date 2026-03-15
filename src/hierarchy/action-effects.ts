import {
  addIframe, removeIframe, navigateFrame, reloadFrame,
  navigateIframe, openTab, closeTab, purgeStale, createTab,
} from './reducer';
import type { HierarchyState } from './reducer';
import type { HierarchyAction } from './actions';
import type { HierarchyEvent } from './events';
import type { TabNode, FrameNode, IframeNode } from './types';

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

// --- Send-message helpers ---

function findParentFrameId(tab: TabNode, targetFrameId: number): number | undefined {
  if (!tab.frames) return undefined;
  for (const frame of tab.frames) {
    const result = findParentInFrame(frame, targetFrameId);
    if (result !== undefined) return result;
  }
  return undefined;
}

function findParentInFrame(frame: FrameNode, targetFrameId: number): number | undefined {
  if (!frame.documents) return undefined;
  for (const doc of frame.documents) {
    if (!doc.iframes) continue;
    for (const iframe of doc.iframes) {
      if (iframe.frame) {
        if (iframe.frame.frameId === targetFrameId) return frame.frameId;
        const nested = findParentInFrame(iframe.frame, targetFrameId);
        if (nested !== undefined) return nested;
      }
    }
  }
  return undefined;
}

function getFrameOrigin(tab: TabNode, frameId: number): string {
  const frame = findFrameInTab(tab, frameId);
  if (!frame?.documents) return '';
  const doc = frame.documents.find(d => !d.stale);
  return doc?.origin ?? '';
}

// --- Main function ---

export function applyAction(state: HierarchyState, action: HierarchyAction): ActionResult {
  switch (action.type) {
    case 'add-iframe': {
      const context = findParentFrameForDocument(state.root, action.documentId);
      const newState = addIframe(state, action.documentId, action.url, action.title);
      const tabId = context?.tabId ?? 0;
      const frameId = newState.nextFrameId - 1;
      // Find the newly created iframe's document to get the URL
      const iframeId = newState.nextIframeId - 1;
      const newIframeContext = findIframeContext(newState.root, iframeId);
      const newDoc = newIframeContext?.iframe.frame?.documents?.[0];
      const url = newDoc?.url ?? '';
      return {
        state: newState,
        events: [
          {
            scope: 'dom',
            type: 'iframeAdded',
            tabId,
            parentFrameId: context?.frameId ?? 0,
            frameId,
            src: url,
          },
          {
            scope: 'chrome',
            type: 'onCommitted',
            tabId,
            frameId,
            url,
          },
        ],
      };
    }

    case 'remove-iframe': {
      const context = findIframeContext(state.root, action.iframeId);
      return {
        state: removeIframe(state, action.iframeId),
        events: [{
          scope: 'dom',
          type: 'iframeRemoved',
          tabId: context?.tabId ?? 0,
          parentFrameId: context?.parentFrameId ?? 0,
          iframeId: action.iframeId,
        }],
      };
    }

    case 'navigate-frame': {
      const tabId = findTabForFrame(state.root, action.frameId) ?? 0;
      const newState = navigateFrame(state, action.frameId, action.url, action.title);
      const frame = findFrameInTab(newState.root.find(t => t.tabId === tabId)!, action.frameId);
      const newDoc = frame?.documents?.find(d => !d.stale);
      return {
        state: newState,
        events: [{
          scope: 'chrome',
          type: 'onCommitted',
          tabId,
          frameId: action.frameId,
          url: newDoc?.url ?? '',
        }],
      };
    }

    case 'reload-frame': {
      const tabId = findTabForFrame(state.root, action.frameId) ?? 0;
      const newState = reloadFrame(state, action.frameId);
      const frame = findFrameInTab(newState.root.find(t => t.tabId === tabId)!, action.frameId);
      const newDoc = frame?.documents?.find(d => !d.stale);
      return {
        state: newState,
        events: [{
          scope: 'chrome',
          type: 'onCommitted',
          tabId,
          frameId: action.frameId,
          url: newDoc?.url ?? '',
          transitionType: 'reload',
        }],
      };
    }

    case 'navigate-iframe': {
      const context = findIframeContext(state.root, action.iframeId);
      const newState = navigateIframe(state, action.iframeId);
      const newContext = findIframeContext(newState.root, action.iframeId);
      const newDoc = newContext?.iframe.frame?.documents?.find(d => !d.stale);
      return {
        state: newState,
        events: [{
          scope: 'chrome',
          type: 'onCommitted',
          tabId: context?.tabId ?? 0,
          frameId: context?.iframe.frame?.frameId ?? 0,
          url: newDoc?.url ?? '',
        }],
      };
    }

    case 'create-tab': {
      const newState = createTab(state, action.url, action.title);
      const newTab = newState.root[newState.root.length - 1];
      const newFrame = newTab.frames![0];
      const newDoc = newFrame.documents![0];
      return {
        state: newState,
        events: [
          {
            scope: 'chrome',
            type: 'onTabCreated',
            tabId: newTab.tabId,
          },
          {
            scope: 'chrome',
            type: 'onCommitted',
            tabId: newTab.tabId,
            frameId: newFrame.frameId,
            url: newDoc.url ?? '',
          },
        ],
      };
    }

    case 'open-tab': {
      const newState = openTab(state, action.tabId, action.frameId, action.url, action.title);
      const newTab = newState.root[newState.root.length - 1];
      const newFrame = newTab.frames![0];
      const newDoc = newFrame.documents![0];
      return {
        state: newState,
        events: [
          {
            scope: 'chrome',
            type: 'onTabCreated',
            tabId: newTab.tabId,
          },
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
        ],
      };
    }

    case 'close-tab': {
      return {
        state: closeTab(state, action.tabId),
        events: [{
          scope: 'chrome',
          type: 'onTabRemoved',
          tabId: action.tabId,
        }],
      };
    }

    case 'send-message': {
      const tab = state.root.find(t => t.tabId === action.tabId);
      if (!tab) return { state, events: [] };

      let sourceTabId: number;
      let sourceFrameId: number;
      let targetTabId: number;
      let targetFrameId: number;

      switch (action.direction) {
        case 'self':
          sourceTabId = targetTabId = action.tabId;
          sourceFrameId = targetFrameId = action.frameId;
          break;
        case 'self->parent': {
          const parentId = findParentFrameId(tab, action.frameId);
          if (parentId === undefined) return { state, events: [] };
          sourceTabId = targetTabId = action.tabId;
          sourceFrameId = action.frameId;
          targetFrameId = parentId;
          break;
        }
        case 'parent->self': {
          const parentId = findParentFrameId(tab, action.frameId);
          if (parentId === undefined) return { state, events: [] };
          sourceTabId = targetTabId = action.tabId;
          sourceFrameId = parentId;
          targetFrameId = action.frameId;
          break;
        }
        case 'self->opener': {
          if (tab.openerTabId == null || tab.openerFrameId == null) return { state, events: [] };
          sourceTabId = action.tabId;
          sourceFrameId = action.frameId;
          targetTabId = tab.openerTabId;
          targetFrameId = tab.openerFrameId;
          break;
        }
        case 'opener->self': {
          if (tab.openerTabId == null || tab.openerFrameId == null) return { state, events: [] };
          sourceTabId = tab.openerTabId;
          sourceFrameId = tab.openerFrameId;
          targetTabId = action.tabId;
          targetFrameId = action.frameId;
          break;
        }
      }

      const seq = state.nextMessageSeq;
      const sourceTab = state.root.find(t => t.tabId === sourceTabId)!;
      const origin = getFrameOrigin(sourceTab, sourceFrameId);

      return {
        state: { ...state, nextMessageSeq: seq + 1 },
        events: [{
          scope: 'window',
          type: 'message',
          sourceTabId,
          sourceFrameId,
          targetTabId,
          targetFrameId,
          data: { type: 'test-message', seq },
          origin,
        }],
      };
    }

    case 'purge-stale':
      return { state: purgeStale(state), events: [] };

    default:
      return { state, events: [] };
  }
}
