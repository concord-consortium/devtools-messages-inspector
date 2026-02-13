# Opener Support Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable cross-tab message routing between opener/openee windows, add the `openee` source type, show source tab IDs in the context pane, and improve the test page for opener scenarios.

**Architecture:** The background script maintains an opener relationship registry (from `onCreatedNavigationTarget`) and an openee window-to-tab map (from registration messages). Messages are forwarded to related tab panels. The content script tracks opened windows via a WeakSet populated from registration messages, enabling the new `openee` source type. The panel displays `tab[T].frame[N]` when the source is in a different tab.

**Tech Stack:** TypeScript, Chrome Extensions MV3, React, MobX, Vitest

---

### Task 1: Add `tabId` Fields to IMessage Type

**Files:**
- Modify: `src/types.ts`

**Step 1: Add `tabId` to the target and source type definitions**

In `src/types.ts`, update the `IMessage` interface:

```typescript
// In the target object, add after documentId:
tabId: number;

// In the source object, add after documentId:
tabId?: number;
```

The `target.tabId` is required (always known from `sender.tab.id`). The `source.tabId` is optional (only known after registration for openee/child, derived from registry for opener, same as target for parent/self/top).

**Step 2: Run tests to verify nothing breaks**

Run: `npm test`
Expected: All tests pass (no code reads these fields yet)

**Step 3: Commit**

```
feat: add tabId fields to IMessage target and source types
```

---

### Task 2: Background Script Sets `target.tabId` and `source.tabId` for Same-Tab Messages

**Files:**
- Modify: `src/background-core.ts`
- Test: `src/integration.test.ts`

**Step 1: Write failing tests**

Add to `src/integration.test.ts`:

```typescript
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
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `payload.target.tabId` is `undefined`

**Step 3: Implement in background-core.ts**

In the `onMessage` handler (the async IIFE around line 242), after building `enrichedPayload`, add:

```typescript
enrichedPayload.target.tabId = tabId;

