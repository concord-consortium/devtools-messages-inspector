// Shared types for Frames Inspector

export const REGISTRATION_MESSAGE_TYPE = '__frames_inspector_register__';

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

export type BackgroundToContentMessage = SendMessageMessage | GetFrameInfoMessage;

// Messages sent from content script to background
export interface PostMessageCapturedMessage {
  type: 'postmessage-captured';
  payload: RawCapturedMessage;
}

export type ContentToBackgroundMessage = PostMessageCapturedMessage;
