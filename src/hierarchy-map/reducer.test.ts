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
});