// For same-tab source types, set source.tabId = target.tabId
const sourceType = message.payload.source.type;
if (sourceType === 'parent' || sourceType === 'self' || sourceType === 'top' || sourceType === 'child') {
  enrichedPayload.source = {
    ...enrichedPayload.source,
    tabId: tabId
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```
feat: set target.tabId and source.tabId on captured messages
```

---

### Task 3: Harness — Add Opener Proxy Wiring to `HarnessWindow` and `openPopup`

The test harness models need opener proxy support so integration tests can exercise opener/openee message flows. Currently `openPopup` creates a tab but doesn't wire up `window.opener` or cross-origin proxy pairs for the opener relationship.

**Files:**
- Modify: `src/test/harness-models.ts`
- Modify: `src/test/chrome-extension-env.ts`
- Test: `src/integration.test.ts`

**Step 1: Write a failing test**

Add to `src/integration.test.ts`:

```typescript
it('delivers an openee→opener message to the opener panel', async () => {
  const topFrame = env.createTab({ tabId: TAB_ID, url: 'https://opener.example.com/', title: 'Opener' });
  const { messages } = env.connectPanel(TAB_ID);
  await flushPromises();

  const POPUP_TAB_ID = 2;
  const popupFrame = env.openPopup(topFrame, { tabId: POPUP_TAB_ID, url: 'https://popup.example.com/', title: 'Popup' });
  await flushPromises();

  const openerWin = topFrame.window!;
  const popupWin = popupFrame.window!;

  // Popup sends a message received by opener
  openerWin.dispatchMessage(
    { type: 'hello-from-popup' },
    'https://popup.example.com',
    popupWin
  );

  const msgPayloads = messages.filter(m => m.type === 'message');
  expect(msgPayloads).toHaveLength(1);
  expect(msgPayloads[0].payload.source.type).toBe('openee');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `source.type` is `'unknown'` because opener proxy wiring is missing, and `openee` source type doesn't exist yet.

**Step 3: Add `setOpenerProxy` and openee proxy wiring to `HarnessWindow`**

In `src/test/harness-models.ts`, add to `HarnessWindow`:

```typescript
// New private field (alongside _childProxies):
private _openeeProxies = new Map<HarnessWindow, CrossOriginWindowProxy>();

// New public method:
/** Register a proxy for an opened window (for dispatchMessage source resolution). */
registerOpeneeProxy(openeeWin: HarnessWindow, proxy: CrossOriginWindowProxy): void {
  this._openeeProxies.set(openeeWin, proxy);
}

/** Set the opener relationship with a cross-origin proxy. */
setOpenerProxy(rawOpener: HarnessWindow, proxy: CrossOriginWindowProxy): void {
  this._rawOpener = rawOpener;
  this._openerProxy = proxy;
}
```

Update `dispatchMessage` to resolve opener and openee proxies (replace the `// TODO: opener translation` comment):

```typescript
// In dispatchMessage, after the childProxy and parentProxy checks:
const openeeProxy = this._openeeProxies.get(source);
if (openeeProxy) {
  resolvedSource = openeeProxy;
} else if (source === this._rawOpener && this._openerProxy) {
  resolvedSource = this._openerProxy;
}
```

**Step 4: Wire opener proxies in `ChromeExtensionEnv.openPopup`**

In `src/test/chrome-extension-env.ts`, update `openPopup` to create proxy pairs and wire opener/openee relationships:

```typescript
openPopup(sourceFrame: HarnessFrame, config: { tabId: number; url: string; title?: string }): HarnessFrame {
  // Fire onCreatedNavigationTarget first so buffering is enabled before the page load
  this.bgOnCreatedNavTarget.fire({
    sourceTabId: sourceFrame.tab.id,
    tabId: config.tabId,
    url: config.url,
  });

  const popupFrame = this.createTab(config);

  // Wire opener/openee proxy pair
  const openerWin = sourceFrame.window!;
  const popupWin = popupFrame.window!;
  const { aForB: openerProxyForPopup, bForA: popupProxyForOpener } =
    createProxyPair(openerWin, popupWin);

  popupWin.setOpenerProxy(openerWin, openerProxyForPopup);
  openerWin.registerOpeneeProxy(popupWin, popupProxyForOpener);

  return popupFrame;
}
```

Also add the import of `createProxyPair` from `./harness-models` if not already imported (check — it's imported via `./chrome-api` re-exports but `createProxyPair` is defined in `harness-models.ts`).

**Step 5: Run tests**

Run: `npm test`
Expected: Still FAIL — the test expects `source.type === 'openee'` but the content script doesn't know about `openee` yet. However, verify it no longer throws errors about missing proxy wiring.

**Step 6: Commit the harness changes (partial progress is fine)**

```
feat: add opener/openee proxy wiring to test harness models
```

---

### Task 4: Content Script — `openee` Source Type

**Files:**
- Modify: `src/content-core.ts`
- Test: `src/integration.test.ts` (the test from Task 3 should now pass)

**Step 1: The failing test from Task 3 already exists**

The test `delivers an openee→opener message to the opener panel` should still be failing with `source.type === 'unknown'`.

**Step 2: Add `openee` tracking to content-core.ts**

In `initContentScript`, add a WeakSet to track opened windows:

```typescript
// After the sourceWindows WeakMap declaration:
const openedWindows = new WeakSet<object>();
```

In the message event listener (around line 210), when a registration message with `targetType: 'opener'` is received, add `event.source` to the set:

```typescript
if (event.data?.type === '__frames_inspector_register__') {
  event.stopImmediatePropagation();
  if (event.data.targetType === 'opener' && event.source) {
    openedWindows.add(event.source);
  }
}
```

In `getSourceRelationship`, add the check before the `return 'unknown'` fallthrough:

```typescript
// After the frames loop, before return 'unknown':
if (openedWindows.has(eventSource)) return 'openee';
```

**Step 3: Run tests**

Run: `npm test`
Expected: The test from Task 3 may still fail because the `openee` type requires a registration message to arrive first. The test dispatches a message directly without going through the registration flow. We need to enable frame registration in this test or simulate the registration.

**Step 4: Update the test to enable registration**

The test needs frame registration enabled so the popup's content script sends a `__frames_inspector_register__` message to the opener. Update the test:

```typescript
it('delivers an openee→opener message to the opener panel', async () => {
  // Need registration enabled so popup registers with opener
  env.storageData.enableFrameRegistration = true;

  const topFrame = env.createTab({ tabId: TAB_ID, url: 'https://opener.example.com/', title: 'Opener' });
  const { messages } = env.connectPanel(TAB_ID);
  await flushPromises();

  const POPUP_TAB_ID = 2;
  const popupFrame = env.openPopup(topFrame, { tabId: POPUP_TAB_ID, url: 'https://popup.example.com/', title: 'Popup' });
  // Wait for registration message to flow: content script → postMessage → opener content script
  await flushPromises();
  // Registration is sent with 500ms setTimeout, need to advance timers or wait
  // Use vi.useFakeTimers() or increase flush

  const openerWin = topFrame.window!;
  const popupWin = popupFrame.window!;

  // Popup sends a message received by opener
  openerWin.dispatchMessage(
    { type: 'hello-from-popup' },
    'https://popup.example.com',
    popupWin
  );

  const msgPayloads = messages.filter(m => m.type === 'message');
  // Filter out registration messages
  const nonRegMsgs = msgPayloads.filter(m => m.payload.data?.type !== '__frames_inspector_register__');
  expect(nonRegMsgs).toHaveLength(1);
  expect(nonRegMsgs[0].payload.source.type).toBe('openee');
});
```

Note: The 500ms `setTimeout` in `content-core.ts` for sending registration messages will need fake timers or a reduced delay for testing. Use `vi.useFakeTimers()` and `vi.advanceTimersByTime(500)` to handle this, then switch back with `vi.useRealTimers()` before `flushPromises()`.

**Step 5: Run tests**

Run: `npm test`
Expected: PASS

**Step 6: Commit**

```
feat: add openee source type for messages from opened windows
```

---

### Task 5: Background Script — Opener Relationship Registry

**Files:**
- Modify: `src/background-core.ts`
- Test: `src/integration.test.ts`

**Step 1: Write failing test for opener-type cross-tab routing**

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — opener panel doesn't receive the message

**Step 3: Add `openerRelationships` registry to background-core.ts**

Add after the existing data structure declarations (around line 56):

```typescript
// Bidirectional opener relationships: tabId -> Set of related tabIds
const openerRelationships = new Map<number, Set<number>>();
```

Update the `onCreatedNavigationTarget` handler to record the relationship only when monitored:

```typescript
chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
  const sourceTabId = details.sourceTabId;
  const newTabId = details.tabId;

  if (panelConnections.has(sourceTabId) || bufferingEnabledTabs.has(sourceTabId)) {
    bufferingEnabledTabs.add(newTabId);

    // Record bidirectional opener relationship
    if (!openerRelationships.has(sourceTabId)) {
      openerRelationships.set(sourceTabId, new Set());
    }
    openerRelationships.get(sourceTabId)!.add(newTabId);

    if (!openerRelationships.has(newTabId)) {
      openerRelationships.set(newTabId, new Set());
    }
    openerRelationships.get(newTabId)!.add(sourceTabId);
  }
});
```

Clean up in the tab removed handler:

```typescript
chrome.tabs.onRemoved.addListener((tabId: number) => {
  messageBuffers.delete(tabId);
  bufferingEnabledTabs.delete(tabId);
  injectedFrames.delete(tabId);

  // Clean up opener relationships
  const related = openerRelationships.get(tabId);
  if (related) {
    for (const relatedTabId of related) {
      openerRelationships.get(relatedTabId)?.delete(tabId);
    }
    openerRelationships.delete(tabId);
  }
});
```

**Step 4: Add cross-tab routing for `opener`-type messages**

In the `onMessage` handler, after the existing panel send/buffer logic, add routing for opener messages. When `source.type === 'opener'`, look up the related tabs and forward:

```typescript
// After the existing panel/buffer logic:
// Cross-tab routing for opener-type messages
if (enrichedPayload.source.type === 'opener') {
  const relatedTabs = openerRelationships.get(tabId);
  if (relatedTabs) {
    for (const relatedTabId of relatedTabs) {
      const relatedPanel = panelConnections.get(relatedTabId);
      if (relatedPanel) {
        relatedPanel.postMessage({
          type: 'message',
          payload: enrichedPayload
        });
      }
    }
  }
}
```

Also set `source.tabId` for opener messages using the relationship:

```typescript
// In the source.tabId setting logic:
if (sourceType === 'opener') {
  const relatedTabs = openerRelationships.get(tabId);
  if (relatedTabs) {
    // The opener tab is the related tab (popup's related tab is its opener)
    for (const relatedTabId of relatedTabs) {
      enrichedPayload.source = {
        ...enrichedPayload.source,
        tabId: relatedTabId
      };
      break; // Each tab has at most one opener
    }
  }
}
```

**Step 5: Run tests**

Run: `npm test`
Expected: PASS

**Step 6: Commit**

```
feat: add opener relationship registry and cross-tab routing for opener messages
```

---

### Task 6: Background Script — `openeeWindowToTab` Registry and Cross-Tab Routing for Openee Messages

**Files:**
- Modify: `src/background-core.ts`
- Test: `src/integration.test.ts`

**Step 1: Write failing test**

```typescript
it('routes openee→opener messages to the openee tab panel', async () => {
  env.storageData.enableFrameRegistration = true;

  const topFrame = env.createTab({ tabId: TAB_ID, url: 'https://opener.example.com/', title: 'Opener' });
  const { messages: openerMessages } = env.connectPanel(TAB_ID);
  await flushPromises();

  const POPUP_TAB_ID = 2;
  const popupFrame = env.openPopup(topFrame, { tabId: POPUP_TAB_ID, url: 'https://popup.example.com/', title: 'Popup' });
  // Wait for registration flow
  await flushPromises();
  // Advance timers for the 500ms registration delay if using fake timers

  // Connect popup panel too
  const { messages: popupMessages } = env.connectPanel(POPUP_TAB_ID);
  await flushPromises();

  const openerWin = topFrame.window!;
  const popupWin = popupFrame.window!;

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
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — popup panel doesn't receive the message

**Step 3: Add `openeeWindowToTab` registry**

In `background-core.ts`, add after the `openerRelationships` declaration:

```typescript
// Maps "${capturingTabId}:${windowId}" to the openee's tab info
const openeeWindowToTab = new Map<string, { tabId: number; frameId: number }>();
```

In the `onMessage` handler, detect registration messages and populate the map:

```typescript
// After building enrichedPayload, before the panel send logic:
// Extract openee registration data for cross-tab routing
if (message.payload.data?.type === '__frames_inspector_register__'
    && message.payload.data?.targetType === 'opener'
    && message.payload.source.windowId) {
  const regData = message.payload.data;
  const key = `${tabId}:${message.payload.source.windowId}`;
  openeeWindowToTab.set(key, { tabId: regData.tabId, frameId: regData.frameId });
}
```

**Step 4: Add cross-tab routing for openee messages**

In the `onMessage` handler, after the opener routing block:

```typescript
// Cross-tab routing for openee-type messages
if (enrichedPayload.source.type === 'openee' && message.payload.source.windowId) {
  const key = `${tabId}:${message.payload.source.windowId}`;
  const openeeInfo = openeeWindowToTab.get(key);
  if (openeeInfo) {
    enrichedPayload.source = {
      ...enrichedPayload.source,
      tabId: openeeInfo.tabId
    };
    const relatedPanel = panelConnections.get(openeeInfo.tabId);
    if (relatedPanel) {
      relatedPanel.postMessage({
        type: 'message',
        payload: enrichedPayload
      });
    }
  }
}
```

**Step 5: Run tests**

Run: `npm test`
Expected: PASS

**Step 6: Commit**

```
feat: add openeeWindowToTab registry and cross-tab routing for openee messages
```

---

### Task 7: Direction Icon for `openee`

**Files:**
- Modify: `src/panel/store.ts`

**Step 1: Add `openee` to direction icon map**

In `getDirectionIcon` (around line 152), add:

```typescript
case 'openee': return '→';
```

**Step 2: Run tests**

Run: `npm test`
Expected: PASS

**Step 3: Commit**

```
feat: add direction icon for openee source type
```

---

### Task 8: Context Pane — Display Source Tab ID

**Files:**
- Modify: `src/panel/components/shared/FrameDetail.tsx`
- Modify: `src/panel/field-info.ts`

**Step 1: Add `tabId` field info entry**

In `src/panel/field-info.ts`, add to `FIELD_INFO`:

```typescript
tabId: {
  label: 'Tab',
  description: 'The Chrome tab ID of the window.',
  technical: 'Set by the background script from sender.tab.id or the opener relationship registry.',
  filter: null
},
```

**Step 2: Update FrameDetail to show `tab[T].frame[N]` when cross-tab**

In `src/panel/components/shared/FrameDetail.tsx`, update the frameId display. Replace the existing frameId field rendering:

```typescript
{frame && (
  <Field id="frameId">
    {frame.tabId !== store.tabId
      ? `tab[${frame.tabId}].frame[${frame.frameId}]`
      : `frame[${frame.frameId}]`}
  </Field>
)}
```

**Step 3: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS

**Step 4: Commit**

```
feat: show tab[T].frame[N] in context pane for cross-tab messages
```

---

### Task 9: Test Page — Opener Detection and Response Capability

**Files:**
- Modify: `test/test-page.html`

**Step 1: Add opener detection section**

In `test/test-page.html`, add a new controls section after the "Popup Testing" section that's conditionally visible when `window.opener` exists:

```html
<div class="controls" id="opener-controls" style="display: none">
  <h3>Opener Communication</h3>
  <button onclick="sendToOpener('ping')">Send ping to opener</button>
  <button onclick="sendToOpener('data')">Send data to opener</button>
  <span id="opener-status"></span>
</div>
```

**Step 2: Add received message log and respond capability**

Add after the opener controls:

```html
<div class="controls">
  <h3>Received Messages</h3>
  <button onclick="respondToLastMessage()" id="respond-btn" disabled>Respond to last message</button>
  <span id="respond-status"></span>
  <div class="log" id="message-log" style="font-family: monospace; font-size: 12px; margin-top: 10px; max-height: 200px; overflow-y: auto;"></div>
</div>
```

**Step 3: Add the JavaScript**

In the `<script>` section:

```javascript
// Opener detection
if (window.opener) {
  document.getElementById('opener-controls').style.display = '';
}

function sendToOpener(type) {
  if (window.opener) {
    window.opener.postMessage({ type, from: 'opened-page', timestamp: performance.now() }, '*');
    document.getElementById('opener-status').textContent = 'Sent ' + type;
  }
}

// Message logging and response
let lastMessageSource = null;
let lastMessageOrigin = null;

// Update the existing message listener to also log and track source
window.addEventListener('message', (e) => {
  // Existing popup-ready handling stays
  if (e.data.type === 'popup-ready') {
    document.getElementById('popup-status').textContent =
      'Popup ready (' + e.data.timing + ' at ' + e.data.timestamp.toFixed(2) + 'ms)';
  }

  // Log all received messages
  const logEl = document.getElementById('message-log');
  logEl.textContent += JSON.stringify(e.data) + '\n';
  logEl.scrollTop = logEl.scrollHeight;

  // Track last message source for responding
  if (e.source && e.source !== window) {
    lastMessageSource = e.source;
    lastMessageOrigin = e.origin;
    document.getElementById('respond-btn').disabled = false;
    document.getElementById('respond-status').textContent = 'Ready to respond (from ' + e.origin + ')';
  }
});

function respondToLastMessage() {
  if (lastMessageSource) {
    lastMessageSource.postMessage(
      { type: 'response', from: location.origin, timestamp: performance.now() },
      lastMessageOrigin || '*'
    );
    document.getElementById('respond-status').textContent = 'Response sent to ' + lastMessageOrigin;
  }
}
```

Note: The existing `window.addEventListener('message', ...)` handler (lines 96-101) should be merged with the new one — don't add a second listener. Combine the popup-ready check with the logging/response tracking in a single listener.

**Step 4: Test manually**

- Run `cd test && python -m http.server 8000`
- Open `http://localhost:8000/test-page.html`
- Click "Open in New Tab (with opener)" link
- In the opened tab, the "Opener Communication" section should be visible
- Click "Send ping to opener" — the opener tab should show the message in its log
- In the opener tab, click "Respond to last message"
- The opened tab should see the response in its log

**Step 5: Commit**

```
feat: add opener controls and message response to test page
```

---

### Task 10: Update Filter and Column Display for `openee`

**Files:**
- Modify: `src/panel/store.ts`
- Modify: `src/panel/field-info.ts`

**Step 1: Update sourceType field info**

In `src/panel/field-info.ts`, update the `sourceType` entry's filter example:

```typescript
sourceType: {
  label: 'Source Type',
  description: 'The relationship between the sender and receiver windows.',
  technical: 'Determined by comparing event.source to window.parent, window.opener, opened windows, and child frames.',
  filter: 'sourceType:parent'
},
```

**Step 2: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS

**Step 3: Commit**

```
feat: update field info descriptions for openee source type
```

---

### Task 11: End-to-End Verification

**Step 1: Build the extension**

Run: `npm run build`

**Step 2: Run all tests**

Run: `npm test`
Expected: All pass

**Step 3: Run e2e tests**

Run: `npm run test:e2e`
Expected: All pass (existing tests should not be affected)

**Step 4: Manual verification with real browser**

1. Load `dist/` as unpacked extension in Chrome
2. Open test page, open DevTools → Frames panel
3. Click "Open Popup" → verify messages from popup show as `openee` type in opener's panel
4. Click "Open in New Tab (with opener)" → verify opener controls appear
5. Send messages back and forth → verify they appear in both panels
6. Check context pane → verify `tab[T].frame[N]` format for cross-tab messages

**Step 5: Commit any fixes from manual testing**
