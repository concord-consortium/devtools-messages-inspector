# Log Iframe Element Button Design

## Overview

Add a button labeled **"Log element"** to the detail-pane header in the Endpoints view. Clicking it logs the iframe's DOM element to the inspected page's console, so the user can hover the logged element to highlight on the page, right-click to reveal in the Elements panel, or store as a global variable from the console's built-in context menu.

The log is produced by routing through the content script in the iframe's parent document. This automatically scopes lookups to the document the iframe was actually observed in, so the lookup correctly returns `null` (rather than a wrong element from a new page) when the parent document has navigated away. Because content scripts run in every frame, this design supports nested iframes too.

## Scope

The button is rendered for the two iframe detail types that carry an `IFrame` reference:

- `iframe` — selected from `IFrameNode` when a child `Frame` has been linked. Handled by `IFrameDetail` with an `iframeRef` prop.
- `iframe-element` — selected when the iframe has no linked child Frame. Handled by `IFrameElementDetail`.

The button is **not** rendered for `tab`, `document`, `document-by-sourceId`, `unknown-iframe`, or `unknown-document` nodes.

Both top-level and nested iframes are supported.

## Behavior

### Message flow

1. **Panel → background** (over the existing port): `{ type: 'log-iframe-element', tabId, documentId, domPath }`. The `documentId` is the parent document's documentId (`iframe.parentDocument.documentId`).
2. **Background → content script**: `chrome.tabs.sendMessage(tabId, { type: 'log-iframe-element', domPath }, { documentId })`. The `documentId` option targets the specific document; if it's gone, the call rejects with `chrome.runtime.lastError`.
3. **Content script** in that document runs:

```js
console.log("[messages]", document.querySelector(domPath));
```

The `[messages]` prefix identifies the log as coming from this extension. If the iframe was removed from its parent's DOM but the document is still loaded, `document.querySelector(domPath)` returns `null` and the console shows `null` — which correctly conveys "the iframe is no longer there."

### Document-gone (and other failure) handling

If `chrome.tabs.sendMessage` rejects — the parent document has navigated away, the content script isn't yet injected, the tab is closed, etc. — the background captures the rejection's `.message` and posts `{ type: 'log-iframe-element-failed', error }` back to the panel. The panel's port handler logs in the inspected page's main world via `chrome.devtools.inspectedWindow.eval`:

```
[messages] could not log iframe — failed to reach parent document: <error>
```

For example, when the document has navigated away, Chrome's error message is *"Could not establish connection. Receiving end does not exist."* — so the user sees `[messages] could not log iframe — failed to reach parent document: Could not establish connection. Receiving end does not exist.`

The raw error text is exposed verbatim. We don't translate it: that keeps the panel ignorant of Chrome's specific wording (which can change across Chrome versions) and gives the user the actual cause. The downside is the message is more technical than a curated user-facing string, but the prefix `[messages]` makes it clearly identifiable as coming from this extension.

Note: the success path's log comes from the content script's isolated world (per-document context), while the failure path's log comes from the main world — so the two appear under different console contexts. Acceptable since the failure case has no element to attach to.

### Enabled vs. disabled

The button is **enabled** when the iframe's parent document has a known `documentId`:

```ts
!!iframe.parentDocument.documentId
```

When **disabled** (no documentId — meaning we never observed a registration message that gave the document its identity), the button still renders, with:

- `disabled` attribute set
- `title="Parent document identity unknown — cannot target log"`

No special handling for `removedFromHierarchy` or navigated-away parents — those are handled by the runtime mechanism (silent failure or `null` log).

## Components

### 1. Helper: `logIframeElement` (in `EndpointsView.tsx`)

```ts
function logIframeElement(iframe: IFrame): void {
  const documentId = iframe.parentDocument.documentId;
  if (!documentId) return;
  sendLogIframeElement(documentId, iframe.domPath);
}
```

### 2. Connection helper: `sendLogIframeElement` (in `connection.ts`)

Sends the message over the panel's existing port to the background script. Mirrors the existing `sendPreserveLog`/`requestFrameHierarchy` helpers.

```ts
export function sendLogIframeElement(documentId: string, domPath: string): void {
  if (port) {
    port.postMessage({ type: 'log-iframe-element', tabId: store.tabId, documentId, domPath });
  }
}
```

### 3. Background port message handler (in `background-core.ts`)

Add a case to the existing `port.onMessage.addListener` block:

