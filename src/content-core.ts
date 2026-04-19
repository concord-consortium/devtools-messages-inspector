// Content script core logic — extracted for testability.
// In production, content.ts calls initContentScript(window, chrome).
// In tests, call with mock window and chrome objects to simulate multiple content scripts.

import { REGISTRATION_MESSAGE_TYPE, BackgroundToContentMessage, IframeElementInfo, RawCapturedMessage, FrameInfoResponse, OpenerInfo, PostMessageCapturedMessage } from './types';

declare global {
  interface Window {
    __postmessage_devtools_content__?: boolean;
  }
}

/** Minimal window interface needed by the content script */
export interface ContentWindow {
  __postmessage_devtools_content__?: boolean;
  parent: any;
  top: any;
  opener: any;
  location: { href: string; origin: string };
  document: {
    title: string;
    querySelector(selector: string): Element | null;
    querySelectorAll(selector: string): NodeListOf<Element>;
  };
  frames: { length: number; [index: number]: any };
  addEventListener(type: string, callback: (event: any) => void, capture?: boolean): void;
}

/** Minimal chrome API interface needed by the content script */
export interface ContentChrome {
  runtime: {
    sendMessage(message: PostMessageCapturedMessage): void;
    onMessage: {
      addListener(callback: (
        message: BackgroundToContentMessage,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: FrameInfoResponse) => void
      ) => boolean | void): void;
    };
  };
}

export function initContentScript(win: ContentWindow, chrome: ContentChrome): void {
  // Guard against multiple injections
  if (win.__postmessage_devtools_content__) return;
  win.__postmessage_devtools_content__ = true;

  const sourceEntries = new WeakMap<object, { sourceId: string; type: string }>();

  // Generate a CSS selector path for an element
  function getDomPath(element: Element | null): string {
    const parts: string[] = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let selector = element.nodeName.toLowerCase();
      if (element.id) {
        selector += '#' + element.id;
        parts.unshift(selector);
        break; // id is unique, stop here
      }
      // Position among same-type siblings
      let sibling: Element | null = element;
      let nth = 1;
      while ((sibling = sibling.previousElementSibling)) {
        if (sibling.nodeName === element.nodeName) nth++;
      }
      if (nth > 1) selector += ':nth-of-type(' + nth + ')';
      parts.unshift(selector);
      element = element.parentElement;
    }
    return parts.join(' > ');
  }

  // Generate unique ID (12 chars = 72 bits of entropy)
  function generateId(): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    let id = '';
    for (let i = 0; i < 12; i++) {
      id += alphabet[bytes[i] & 63];
    }
    return id;
  }

  // Compute the source type from window reference comparisons
  function computeSourceType(eventSource: object): string {
    if (eventSource === win) return 'self';
    if (eventSource === win.parent && win.parent !== win) return 'parent';
    if (eventSource === win.top && win.top !== win) return 'top';
    if (win.opener && eventSource === win.opener) return 'opener';
    for (let i = 0; i < win.frames.length; i++) {
      if (eventSource === win.frames[i]) return 'child';
    }
    return 'unknown';
  }

  // Get or create a stable entry for a message source
  function resolveSourceEntry(sourceWindow: object): { sourceId: string; type: string } {
    let entry = sourceEntries.get(sourceWindow);
    if (!entry) {
      entry = { sourceId: generateId(), type: computeSourceType(sourceWindow) };
      sourceEntries.set(sourceWindow, entry);
    }
    return entry;
  }

  // Extract DOM properties from an iframe element
  function getIframeElementInfo(iframe: HTMLIFrameElement): IframeElementInfo {
    return {
      src: iframe.src || '',
      id: iframe.id || '',
      domPath: getDomPath(iframe)
    };
  }

  // Collect target frame info (the frame receiving the message)
  function getTargetInfo() {
    return {
      url: win.location.href,
      origin: win.location.origin,
      documentTitle: win.document.title || ''
    };
  }

  // Collect source info from a message event
  function getSourceInfo(event: MessageEvent): RawCapturedMessage['source'] {
    const eventSource = event.source;
    const sourceEntry = eventSource ? resolveSourceEntry(eventSource) : null;
    const sourceType = sourceEntry ? sourceEntry.type : 'unknown';

    let iframe: IframeElementInfo | null = null;

    // For child frames, find the iframe element and include its properties
    if (sourceType === 'child') {
      const iframes = win.document.querySelectorAll('iframe') as NodeListOf<HTMLIFrameElement>;
      for (const el of iframes) {
        if (el.contentWindow === event.source) {
          iframe = getIframeElementInfo(el);
          break;
        }
      }
    }

    return {
      type: sourceType,
      origin: event.origin,
      sourceId: sourceEntry ? sourceEntry.sourceId : null,
      iframe
    };
  }

  // Listen for incoming postMessage events
  win.addEventListener('message', (event: MessageEvent) => {
    // Stop propagation of registration messages to prevent app from seeing them
    if (event.data?.type === REGISTRATION_MESSAGE_TYPE) {
      event.stopImmediatePropagation();
    }

    const capturedMessage: RawCapturedMessage = {
      id: generateId(),
      timestamp: Date.now(),
      target: getTargetInfo(),
      source: getSourceInfo(event),
      data: event.data
    };

    const message: PostMessageCapturedMessage = {
      type: 'postmessage-captured',
      payload: capturedMessage
    };
    chrome.runtime.sendMessage(message);
  }, true);

  // Get opener info if available
  function getOpenerInfo(): OpenerInfo | null {
    if (!win.opener) return null;

    const info: OpenerInfo = {
      origin: null,
      sourceId: resolveSourceEntry(win.opener).sourceId
    };

    // window.origin is accessible cross-origin (unlike location.origin)
    try {
      info.origin = win.opener.origin;
    } catch {
      info.origin = null;
    }

    return info;
  }

  // Handle messages from background
  chrome.runtime.onMessage.addListener((
    message: BackgroundToContentMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: FrameInfoResponse) => void
  ) => {
    if (message.type === 'log-iframe-element') {
      const el = win.document.querySelector(message.domPath);
      console.log("Iframe " + message.domPath, el);
      return;
    }

    if (message.type === 'send-message') {
      const { target, message: payload } = message;
      if (target === 'parent' && win.parent !== win) {
        win.parent.postMessage(payload, '*');
      } else if (target === 'opener' && win.opener) {
        win.opener.postMessage(payload, '*');
      }
      return; // No async response needed — don't return true
    }

    if (message.type === 'get-frame-info') {
      const iframes = Array.from(win.document.querySelectorAll('iframe') as NodeListOf<HTMLIFrameElement>).map(iframe => ({
        ...getIframeElementInfo(iframe),
        sourceId: iframe.contentWindow ? resolveSourceEntry(iframe.contentWindow).sourceId : undefined
      }));

      const response: FrameInfoResponse = {
        title: win.document.title,
        origin: win.location.origin,
        iframes: iframes
      };

      // Include opener info only for main frame
      if (win === win.top) {
        response.opener = getOpenerInfo();
      }

      sendResponse(response);
    }
    return true; // Keep channel open for async response
  });
}
