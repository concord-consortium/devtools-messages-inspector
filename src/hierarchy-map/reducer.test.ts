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

      const doc = next.root[0].frames![0].documents![0];
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
      const iframeId = state.root[0].frames![0].documents![0].iframes![0].iframeId;

      const next = reduce(state, { type: 'remove-iframe', iframeId });

      const iframe = next.root[0].frames![0].documents![0].iframes![0];
      expect(iframe.stale).toBe(true);
      expect(iframe.frame!.stale).toBe(true);
      expect(iframe.frame!.documents![0].stale).toBe(true);
    });
  });

  describe('reload-frame', () => {
    it('adds new document with same URL and marks old document stale', () => {
      const state = initState(makeTab());
      const next = reduce(state, { type: 'reload-frame', frameId: 0 });

      const frame = next.root[0].frames![0];
      expect(frame.documents).toHaveLength(2);
      expect(frame.documents![0].stale).toBe(true);
      expect(frame.documents![1].url).toBe('https://page-1.example.com/');
      expect(frame.documents![1].origin).toBe('https://page-1.example.com');
    });
  });

  describe('navigate-frame', () => {
    it('adds new document to frame and marks old document stale', () => {
      const state = initState(makeTab());
      const next = reduce(state, { type: 'navigate-frame', frameId: 0 });

      const frame = next.root[0].frames![0];
      expect(frame.documents).toHaveLength(2);
      expect(frame.documents![0].stale).toBe(true);
      expect(frame.documents![1].stale).toBeUndefined();
      expect(frame.documents![1].url).toMatch(/^https:\/\/page-\d+\.example\.com\/$/);
    });

    it('marks nested iframes in old document as stale (navigate-frame)', () => {
      let state = initState(makeTab());
      state = reduce(state, { type: 'add-iframe', documentId: 'doc-1' });

      const next = reduce(state, { type: 'navigate-frame', frameId: 0 });

      // Old document's iframe and its subtree should be stale
      const oldDoc = next.root[0].frames![0].documents![0];
      expect(oldDoc.stale).toBe(true);
      expect(oldDoc.iframes![0].stale).toBe(true);
      expect(oldDoc.iframes![0].frame!.stale).toBe(true);

      // New document should have no iframes
      const newDoc = next.root[0].frames![0].documents![1];
      expect(newDoc.iframes).toBeUndefined();
    });
  });

  describe('navigate-iframe', () => {
    it('navigates the frame inside the iframe and updates iframe src', () => {
      let state = initState(makeTab());
      state = reduce(state, { type: 'add-iframe', documentId: 'doc-1' });
      const iframeId = state.root[0].frames![0].documents![0].iframes![0].iframeId;

      const next = reduce(state, { type: 'navigate-iframe', iframeId });

      const iframe = next.root[0].frames![0].documents![0].iframes![0];
      // Iframe src should update to new URL
      expect(iframe.src).toMatch(/^https:\/\/page-\d+\.example\.com\/$/);

      // Inner frame should have old doc (stale) + new doc
      const innerFrame = iframe.frame!;
      expect(innerFrame.documents).toHaveLength(2);
      expect(innerFrame.documents![0].stale).toBe(true);
      expect(innerFrame.documents![1].stale).toBeUndefined();
    });
  });

  describe('open-tab', () => {
    it('creates a new tab with frame[0] and auto-generated document', () => {
      const state = initState(makeTab());
      const next = reduce(state, { type: 'open-tab', tabId: 1, frameId: 0 });

      expect(next.root).toHaveLength(2);
      const newTab = next.root[1];
      expect(newTab.tabId).toBe(2);
      expect(newTab.frames).toHaveLength(1);
      expect(newTab.frames![0].frameId).toBe(1);
      expect(newTab.frames![0].documents![0].url).toMatch(/^https:\/\/page-\d+\.example\.com\/$/);
    });

    it('stores opener tabId and frameId on the new tab', () => {
      const state = initState(makeTab());
      const next = reduce(state, { type: 'open-tab', tabId: 1, frameId: 0 });

      const newTab = next.root[1];
      expect(newTab.openerTabId).toBe(1);
      expect(newTab.openerFrameId).toBe(0);
    });
  });

  describe('close-tab', () => {
    it('marks tab and all descendants stale', () => {
      const state = initState(makeTab());
      const next = reduce(state, { type: 'close-tab', tabId: 1 });

      expect(next.root[0].stale).toBe(true);
      expect(next.root[0].frames![0].stale).toBe(true);
      expect(next.root[0].frames![0].documents![0].stale).toBe(true);
    });
  });

  describe('purge-stale', () => {
    it('removes all stale nodes from the tree', () => {
      let state = initState(makeTab());
      // Add iframe, then remove it (makes it stale)
      state = reduce(state, { type: 'add-iframe', documentId: 'doc-1' });
      const iframeId = state.root[0].frames![0].documents![0].iframes![0].iframeId;
      state = reduce(state, { type: 'remove-iframe', iframeId });

      const next = reduce(state, { type: 'purge-stale' });

      expect(next.root[0].frames![0].documents![0].iframes).toHaveLength(0);
    });

    it('removes stale documents from frames', () => {
      let state = initState(makeTab());
      state = reduce(state, { type: 'navigate-frame', frameId: 0 });

      const next = reduce(state, { type: 'purge-stale' });

      const frame = next.root[0].frames![0];
      expect(frame.documents).toHaveLength(1);
      expect(frame.documents![0].stale).toBeUndefined();
    });

    it('removes stale tabs', () => {
      let state = initState(makeTab());
      state = reduce(state, { type: 'close-tab', tabId: 1 });

      const next = reduce(state, { type: 'purge-stale' });

      expect(next.root).toHaveLength(0);
    });
  });
});
