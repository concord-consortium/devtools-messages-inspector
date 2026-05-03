// Shared types for Messages Inspector

export const REGISTRATION_MESSAGE_TYPE = '__messages_inspector_register__';

// DOM properties of an iframe element
export interface IframeElementInfo {
  src: string;
  id: string;
  domPath: string;
}

// Message as captured by content script (before background enriches it)
export interface RawCapturedMessage {
  id: string;
  timestamp: number;
  target: {
    url: string;
    origin: string;
    documentTitle: string;
  };
  source: {
    type: string;
    origin: string;
    sourceId: string | null;
    iframe: IframeElementInfo | null;
  };
  data: unknown;
}

// Message interface - can be implemented by Message class or used as plain object
export interface IMessage {
  id: string;
  timestamp: number;
  target: {
    url: string;
    origin: string;
    documentTitle: string;
    frameId: number;
    tabId: number;
    documentId?: string;  // From sender.documentId in background script
    frameInfoError?: string;
  };
  source: {
    type: string;
    origin: string;
    sourceId: string | null;
    iframe: IframeElementInfo | null;
    frameId?: number;  // Computed for child messages
    tabId?: number;
    documentId?: string;  // For parent messages, from webNavigation lookup
    frameInfoError?: string;
  };
  data: unknown;
  buffered?: boolean;
}

// Alias for backward compatibility during transition
export type CapturedMessage = IMessage;

export interface FrameInfo {
  frameId: number | string;
  documentId?: string;
  tabId?: number;
  url: string;
  parentFrameId: number;
  title: string;
  origin: string;
  iframes: (IframeElementInfo & { sourceId?: string })[];
  sourceId?: string;
  isOpener?: boolean;
  children?: FrameInfo[];
}

export interface OpenerInfo {
  origin: string | null;
  sourceId?: string;
}

// Messages sent from background to content script
export interface SendMessageMessage {
  type: 'send-message';
  target: 'parent' | 'opener';
  message: unknown;
}

export interface GetFrameInfoMessage {
  type: 'get-frame-info';
}

export interface FrameInfoResponse {
  title: string;
  origin: string;
  iframes: (IframeElementInfo & { sourceId?: string })[];
  opener?: OpenerInfo | null;
}

export interface LogIframeElementMessage {
  type: 'log-iframe-element';
  domPath: string;
}

export type BackgroundToContentMessage = SendMessageMessage | GetFrameInfoMessage | LogIframeElementMessage;

// Messages sent from content script to background
export interface PostMessageCapturedMessage {
  type: 'postmessage-captured';
  payload: RawCapturedMessage;
}

export type ContentToBackgroundMessage =
  | PostMessageCapturedMessage
  | ContentScriptReadyMessage
  | StaleFrameMessage;

// Window globals used by the inject bootstrap.
// __pm_devtools_sw_id__ holds the service-worker startup ID that injected the
// most recent content script. The bootstrap stores it on the page window so
// future injections (after extension reload) can detect mismatch.
export const SW_ID_KEY = '__pm_devtools_sw_id__';

// __pm_devtools_inject_action__ is written by the bootstrap and read by the
// content script. Tells the content script what to do this injection.
export const INJECT_ACTION_KEY = '__pm_devtools_inject_action__';

export type InjectAction = 'init' | 'skip' | 'stale';

// Storage key for swStartupId persisted in chrome.storage.session.
export const SW_STARTUP_ID_STORAGE_KEY = 'swStartupId';

// Content script → background: this content script just finished fresh init.
export interface ContentScriptReadyMessage {
  type: 'content-script-ready';
}

// Content script → background: a stale orphan from a previous extension
// version is still attached to this frame; this fresh injection bailed.
export interface StaleFrameMessage {
  type: 'stale-frame';
}
