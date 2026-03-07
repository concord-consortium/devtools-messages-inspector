import { describe, it, expect, beforeEach, vi } from 'vitest';
import { store } from './store';

// Mock chrome.storage.local (used by setCurrentView and other persisting actions)
vi.stubGlobal('chrome', {
  storage: { local: { set: vi.fn(), get: vi.fn() } },
  devtools: { inspectedWindow: { tabId: 42 } },
});

const TAB_ID = 42;

describe('store.buildFrameFilter', () => {
  it('returns frames filter with tab and frame id', () => {
    expect(store.buildFrameFilter(TAB_ID, 3))
      .toBe('frames:"tab[42].frame[3]"');
  });
});

describe('store.navigateToFrameMessages', () => {
  beforeEach(() => {
    store.setFilter('');
    store.setFocusedFrame(null);
    store.setCurrentView('endpoints');
  });

  it('sets focused frame, filter, and switches to log view', () => {
    store.navigateToFrameMessages(TAB_ID, 3);

    expect(store.focusedFrame).toEqual({ tabId: TAB_ID, frameId: 3 });
    expect(store.filterText).toBe('frames:"tab[42].frame[3]"');
    expect(store.currentView).toBe('log');
  });
});

describe('store.viewFrameInEndpoints', () => {
  beforeEach(() => {
    store.selectFrame(null);
    store.setCurrentView('log');
  });

  it('selects the frame and switches to endpoints view', () => {
    store.viewFrameInEndpoints(TAB_ID, 3);

    expect(store.selectedFrameKey).toBe(`${TAB_ID}:3`);
    expect(store.currentView).toBe('endpoints');
  });
});
