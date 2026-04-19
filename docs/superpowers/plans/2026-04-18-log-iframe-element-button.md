# Log Iframe Element Button Implementation Plan

> **SUPERSEDED.** This v1 plan describes the original `chrome.devtools.inspectedWindow.eval`-based approach. The implementation was rewritten before merge to route through the content script — see [`2026-04-18-log-iframe-element-button-v2.md`](2026-04-18-log-iframe-element-button-v2.md). The v1 commits are still in the branch history for context, but readers implementing or testing should use the v2 plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Log element" button to the Endpoints view's iframe details pane that logs the iframe's DOM element to the inspected page's console via `chrome.devtools.inspectedWindow.eval`.

**Architecture:** Single React component (`LogElementButton`) plus one helper function (`logIframeElement`), both colocated in `EndpointsView.tsx`. The button is rendered in `NodeDetailPane`'s header for `iframe` and `iframe-element` node types only. Enabled state derived from `iframe.parentDocument.frame?.frameId === 0` so only iframes whose parent is the top-level document can be logged (avoids `frameURL` ambiguity for nested cases). New CSS rule added to `panel.css` mirroring the existing `.show-messages-btn` style.

**Tech Stack:** React + MobX (mobx-react-lite), TypeScript, vitest + @testing-library/react, Chrome DevTools APIs (`chrome.devtools.inspectedWindow.eval`).

**Spec:** [docs/superpowers/specs/2026-04-18-log-iframe-element-button-design.md](../specs/2026-04-18-log-iframe-element-button-design.md)

---

## File Structure

| File | Role | Status |
|------|------|--------|
| `src/panel/components/EndpointsView/EndpointsView.tsx` | Add `logIframeElement` helper + `LogElementButton` component; render in `NodeDetailPane` header. | Modify |
| `src/panel/components/EndpointsView/EndpointsView.test.tsx` | New test file covering button visibility, enabled/disabled state, and click behavior. | Create |
| `src/panel/panel.css` | Add `.log-element-btn` rule + `.log-element-btn + .close-detail-btn` rule. | Modify |

The helper and component live in the same file as their only consumer. No new modules.

---

## Task 1: Add `logIframeElement` helper with passing test

**Files:**
- Create: `src/panel/components/EndpointsView/EndpointsView.test.tsx`
- Modify: `src/panel/components/EndpointsView/EndpointsView.tsx` (add helper + export)

This task introduces the eval helper and verifies the produced expression is correct, including JSON-escaping of the domPath.

- [ ] **Step 1: Write the failing test**

Create `src/panel/components/EndpointsView/EndpointsView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Frame } from '../../models/Frame';
import { FrameDocument } from '../../models/FrameDocument';
import { IFrame } from '../../models/IFrame';
import { logIframeElement } from './EndpointsView';

const evalMock = vi.fn();

vi.stubGlobal('chrome', {
  storage: { local: { set: vi.fn(), get: vi.fn() } },
  devtools: {
    inspectedWindow: { tabId: 42, eval: evalMock },
  },
});

const frameLookup = { getFramesByParent: () => [] };
const docLookup = { getDocumentBySourceId: () => undefined };

function makeIframe(domPath: string, parentFrameId: number): IFrame {
  const frame = new Frame(42, parentFrameId, frameLookup);
  const parentDoc = new FrameDocument({ documentId: 'doc-parent' });
  parentDoc.frame = frame;
  return new IFrame(parentDoc, domPath, undefined, undefined, docLookup);
}

describe('logIframeElement', () => {
  beforeEach(() => {
    evalMock.mockClear();
  });

  it('calls inspectedWindow.eval with a console.log expression for the domPath', () => {
    const iframe = makeIframe('iframe#hello', 0);
    logIframeElement(iframe);

    expect(evalMock).toHaveBeenCalledTimes(1);
    expect(evalMock).toHaveBeenCalledWith(
      'console.log("Iframe " + "iframe#hello", document.querySelector("iframe#hello"))',
    );
  });

  it('JSON-escapes domPaths containing double quotes', () => {
    const iframe = makeIframe('iframe[src="https://x.com/a"]', 0);
    logIframeElement(iframe);

    const expr = evalMock.mock.calls[0][0] as string;
    // The expression must be valid JS that, when parsed, produces a console.log call.
    // We don't execute it; we just verify the embedded string literal round-trips.
    expect(expr).toBe(
      'console.log("Iframe " + "iframe[src=\\"https://x.com/a\\"]", document.querySelector("iframe[src=\\"https://x.com/a\\"]"))',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/panel/components/EndpointsView/EndpointsView.test.tsx`

