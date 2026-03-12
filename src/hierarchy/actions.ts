export type HierarchyAction =
  | { type: 'open-tab'; tabId: number; frameId: number }
  | { type: 'close-tab'; tabId: number }
  | { type: 'add-iframe'; documentId: string; url?: string }
  | { type: 'remove-iframe'; iframeId: number }
  | { type: 'navigate-iframe'; iframeId: number }
  | { type: 'navigate-frame'; frameId: number }
  | { type: 'reload-frame'; frameId: number }
  | { type: 'purge-stale' };
