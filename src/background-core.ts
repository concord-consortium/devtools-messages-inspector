// Background script core logic — extracted for testability.
// In production, background.ts calls initBackgroundScript(chrome).
// In tests, call with a mock BackgroundChrome to avoid needing globalThis.chrome.

import { IMessage, ContentToBackgroundMessage, FrameIdentityMessage, FrameInfo, FrameInfoResponse, GetFrameInfoMessage, OpenerInfo } from './types';

/** Minimal chrome API surface needed by the background script */
export interface BackgroundPort {
  name: string;
  postMessage(msg: any): void;
  onMessage: { addListener(cb: (msg: any) => void): void };
  onDisconnect: { addListener(cb: () => void): void };
}

export interface MessageSender {
  tab?: { id?: number };
  frameId?: number;
  documentId?: string;
}

export interface BackgroundChrome {
  runtime: {
    onConnect: { addListener(cb: (port: BackgroundPort) => void): void };
    onMessage: { addListener(cb: (msg: ContentToBackgroundMessage, sender: MessageSender, sendResponse: (...args: any[]) => void) => void): void };
  };
  scripting: {
    executeScript(options: { target: { tabId: number; frameIds?: number[]; allFrames?: boolean }; files: string[]; injectImmediately?: boolean }): Promise<any[]>;
  };
  tabs: {
    sendMessage(tabId: number, msg: any, options?: { frameId?: number }): Promise<any>;
    onRemoved: { addListener(cb: (tabId: number) => void): void };
  };
  webNavigation: {
    getAllFrames(details: { tabId: number }): Promise<Array<{ frameId: number; parentFrameId: number; documentId?: string; url: string }> | null>;
    getFrame(details: { tabId: number; frameId: number }): Promise<{ documentId?: string; parentFrameId?: number; url?: string } | null>;
    onCommitted: { addListener(cb: (details: { tabId: number; frameId: number; url: string }) => void): void };
    onCreatedNavigationTarget: { addListener(cb: (details: { sourceTabId: number; sourceFrameId: number; tabId: number; url: string }) => void): void };
  };
  storage: { local: { get(keys: string | string[]): Promise<Record<string, any>> } };
}

