// Test harness entry point — runs in a real browser via Vite dev server.
// Sets up the mock Chrome environment, initializes background + content scripts,
// then renders the panel UI. Exposes `window.harness` for console/Playwright access.

import { ChromeExtensionEnv, flushPromises } from './chrome-extension-env';
import { createPortPair } from './chrome-api';
import { initBackgroundScript } from '../background-core';
import { initContentScript } from '../content-core';
import { HarnessRuntime } from './harness-runtime';
import { HarnessActions } from './harness-actions';
import { autorun } from 'mobx';

// ---------------------------------------------------------------------------
// 1. Set up the test environment
// ---------------------------------------------------------------------------

const env = new ChromeExtensionEnv(initContentScript);

// Initialize background service worker
initBackgroundScript(env.createBackgroundChrome());

// Set up tab with parent (frameId=0) + child iframe (frameId=1)
const runtime = new HarnessRuntime(env);
const actions = new HarnessActions(runtime);
const topFrame = actions.createTab({ url: 'https://parent.example.com/', title: 'Parent Page' });
const childFrame = actions.addIframe(topFrame, { url: 'https://child.example.com/', iframeId: 'child-iframe', title: 'Child Page' });
const TAB_ID = topFrame.tab.id;
const parentWin = topFrame.window!;
const childWin = childFrame.window!;
// Content scripts are auto-injected when the panel connects (via executeScript mock)

// ---------------------------------------------------------------------------
// 2. Set up global `chrome` object for the panel code
// ---------------------------------------------------------------------------

(window as any).chrome = {
  devtools: {
    inspectedWindow: { tabId: TAB_ID },
  },
  runtime: {
    connect(options: { name: string }) {
      const [panelPort, bgPort] = createPortPair(options.name);
      env.bgOnConnect.fire(bgPort);
      return panelPort;
    },
  },
  storage: {
    local: {
      get(keys: string | string[], callback?: (result: Record<string, any>) => void) {
        const keyArr = Array.isArray(keys) ? keys : [keys];
        const result: Record<string, any> = {};
        for (const key of keyArr) {
          if (key in env.storageData) {
            result[key] = env.storageData[key];
          }
        }
        if (callback) callback(result);
        return Promise.resolve(result);
      },
      set(items: Record<string, any>) {
        Object.assign(env.storageData, items);
        return Promise.resolve();
      },
    },
  },
};

// ---------------------------------------------------------------------------
// 3. Dynamically import and render the panel
// ---------------------------------------------------------------------------

async function init() {
  const { store } = await import('../panel/store');
  const { frameStore } = await import('../panel/models');
  const { connect, requestFrameHierarchy } = await import('../panel/connection');
  const { App } = await import('../panel/components/App');
  const { createRoot } = await import('react-dom/client');

  await store.loadPersistedState();
  connect();

  const React = await import('react');
  const { HarnessBanner, HARNESS_EXAMPLES } = await import('./HarnessBanner');

  const banner = document.getElementById('harness-banner');
  if (banner) {
    createRoot(banner).render(React.createElement(HarnessBanner));
  }

  const { HarnessSidebar } = await import('./HarnessSidebar');

  const sidebar = document.getElementById('hierarchy-sidebar');
  if (sidebar) {
    createRoot(sidebar).render(React.createElement(HarnessSidebar, { runtime }));
  }

  const container = document.getElementById('root');
  if (container) {
    createRoot(container).render(React.createElement(App));
  }

  // ---------------------------------------------------------------------------
  // 4. Expose harness API on window for console / Playwright
  // ---------------------------------------------------------------------------

  (window as any).harness = {
    env,
    store,
    runtime,
    actions,
    parentWin,
    childWin,
    topFrame,
    TAB_ID,
    flushPromises,

    // Convenience: send a message from child → parent (via cross-origin proxy)
    sendChildToParent(data: any) {
      childWin.parent.postMessage(data, '*');
    },

    // Convenience: send a message from parent → child (via cross-origin proxy)
    sendParentToChild(data: any) {
      parentWin.frames[0].postMessage(data, '*');
    },

    // Request frame hierarchy refresh from background
    requestFrameHierarchy,

    // MobX utilities for testing reactivity
    autorun,

    // Frame store for diagnostics
    frameStore,
  };

  console.log(
    '%c Frames Inspector Test Harness ',
    'background: #2196F3; color: white; font-weight: bold; padding: 2px 6px; border-radius: 3px;',
    '\n\nUse window.harness to interact:\n' +
    HARNESS_EXAMPLES.map(ex => '  ' + ex).join('\n'),
  );
}

init();
