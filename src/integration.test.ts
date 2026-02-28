// Integration tests: content script → background service worker → panel
//
// These tests exercise the real background-core.ts and content-core.ts code
// with mock Chrome APIs wired together by ChromeExtensionEnv.
//
// Test frame hierarchy:
//   Parent (frameId=0) — https://parent.example.com
//   └── Child (frameId=1) — https://child.example.com

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChromeExtensionEnv, flushPromises } from './test/chrome-extension-env';
import { initContentScript } from './content-core';
import { initBackgroundScript } from './background-core';

const TAB_ID = 1;

describe('content → background → panel integration', () => {
  let env: ChromeExtensionEnv;

  beforeEach(() => {
    env = new ChromeExtensionEnv(initContentScript);
    // Disable frame registration to keep tests focused on message routing
    env.storageData.enableFrameRegistration = false;
    initBackgroundScript(env.createBackgroundChrome());
  });

  // --- Frame + window setup helpers ---

  function setupTwoFrames() {
    const topFrame = env.createTab({ tabId: TAB_ID, url: 'https://parent.example.com/', title: 'Parent Page' });
    const childFrame = topFrame.addIframe({ url: 'https://child.example.com/', iframeId: 'child-iframe', title: 'Child Page' });

    return { topFrame, childFrame, parentWin: topFrame.window!, childWin: childFrame.window! };
  }

  // --- Tests ---

  it('delivers a child→parent postMessage to the panel', async () => {
    const { parentWin, childWin } = setupTwoFrames();
    const { messages } = env.connectPanel(TAB_ID);
    await flushPromises();

    // Child sends a message that parent receives
    parentWin.dispatchMessage(
      { type: 'hello-from-child', value: 42 },
      'https://child.example.com',
      childWin
    );

    const msgPayloads = messages.filter(m => m.type === 'message');
    expect(msgPayloads).toHaveLength(1);

    const payload = msgPayloads[0].payload;
    expect(payload.data).toEqual({ type: 'hello-from-child', value: 42 });
    expect(payload.source.type).toBe('child');
    expect(payload.source.origin).toBe('https://child.example.com');
    expect(payload.source.iframe?.src).toBe('https://child.example.com/');
    expect(payload.source.iframe?.id).toBe('child-iframe');
    expect(payload.target.origin).toBe('https://parent.example.com');
    expect(payload.target.frameId).toBe(0);
    expect(payload.target.documentId).toBe('doc-f0');
  });

  it('delivers a parent→child postMessage to the panel', async () => {
    const { parentWin, childWin } = setupTwoFrames();
    const { messages } = env.connectPanel(TAB_ID);
    await flushPromises();

    // Parent sends a message that child receives
    childWin.dispatchMessage(
      { type: 'hello-from-parent' },
      'https://parent.example.com',
      parentWin
    );
    // Background enriches parent messages with webNavigation lookup (async)
    await flushPromises();

    const msgPayloads = messages.filter(m => m.type === 'message');
    expect(msgPayloads).toHaveLength(1);

    const payload = msgPayloads[0].payload;
    expect(payload.data).toEqual({ type: 'hello-from-parent' });
    expect(payload.source.type).toBe('parent');
    expect(payload.source.origin).toBe('https://parent.example.com');
    // Background enriches source with parent's frameId and documentId
    expect(payload.source.frameId).toBe(0);
    expect(payload.source.documentId).toBe('doc-f0');
    expect(payload.target.origin).toBe('https://child.example.com');
    expect(payload.target.frameId).toBe(1);
    expect(payload.target.documentId).toBe('doc-f1');
  });

  it('delivers messages from multiple content scripts in the same test', async () => {
    const { parentWin, childWin } = setupTwoFrames();
    const { messages } = env.connectPanel(TAB_ID);
    await flushPromises();

    // Child→Parent message
    parentWin.dispatchMessage({ type: 'msg-1' }, 'https://child.example.com', childWin);
    // Parent→Child message
    childWin.dispatchMessage({ type: 'msg-2' }, 'https://parent.example.com', parentWin);
    await flushPromises();

    const msgPayloads = messages.filter(m => m.type === 'message');
    expect(msgPayloads).toHaveLength(2);
    expect(msgPayloads[0].payload.data).toEqual({ type: 'msg-1' });
    expect(msgPayloads[0].payload.source.type).toBe('child');
    expect(msgPayloads[1].payload.data).toEqual({ type: 'msg-2' });
    expect(msgPayloads[1].payload.source.type).toBe('parent');
  });

  it('assigns stable sourceIds to repeated messages from the same source', async () => {
    const { parentWin, childWin } = setupTwoFrames();
    const { messages } = env.connectPanel(TAB_ID);
    await flushPromises();

    parentWin.dispatchMessage({ type: 'first' }, 'https://child.example.com', childWin);
    parentWin.dispatchMessage({ type: 'second' }, 'https://child.example.com', childWin);

    const payloads = messages.filter(m => m.type === 'message').map(m => m.payload);
    expect(payloads).toHaveLength(2);
    // Same source window should get the same sourceId
    expect(payloads[0].source.sourceId).toBe(payloads[1].source.sourceId);
    // And it should be a non-empty string
    expect(payloads[0].source.sourceId).toBeTruthy();
  });

  it('clears panel messages on main frame navigation', async () => {
    const { topFrame } = setupTwoFrames();
    const { messages } = env.connectPanel(TAB_ID);
    await flushPromises();

    topFrame.navigate('https://parent.example.com/new');

    const clearMsgs = messages.filter(m => m.type === 'clear');
    expect(clearMsgs).toHaveLength(1);
  });

  it('does not clear messages on subframe navigation', async () => {
    const { childFrame } = setupTwoFrames();
    const { messages } = env.connectPanel(TAB_ID);
    await flushPromises();

    childFrame.navigate('https://child.example.com/new');

    const clearMsgs = messages.filter(m => m.type === 'clear');
    expect(clearMsgs).toHaveLength(0);
  });

  it('sets target.tabId on captured messages', async () => {
    const { parentWin, childWin } = setupTwoFrames();
    const { messages } = env.connectPanel(TAB_ID);
    await flushPromises();

    parentWin.dispatchMessage({ type: 'test' }, 'https://child.example.com', childWin);

    const payload = messages.filter(m => m.type === 'message')[0].payload;
    expect(payload.target.tabId).toBe(TAB_ID);
  });

  it('sets source.tabId for same-tab messages', async () => {
    const { parentWin, childWin } = setupTwoFrames();
    const { messages } = env.connectPanel(TAB_ID);
    await flushPromises();

    // child→parent (same tab)
    parentWin.dispatchMessage({ type: 'test' }, 'https://child.example.com', childWin);

    const payload = messages.filter(m => m.type === 'message')[0].payload;
    expect(payload.source.tabId).toBe(TAB_ID);
  });

  it('delivers an opened→opener message to the opener panel', async () => {
    const topFrame = env.createTab({ tabId: TAB_ID, url: 'https://opener.example.com/', title: 'Opener' });
    const { messages } = env.connectPanel(TAB_ID);
    await flushPromises();

    const POPUP_TAB_ID = 2;
    const popupFrame = env.openPopup(topFrame, { tabId: POPUP_TAB_ID, url: 'https://popup.example.com/', title: 'Popup' });
    await flushPromises();

    const openerWin = topFrame.window!;
    const popupWin = popupFrame.window!;

    // Simulate the popup's content script sending its opener registration
    // (In production this happens via send-message → content script → postMessage)
    openerWin.dispatchMessage(
      { type: '__frames_inspector_register__', targetType: 'opener', frameId: 0, tabId: POPUP_TAB_ID, documentId: 'doc-f0' },
      'https://popup.example.com',
      popupWin
    );

    // Popup sends a message received by opener
    openerWin.dispatchMessage(
      { type: 'hello-from-popup' },
      'https://popup.example.com',
      popupWin
    );

    const msgPayloads = messages.filter(m =>
      m.type === 'message' && m.payload.data?.type !== '__frames_inspector_register__'
    );
    expect(msgPayloads).toHaveLength(1);
    expect(msgPayloads[0].payload.source.type).toBe('opened');
  });

  it('routes opener→popup messages to the opener tab panel', async () => {
    const topFrame = env.createTab({ tabId: TAB_ID, url: 'https://opener.example.com/', title: 'Opener' });
    const { messages: openerMessages } = env.connectPanel(TAB_ID);
    await flushPromises();

    const POPUP_TAB_ID = 2;
    const popupFrame = env.openPopup(topFrame, { tabId: POPUP_TAB_ID, url: 'https://popup.example.com/', title: 'Popup' });
    await flushPromises();

    const popupWin = popupFrame.window!;

    // Opener sends a message that popup receives — captured in popup's tab
    popupWin.dispatchMessage(
      { type: 'init-from-opener' },
      'https://opener.example.com',
      topFrame.window!
    );
    await flushPromises();

    // Should appear in opener's panel too (cross-tab routing)
    const openerMsgs = openerMessages.filter(m => m.type === 'message' && m.payload.data?.type === 'init-from-opener');
    expect(openerMsgs).toHaveLength(1);
    expect(openerMsgs[0].payload.source.type).toBe('opener');
  });

  it('enriches opener source with documentId from webNavigation', async () => {
    const topFrame = env.createTab({ tabId: TAB_ID, url: 'https://opener.example.com/', title: 'Opener' });
    env.connectPanel(TAB_ID);
    await flushPromises();

    const POPUP_TAB_ID = 2;
    const popupFrame = env.openPopup(topFrame, { tabId: POPUP_TAB_ID, url: 'https://popup.example.com/', title: 'Popup' });
    const { messages: popupMessages } = env.connectPanel(POPUP_TAB_ID);
    await flushPromises();

    // Opener sends a message that popup receives
    popupFrame.window!.dispatchMessage(
      { type: 'init-from-opener' },
      'https://opener.example.com',
      topFrame.window!
    );
    await flushPromises();

    const msgPayloads = popupMessages.filter(m => m.type === 'message' && m.payload.data?.type === 'init-from-opener');
    expect(msgPayloads).toHaveLength(1);

    const payload = msgPayloads[0].payload;
    expect(payload.source.type).toBe('opener');
    expect(payload.source.tabId).toBe(TAB_ID);
    expect(payload.source.frameId).toBe(0);
    // documentId should be enriched via webNavigation.getFrame lookup
    expect(payload.source.documentId).toBe('doc-f0');
  });

  it('routes opened→opener messages to the opened tab panel', async () => {
    const topFrame = env.createTab({ tabId: TAB_ID, url: 'https://opener.example.com/', title: 'Opener' });
    const { messages: openerMessages } = env.connectPanel(TAB_ID);
    await flushPromises();

    const POPUP_TAB_ID = 2;
    const popupFrame = env.openPopup(topFrame, { tabId: POPUP_TAB_ID, url: 'https://popup.example.com/', title: 'Popup' });
    await flushPromises();

    // Connect popup panel too
    const { messages: popupMessages } = env.connectPanel(POPUP_TAB_ID);
    await flushPromises();

    const openerWin = topFrame.window!;
    const popupWin = popupFrame.window!;

    // Simulate popup's registration arriving at opener (triggers openedWindowToTab mapping)
    openerWin.dispatchMessage(
      { type: '__frames_inspector_register__', targetType: 'opener', frameId: 0, tabId: POPUP_TAB_ID, documentId: 'doc-f0' },
      'https://popup.example.com',
      popupWin
    );

    // Popup sends message to opener — captured in opener's tab
    openerWin.dispatchMessage(
      { type: 'hello-from-popup' },
      'https://popup.example.com',
      popupWin
    );

    // Should appear in popup's panel too (cross-tab routing)
    const popupMsgs = popupMessages.filter(m => m.type === 'message' && m.payload.data?.type === 'hello-from-popup');
    expect(popupMsgs).toHaveLength(1);
  });

  it('routes opener→opened to opener panel when popup opened before DevTools', async () => {
    // Scenario: popup opened BEFORE DevTools is connected.
    // onCreatedNavigationTarget fires but the panel condition fails,
    // so openerRelationships is NOT established. Registration still flows,
    // establishing openedWindowToTab. The opener→opened cross-tab routing
    // should still work (via registration-based relationship).
    const topFrame = env.createTab({ tabId: TAB_ID, url: 'https://opener.example.com/', title: 'Opener' });

    const POPUP_TAB_ID = 2;
    // Open popup BEFORE connecting any panels
    const popupFrame = env.openPopup(topFrame, { tabId: POPUP_TAB_ID, url: 'https://popup.example.com/', title: 'Popup' });

    // NOW connect panels (after popup was already opened)
    const { messages: openerMessages } = env.connectPanel(TAB_ID);
    env.connectPanel(POPUP_TAB_ID);
    await flushPromises();

    const openerWin = topFrame.window!;
    const popupWin = popupFrame.window!;

    // Registration flows from popup to opener
    openerWin.dispatchMessage(
      { type: '__frames_inspector_register__', targetType: 'opener', frameId: 0, tabId: POPUP_TAB_ID, documentId: 'doc-f0' },
      'https://popup.example.com',
      popupWin
    );

    // Opened window sends to opener (cross-tab routing via openedWindowToTab works)
    openerWin.dispatchMessage(
      { type: 'hello-from-popup' },
      'https://popup.example.com',
      popupWin
    );
    await flushPromises();

    // Opener responds to opened window
    popupWin.dispatchMessage(
      { type: 'response', from: 'opener' },
      'https://opener.example.com',
      openerWin
    );
    await flushPromises();

    // Opener panel should show the response (cross-tab routing for opener messages)
    const openerResponseMsgs = openerMessages.filter(m =>
      m.type === 'message' && m.payload.data?.type === 'response'
    );
    expect(openerResponseMsgs).toHaveLength(1);
    expect(openerResponseMsgs[0].payload.source.type).toBe('opener');
  });

  it('includes opener in frame hierarchy for popup tabs', async () => {
    const topFrame = env.createTab({ tabId: TAB_ID, url: 'https://opener.example.com/', title: 'Opener' });
    env.connectPanel(TAB_ID);
    await flushPromises();

    const POPUP_TAB_ID = 2;
    env.openPopup(topFrame, { tabId: POPUP_TAB_ID, url: 'https://popup.example.com/', title: 'Popup' });
    await flushPromises();

    // Connect popup panel and request hierarchy
    const { port: popupPort, messages: popupMessages } = env.connectPanel(POPUP_TAB_ID);
    await flushPromises();

    popupPort.postMessage({ type: 'get-frame-hierarchy', tabId: POPUP_TAB_ID });
    await flushPromises();

    const hierarchyMsg = popupMessages.find(m => m.type === 'frame-hierarchy');
    expect(hierarchyMsg).toBeDefined();

    const frames = hierarchyMsg!.payload;
    // Should have 2 entries: the opener and the popup's own frame 0
    expect(frames).toHaveLength(2);

    const openerEntry = frames.find((f: any) => f.isOpener);
    expect(openerEntry).toBeDefined();
    expect(openerEntry.tabId).toBe(TAB_ID); // opener's tab
    expect(openerEntry.frameId).toBe(0);    // opener's frame
  });

  it('buffers messages for tabs opened from monitored tabs', async () => {
    const { topFrame } = setupTwoFrames();
    env.connectPanel(TAB_ID);
    await flushPromises();

    const POPUP_TAB_ID = 2;
    const popupFrame = env.openPopup(topFrame, { tabId: POPUP_TAB_ID, url: 'https://popup.example.com/', title: 'Popup' });
    await flushPromises();

    // Message sent before popup panel connects — should be buffered
    popupFrame.window!.dispatchMessage({ type: 'early-msg' }, 'https://popup.example.com', popupFrame.window!);

    // Now connect a panel for the popup tab
    const { messages: popupMessages } = env.connectPanel(POPUP_TAB_ID);
    await flushPromises();

    // Buffered message should have been flushed to the panel
    const msgPayloads = popupMessages.filter(m => m.type === 'message');
    expect(msgPayloads).toHaveLength(1);
    expect(msgPayloads[0].payload.data).toEqual({ type: 'early-msg' });
    expect(msgPayloads[0].payload.buffered).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Automatic frame registration tests
// These use fake timers to control the 500ms registration delay and test the
// full end-to-end flow including background-initiated registration messages.
// ---------------------------------------------------------------------------

describe('automatic frame registration', () => {
  let env: ChromeExtensionEnv;

  beforeEach(() => {
    vi.useFakeTimers();
    env = new ChromeExtensionEnv(initContentScript);
    // Leave enableFrameRegistration at default (enabled)
    initBackgroundScript(env.createBackgroundChrome());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('popup→opener message has source type "opened" and is routed to popup panel', async () => {
    const OPENER_TAB_ID = 1;
    const POPUP_TAB_ID = 2;

    const topFrame = env.createTab({ tabId: OPENER_TAB_ID, url: 'https://opener.example.com/', title: 'Opener' });
    const { messages: openerMessages } = env.connectPanel(OPENER_TAB_ID);
    await vi.advanceTimersByTimeAsync(0);

    const popupFrame = env.openPopup(topFrame, { tabId: POPUP_TAB_ID, url: 'https://popup.example.com/', title: 'Popup' });
    const { messages: popupMessages } = env.connectPanel(POPUP_TAB_ID);

    // Advance past the 500ms registration timeout and let all nested timers
    // (postMessage delivery, promise chains) complete
    await vi.advanceTimersByTimeAsync(1000);

    // Popup sends a message to opener (via the cross-origin proxy)
    const openerProxy = popupFrame.window!.opener!;
    (openerProxy as any).postMessage({ type: 'ping' }, '*');
    await vi.advanceTimersByTimeAsync(100);

    // Opener panel should show the message with source type 'opened'
    const openerPings = openerMessages.filter(m =>
      m.type === 'message' && m.payload.data?.type === 'ping'
    );
    expect(openerPings).toHaveLength(1);
    expect(openerPings[0].payload.source.type).toBe('opened');

    // Cross-tab routing: popup panel should also see the message
    const popupPings = popupMessages.filter(m =>
      m.type === 'message' && m.payload.data?.type === 'ping'
    );
    expect(popupPings).toHaveLength(1);
  });
});
