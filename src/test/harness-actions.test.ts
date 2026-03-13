import { describe, it, expect, beforeEach } from 'vitest';
import { ChromeExtensionEnv } from './chrome-extension-env';
import { HarnessRuntime } from './harness-runtime';
import { HarnessActions } from './harness-actions';
import { initContentScript } from '../content-core';

describe('HarnessActions', () => {
  let env: ChromeExtensionEnv;
  let runtime: HarnessRuntime;
  let actions: HarnessActions;

  beforeEach(() => {
    env = new ChromeExtensionEnv(initContentScript);
    runtime = new HarnessRuntime(env);
    actions = new HarnessActions(runtime);
  });

  describe('createTab', () => {
    it('creates a tab and returns the top frame', () => {
      const topFrame = actions.createTab({ url: 'https://example.com/', title: 'Test' });

      expect(topFrame).toBeDefined();
      expect(topFrame.frameId).toBe(0);
      expect(topFrame.parentFrameId).toBe(-1);
      expect(topFrame.window).toBeDefined();
      expect(topFrame.window!.location.href).toBe('https://example.com/');
      expect(topFrame.currentDocument?.title).toBe('Test');
    });

    it('registers the tab with the env', () => {
      const topFrame = actions.createTab({ url: 'https://example.com/' });
      expect(runtime.getTab(topFrame.tab.id)).toBeDefined();
    });

    it('auto-assigns tab IDs', () => {
      const frame1 = actions.createTab({ url: 'https://a.example.com/' });
      const frame2 = actions.createTab({ url: 'https://b.example.com/' });
      expect(frame1.tab.id).not.toBe(frame2.tab.id);
    });
  });

  describe('addIframe', () => {
    it('adds an iframe and returns the child frame', () => {
      const topFrame = actions.createTab({ url: 'https://parent.example.com/' });
      const childFrame = actions.addIframe(topFrame, { url: 'https://child.example.com/' });

      expect(childFrame).toBeDefined();
      expect(childFrame.parentFrameId).toBe(0);
      expect(childFrame.window).toBeDefined();
      expect(childFrame.window!.location.href).toBe('https://child.example.com/');
    });

    it('wires cross-origin proxy pair', () => {
      const topFrame = actions.createTab({ url: 'https://parent.example.com/' });
      const childFrame = actions.addIframe(topFrame, { url: 'https://child.example.com/' });

      expect(childFrame.window!.parent).not.toBe(childFrame.window);
      expect(childFrame.window!.parent.origin).toBe('https://parent.example.com');
      expect(topFrame.window!.frames.length).toBe(1);
    });

    it('sets iframe element id when iframeId config provided', () => {
      const topFrame = actions.createTab({ url: 'https://parent.example.com/' });
      actions.addIframe(topFrame, { url: 'https://child.example.com/', iframeId: 'my-iframe' });

      const iframeEl = topFrame.window!.document.querySelectorAll('iframe')[0];
      expect(iframeEl.id).toBe('my-iframe');
    });

    it('sets title on the child document', () => {
      const topFrame = actions.createTab({ url: 'https://parent.example.com/' });
      const childFrame = actions.addIframe(topFrame, {
        url: 'https://child.example.com/', title: 'Child Page',
      });

      expect(childFrame.currentDocument?.title).toBe('Child Page');
    });
  });

  describe('openPopup', () => {
    it('opens a popup with opener proxy wiring', () => {
      const topFrame = actions.createTab({ url: 'https://opener.example.com/' });
      const popupFrame = actions.openPopup(topFrame, { url: 'https://popup.example.com/' });

      expect(popupFrame).toBeDefined();
      expect(popupFrame.window!.opener).not.toBeNull();
      expect(popupFrame.window!.opener!.origin).toBe('https://opener.example.com');
    });

    it('uses the provided URL (not auto-generated)', () => {
      const topFrame = actions.createTab({ url: 'https://opener.example.com/' });
      const popupFrame = actions.openPopup(topFrame, { url: 'https://popup.example.com/', title: 'Popup' });

      expect(popupFrame.window!.location.href).toBe('https://popup.example.com/');
      expect(popupFrame.currentDocument?.url).toBe('https://popup.example.com/');
      expect(popupFrame.currentDocument?.title).toBe('Popup');
    });

    it('creates an independent tab', () => {
      const topFrame = actions.createTab({ url: 'https://opener.example.com/' });
      const popupFrame = actions.openPopup(topFrame, { url: 'https://popup.example.com/' });
      expect(popupFrame.tab.id).not.toBe(topFrame.tab.id);
    });
  });

  describe('navigate', () => {
    it('updates the frame document and window location', () => {
      const topFrame = actions.createTab({ url: 'https://example.com/' });
      actions.navigate(topFrame, 'https://example.com/new-page', 'New Page');

      expect(topFrame.currentDocument?.url).toBe('https://example.com/new-page');
      expect(topFrame.currentDocument?.title).toBe('New Page');
      expect(topFrame.window!.location.href).toBe('https://example.com/new-page');
    });

    it('fires bgOnCommitted with the correct URL', () => {
      const topFrame = actions.createTab({ url: 'https://example.com/' });

      const committedUrls: string[] = [];
      env.bgOnCommitted.addListener((d: any) => committedUrls.push(d.url));

      actions.navigate(topFrame, 'https://example.com/page2');

      // Should see exactly one onCommitted with the requested URL (not auto-generated)
      const page2Commits = committedUrls.filter(u => u === 'https://example.com/page2');
      expect(page2Commits).toHaveLength(1);
    });
  });
});
