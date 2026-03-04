import { describe, it, expect, beforeEach } from 'vitest';
import { Message } from './Message';
import { frameStore } from './models';
import { store } from './store';
import type { IMessage } from '../types';
import { REGISTRATION_MESSAGE_TYPE } from '../types';

const TAB_ID = 42;

function makeMessage(overrides: Partial<IMessage> = {}): Message {
  const base: IMessage = {
    id: 'msg-1',
    timestamp: Date.now(),
    target: {
      url: 'https://parent.example.com/',
      origin: 'https://parent.example.com',
      documentTitle: 'Parent',
      frameId: 0,
      tabId: TAB_ID,
      documentId: 'doc-target',
    },
    source: {
      type: 'child',
      origin: 'https://child.example.com',
      sourceId: 'win-1',
      iframe: null,
      frameId: 1,
      tabId: TAB_ID,
      documentId: 'doc-source',
    },
    data: { type: 'test' },
    ...overrides,
  };
  return new Message(base, undefined, undefined);
}

describe('Message.frames', () => {
  beforeEach(() => {
    frameStore.clear();
    Message.currentTabId = TAB_ID;
  });

  it('returns relative and absolute forms for current-tab frames', () => {
    // Set up frames in the frameStore so sourceFrame/targetFrame resolve
    const targetFrame = frameStore.getOrCreateFrame(TAB_ID, 0);
    const targetDoc = frameStore.getOrCreateDocumentById('doc-target');
    targetDoc.frame = targetFrame;
    targetFrame.currentDocument = targetDoc;

    const sourceFrame = frameStore.getOrCreateFrame(TAB_ID, 1);
    const sourceDoc = frameStore.getOrCreateDocumentById('doc-source');
    sourceDoc.frame = sourceFrame;
    sourceFrame.currentDocument = sourceDoc;
    sourceDoc.sourceId = 'win-1';
    frameStore.documentsBySourceId.set('win-1', sourceDoc);

    const msg = makeMessage();
    expect(msg.frames).toContain('frame[0]');
    expect(msg.frames).toContain(`tab[${TAB_ID}].frame[0]`);
    expect(msg.frames).toContain('frame[1]');
    expect(msg.frames).toContain(`tab[${TAB_ID}].frame[1]`);
  });

  it('omits relative form for frames not in current tab', () => {
    const otherTabId = 99;
    const sourceFrame = frameStore.getOrCreateFrame(otherTabId, 0);
    const sourceDoc = frameStore.getOrCreateDocumentById('doc-source');
    sourceDoc.frame = sourceFrame;
    sourceFrame.currentDocument = sourceDoc;
    sourceDoc.sourceId = 'win-1';
    frameStore.documentsBySourceId.set('win-1', sourceDoc);

    const msg = makeMessage({
      source: {
        type: 'opener',
        origin: 'https://other.example.com',
        sourceId: 'win-1',
        iframe: null,
        tabId: otherTabId,
        frameId: 0,
        documentId: 'doc-source',
      },
    });

    expect(msg.frames).toContain(`tab[${otherTabId}].frame[0]`);
    expect(msg.frames).not.toContain('frame[0]');
  });

  it('returns empty array when no frames resolve', () => {
    const msg = makeMessage();
    expect(msg.frames).toEqual([]);
  });
});

describe('liqe filtering via store', () => {
  beforeEach(() => {
    // Mock chrome.storage.local for updateSettings calls
    globalThis.chrome = { storage: { local: { set: () => {}, get: () => {} } } } as unknown as typeof chrome;
    store.messages = [];
    store.filterText = '';
    store.settings = { showExtraMessageInfo: false, enableFrameRegistration: true, showRegistrationMessages: false };
    Message.currentTabId = TAB_ID;
    frameStore.clear();
  });

  function addMessage(data: unknown, sourceType = 'child', sourceOrigin = 'https://child.example.com'): Message {
    const msg = makeMessage({
      data,
      source: {
        type: sourceType,
        origin: sourceOrigin,
        sourceId: null,
        iframe: null,
      },
    });
    store.addMessage(msg);
    return msg;
  }

  it('shows all messages when filter is empty', () => {
    addMessage({ type: 'a' });
    addMessage({ type: 'b' });
    expect(store.filteredMessages).toHaveLength(2);
  });

  it('filters by data property with field prefix', () => {
    addMessage({ type: 'click', source: 'app' });
    addMessage({ type: 'hover', source: 'react-devtools-hook' });
    store.setFilter('data.source:app');
    expect(store.filteredMessages).toHaveLength(1);
    expect((store.filteredMessages[0].data as { source: string }).source).toBe('app');
  });

  it('filters with wildcard on data property', () => {
    addMessage({ source: 'react-devtools-hook' });
    addMessage({ source: 'react-devtools-bridge' });
    addMessage({ source: 'my-app' });
    store.setFilter('data.source:react-devtools*');
    expect(store.filteredMessages).toHaveLength(2);
  });

  it('negates with dash prefix', () => {
    addMessage({ source: 'react-devtools-hook' });
    addMessage({ source: 'my-app' });
    store.setFilter('-data.source:react-devtools*');
    expect(store.filteredMessages).toHaveLength(1);
    expect((store.filteredMessages[0].data as { source: string }).source).toBe('my-app');
  });

  it('supports OR operator', () => {
    addMessage({ type: 'a' }, 'child', 'https://a.example.com');
    addMessage({ type: 'b' }, 'child', 'https://b.example.com');
    addMessage({ type: 'c' }, 'child', 'https://c.example.com');
    store.setFilter('source.origin:a.example.com OR source.origin:b.example.com');
    expect(store.filteredMessages).toHaveLength(2);
  });

  it('filters by messageType shortcut', () => {
    addMessage({ type: 'click' });
    addMessage({ type: 'hover' });
    store.setFilter('messageType:click');
    expect(store.filteredMessages).toHaveLength(1);
  });

  it('filters by sourceType shortcut', () => {
    addMessage({ type: 'a' }, 'child');
    addMessage({ type: 'b' }, 'parent');
    store.setFilter('sourceType:child');
    expect(store.filteredMessages).toHaveLength(1);
  });

  it('filters by source.origin', () => {
    addMessage({ type: 'a' }, 'child', 'https://a.example.com');
    addMessage({ type: 'b' }, 'child', 'https://b.example.com');
    store.setFilter('source.origin:a.example.com');
    expect(store.filteredMessages).toHaveLength(1);
  });

  it('shows all messages on invalid query (graceful fallback)', () => {
    addMessage({ type: 'a' });
    addMessage({ type: 'b' });
    store.setFilter('((invalid query');
    expect(store.filteredMessages).toHaveLength(2);
  });

  it('still filters out registration messages when setting is off', () => {
    addMessage({ type: REGISTRATION_MESSAGE_TYPE, frameId: 0, tabId: TAB_ID, documentId: 'doc-A' });
    addMessage({ type: 'normal' });
    store.updateSettings({ showRegistrationMessages: false });
    store.setFilter('');
    expect(store.filteredMessages).toHaveLength(1);
  });
});
