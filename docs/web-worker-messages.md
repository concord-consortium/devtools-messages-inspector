# Web Worker Message Interception

## Current State

The extension only captures `message` events on `window` (in `content-core.ts`). Worker messages fire on the `Worker` object, not on `window`, so they are completely invisible to the extension today.

## Can We Inject Code Into a Worker?

No. Chrome extensions have no API to inject scripts into worker contexts. `chrome.scripting.executeScript` only targets document frames. The known workarounds are impractical:

- **`chrome.debugger` API** — Can attach to worker targets via CDP, but shows a persistent warning banner to the user. Not suitable for a DevTools panel extension.
- **Script URL interception** — Intercept the worker script URL, fetch it, prepend instrumentation code, and pass a blob URL to the real `Worker` constructor. Breaks cross-origin worker scripts (can't fetch them) and changes the worker's origin (blob: URL), which can break the worker's own network requests and `importScripts`.

Reference: [Chromium extensions discussion on patching worker scopes](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/ZB_Wm5RM-n4)

## Viable Approach: Monkey-Patch From the Main Thread

We can intercept worker messages from the main thread by patching constructors before any workers are created. The content script already runs with `injectImmediately: true` in the main world, so timing should work.

### Dedicated Workers

Patch the `Worker` constructor to wrap each new instance:

```js
const OriginalWorker = window.Worker;
window.Worker = function(...args) {
  const worker = new OriginalWorker(...args);

  // Capture: worker → main thread
  worker.addEventListener('message', (e) => { /* log e.data */ });

  // Capture: main thread → worker
  const orig = worker.postMessage.bind(worker);
  worker.postMessage = function(data, ...rest) {
    /* log data */
    return orig(data, ...rest);
  };

  return worker;
};
```

### Shared Workers

Same pattern — patch `SharedWorker` constructor, then instrument `worker.port.postMessage` and listen on `worker.port` for incoming messages.

### Service Workers

Messages go through different APIs:
- **Main → SW**: `navigator.serviceWorker.controller.postMessage()`
- **SW → Main**: fires `message` on `navigator.serviceWorker`

Patch `navigator.serviceWorker.controller.postMessage` and add a listener on `navigator.serviceWorker` to capture both directions.

## What This Captures

| Direction | Capturable? |
|-----------|------------|
| Main thread → Dedicated Worker | Yes (patch `worker.postMessage`) |
| Dedicated Worker → Main thread | Yes (listen on worker object) |
| Main thread → Shared Worker | Yes (patch `port.postMessage`) |
| Shared Worker → Main thread | Yes (listen on `port`) |
| Main thread → Service Worker | Yes (patch `controller.postMessage`) |
| Service Worker → Main thread | Yes (listen on `navigator.serviceWorker`) |
| Worker → Worker (via MessagePort) | No (requires code inside the worker) |

## UI Considerations

- Need a new `sourceType` value (e.g. `worker`, `shared-worker`, `service-worker`) alongside existing `parent`, `child`, `self`, etc.
- Worker URL is available from the constructor argument — can display it like iframe `src`.
- `event.data` is the same shape as postMessage data, so existing detail panel and filtering should work.
- Consider whether worker messages should be shown by default or behind a toggle, since some pages use workers heavily and could flood the log.
