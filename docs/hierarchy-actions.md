# Hierarchy Actions

Each action represents a change to the browser's frame/tab hierarchy. This document describes how each action is triggered in a real browser and which Chrome extension events the extension uses to detect it.

## open-tab

Opens a new tab linked to a source frame (the opener).

**Browser triggers:**
- `window.open(url)` from JavaScript
- Clicking a link with `target="_blank"`
- Middle-clicking a link (browser-dependent)
- `<a>` with `rel="opener"` or default opener behavior

**Chrome events:**
- `chrome.webNavigation.onCreatedNavigationTarget` — provides `sourceTabId`, `sourceFrameId`, and the new `tabId`

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
None. The extension does not currently have a direct event for iframe creation.

## remove-iframe

Removes an iframe element from a document.

**Browser triggers:**
- JavaScript removes the iframe: `iframe.remove()` or `iframe.parentNode.removeChild(iframe)`
- JavaScript replaces parent content that contained the iframe (`innerHTML`, `replaceChildren`, etc.)

**Chrome events:**
None. The extension does not currently have a direct event for iframe removal.

## navigate-iframe

Changes the URL loaded inside an iframe by updating its `src` attribute. This causes the frame inside the iframe to navigate to a new document.

**Browser triggers:**
- JavaScript sets `iframe.src = newUrl`
- JavaScript sets `iframe.setAttribute('src', newUrl)`

**Chrome events:**
- `chrome.webNavigation.onCommitted` — fires for the iframe's `frameId` within the parent `tabId`

## navigate-frame

Navigates a frame to a new URL, replacing the current document with a new one.

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