Expected: FAIL with an error indicating `logIframeElement` is not exported from `./EndpointsView`.

- [ ] **Step 3: Add the helper to `EndpointsView.tsx`**

Open `src/panel/components/EndpointsView/EndpointsView.tsx`. After the existing imports at the top of the file (currently ending around line 12 with the `SelectedNode` import), add the helper function near the top of the file, before the `// --- Helpers ---` comment.

Add this exported helper:

```tsx
export function logIframeElement(iframe: IFrame): void {
  const selector = JSON.stringify(iframe.domPath);
  const expression = `console.log("Iframe " + ${selector}, document.querySelector(${selector}))`;
  chrome.devtools.inspectedWindow.eval(expression);
}
```

`IFrame` is already imported (line 11 of the existing file).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/panel/components/EndpointsView/EndpointsView.test.tsx`

Expected: PASS — both tests in `describe('logIframeElement', ...)`.

- [ ] **Step 5: Commit**

```bash
git add src/panel/components/EndpointsView/EndpointsView.tsx src/panel/components/EndpointsView/EndpointsView.test.tsx
git commit -m "feat: add logIframeElement helper for inspectedWindow.eval"
```

---

## Task 2: Add `LogElementButton` component with visibility/state tests

**Files:**
- Modify: `src/panel/components/EndpointsView/EndpointsView.test.tsx` (add new describe block)
- Modify: `src/panel/components/EndpointsView/EndpointsView.tsx` (add component + export)

The component encapsulates the enabled/disabled logic and click handler.

- [ ] **Step 1: Write failing tests for the component**

In `src/panel/components/EndpointsView/EndpointsView.test.tsx`, add these imports to the existing import block at the top of the file (alongside the imports added in Task 1):

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogElementButton } from './EndpointsView';
```

Update the existing `import { logIframeElement } from './EndpointsView';` line so both names import together: `import { logIframeElement, LogElementButton } from './EndpointsView';` (delete the new standalone import line if you prefer).

Then append this `describe` block to the bottom of the file:

```tsx
describe('LogElementButton', () => {
  beforeEach(() => {
    evalMock.mockClear();
  });

  it('renders enabled when parent document is the top-level frame', () => {
    const iframe = makeIframe('iframe#hello', 0);
    render(<LogElementButton iframe={iframe} />);

    const btn = screen.getByRole('button', { name: 'Log element' });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders disabled with tooltip when parent is a nested frame', () => {
    const iframe = makeIframe('iframe#nested', 5);
    render(<LogElementButton iframe={iframe} />);

    const btn = screen.getByRole('button', { name: 'Log element' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.getAttribute('title')).toBe(
      'Log element only supported for iframes directly in the top-level document',
    );
  });

  it('renders disabled when parent document has no frame attached', () => {
    const docLookup = { getDocumentBySourceId: () => undefined };
    const parentDoc = new FrameDocument({ documentId: 'doc-orphan' });
    // Note: parentDoc.frame intentionally left undefined
    const iframe = new IFrame(parentDoc, 'iframe#orphan', undefined, undefined, docLookup);

    render(<LogElementButton iframe={iframe} />);

    const btn = screen.getByRole('button', { name: 'Log element' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls logIframeElement on click when enabled', async () => {
    const user = userEvent.setup();
    const iframe = makeIframe('iframe#clickme', 0);
    render(<LogElementButton iframe={iframe} />);

    await user.click(screen.getByRole('button', { name: 'Log element' }));

    expect(evalMock).toHaveBeenCalledTimes(1);
    expect(evalMock).toHaveBeenCalledWith(
      'console.log("Iframe " + "iframe#clickme", document.querySelector("iframe#clickme"))',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/panel/components/EndpointsView/EndpointsView.test.tsx`

Expected: 4 failures in `describe('LogElementButton', ...)` — `LogElementButton` is not exported from `./EndpointsView`. The Task 1 tests should still pass.

- [ ] **Step 3: Add the component to `EndpointsView.tsx`**

Open `src/panel/components/EndpointsView/EndpointsView.tsx`. Just after the `logIframeElement` helper added in Task 1, add:

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

