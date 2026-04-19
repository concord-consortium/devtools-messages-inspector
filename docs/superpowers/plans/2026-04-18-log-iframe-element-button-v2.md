# Log Iframe Element Button (v2: Content-Script Routing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v1 `chrome.devtools.inspectedWindow.eval` implementation of the "Log element" button with a panel→background→content-script roundtrip that targets the parent document by `documentId`. Adds support for nested iframes. When the parent document has navigated away (or `chrome.tabs.sendMessage` otherwise rejects), the failure is reported back to the panel via a `log-iframe-element-failed` port message; the panel logs a fallback message in the inspected page's console via `chrome.devtools.inspectedWindow.eval`.

**Architecture:** Panel sends a port message; background calls `chrome.tabs.sendMessage(tabId, msg, { documentId })` so Chrome targets the exact document; content script in that document runs `console.log("[messages]", document.querySelector(domPath))`. The button is enabled whenever the iframe's `parentDocument.documentId` is known.

**Tech Stack:** TypeScript + React + MobX, vitest, existing Chrome extension messaging APIs.

**Spec:** [docs/superpowers/specs/2026-04-18-log-iframe-element-button-design.md](../specs/2026-04-18-log-iframe-element-button-design.md)

**Predecessor:** v1 plan `docs/superpowers/plans/2026-04-18-log-iframe-element-button.md`. v1 commits stay on this branch as historical record; v2 supersedes the eval call, the LogElementButton's enable check, and the EndpointsView tests.

---

## File Structure

| File | Role | Status |
|------|------|--------|
| `src/types.ts` | Add `LogIframeElementMessage` to `BackgroundToContentMessage` union. | Modify |
| `src/content-core.ts` | Add `querySelector` to `ContentWindow.document` interface; handle `log-iframe-element` message. | Modify |
| `src/background-core.ts` | Allow `documentId` in `BackgroundChrome.tabs.sendMessage` options; handle `log-iframe-element` port message. | Modify |
| `src/panel/connection.ts` | Add `sendLogIframeElement(documentId, domPath)` helper. | Modify |
| `src/panel/components/EndpointsView/EndpointsView.tsx` | `logIframeElement` calls `sendLogIframeElement`; `LogElementButton`'s `canLog` checks `parentDocument.documentId`. | Modify |
| `src/panel/components/EndpointsView/EndpointsView.test.tsx` | Replace eval-based mocks with mocks of the connection helper; update enabled/disabled assertions. | Modify |

No CSS changes — v1's `.log-element-btn` styling still applies.

---

## Task 1: Types and content-script handler

**Files:**
- Modify: `src/types.ts`
- Modify: `src/content-core.ts`

Add the new message type and wire the content script to log when it receives one.

- [ ] **Step 1: Add `LogIframeElementMessage` to `src/types.ts`**

Locate the `BackgroundToContentMessage` definitions (around lines 80-97) and add a new interface plus extend the union:

```ts
export interface LogIframeElementMessage {
  type: 'log-iframe-element';
  domPath: string;
}

export type BackgroundToContentMessage =
  | SendMessageMessage
  | GetFrameInfoMessage
  | LogIframeElementMessage;
```

- [ ] **Step 2: Extend `ContentWindow.document` to declare `querySelector`**

In `src/content-core.ts`, find the `ContentWindow` interface (lines 14-26). Update the `document` property to include `querySelector`:

```ts
document: {
  title: string;
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): NodeListOf<Element>;
};
```

- [ ] **Step 3: Add the handler case to the content script's `onMessage` listener**

In the `chrome.runtime.onMessage.addListener` block in `initContentScript` (currently around lines 192-227), add a new case at the top of the listener (before the existing `send-message` case):

```ts
if (message.type === 'log-iframe-element') {
  const el = win.document.querySelector(message.domPath);
  console.log("Iframe " + message.domPath, el);
  return;
}
```

The `return` (no value, no `return true`) tells Chrome the listener handled the message synchronously and no response is needed.

