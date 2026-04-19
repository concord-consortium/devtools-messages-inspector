// Integration test for the log-iframe-element message flow:
// panel port → background → chrome.tabs.sendMessage({ documentId }) → content script.
// Also covers the failure path where the targeted document is gone, in which case
// the background reports the underlying error back to the panel via
// log-iframe-element-failed.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChromeExtensionEnv, flushPromises } from './test/chrome-extension-env';
import { HarnessRuntime } from './test/harness-runtime';
import { initBackgroundScript } from './background-core';
import { initContentScript } from './content-core';

describe('log-iframe-element message flow', () => {
  let env: ChromeExtensionEnv;
  let runtime: HarnessRuntime;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    env = new ChromeExtensionEnv(initContentScript);
    env.storageData.enableFrameRegistration = false;
    runtime = new HarnessRuntime(env);
    initBackgroundScript(env.createBackgroundChrome());
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function setupTab() {
    runtime.materializeTree({
      type: 'tab', tabId: 1,
      frames: [{
        type: 'frame', frameId: 0,
        documents: [{
          type: 'document', documentId: 'doc-1',
          url: 'https://parent.example.com/', origin: 'https://parent.example.com',
        }],
      }],
    });
  }

  it('forwards a successful log-iframe-element to the targeted document', async () => {
    setupTab();
    const { port } = env.connectPanel(1);
    await flushPromises();

    port.postMessage({
      type: 'log-iframe-element',
      tabId: 1,
      documentId: 'doc-1',
      domPath: 'iframe',
    });
    await flushPromises();

    // Content script in doc-1's frame logs via the global console.log.
    // querySelector('iframe') in the harness's detached container returns null,
    // so the handler logs the "can't find" branch — but with the [messages]
    // prefix that confirms the message was routed correctly.
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[messages] can't find iframe element at iframe"),
    );
  });

  it('reports failure to panel when the documentId no longer matches a live document', async () => {
    setupTab();
    const { port, messages } = env.connectPanel(1);
    await flushPromises();

    port.postMessage({
      type: 'log-iframe-element',
      tabId: 1,
      documentId: 'stale-doc-id',
      domPath: 'iframe',
    });
    await flushPromises();

    const failure = messages.find(m => m.type === 'log-iframe-element-failed');
    expect(failure).toBeDefined();
    expect(failure.error).toBe('Could not establish connection. Receiving end does not exist.');
    // No false-positive [messages] log
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('[messages]'));
  });
});
