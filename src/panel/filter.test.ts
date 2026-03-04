import { describe, it, expect, beforeEach } from 'vitest';
import { Message } from './Message';
import { frameStore } from './models';
import type { IMessage } from '../types';

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
