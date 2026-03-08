export interface TabNode {
  type: 'tab';
  tabId: number;
  openerTabId?: number;
  openerFrameId?: number;
  label?: string;
  stale?: boolean;
  frames?: FrameNode[];
}

export interface FrameNode {
  type: 'frame';
  frameId: number;
  label?: string;
  stale?: boolean;
  documents?: DocumentNode[];
}

export interface DocumentNode {
  type: 'document';
  documentId?: string;
  url?: string;
  origin?: string;
  stale?: boolean;
  iframes?: IframeNode[];
}

export interface IframeNode {
  type: 'iframe';
  iframeId: number;
  src?: string;
  id?: string;
  stale?: boolean;
  frame?: FrameNode;
}

export type HierarchyNode = TabNode | FrameNode | DocumentNode | IframeNode;
