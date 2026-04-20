# Inspect Iframe Element — Deferred

This document explains why the "Inspect" button (which would select an iframe element in the Elements panel from the Endpoints view) is not currently implemented, even though logging the iframe element via the console is supported.

## Decision

Not implementing for now. The feature is technically possible via [`chrome.devtools.inspectedWindow.eval('inspect(el)')`](https://developer.chrome.com/docs/extensions/reference/api/devtools/inspectedWindow#method-eval), but it has an unavoidable caveat: when multiple iframes in the inspected page share the same URL, we cannot guarantee the *correct* iframe will be selected. Shipping a button whose behavior is sometimes wrong invites bug reports and erodes trust in the rest of the extension. We prefer to ship features that work without caveats.

## Workaround for users

You can already get the same effect in two clicks:

1. Click the **Log Element** button on the iframe in the Endpoints view. This logs the `<iframe>` element to the DevTools console.
2. Right-click the logged element in the console and choose **Reveal in Elements panel**.

This path is reliable for every iframe — including duplicates of the same URL — because the console reference is the actual element, not a selector.

---

## For Extension Developers

### Why a content script can't do this

The natural-feeling design — "send a message to the content script, have it call `inspect(el)`" — does not work. `inspect()` is part of the [DevTools Console Utilities API](https://developer.chrome.com/docs/devtools/console/utilities), which is only exposed in the DevTools console execution context. It is not available in:

- Page main-world scripts
- Content scripts (isolated world)
- Service workers
- DevTools panel HTML/JS

### Where `inspect()` *is* available

Inside `chrome.devtools.inspectedWindow.eval(...)`. The eval context exposes the full Console Utilities API, so this works from the panel:

```js
chrome.devtools.inspectedWindow.eval(
  `inspect(document.querySelector(${JSON.stringify(domPath)}))`,
  { frameURL: parentFrameUrl }
);
```

No content-script round-trip is needed — the panel can call this directly. Compare to the existing `Log Element` button, which does need the content-script round-trip because the console-log call happens in the page context and we can use `documentId` to address the right frame ([`background-core.ts:210-220`](src/background-core.ts#L210-L220)).

### The caveat: frame addressing

`inspectedWindow.eval` selects the target frame via the `frameURL` option. This is a string match against frame URLs in the inspected tab. If two iframes in the page have the same URL, `frameURL` matches both and Chrome picks one arbitrarily — there is no way to disambiguate. This is the exact opposite of `chrome.tabs.sendMessage(..., { documentId })` (used by the Log Element flow), which addresses a specific document by its unique `documentId`.

Other addressing options (`useContentScriptContext`, `scriptExecutionContext`) don't help — they control *which world* the script runs in, not *which frame*.

Edge cases that compound the problem:

- `about:blank` and `srcdoc` iframes share generic URLs across many frames.
- A frame that has navigated may briefly have a stale URL.

### Open proposals (would remove the caveat)

Both proposals are open in the W3C WebExtensions Community Group and have positive signals from Chrome, Firefox, and Safari, but neither has shipped:

- [w3c/webextensions#389 — Allow specifying `frameId` for `devtools.inspectedWindow.eval`](https://github.com/w3c/webextensions/issues/389) — opened May 2023. Motivated by the exact same-URL-collision problem.
- [w3c/webextensions#393 — Allow specifying `documentId` for `devtools.inspectedWindow.eval()`](https://github.com/w3c/webextensions/issues/393) — split from #389. Argues `documentId` is more robust than `frameId` across navigations and prerender re-parenting.

If either ships, we can implement the Inspect button without the caveat and revisit this decision.

### Alternative APIs considered

None found. There is no proposal for:

- A `chrome.devtools.inspect(...)` method
- A way to programmatically select an element in the Elements panel from a panel or content script

The only related surface is [`chrome.devtools.panels.elements.onSelectionChanged`](https://developer.chrome.com/docs/extensions/reference/api/devtools/panels#event-onSelectionChanged), which is listen-only — there is no setter counterpart. Every documented path to programmatic element selection ultimately routes through `inspectedWindow.eval("inspect(...)")`.

### References

- [chrome.devtools.inspectedWindow.eval](https://developer.chrome.com/docs/extensions/reference/api/devtools/inspectedWindow#method-eval)
- [DevTools Console Utilities API](https://developer.chrome.com/docs/devtools/console/utilities)
- [w3c/webextensions#389](https://github.com/w3c/webextensions/issues/389) — frameId proposal
- [w3c/webextensions#393](https://github.com/w3c/webextensions/issues/393) — documentId proposal
