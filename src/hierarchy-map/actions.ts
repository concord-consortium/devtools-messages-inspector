export type HierarchyAction =
  | { type: 'open-tab'; documentId: string }
  | { type: 'close-tab'; tabId: number }
  | { type: 'add-iframe'; documentId: string }
  | { type: 'remove-iframe'; iframeId: number }
  | { type: 'navigate-iframe'; iframeId: number }
  | { type: 'navigate-frame'; frameId: number }
  | { type: 'reload-frame'; frameId: number }
  | { type: 'purge-stale' };
