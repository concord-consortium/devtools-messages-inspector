import { describe, it, expect } from 'vitest';
import { reduce, initState } from './reducer';
import type { TabNode } from './types';

function makeTab(overrides?: Partial<TabNode>): TabNode {
  return {
    type: 'tab',
    tabId: 1,
    frames: [{
      type: 'frame',
      frameId: 0,
      documents: [{
        type: 'document',
        documentId: 'doc-1',
        url: 'https://page-1.example.com/',
        origin: 'https://page-1.example.com',
      }],
    }],
    ...overrides,
  };
}

describe('reduce', () => {
  describe('add-iframe', () => {
    it('adds iframe with new frame and about:blank document to target document', () => {
      const state = initState(makeTab());
      const next = reduce(state, { type: 'add-iframe', documentId: 'doc-1' });

      const doc = next.root.frames![0].documents![0];
      expect(doc.iframes).toHaveLength(1);

      const iframe = doc.iframes![0];
      expect(iframe.type).toBe('iframe');
      expect(iframe.iframeId).toBe(1);
      expect(iframe.stale).toBeUndefined();

      const frame = iframe.frame!;
      expect(frame.type).toBe('frame');
      expect(frame.frameId).toBe(1);

      const innerDoc = frame.documents![0];
      expect(innerDoc.type).toBe('document');
      expect(innerDoc.url).toBe('about:blank');
      expect(innerDoc.origin).toBeUndefined();
    });
  });

  describe('remove-iframe', () => {
    it('marks iframe and its frame subtree as stale', () => {
      const tab = makeTab();
      // Add an iframe first
      let state = initState(tab);
      state = reduce(state, { type: 'add-iframe', documentId: 'doc-1' });
      const iframeId = state.root.frames![0].documents![0].iframes![0].iframeId;

      const next = reduce(state, { type: 'remove-iframe', iframeId });

      const iframe = next.root.frames![0].documents![0].iframes![0];
      expect(iframe.stale).toBe(true);
      expect(iframe.frame!.stale).toBe(true);
      expect(iframe.frame!.documents![0].stale).toBe(true);
    });
  });
});