`observer` is already imported on line 3 (`import { observer } from 'mobx-react-lite';`). `IFrame` is already imported on line 11.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/panel/components/EndpointsView/EndpointsView.test.tsx`

Expected: All 6 tests pass (2 from Task 1, 4 from Task 2).

- [ ] **Step 5: Commit**

```bash
git add src/panel/components/EndpointsView/EndpointsView.tsx src/panel/components/EndpointsView/EndpointsView.test.tsx
git commit -m "feat: add LogElementButton component with enabled/disabled state"
```

---

## Task 3: Wire the button into `NodeDetailPane`

**Files:**
- Modify: `src/panel/components/EndpointsView/EndpointsView.tsx:412-440` (the `NodeDetailPane` JSX)
- Modify: `src/panel/components/EndpointsView/EndpointsView.test.tsx` (integration tests for `NodeDetailPane`)

Render the button conditionally based on the selected node's type.

- [ ] **Step 1: Write failing integration tests for `NodeDetailPane`**

In `src/panel/components/EndpointsView/EndpointsView.test.tsx`, add these imports to the import block at the top of the file:

```tsx
import { NodeDetailPane } from './EndpointsView';
import { store } from '../../store';
```

Or merge `NodeDetailPane` into the existing `from './EndpointsView'` import.

Then append this `describe` block to the bottom of the file:

```tsx
describe('NodeDetailPane "Log element" button visibility', () => {
  beforeEach(() => {
    evalMock.mockClear();
    store.selectNode(null);
  });

  it('shows the Log element button for an iframe-element node', () => {
    const iframe = makeIframe('iframe#abc', 0);
    iframe.sourceIdFromParent = 'src-1';
    store.selectNode({ type: 'iframe-element', sourceId: 'src-1', iframeRef: iframe });

    render(<NodeDetailPane />);

    expect(screen.queryByRole('button', { name: 'Log element' })).toBeTruthy();
  });

  it('shows the Log element button for an iframe node with iframeRef', () => {
    const iframe = makeIframe('iframe#xyz', 0);
    store.selectNode({ type: 'iframe', tabId: 42, frameId: 7, iframeRef: iframe });

    render(<NodeDetailPane />);

    expect(screen.queryByRole('button', { name: 'Log element' })).toBeTruthy();
  });

  it('does not show the Log element button for a tab node', () => {
    store.selectNode({ type: 'tab', tabId: 42 });

    render(<NodeDetailPane />);

    expect(screen.queryByRole('button', { name: 'Log element' })).toBeNull();
  });

  it('does not show the Log element button for an unknown-iframe node', () => {
    store.selectNode({ type: 'unknown-iframe', tabId: 42, frameId: 9 });

    render(<NodeDetailPane />);

    expect(screen.queryByRole('button', { name: 'Log element' })).toBeNull();
  });

  it('does not show the Log element button for an iframe node lacking iframeRef', () => {
    store.selectNode({ type: 'iframe', tabId: 42, frameId: 7 });

    render(<NodeDetailPane />);

    expect(screen.queryByRole('button', { name: 'Log element' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/panel/components/EndpointsView/EndpointsView.test.tsx`

Expected: The first two tests in this block fail with `screen.queryByRole(...) returned null`. (The "does not show" tests pass coincidentally because the button doesn't exist there yet — that's fine; they'll continue to pass after the change.) `NodeDetailPane` is already exported as the default render of the file? Verify it's exported. If it isn't exported, add `export` to its declaration.

If `NodeDetailPane` is not exported, edit `src/panel/components/EndpointsView/EndpointsView.tsx` line ~401 from:

```tsx
const NodeDetailPane = observer(() => {
```

to:

```tsx
export const NodeDetailPane = observer(() => {
```

Then re-run the tests to confirm the failure mode is the missing button (not a missing export).

- [ ] **Step 3: Render the button in `NodeDetailPane`**

In `src/panel/components/EndpointsView/EndpointsView.tsx`, locate the `<div className="detail-tabs">` block inside `NodeDetailPane` (currently around lines 414–424). It looks like this:

```tsx
<div className="detail-tabs">
  <span className="detail-title">{getDetailTitle(node)}</span>
  <button
    className="show-messages-btn"
    title="Show messages involving this node"
    onClick={() => store.navigateToNodeMessages(node)}
  >
    Show messages
  </button>
  <button className="close-detail-btn" title="Close" onClick={handleClose}>×</button>
</div>
```

Insert the `LogElementButton` between the existing `show-messages-btn` and `close-detail-btn`:

```tsx
<div className="detail-tabs">
  <span className="detail-title">{getDetailTitle(node)}</span>
  <button
    className="show-messages-btn"
    title="Show messages involving this node"
    onClick={() => store.navigateToNodeMessages(node)}
  >
    Show messages
  </button>
  {(node.type === 'iframe' || node.type === 'iframe-element') && node.iframeRef && (
    <LogElementButton iframe={node.iframeRef} />
  )}
  <button className="close-detail-btn" title="Close" onClick={handleClose}>×</button>
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/panel/components/EndpointsView/EndpointsView.test.tsx`

Expected: All 11 tests pass (2 from Task 1, 4 from Task 2, 5 from Task 3).

- [ ] **Step 5: Run the full unit test suite to check for regressions**

Run: `npm test`

Expected: All tests pass — no regressions in unrelated suites.

- [ ] **Step 6: Commit**

```bash
git add src/panel/components/EndpointsView/EndpointsView.tsx src/panel/components/EndpointsView/EndpointsView.test.tsx
git commit -m "feat: render Log element button in iframe detail pane"
```

---

## Task 4: Add CSS for the new button

**Files:**
- Modify: `src/panel/panel.css:1011-1029`

Add styling that matches the existing `.show-messages-btn` look but doesn't duplicate its `margin-left: auto` push-right behavior — the existing button already pushes the group to the right; the new one sits next to it.

- [ ] **Step 1: Add the CSS rules**

Open `src/panel/panel.css`. Locate the existing `.show-messages-btn` rules (around lines 1011–1029). After the `.show-messages-btn + .close-detail-btn` rule on line 1027–1029, append:

```css
/* Log element button in Endpoints detail pane (sits next to .show-messages-btn) */
.log-element-btn {
  padding: 2px 8px;
  border: 1px solid #cacdd1;
  border-radius: 2px;
  background: #fff;
  font-size: 11px;
  cursor: pointer;
  margin-right: 4px;
}

.log-element-btn:hover:not(:disabled) {
  background: #e8eaed;
}

.log-element-btn + .close-detail-btn {
  margin-left: 0;
}
```

- [ ] **Step 2: Build to confirm no CSS syntax errors**

Run: `npm run build`

Expected: Build succeeds with no errors. `dist/` contains updated assets.

- [ ] **Step 3: Commit**

```bash
git add src/panel/panel.css
git commit -m "style: add CSS for Log element button in iframe detail pane"
```

---

## Task 5: Manual verification in Chrome

**Files:** none

Confirm the feature behaves correctly in the actual extension. Unit tests verify component logic; this verifies the eval/console interaction works end-to-end.

- [ ] **Step 1: Reload the extension**

1. Run `npm run build` (already done in Task 4 unless changes since).
2. Open `chrome://extensions/` in Chrome.
3. Click the refresh icon on the Messages Inspector extension.

- [ ] **Step 2: Open the test page and DevTools**

1. Open `http://localhost:5173/test/test-page.html` in Chrome (start dev server with `npm run dev` if not running).
2. Open DevTools (F12) and switch to the **Messages** tab.
3. Switch to the **Endpoints** view (sub-view tab inside the panel).

- [ ] **Step 3: Verify enabled case (top-level iframe)**

1. In the tree, expand the top tab/document until you see an `IFrame` node directly under the root document.
2. Click that IFrame node.
3. In the detail pane on the right, verify a **"Log element"** button appears in the header next to "Show messages".
4. Click "Log element".
5. Switch to the DevTools **Console** tab.
6. Verify a log appears like: `Iframe iframe#... <iframe>...</iframe>`.
7. Hover the logged `<iframe>` element — confirm it highlights on the page.
8. Right-click the logged element — confirm "Reveal in Elements panel" and "Store as global variable" options work.

Expected: All confirmed.

- [ ] **Step 4: Verify disabled case (nested iframe)**

1. Expand the tree further to find an iframe nested inside another iframe (the test page has nested iframes).
2. Click the nested IFrame node.
3. Verify the "Log element" button appears but is **disabled**.
4. Hover the disabled button — verify the tooltip reads: *"Log element only supported for iframes directly in the top-level document"*.

Expected: All confirmed.

- [ ] **Step 5: Verify button hidden for non-iframe nodes**

1. Click a Tab node — confirm no "Log element" button.
2. Click a Doc node — confirm no "Log element" button.

Expected: All confirmed.

- [ ] **Step 6: Run e2e tests for regression check**

Run: `npx playwright test`

Expected: All existing e2e tests pass. (We're not adding new e2e coverage; the unit tests cover the new logic, and the existing e2e suite catches regressions in the surrounding UI.)

- [ ] **Step 7: No commit needed (verification only)**

If everything passes, the feature is done. If anything fails, fix it before declaring complete — do not commit a fix without re-running the relevant test command.
