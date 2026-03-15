export type HierarchyAction =
  | { type: 'open-tab'; tabId: number; frameId: number; url?: string; title?: string }
  | { type: 'close-tab'; tabId: number }
  | { type: 'create-tab'; url: string; title?: string }
  | { type: 'add-iframe'; documentId: string; url?: string; title?: string }
  | { type: 'remove-iframe'; iframeId: number }
  | { type: 'navigate-iframe'; iframeId: number }
  | { type: 'navigate-frame'; frameId: number; url?: string; title?: string }
  | { type: 'reload-frame'; frameId: number }
  | { type: 'purge-stale' }
  | { type: 'send-message'; tabId: number; frameId: number; direction: MessageDirection };

export type MessageDirection = 'self' | 'self->parent' | 'parent->self' | 'self->opener' | 'opener->self';
