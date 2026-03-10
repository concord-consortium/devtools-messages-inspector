import { describe, it, expect } from 'vitest';
import { applyAction } from './action-effects';
import { initState } from './reducer';
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

describe('applyAction', () => {
  describe('add-iframe', () => {
    it('returns iframeAdded dom event with correct frame IDs', () => {
      const state = initState(makeTab());
      const { events } = applyAction(state, { type: 'add-iframe', documentId: 'doc-1' });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        scope: 'dom',
        type: 'iframeAdded',
        tabId: 1,
        parentFrameId: 0,
      });
    });

    it('returns updated tree state (same as reducer)', () => {
      const state = initState(makeTab());
      const { state: next } = applyAction(state, { type: 'add-iframe', documentId: 'doc-1' });

      const doc = next.root[0].frames![0].documents![0];
      expect(doc.iframes).toHaveLength(1);
      expect(doc.iframes![0].frame!.documents![0].url).toBe('about:blank');
    });
  });

  describe('remove-iframe', () => {
    it('returns iframeRemoved dom event', () => {
      let state = initState(makeTab());
      state = applyAction(state, { type: 'add-iframe', documentId: 'doc-1' }).state;
      const iframeId = state.root[0].frames![0].documents![0].iframes![0].iframeId;

      const { events } = applyAction(state, { type: 'remove-iframe', iframeId });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        scope: 'dom',
        type: 'iframeRemoved',
        tabId: 1,
        iframeId,
      });
    });
  });

  describe('navigate-frame', () => {
    it('returns onCommitted chrome event', () => {
      const state = initState(makeTab());
      const { state: next, events } = applyAction(state, { type: 'navigate-frame', frameId: 0 });

      expect(events).toHaveLength(1);
      const newDoc = next.root[0].frames![0].documents![1];
      expect(events[0]).toMatchObject({
        scope: 'chrome',
        type: 'onCommitted',
        tabId: 1,
        frameId: 0,
        url: newDoc.url,
      });
    });
  });

  describe('reload-frame', () => {
    it('returns onCommitted chrome event with transitionType reload', () => {
      const state = initState(makeTab());
      const { events } = applyAction(state, { type: 'reload-frame', frameId: 0 });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        scope: 'chrome',
        type: 'onCommitted',
        transitionType: 'reload',
      });
    });
  });

  describe('navigate-iframe', () => {
    it('returns onCommitted chrome event for the iframe inner frame', () => {
      let state = initState(makeTab());
      state = applyAction(state, { type: 'add-iframe', documentId: 'doc-1' }).state;
      const iframe = state.root[0].frames![0].documents![0].iframes![0];

      const { events } = applyAction(state, { type: 'navigate-iframe', iframeId: iframe.iframeId });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        scope: 'chrome',
        type: 'onCommitted',
        tabId: 1,
        frameId: iframe.frame!.frameId,
      });
    });
  });

  describe('open-tab', () => {
    it('returns onCreatedNavigationTarget then onCommitted', () => {
      const state = initState(makeTab());
      const { state: next, events } = applyAction(state, { type: 'open-tab', tabId: 1, frameId: 0 });

      expect(events).toHaveLength(2);
      const newTab = next.root[1];

      expect(events[0]).toMatchObject({
        scope: 'chrome',
        type: 'onCreatedNavigationTarget',
        sourceTabId: 1,
        sourceFrameId: 0,
        tabId: newTab.tabId,
      });
      expect(events[1]).toMatchObject({
        scope: 'chrome',
        type: 'onCommitted',
        tabId: newTab.tabId,
        frameId: newTab.frames![0].frameId,
      });
    });
  });

  describe('close-tab', () => {
    it('returns onTabRemoved chrome event', () => {
      const state = initState(makeTab());
      const { events } = applyAction(state, { type: 'close-tab', tabId: 1 });

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        scope: 'chrome',
        type: 'onTabRemoved',
        tabId: 1,
      });
    });
  });

  describe('purge-stale', () => {
    it('returns no events', () => {
      let state = initState(makeTab());
      state = applyAction(state, { type: 'close-tab', tabId: 1 }).state;
      const { events } = applyAction(state, { type: 'purge-stale' });

      expect(events).toHaveLength(0);
    });
  });
});