- [ ] **Step 4: Build to verify TypeScript accepts the changes**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/content-core.ts
git commit -m "feat: add log-iframe-element message handler in content script"
```

---

## Task 2: Background-script port message handler

**Files:**
- Modify: `src/background-core.ts`

Wire the panel-port message to forward via `chrome.tabs.sendMessage` with `{ documentId }`.

- [ ] **Step 1: Widen `BackgroundChrome.tabs.sendMessage` options**

In `src/background-core.ts` find the `BackgroundChrome` interface (around lines 21-40). Update the `tabs.sendMessage` signature to allow `documentId`:

```ts
tabs: {
  sendMessage(tabId: number, msg: any, options?: { frameId?: number; documentId?: string }): Promise<any>;
  onRemoved: { addListener(cb: (tabId: number) => void): void };
};
```

- [ ] **Step 2: Add the port message case**

In `initBackgroundScript`, find the `port.onMessage.addListener` block (currently around lines 179-211). Add a new `else if` branch alongside the existing ones (after the `'get-frame-hierarchy'` case):

```ts
} else if (msg.type === 'log-iframe-element' && msg.tabId !== undefined && msg.documentId && msg.domPath) {
  chrome.tabs.sendMessage(
    msg.tabId,
    { type: 'log-iframe-element', domPath: msg.domPath },
    { documentId: msg.documentId },
  ).catch(e => console.debug('[Messages] log-iframe-element failed:', { tabId: msg.tabId, documentId: msg.documentId, domPath: msg.domPath }, e));
}
```

The existing handler already destructures `msg` loosely as `{ type: string; tabId?: number; value?: boolean }`. Extend that inline destructure type to add the v2 fields:

```ts
port.onMessage.addListener((msg: { type: string; tabId?: number; value?: boolean; documentId?: string; domPath?: string }) => {
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`

Expected: Build succeeds, no TS errors.

- [ ] **Step 4: Commit**

```bash
git add src/background-core.ts
git commit -m "feat: forward log-iframe-element port message to content script via documentId"
```

---

## Task 3: Connection helper

**Files:**
- Modify: `src/panel/connection.ts`

Add the panel-side helper that posts the port message. Mirrors `sendPreserveLog`.

- [ ] **Step 1: Add `sendLogIframeElement` to `connection.ts`**

After the existing `sendPreserveLog` and `requestFrameHierarchy` helpers (around lines 299-309), append:

```ts
export function sendLogIframeElement(documentId: string, domPath: string): void {
  if (port) {
    port.postMessage({ type: 'log-iframe-element', tabId: store.tabId, documentId, domPath });
  }
}
```

`port` and `store.tabId` are already in scope.

- [ ] **Step 2: Build to verify**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/panel/connection.ts
git commit -m "feat: add sendLogIframeElement connection helper"
```

---

## Task 4: Update panel `logIframeElement` and `LogElementButton`

**Files:**
- Modify: `src/panel/components/EndpointsView/EndpointsView.tsx`
- Modify: `src/panel/components/EndpointsView/EndpointsView.test.tsx`

Replace the eval-based body and update the button's enabled check.

- [ ] **Step 1: Update existing tests for the new behavior**

Open `src/panel/components/EndpointsView/EndpointsView.test.tsx`. The current test setup mocks `chrome.devtools.inspectedWindow.eval` via `vi.stubGlobal('chrome', ...)` and asserts on `evalMock`. Replace this with a mock of the connection module's `sendLogIframeElement`.

At the top of the file (after imports), replace the `chrome` stub block with mocks of the connection module. Add this import and `vi.mock` call near the imports:

```tsx
import * as connection from '../../connection';

vi.stubGlobal('chrome', {
  storage: { local: { set: vi.fn(), get: vi.fn() } },
  devtools: { inspectedWindow: { tabId: 42 } },
});

const sendSpy = vi.spyOn(connection, 'sendLogIframeElement').mockImplementation(() => {});
```

Remove the `evalMock` constant and any references to `chrome.devtools.inspectedWindow.eval` in the stub.

Update `makeIframe` to optionally take a `documentId` so tests can control whether the parent document has one. Replace the existing helper with:

```tsx
function makeIframe(domPath: string, frameId: number, documentId: string | undefined = 'doc-parent'): IFrame {
  const frame = new Frame(42, frameId, frameLookup);
  const parentDoc = new FrameDocument({ documentId });
  parentDoc.frame = frame;
  return new IFrame(parentDoc, domPath, undefined, undefined, docLookup);
}
```

Now rewrite the existing test bodies as follows:

**`describe('logIframeElement', ...)` — replace both tests with:**

```tsx
describe('logIframeElement', () => {
  beforeEach(() => {
    sendSpy.mockClear();
  });

  it('calls sendLogIframeElement with the parent documentId and domPath', () => {
    const iframe = makeIframe('iframe#hello', 0, 'doc-abc');
    logIframeElement(iframe);
    expect(sendSpy).toHaveBeenCalledWith('doc-abc', 'iframe#hello');
  });

  it('is a no-op when parentDocument has no documentId', () => {
    const iframe = makeIframe('iframe#orphan', 0, undefined);
    logIframeElement(iframe);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
```

**`describe('LogElementButton', ...)` — replace tests with:**

```tsx
describe('LogElementButton', () => {
  beforeEach(() => {
    sendSpy.mockClear();
  });

  it('renders enabled when parent document has a documentId', () => {
    const iframe = makeIframe('iframe#hello', 0, 'doc-abc');
    render(<LogElementButton iframe={iframe} />);

    const btn = screen.getByRole('button', { name: 'Log element' });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders enabled for nested iframes too', () => {
    const iframe = makeIframe('iframe#nested', 5, 'doc-nested');
    render(<LogElementButton iframe={iframe} />);

    const btn = screen.getByRole('button', { name: 'Log element' });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders disabled with tooltip when parentDocument has no documentId', () => {
    const iframe = makeIframe('iframe#orphan', 0, undefined);
    render(<LogElementButton iframe={iframe} />);

    const btn = screen.getByRole('button', { name: 'Log element' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.getAttribute('title')).toBe(
      'Parent document identity unknown — cannot target log',
    );
  });

  it('calls sendLogIframeElement on click when enabled', async () => {
    const user = userEvent.setup();
    const iframe = makeIframe('iframe#clickme', 0, 'doc-click');
    render(<LogElementButton iframe={iframe} />);

    await user.click(screen.getByRole('button', { name: 'Log element' }));

    expect(sendSpy).toHaveBeenCalledWith('doc-click', 'iframe#clickme');
  });
});
```

**`describe('NodeDetailPane "Log element" button visibility', ...)` — keep all 5 tests, but ensure each `iframe-element` and `iframe` case uses `makeIframe(..., 0, 'doc-X')` so the button is enabled (the existing tests don't check enabled state for visibility, but the no-documentId case would now show a disabled button rather than no button at all). The visibility tests are about whether the button renders for the node type, not its enabled state — so the existing assertions remain correct.

The "iframe node lacking iframeRef" test stays unchanged.

- [ ] **Step 2: Run tests to confirm they fail with the OLD implementation**

Run: `npx vitest run src/panel/components/EndpointsView/EndpointsView.test.tsx`

Expected: Tests fail. The existing `logIframeElement` calls `inspectedWindow.eval`, not `sendLogIframeElement` — so `sendSpy` never gets called. The existing `LogElementButton` checks `parentDocument.frame?.frameId === 0`, not `parentDocument.documentId`, so the disabled tooltip text mismatches.

This confirms the tests are exercising the new behavior.

- [ ] **Step 3: Update `logIframeElement` in `EndpointsView.tsx`**

Find the existing helper (added in v1, around lines 14-18):

```ts
export function logIframeElement(iframe: IFrame): void {
  const selector = JSON.stringify(iframe.domPath);
  const expression = `console.log("Iframe " + ${selector}, document.querySelector(${selector}))`;
  chrome.devtools.inspectedWindow.eval(expression);
}
```

Replace with:

```ts
export function logIframeElement(iframe: IFrame): void {
  const documentId = iframe.parentDocument.documentId;
  if (!documentId) return;
  sendLogIframeElement(documentId, iframe.domPath);
}
```

Add the import at the top of the file:

```ts
import { requestFrameHierarchy, sendLogIframeElement } from '../../connection';
```

(Modify the existing `import { requestFrameHierarchy } from '../../connection';` line.)

- [ ] **Step 4: Update `LogElementButton`'s enabled check**

Find the existing component (around lines 20-32):

```tsx
export const LogElementButton = observer(({ iframe }: { iframe: IFrame }) => {
  const canLog = iframe.parentDocument.frame?.frameId === 0;
  return (
    <button
      className="log-element-btn"
      disabled={!canLog}
      title={canLog ? undefined : 'Log element only supported for iframes directly in the top-level document'}
      onClick={() => logIframeElement(iframe)}
    >
      Log element
    </button>
  );
});
```

Replace with:

```tsx
export const LogElementButton = observer(({ iframe }: { iframe: IFrame }) => {
  const canLog = !!iframe.parentDocument.documentId;
  return (
    <button
      className="log-element-btn"
      disabled={!canLog}
      title={canLog ? undefined : 'Parent document identity unknown — cannot target log'}
      onClick={() => logIframeElement(iframe)}
    >
      Log element
    </button>
  );
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/panel/components/EndpointsView/EndpointsView.test.tsx`

Expected: All tests in this file pass (logIframeElement: 2, LogElementButton: 4, NodeDetailPane visibility: 5 = 11).

- [ ] **Step 6: Run the full unit test suite for regressions**

Run: `npm test`

Expected: All tests pass — no regressions in unrelated suites.

- [ ] **Step 7: Commit**

```bash
git add src/panel/components/EndpointsView/EndpointsView.tsx src/panel/components/EndpointsView/EndpointsView.test.tsx
git commit -m "feat: route Log element through content script with documentId targeting"
```

---

## Task 5: Manual verification in Chrome

**Files:** none

End-to-end check that the routing works.

- [ ] **Step 1: Build and reload the extension**

Run: `npm run build`

Then in Chrome: `chrome://extensions/` → reload the Messages Inspector extension.

- [ ] **Step 2: Open the test page and DevTools**

1. Open `http://localhost:5173/test/test-page.html` (`npm run dev` if not already running).
2. F12 → **Messages** tab → **Endpoints** view.

- [ ] **Step 3: Top-level iframe — log works**

Pick an IFrame node directly under the top tab/document. Click "Log element". Switch to the Console tab. You should see `Iframe iframe#... <iframe>...</iframe>` (likely with the content script's context indicator — note where Chrome shows it).

Hover the logged element to confirm it highlights on the page. Right-click → "Reveal in Elements panel" and "Store as global variable" should still work.

- [ ] **Step 4: Nested iframe — log also works**

Drill into a nested iframe (one whose parent is itself an iframe). Click "Log element". Confirm the element is logged in the inspected page's console. Note: Chrome's console may filter logs by context — if you don't see it immediately, check the console's context dropdown (top-left of the console panel).

- [ ] **Step 5: Navigated-away parent — failure log**

Trigger a navigation in the test page (e.g., the "Navigate Iframe 1 → Page 2" button) so a previously-known iframe's parent document is no longer current. Click "Log element" on the now-stale iframe. The inspected page's main-world console should show: `[messages] iframe no longer exists, containing document no longer exists` (logged via `chrome.devtools.inspectedWindow.eval` after the background's `chrome.tabs.sendMessage` rejection).

- [ ] **Step 6: No documentId — button disabled**

Find an iframe entry in the tree whose detail pane shows no Document ID (if possible — depends on what registration messages have been observed). Confirm the button is disabled with the tooltip *"Parent document identity unknown — cannot target log"*.

- [ ] **Step 7: Run e2e tests for regression check**

Run: `npx playwright test`

Expected: All 39 existing e2e tests pass.

- [ ] **Step 8: Report findings**

If everything works, the v2 feature is done. If the console output looks weird (wrong context, hard to find, etc.), report back with notes — the user explicitly wants to "try it and see how the logs look."