export function initBackgroundScript(chrome: BackgroundChrome): void {
  // Store panel connections by tab ID
  const panelConnections = new Map<number, BackgroundPort>();

  // Store preserve log preference by tab ID
  const preserveLogPrefs = new Map<number, boolean>();

  // Buffer messages for tabs without a panel connection
  const messageBuffers = new Map<number, IMessage[]>();
  // Tabs that should have buffering enabled (opened from a monitored tab)
  const bufferingEnabledTabs = new Set<number>();
  const MAX_BUFFER_SIZE = 1000;

  // Track which frames have been injected to avoid double-injection
  const injectedFrames = new Map<number, Set<number>>();

  // For each opened tab, the frame that opened it (via window.open)
  const openedTabs = new Map<number, { tabId: number; frameId: number }>();
  // For each opener frame key ("tabId:frameId"), the tabs it opened
  const openerFrames = new Map<string, Set<number>>();

  // Record an opener relationship
  function recordOpenerRelationship(openerTabId: number, openerFrameId: number, openedTabId: number): void {
    openedTabs.set(openedTabId, { tabId: openerTabId, frameId: openerFrameId });
    const key = `${openerTabId}:${openerFrameId}`;
    if (!openerFrames.has(key)) openerFrames.set(key, new Set());
    openerFrames.get(key)!.add(openedTabId);
  }

  // Maps "${capturingTabId}:${windowId}" to the opened window's tab info
  const openedWindowToTab = new Map<string, { tabId: number; frameId: number }>();

  // Inject content script into a specific tab and frame
  async function injectContentScript(tabId: number, frameId: number | null = null): Promise<void> {
    try {
      const target: { tabId: number; frameIds?: number[]; allFrames?: boolean } = { tabId };
      if (frameId !== null) {
        target.frameIds = [frameId];
      } else {
        target.allFrames = true;
      }

      if (!injectedFrames.has(tabId)) {
        injectedFrames.set(tabId, new Set());
      }

      if (frameId !== null && injectedFrames.get(tabId)!.has(frameId)) {
        return;
      }

      await chrome.scripting.executeScript({
        target,
        files: ['content.js'],
        injectImmediately: true
      });

      if (frameId !== null) {
        injectedFrames.get(tabId)!.add(frameId);
        sendFrameIdentity(tabId, frameId);
      } else {
        const frames = await chrome.webNavigation.getAllFrames({ tabId });
        if (frames) {
          for (const frame of frames) {
            injectedFrames.get(tabId)!.add(frame.frameId);
            sendFrameIdentity(tabId, frame.frameId);
          }
        }
      }
    } catch {
      // Injection can fail for chrome:// pages, etc.
    }
  }

  async function sendFrameIdentity(tabId: number, frameId: number): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['enableFrameRegistration']);
      const enabled = result.enableFrameRegistration !== false;

      if (enabled) {
        let documentId: string | undefined;
        try {
          const frameInfo = await chrome.webNavigation.getFrame({ tabId, frameId });
          documentId = frameInfo?.documentId;
        } catch {
          return;
        }
        if (documentId == null) return;

        const message: FrameIdentityMessage = {
          type: 'frame-identity',
          frameId: frameId,
          tabId: tabId,
          documentId: documentId
        };
        await chrome.tabs.sendMessage(tabId, message, { frameId: frameId });
      }
    } catch {
      // Content script may not be ready yet, ignore
    }
  }

  // Handle connections from DevTools panel
  chrome.runtime.onConnect.addListener((port: BackgroundPort) => {
    if (port.name !== 'postmessage-panel') return;

    port.onMessage.addListener((msg: { type: string; tabId?: number; value?: boolean }) => {
      if (msg.type === 'init' && msg.tabId !== undefined) {
        panelConnections.set(msg.tabId, port);
        preserveLogPrefs.set(msg.tabId, false);

        injectContentScript(msg.tabId);

        const bufferedMessages = messageBuffers.get(msg.tabId);
        if (bufferedMessages && bufferedMessages.length > 0) {
          for (const payload of bufferedMessages) {
            port.postMessage({ type: 'message', payload });
          }
          messageBuffers.delete(msg.tabId);
        }
        bufferingEnabledTabs.delete(msg.tabId);

        port.onDisconnect.addListener(() => {
          panelConnections.delete(msg.tabId!);
          preserveLogPrefs.delete(msg.tabId!);
        });
      } else if (msg.type === 'preserveLog' && msg.tabId !== undefined) {
        preserveLogPrefs.set(msg.tabId, msg.value ?? false);
      } else if (msg.type === 'get-frame-hierarchy' && msg.tabId !== undefined) {
        getFrameHierarchy(msg.tabId).then(hierarchy => {
          port.postMessage({
            type: 'frame-hierarchy',
            payload: hierarchy
          });
        });
      }
    });
  });

  async function getFrameHierarchy(tabId: number): Promise<FrameInfo[]> {
    try {
      const webNavFrames = await chrome.webNavigation.getAllFrames({ tabId });
      if (!webNavFrames) return [];

      let openerInfo: OpenerInfo | null = null;

      const frameInfoPromises = webNavFrames.map(async (frame): Promise<FrameInfo> => {
        try {
          const message: GetFrameInfoMessage = { type: 'get-frame-info' };
          const info = await chrome.tabs.sendMessage(tabId,
            message,
            { frameId: frame.frameId }
          ) as FrameInfoResponse | undefined;

          if (frame.frameId === 0 && info?.opener) {
            openerInfo = info.opener;
          }

          return {
            frameId: frame.frameId,
            documentId: frame.documentId,
            tabId,
            url: frame.url,
            parentFrameId: frame.parentFrameId,
            title: info?.title || '',
            origin: info?.origin || '',
            iframes: info?.iframes || []
          };
        } catch {
          let origin = '';
          try {
            origin = new URL(frame.url).origin;
          } catch { /* ignore */ }
          return {
            frameId: frame.frameId,
            documentId: frame.documentId,
            tabId,
            url: frame.url,
            parentFrameId: frame.parentFrameId,
            title: '',
            origin: origin,
            iframes: []
          };
        }
      });

      const frames = await Promise.all(frameInfoPromises);

      if (openerInfo) {
        const openerFrame: FrameInfo = {
          frameId: 'opener',
          url: '',
          parentFrameId: -1,
          title: '',
          origin: (openerInfo as OpenerInfo).origin || '',
          iframes: [],
          isOpener: true
        };

        // Enrich opener with info from webNavigation if we know which frame opened us
        const opener = openedTabs.get(tabId);
        if (opener) {
          openerFrame.tabId = opener.tabId;
          openerFrame.frameId = opener.frameId;
          try {
            const navFrame = await chrome.webNavigation.getFrame({ tabId: opener.tabId, frameId: opener.frameId });
            if (navFrame?.url) {
              openerFrame.url = navFrame.url;
              if (!openerFrame.origin) {
                try { openerFrame.origin = new URL(navFrame.url).origin; } catch { /* ignore */ }
              }
            }
          } catch { /* tab may be closed */ }
          try {
            // Get title from content script in the opener frame
            const info = await chrome.tabs.sendMessage(opener.tabId,
              { type: 'get-frame-info' } as GetFrameInfoMessage,
              { frameId: opener.frameId }
            ) as FrameInfoResponse | undefined;
            if (info?.title) openerFrame.title = info.title;
          } catch { /* content script may not be injected */ }
        }

        frames.unshift(openerFrame);
      }

      return frames;
    } catch (e) {
      console.error('Failed to get frame hierarchy:', e);
      return [];
    }
  }

  // Handle messages from content scripts
  chrome.runtime.onMessage.addListener((
    message: ContentToBackgroundMessage,
    sender: MessageSender
  ) => {
    if (message.type !== 'postmessage-captured') return;

    const tabId = sender.tab?.id;
    const frameId = sender.frameId;

    if (!tabId || frameId === undefined) return;

    (async () => {
      const enrichedPayload: IMessage = {
        ...message.payload,
        target: {
          ...message.payload.target,
          frameId: frameId,
          tabId: tabId,
          documentId: sender.documentId
        }
      };

      // Detect opened-window source type from registration data
      // (content script can't determine this — background tracks it via openedWindowToTab)
      if (message.payload.source.windowId) {
        const windowKey = `${tabId}:${message.payload.source.windowId}`;
        const openedWindow = openedWindowToTab.get(windowKey);
        if (openedWindow) {
          enrichedPayload.source = {
            ...enrichedPayload.source,
            type: 'opened',
            tabId: openedWindow.tabId,
            frameId: openedWindow.frameId
          };
        }
      }

      // For same-tab source types, set source.tabId = target.tabId
      const sourceType = enrichedPayload.source.type;
      if (sourceType === 'parent' || sourceType === 'self' || sourceType === 'top' || sourceType === 'child') {
        enrichedPayload.source = {
          ...enrichedPayload.source,
          tabId: tabId
        };
      } else if (sourceType === 'opener') {
        // Opener is in a related tab
        const opener = openedTabs.get(tabId);
        if (opener) {
          enrichedPayload.source = {
            ...enrichedPayload.source,
            tabId: opener.tabId,
            frameId: opener.frameId
          }
        }
      }

      if (message.payload.source.type === 'parent') {
        try {
          const frame = await chrome.webNavigation.getFrame({ tabId, frameId });
          if (!frame) {
            enrichedPayload.target.frameInfoError = 'Frame not found';
          } else if (frame.parentFrameId == null) {
            enrichedPayload.source = {
              ...enrichedPayload.source,
              frameInfoError: 'No parentFrameId'
            };
          } else {
            let parentDocumentId: string | undefined;
            try {
              const parentFrame = await chrome.webNavigation.getFrame({ tabId, frameId: frame.parentFrameId });
              parentDocumentId = parentFrame?.documentId;
            } catch {
              // Parent frame may no longer exist
            }
            enrichedPayload.source = {
              ...enrichedPayload.source,
              frameId: frame.parentFrameId,
              documentId: parentDocumentId
            };
          }
        } catch (e) {
          enrichedPayload.target.frameInfoError = (e instanceof Error ? e.message : 'Failed to get frame info');
        }
      }

      // Extract opened window registration data for cross-tab routing
      const rawData = message.payload.data as any;
      if (rawData?.type === '__frames_inspector_register__'
          && rawData?.targetType === 'opener'
          && message.payload.source.windowId) {
        const key = `${tabId}:${message.payload.source.windowId}`;
        openedWindowToTab.set(key, { tabId: rawData.tabId, frameId: rawData.frameId });

        // Also establish opener relationship from registration, as a fallback
        // for cases where onCreatedNavigationTarget didn't set it up (e.g.,
        // popup opened before the panel was connected).
        // frameId here is the opener's frame (where the message was received).
        recordOpenerRelationship(tabId, frameId, rawData.tabId as number);
      }

      const panel = panelConnections.get(tabId);
      if (panel) {
        enrichedPayload.buffered = false;
        panel.postMessage({
          type: 'message',
          payload: enrichedPayload
        });
      } else if (bufferingEnabledTabs.has(tabId)) {
        enrichedPayload.buffered = true;
        if (!messageBuffers.has(tabId)) {
          messageBuffers.set(tabId, []);
        }
        const buffer = messageBuffers.get(tabId)!;
        if (buffer.length < MAX_BUFFER_SIZE) {
          buffer.push(enrichedPayload);
        }
      }

      // Cross-tab routing: forward to the source's tab panel if it's a different tab
      if (enrichedPayload.source.tabId && enrichedPayload.source.tabId !== tabId) {
        const relatedPanel = panelConnections.get(enrichedPayload.source.tabId);
        if (relatedPanel) {
          relatedPanel.postMessage({
            type: 'message',
            payload: enrichedPayload
          });
        }
      }
    })();
  });

  // Enable buffering for tabs opened from monitored tabs
  chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
    const sourceTabId = details.sourceTabId;
    const sourceFrameId = details.sourceFrameId;
    const newTabId = details.tabId;
    if (panelConnections.has(sourceTabId) || bufferingEnabledTabs.has(sourceTabId)) {
      bufferingEnabledTabs.add(newTabId);

      recordOpenerRelationship(sourceTabId, sourceFrameId, newTabId);
    }
  });

  // Handle navigation events
  chrome.webNavigation.onCommitted.addListener((details) => {
    const { tabId, frameId } = details;
    const isMonitored = panelConnections.has(tabId);
    const needsBuffering = bufferingEnabledTabs.has(tabId);

    if (isMonitored || needsBuffering) {
      if (injectedFrames.has(tabId)) {
        injectedFrames.get(tabId)!.delete(frameId);
      }
      injectContentScript(tabId, frameId);
    }

    if (frameId === 0) {
      const preserveLog = preserveLogPrefs.get(tabId);
      if (!preserveLog) {
        const panel = panelConnections.get(tabId);
        if (panel) {
          panel.postMessage({ type: 'clear' });
        }
      }
    }
  });

  // Clean up when tab is closed
  chrome.tabs.onRemoved.addListener((tabId: number) => {
    messageBuffers.delete(tabId);
    bufferingEnabledTabs.delete(tabId);
    injectedFrames.delete(tabId);

    // Clean up opener relationships
    const opener = openedTabs.get(tabId);
    if (opener) {
      // This tab was opened by opener — remove it from the opener's set
      const key = `${opener.tabId}:${opener.frameId}`;
      openerFrames.get(key)?.delete(tabId);
      if (openerFrames.get(key)?.size === 0) openerFrames.delete(key);
      openedTabs.delete(tabId);
    }
    // Also clean up any tabs this tab opened (as an opener frame)
    // Check all frames in this tab — iterate openerFrames for keys starting with tabId
    for (const [key, openedSet] of openerFrames) {
      if (key.startsWith(`${tabId}:`)) {
        for (const openedTabId of openedSet) {
          openedTabs.delete(openedTabId);
        }
        openerFrames.delete(key);
      }
    }
  });
}
