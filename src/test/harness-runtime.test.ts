import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChromeExtensionEnv, flushPromises } from './chrome-extension-env';
import { HarnessRuntime } from './harness-runtime';
import { initContentScript } from '../content-core';
import { initBackgroundScript } from '../background-core';
import type { TabNode } from '../hierarchy/types';

describe('HarnessRuntime', () => {
  let env: ChromeExtensionEnv;
  let runtime: HarnessRuntime;

  beforeEach(() => {
    env = new ChromeExtensionEnv(initContentScript);
    env.storageData.enableFrameRegistration = false;
    runtime = new HarnessRuntime(env);
  });

  // -------------------------------------------------------------------------
  // materializeTree
  // -------------------------------------------------------------------------

  describe('materializeTree', () => {
    it('creates harness objects for a simple tab + frame + iframe tree', () => {
      const tree: TabNode = {
        type: 'tab',
        tabId: 1,
        frames: [{
          type: 'frame',
          frameId: 0,
          documents: [{
            type: 'document',
            documentId: 'doc-1',
            url: 'https://parent.example.com/',
            origin: 'https://parent.example.com',
            iframes: [{
              type: 'iframe',
              iframeId: 1,
              frame: {
                type: 'frame',
                frameId: 1,
                documents: [{
                  type: 'document',
                  documentId: 'doc-2',
                  url: 'https://child.example.com/',
                  origin: 'https://child.example.com',
                }],
              },
            }],
          }],
        }],
      };

      runtime.materializeTree(tree);

      // Tab created
      const tab = runtime.getTab(1);
      expect(tab).toBeDefined();
      expect(tab!.id).toBe(1);

      // Top frame
      const topFrame = runtime.getFrame(0);
      expect(topFrame).toBeDefined();
      expect(topFrame!.frameId).toBe(0);
      expect(topFrame!.parentFrameId).toBe(-1);
      expect(topFrame!.currentDocument?.url).toBe('https://parent.example.com/');
      expect(topFrame!.window?.location.origin).toBe('https://parent.example.com');

      // Child frame
      const childFrame = runtime.getFrame(1);
      expect(childFrame).toBeDefined();
      expect(childFrame!.frameId).toBe(1);
      expect(childFrame!.parentFrameId).toBe(0);
      expect(childFrame!.currentDocument?.url).toBe('https://child.example.com/');
      expect(childFrame!.window?.location.origin).toBe('https://child.example.com');

      // Proxy pair: child's parent should be a proxy
      const childWin = childFrame!.window!;
      const parentProxy = childWin.parent;
      expect(parentProxy).not.toBe(childWin); // parent is not self
      expect(parentProxy.origin).toBe('https://parent.example.com');

      // Parent can see child via frames
      const parentWin = topFrame!.window!;
      expect(parentWin.frames.length).toBe(1);

      // Tab is registered with env (can be looked up)
      expect(tab!.frames.size).toBe(2);
    });

    it('wires opener proxies for popup tabs', () => {
      const trees: TabNode[] = [
        {
          type: 'tab',
          tabId: 1,
          frames: [{
            type: 'frame',
            frameId: 0,
            documents: [{
              type: 'document',
              documentId: 'doc-1',
              url: 'https://opener.example.com/',
              origin: 'https://opener.example.com',
            }],
          }],
        },
        {
          type: 'tab',
          tabId: 2,
          openerTabId: 1,
          openerFrameId: 0,
          frames: [{
            type: 'frame',
            frameId: 2,
            documents: [{
              type: 'document',
              documentId: 'doc-2',
              url: 'https://popup.example.com/',
              origin: 'https://popup.example.com',
            }],
          }],
        },
      ];

      runtime.materializeTree(trees);

      const openerWin = runtime.getWindow(0)!;
      const popupWin = runtime.getWindow(2)!;

      // Popup's opener is a proxy pointing to opener's origin
      const openerProxy = popupWin.opener;
      expect(openerProxy).not.toBeNull();
      expect(openerProxy!.origin).toBe('https://opener.example.com');
    });
  });

  // -------------------------------------------------------------------------
  // dispatch
  // -------------------------------------------------------------------------

  describe('dispatch', () => {
    function setupSingleTab(): void {
      runtime.materializeTree({
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
      });
    }

    it('add-iframe creates child frame, window, proxy pair, and iframe DOM element', () => {
      setupSingleTab();

      const { events } = runtime.dispatch({ type: 'add-iframe', documentId: 'doc-1' });

      // Two events: iframeAdded + onCommitted
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('iframeAdded');
      expect(events[1].type).toBe('onCommitted');

      // Child frame was materialized
      const iframeAddedEvent = events[0] as any;
      const childFrameId = iframeAddedEvent.frameId;
      const childFrame = runtime.getFrame(childFrameId);
      expect(childFrame).toBeDefined();
      expect(childFrame!.parentFrameId).toBe(0);
      expect(childFrame!.window).toBeDefined();

      // Proxy pair wired
      const childWin = childFrame!.window!;
      const parentProxy = childWin.parent;
      expect(parentProxy).not.toBe(childWin);

      // Iframe DOM element in parent
      const parentWin = runtime.getWindow(0)!;
      expect(parentWin.frames.length).toBe(1);
    });

    it('add-iframe fires onCommitted via bgOnCommitted', () => {
      setupSingleTab();

      const committedEvents: any[] = [];
      env.bgOnCommitted.addListener((details: any) => committedEvents.push(details));

      runtime.dispatch({ type: 'add-iframe', documentId: 'doc-1' });

      // There should be a committed event for the new child frame
      // (bgOnCommitted was also fired during materializeTree for the top frame)
      const childCommitted = committedEvents.find(e => e.frameId !== 0);
      expect(childCommitted).toBeDefined();
      expect(childCommitted.tabId).toBe(1);
    });

    it('open-tab creates new tab, frame, window, and opener proxies', () => {
      setupSingleTab();

      const { events } = runtime.dispatch({ type: 'open-tab', tabId: 1, frameId: 0 });

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('onTabCreated');
      expect(events[1].type).toBe('onCreatedNavigationTarget');
      expect(events[2].type).toBe('onCommitted');

      const navTargetEvent = events[1] as any;
      const newTabId = navTargetEvent.tabId;

      const newTab = runtime.getTab(newTabId);
      expect(newTab).toBeDefined();

      const newFrame = newTab!.getFrame(0);
      expect(newFrame).toBeDefined();
      expect(newFrame!.window).toBeDefined();

      const popupWin = newFrame!.window!;
      expect(popupWin.opener).not.toBeNull();
      expect(popupWin.opener!.origin).toBe('https://page-1.example.com');
    });

    it('open-tab fires onCreatedNavigationTarget and onCommitted', () => {
      setupSingleTab();

      const navTargetEvents: any[] = [];
      const committedEvents: any[] = [];
      env.bgOnCreatedNavTarget.addListener((d: any) => navTargetEvents.push(d));
      env.bgOnCommitted.addListener((d: any) => committedEvents.push(d));

      runtime.dispatch({ type: 'open-tab', tabId: 1, frameId: 0 });

      expect(navTargetEvents).toHaveLength(1);
      expect(navTargetEvents[0].sourceTabId).toBe(1);
      expect(navTargetEvents[0].sourceFrameId).toBe(0);

      // onCommitted fired for the new tab's frame
      const newTabCommitted = committedEvents.find(e => e.tabId === navTargetEvents[0].tabId);
      expect(newTabCommitted).toBeDefined();
    });

    it('create-tab creates new tab, frame, window (no opener proxies)', () => {
      setupSingleTab();

      const { events } = runtime.dispatch({
        type: 'create-tab', url: 'https://new-tab.example.com/', title: 'New Tab',
      });

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('onTabCreated');
      expect(events[1].type).toBe('onCommitted');

      const tabCreatedEvent = events[0] as any;
      const newTabId = tabCreatedEvent.tabId;

      const newTab = runtime.getTab(newTabId);
      expect(newTab).toBeDefined();

      const newFrame = newTab!.getFrame(0);
      expect(newFrame).toBeDefined();
      expect(newFrame!.window).toBeDefined();
      expect(newFrame!.window!.location.href).toBe('https://new-tab.example.com/');
      expect(newFrame!.currentDocument?.title).toBe('New Tab');

      expect(newFrame!.window!.opener).toBeNull();
    });

    it('navigate-frame updates document and location, fires onCommitted', () => {
      setupSingleTab();

      const committedEvents: any[] = [];
      env.bgOnCommitted.addListener((d: any) => committedEvents.push(d));

      const { events } = runtime.dispatch({ type: 'navigate-frame', frameId: 0 });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('onCommitted');

      const frame = runtime.getFrame(0)!;
      // URL should be updated to the new page
      const newUrl = (events[0] as any).url;
      expect(frame.currentDocument?.url).toBe(newUrl);
      expect(frame.window?.location.href).toBe(newUrl);

      // bgOnCommitted fired
      expect(committedEvents.length).toBeGreaterThan(0);
      expect(committedEvents[committedEvents.length - 1].url).toBe(newUrl);
    });

    it('close-tab fires onTabRemoved', () => {
      setupSingleTab();

      const removedTabIds: number[] = [];
      env.bgOnTabRemoved.addListener((id: number) => removedTabIds.push(id));

      const { events } = runtime.dispatch({ type: 'close-tab', tabId: 1 });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('onTabRemoved');
      expect(removedTabIds).toEqual([1]);
    });

    it('logs actions to actionLog', () => {
      setupSingleTab();

      runtime.dispatch({ type: 'add-iframe', documentId: 'doc-1' });
      runtime.dispatch({ type: 'navigate-frame', frameId: 0 });

      expect(runtime.actionLog).toHaveLength(2);
      expect(runtime.actionLog[0].action.type).toBe('add-iframe');
      expect(runtime.actionLog[0].events).toHaveLength(2);
      expect(runtime.actionLog[1].action.type).toBe('navigate-frame');
    });
  });

  // -------------------------------------------------------------------------
  // Integration: runtime + env + background + content scripts
  // -------------------------------------------------------------------------

  describe('integration with background and content scripts', () => {
    it('dispatch add-iframe, connect panel, verify content script injection', async () => {
      initBackgroundScript(env.createBackgroundChrome());

      runtime.materializeTree({
        type: 'tab',
        tabId: 1,
        frames: [{
          type: 'frame',
          frameId: 0,
          documents: [{
            type: 'document',
            documentId: 'doc-1',
            url: 'https://parent.example.com/',
            origin: 'https://parent.example.com',
          }],
        }],
      });

      // Connect panel — triggers content script injection for existing frames
      const { messages } = env.connectPanel(1);
      await flushPromises();

      // Dispatch add-iframe — background sees onCommitted and injects content script
      runtime.dispatch({ type: 'add-iframe', documentId: 'doc-1' });
      await flushPromises();

      // Now simulate a cross-origin message: child → parent
      const parentWin = runtime.getWindow(0)!;
      const childFrameId = runtime.hierarchyState.nextFrameId - 1;
      const childWin = runtime.getWindow(childFrameId)!;

      parentWin.dispatchMessage(
        { type: 'hello-from-child' },
        childWin.location.origin,
        childWin,
      );
      await flushPromises();

      const msgPayloads = messages.filter(m => m.type === 'message');
      expect(msgPayloads).toHaveLength(1);
      expect(msgPayloads[0].payload.data).toEqual({ type: 'hello-from-child' });
      expect(msgPayloads[0].payload.source.type).toBe('child');
    });
  });
});
