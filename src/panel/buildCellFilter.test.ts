import { describe, it, expect, beforeEach } from 'vitest';
import { Message } from './Message';
import { frameStore } from './models';
import { store } from './store';
import type { IMessage } from '../types';
import { buildCellFilter } from './buildCellFilter';

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

function getCellValue(msg: Message, colId: string): string {
  return store.getCellValue(msg, colId);
}

describe('buildCellFilter', () => {
  beforeEach(() => {
    globalThis.chrome = { storage: { local: { set: () => {}, get: () => {} } } } as unknown as typeof chrome;
    store.messages = [];
    store.filterText = '';
    store.settings = {
      showExtraMessageInfo: false,
      enableFrameRegistration: true,
      showRegistrationMessages: false,
      globalFilter: '',
      globalFilterEnabled: true,
    };
    frameStore.clear();
  });

  describe('target.document.origin column', () => {
    it('generates a filter using target.origin field', () => {
      const msg = makeMessage();
      const filter = buildCellFilter(msg, 'target.document.origin', getCellValue);
      expect(filter).toContain('target.origin:');
    });

    it('quotes URL values containing colons', () => {
      const msg = makeMessage();
      const filter = buildCellFilter(msg, 'target.document.origin', getCellValue);
      expect(filter).toMatch(/target\.origin:"[^"]*"/);
    });

    it('produces a valid liqe filter that matches the correct messages', () => {
      // Register documents in FrameStore so getCellValue can resolve origins
      const doc1 = frameStore.getOrCreateDocumentById('doc-target-1');
      doc1.origin = 'https://parent.example.com';
      const doc2 = frameStore.getOrCreateDocumentById('doc-target-2');
      doc2.origin = 'https://other.example.com';

      const msg1 = makeMessage({
        id: 'msg-1',
        target: {
          url: 'https://parent.example.com/',
          origin: 'https://parent.example.com',
          documentTitle: 'Parent',
          frameId: 0,
          tabId: TAB_ID,
          documentId: 'doc-target-1',
        },
      });
      const msg2 = makeMessage({
        id: 'msg-2',
        target: {
          url: 'https://other.example.com/',
          origin: 'https://other.example.com',
          documentTitle: 'Other',
          frameId: 0,
          tabId: TAB_ID,
          documentId: 'doc-target-2',
        },
      });
      store.addMessage(msg1);
      store.addMessage(msg2);

      const filter = buildCellFilter(msg1, 'target.document.origin', getCellValue);
      store.setFilter(filter);

      expect(store.filteredMessages).toHaveLength(1);
      expect(store.filteredMessages[0].id).toBe('msg-1');
    });
  });

  describe('source.document.origin column', () => {
    it('generates a filter using source.origin field', () => {
      const msg = makeMessage();
      const filter = buildCellFilter(msg, 'source.document.origin', getCellValue);
      expect(filter).toContain('source.origin:');
    });

    it('quotes URL values containing colons', () => {
      const msg = makeMessage();
      const filter = buildCellFilter(msg, 'source.document.origin', getCellValue);
      expect(filter).toMatch(/source\.origin:"[^"]*"/);
    });

    it('produces a valid liqe filter that matches the correct messages', () => {
      // Register documents in FrameStore so getCellValue can resolve origins
      const doc1 = frameStore.getOrCreateDocumentById('doc-source-1');
      doc1.origin = 'https://child.example.com';
      const doc2 = frameStore.getOrCreateDocumentById('doc-source-2');
      doc2.origin = 'https://other-child.example.com';

      const msg1 = makeMessage({
        id: 'msg-1',
        source: {
          type: 'child',
          origin: 'https://child.example.com',
          sourceId: null,
          iframe: null,
          documentId: 'doc-source-1',
        },
      });
      const msg2 = makeMessage({
        id: 'msg-2',
        source: {
          type: 'child',
          origin: 'https://other-child.example.com',
          sourceId: null,
          iframe: null,
          documentId: 'doc-source-2',
        },
      });
      store.addMessage(msg1);
      store.addMessage(msg2);

      const filter = buildCellFilter(msg1, 'source.document.origin', getCellValue);
      store.setFilter(filter);

      expect(store.filteredMessages).toHaveLength(1);
      expect(store.filteredMessages[0].id).toBe('msg-1');
    });
  });

  describe('messageType column', () => {
    it('generates a data.type: filter', () => {
      const msg = makeMessage({ data: { type: 'click' } });
      const filter = buildCellFilter(msg, 'messageType', getCellValue);
      expect(filter).toBe('data.type:"click"');
    });

    it('produces a valid liqe filter that matches', () => {
      const msg1 = makeMessage({ id: 'msg-1', data: { type: 'click' } });
      const msg2 = makeMessage({ id: 'msg-2', data: { type: 'hover' } });
      store.addMessage(msg1);
      store.addMessage(msg2);

      const filter = buildCellFilter(msg1, 'messageType', getCellValue);
      store.setFilter(filter);

      expect(store.filteredMessages).toHaveLength(1);
      expect(store.filteredMessages[0].id).toBe('msg-1');
    });

    it('quotes values with special characters', () => {
      const msg1 = makeMessage({ id: 'msg-1', data: { type: 'my:special event' } });
      const msg2 = makeMessage({ id: 'msg-2', data: { type: 'normal' } });
      store.addMessage(msg1);
      store.addMessage(msg2);

      const filter = buildCellFilter(msg1, 'messageType', getCellValue);
      store.setFilter(filter);

      expect(store.filteredMessages).toHaveLength(1);
      expect(store.filteredMessages[0].id).toBe('msg-1');
    });

    it('escapes values with embedded double-quotes and backslashes', () => {
      const msg1 = makeMessage({ id: 'msg-1', data: { type: 'a"b\\c' } });
      const msg2 = makeMessage({ id: 'msg-2', data: { type: 'normal' } });
      store.addMessage(msg1);
      store.addMessage(msg2);

      const filter = buildCellFilter(msg1, 'messageType', getCellValue);
      store.setFilter(filter);

      expect(store.filteredMessages).toHaveLength(1);
      expect(store.filteredMessages[0].id).toBe('msg-1');
    });
  });

  describe('sourceType column', () => {
    it('generates a sourceType: filter', () => {
      const msg = makeMessage();
      const filter = buildCellFilter(msg, 'sourceType', getCellValue);
      expect(filter).toBe('sourceType:child');
    });

    it('produces a valid liqe filter that matches', () => {
      const msg1 = makeMessage({
        id: 'msg-1',
        source: { type: 'child', origin: 'https://a.example.com', sourceId: null, iframe: null },
      });
      const msg2 = makeMessage({
        id: 'msg-2',
        source: { type: 'parent', origin: 'https://b.example.com', sourceId: null, iframe: null },
      });
      store.addMessage(msg1);
      store.addMessage(msg2);

      const filter = buildCellFilter(msg1, 'sourceType', getCellValue);
      store.setFilter(filter);

      expect(store.filteredMessages).toHaveLength(1);
      expect(store.filteredMessages[0].id).toBe('msg-1');
    });
  });

  describe('direction column', () => {
    it('generates a sourceType: filter (same as sourceType column)', () => {
      const msg = makeMessage();
      const filter = buildCellFilter(msg, 'direction', getCellValue);
      expect(filter).toBe('sourceType:child');
    });
  });
});
