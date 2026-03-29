// Types for Frames Inspector panel

// Re-export shared types
export type { IMessage, CapturedMessage, FrameInfo } from '../types';

export interface ColumnDef {
  id: string;
  defaultVisible: boolean;
  width: number;
}

export interface Settings {
  showInternalFields: boolean;
  enableFrameRegistration: boolean;
  showRegistrationMessages: boolean;
  globalFilter: string;
  globalFilterEnabled: boolean;
}

export const VIEW_TYPES = ['log', 'endpoints', 'settings'] as const;
export type ViewType = (typeof VIEW_TYPES)[number];
export type DetailTabType = 'data' | 'context';
export type SortDirection = 'asc' | 'desc';
export type FocusPosition = 'source' | 'target' | 'both' | 'none';

// Discriminated union for selecting any node type in the endpoints tree
export type SelectedNode =
  | { type: 'tab'; tabId: number; tabRef?: import('./models/Tab').Tab }
  | { type: 'document'; documentId: string; docRef?: import('./models/FrameDocument').FrameDocument }
  | { type: 'document-by-sourceId'; sourceId: string; docRef?: import('./models/FrameDocument').FrameDocument }
  | { type: 'iframe'; tabId: number; frameId: number; iframeRef?: import('./models/IFrame').IFrame }
  | { type: 'unknown-iframe'; tabId: number; frameId: number }
  | { type: 'unknown-document'; sourceId: string };

// Column definitions
export const ALL_COLUMNS: ColumnDef[] = [
  { id: 'timestamp', defaultVisible: true, width: 90 },
  { id: 'direction', defaultVisible: true, width: 40 },
  { id: 'target.document.url', defaultVisible: false, width: 200 },
  { id: 'target.document.origin', defaultVisible: true, width: 150 },
  { id: 'target.document.title', defaultVisible: false, width: 150 },
  { id: 'source.document.origin', defaultVisible: true, width: 120 },
  { id: 'sourceType', defaultVisible: true, width: 70 },
  { id: 'source.frameId', defaultVisible: false, width: 80 },
  { id: 'source.ownerElement.src', defaultVisible: false, width: 200 },
  { id: 'source.ownerElement.id', defaultVisible: false, width: 100 },
  { id: 'source.ownerElement.domPath', defaultVisible: false, width: 200 },
  { id: 'messageType', defaultVisible: true, width: 80 },
  { id: 'dataPreview', defaultVisible: true, width: 200 },
  { id: 'dataSize', defaultVisible: false, width: 60 },
  { id: 'partnerFrame', defaultVisible: false, width: 90 },
  { id: 'partnerType', defaultVisible: false, width: 80 },
];