```ts
} else if (msg.type === 'log-iframe-element' && msg.tabId !== undefined && msg.documentId && msg.domPath) {
  chrome.tabs.sendMessage(msg.tabId, { type: 'log-iframe-element', domPath: msg.domPath }, { documentId: msg.documentId })
    .catch(e => console.debug('[Messages] log-iframe-element failed:', { tabId: msg.tabId, documentId: msg.documentId, domPath: msg.domPath }, e));
}
```

Update `BackgroundChrome.tabs.sendMessage`'s options type to allow `documentId`.

### 4. Content script handler (in `content-core.ts`)

Add a case to the existing `chrome.runtime.onMessage` listener:

```ts
if (message.type === 'log-iframe-element') {
  const el = win.document.querySelector(message.domPath);
  console.log("[messages]", el);
  return;
}
```

Add `querySelector` to the `ContentWindow.document` interface.

### 5. `LogElementButton` component (unchanged shape, updated check)

```tsx
const LogElementButton = observer(({ iframe }: { iframe: IFrame }) => {
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

### 6. Type definitions (in `types.ts`)

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

The panel→background port message is loosely typed via the existing `{ type: string; tabId?: number; ... }` shape; we extend that inline in the handler.

## Files Changed

| File | Change |
|------|--------|
| `src/types.ts` | Add `LogIframeElementMessage` to `BackgroundToContentMessage` union. |
| `src/content-core.ts` | Add `querySelector` to `ContentWindow.document` interface; add `log-iframe-element` case to message handler. |
| `src/background-core.ts` | Allow `documentId` in `BackgroundChrome.tabs.sendMessage` options; add `log-iframe-element` case to port message handler. |
| `src/panel/connection.ts` | Add `sendLogIframeElement(documentId, domPath)` helper. |
| `src/panel/components/EndpointsView/EndpointsView.tsx` | Replace `chrome.devtools.inspectedWindow.eval` body of `logIframeElement` with a call to `sendLogIframeElement`; update `LogElementButton`'s enabled check and tooltip text. |
| `src/panel/components/EndpointsView/EndpointsView.test.tsx` | Replace eval-based test mocks with port-based mocks; update enabled/disabled state tests for the new condition. |
| `src/panel/panel.css` | No changes (CSS from v1 still applies). |

## Testing

### Unit tests

1. `logIframeElement` calls `sendLogIframeElement` with the iframe's `parentDocument.documentId` and `iframe.domPath`. (Mock the connection module.)
2. `logIframeElement` is a no-op when `iframe.parentDocument.documentId` is undefined.
3. `LogElementButton` enabled when `iframe.parentDocument.documentId` is set.
4. `LogElementButton` disabled with the new tooltip when `iframe.parentDocument.documentId` is undefined.
5. Click on enabled button calls the connection helper.
6. `NodeDetailPane` button visibility tests (5 cases from v1) remain unchanged.

### Background unit test

Existing `background-core.test.ts` (if present) — add a test for the port handler that asserts `chrome.tabs.sendMessage` is called with the expected message shape and `{ documentId }` option. If no test file exists for background-core, this can be omitted or added later.

### Content script unit test

Existing `content-core` integration tests use `ChromeExtensionEnv`. Add a test that delivers a `log-iframe-element` message to the content script and asserts `console.log` is called with the expected arguments. (Use `vi.spyOn(console, 'log')`.)

### Manual verification

- Top-level iframe — click button, confirm element logs to inspected page console.
- Nested iframe — click button, confirm element logs to inspected page console (look for the "(Isolated World)" or content script context indicator if Chrome shows one).
- Iframe whose parent document has navigated away — click button, confirm nothing is logged (silent failure).
- Iframe whose parent document has no documentId — confirm button is disabled with tooltip.

## Non-Goals

- **User-visible error message when document is gone.** Silent failure for now. Revisit if confusing.
- **Named globals.** User can right-click → "Store as global variable" from the console.
- **Reveal in Elements panel.** Tracked separately in roadmap (`inspect()` helper).
- **Unknown iframes** (no `IFrame` model entry) — no button.

## Notes on Console Output

Logs from content scripts appear in the inspected page's DevTools console. Depending on Chrome's UI, they may be tagged with the content script's context ("Isolated World" or the extension name) and the console may need its context dropdown set appropriately to see them. This is acceptable — the logged element reference is still valid for highlighting and the right-click menu still works.
