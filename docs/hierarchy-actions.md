# Hierarchy Actions

Each action represents a change to the browser's frame/tab hierarchy. This document describes how each action is triggered in a real browser and which Chrome extension events the extension uses to detect it.

See [action-centric-hierarchy-design.md](action-centric-hierarchy-design.md) for how these actions fit into the overall architecture.

## create-tab

Creates a new independent tab (no opener relationship).

**Browser triggers:**
- User opens a new tab (Cmd/Ctrl+T, new tab button)
- Extension creates a tab via `chrome.tabs.create()`

**Chrome events:**
- `chrome.tabs.onCreated` — provides the new `tabId`
- `chrome.webNavigation.onCommitted` — fires for the new tab's main frame (frameId 0)

## open-tab

Opens a new tab linked to a source frame (the opener).

**Browser triggers:**
- `window.open(url)` from JavaScript
- Clicking a link with `target="_blank"`
- Middle-clicking a link (browser-dependent)
- `<a>` with `rel="opener"` or default opener behavior

**Chrome events:**
- `chrome.tabs.onCreated` — provides the new `tabId`
- `chrome.webNavigation.onCreatedNavigationTarget` — provides `sourceTabId`, `sourceFrameId`, and the new `tabId`
- `chrome.webNavigation.onCommitted` — fires for the new tab's main frame

## close-tab

Closes a tab.

**Browser triggers:**
- User closes the tab (click X, keyboard shortcut)
- `window.close()` from JavaScript (only works on script-opened windows)

**Chrome events:**
- `chrome.tabs.onRemoved` — provides the closed `tabId`

## add-iframe

Adds an iframe element to a document.

**Browser triggers:**
- HTML parser encounters an `<iframe>` element
- JavaScript creates and appends an iframe: `document.body.appendChild(document.createElement('iframe'))`
- JavaScript sets `innerHTML` containing an `<iframe>` tag

**Chrome events:**
- `chrome.webNavigation.onCommitted` — fires for the iframe's new frame within the parent `tabId`

There is no direct Chrome event for iframe creation. The extension detects new iframes when it sees an `onCommitted` for a previously unknown `frameId`.

## remove-iframe

Removes an iframe element from a document.

**Browser triggers:**
- JavaScript removes the iframe: `iframe.remove()` or `iframe.parentNode.removeChild(iframe)`
- JavaScript replaces parent content that contained the iframe (`innerHTML`, `replaceChildren`, etc.)

**Chrome events:**
None. The extension does not currently have a direct event for iframe removal.

## navigate-iframe

Changes the URL loaded inside an iframe by updating its `src` attribute. This causes the frame inside the iframe to navigate to a new document.

This is distinct from `navigate-frame` because when JavaScript sets `iframe.src`, the parent document's iframe element gets an updated `src` attribute. When a frame navigates itself (e.g., via `location.href`), the parent's iframe `src` attribute is **not** updated — it still reflects the original value.

**Browser triggers:**
- JavaScript sets `iframe.src = newUrl`
- JavaScript sets `iframe.setAttribute('src', newUrl)`

**Chrome events:**
- `chrome.webNavigation.onCommitted` — fires for the iframe's `frameId` within the parent `tabId`

## navigate-frame

Navigates a frame to a new URL, replacing the current document with a new one. All child iframes in the old document are destroyed.

**Browser triggers:**
- User types a URL in the address bar (main frame only)
- Clicking a link within the page
- JavaScript sets `window.location.href = url` or `window.location.assign(url)`
- Form submission
- Server-side redirects (3xx responses)
- `<meta http-equiv="refresh">` tags

**Chrome events:**
- `chrome.webNavigation.onCommitted` — fires for the navigated `frameId` within the `tabId`

## reload-frame

Reloads the current document in a frame, creating a new document with the same URL.

**Browser triggers:**
- User presses F5 or Cmd/Ctrl+R
- User clicks the browser reload button
- JavaScript calls `window.location.reload()`

**Chrome events:**
- `chrome.webNavigation.onCommitted` — fires with `transitionType: 'reload'` for the reloaded `frameId`

## send-message

Sends a `postMessage` between two frames. Unlike other actions, this does not modify the frame hierarchy — it only emits a `window`-scoped `message` event and increments a sequence counter.

The `direction` parameter determines the source and target frames relative to the frame specified in the action:

| Direction | Source | Target |
|-----------|--------|--------|
| `self` | The frame itself | The frame itself |
| `self->parent` | The child frame | Its parent frame |
| `parent->self` | The parent frame | The child frame |
| `self->opener` | The opened tab's frame | The opener frame |
| `opener->self` | The opener frame | The opened tab's frame |

**Browser triggers:**
- JavaScript calls `window.postMessage(data, targetOrigin)`
- JavaScript calls `window.parent.postMessage(data, targetOrigin)`
- JavaScript calls `window.opener.postMessage(data, targetOrigin)`

**Chrome events:**
None. `postMessage` is a DOM/window-level API with no corresponding Chrome extension event. The extension's content script listens for `message` events on `window` directly.
