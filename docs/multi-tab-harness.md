# Multi-Panel / Multi-Tab Test Harness

## Problem

Testing opener/opened behavior requires monitoring multiple tabs simultaneously. For example, verifying that an extension viewing the opened tab correctly handles messages when the opener navigates. The background only routes messages to tabs with connected panels, so both tabs need active panels to see the full cross-tab message flow.

## Approaches Considered

### 1. Iframe-Based Multi-Panel (Single Page)

Each panel runs in an iframe within the existing test harness page. A tabbed container replaces the single panel area.

**Mechanism:** Fetch `panel.html` as text, inject a `<base href="/src/panel/">` tag and an inline `<script>` that reads `window.chrome = window.parent.childChromes[tabId]`, then set as `iframe.srcdoc`. The `srcdoc` approach works because srcdoc iframes inherit the parent's origin (unlike blob URLs which get `null` origin). Inline scripts execute before module scripts in the same document, so the chrome mock is available before the panel code runs.

**Verified via experiments:**
- Properties set on `contentWindow` before navigation do NOT survive (iframe gets a fresh window)
- Blob URL iframes have `null` origin — cannot access `window.parent` (cross-origin error)
- `srcdoc` iframes inherit parent origin — CAN access `window.parent`
- Inline (non-module) scripts run before `<script type="module">` in the same document

**Action system:** An `open-devtools-panel` action (added to `HierarchyAction` union) would be dispatched through the hierarchy map. `applyAction` passes through with no state change and no events. The runtime intercepts it directly to create the panel iframe. The action still appears in the action log.

**UI:** "Inspect" button on tab nodes in the hierarchy map. One panel per tab — clicking when already open switches to the existing tab. Tabbed panel container (`PanelTabs` component) managed by the harness, not the panel code.

**Pros:**
- Panel code stays completely unmodified (singletons isolated per iframe)
- Faithful to how Chrome isolates extension panels (each in its own page)
- Single page — everything visible at once

**Cons:**
- Breaks Vite HMR (srcdoc iframes don't get Vite's HMR client)
- Makes Playwright tests harder (need to interact with iframes)
- Adds complexity for iframe lifecycle management

### 2. React Context Refactor (Single Page)

Refactor `PanelStore` and `FrameStore` from singletons into injectable instances. Components receive their store via React context instead of importing the singleton. Multiple panel instances render in the same page, each with its own context provider.

**Scope of change:** ~9 component files import the `store` singleton. `connection.ts` and `Message.ts` import `frameStore`. All would need updating to use context or accept the store as a parameter.

**Pros:**
- Single code path for real extension and test harness
- Stores become testable in isolation
- No iframe boundaries — everything in one JS context
- Playwright interacts with a normal page

**Cons:**
- Touches many existing panel files
- `Message.ts` imports `frameStore` at the model level (not a React component) — needs store passed at construction time
- Risk of breaking existing panel behavior

### 3. SharedWorker Multi-Tab

Each panel gets its own real browser tab. A SharedWorker hosts the background script and harness runtime, shared across tabs.

**Architecture:**
- `initBackgroundScript` already takes a `BackgroundChrome` interface — implement it over SharedWorker `MessagePort`s
- `HarnessRuntime` (hierarchy state, action log, harness models) lives in the worker
- Harness models (`HarnessWindow`, `CrossOriginWindowProxy`) contain functions/circular references — stay in worker, not serialized
- Each browser tab renders the hierarchy map (from broadcast state) and one panel
- "Inspect" button opens a new browser tab

**Pros:**
- Panel code completely unmodified
- Most faithful to real Chrome architecture
- Playwright tests work naturally with multiple browser tabs
- No iframe complexity

**Cons:**
- Significant architecture change
- Communication layer needed for serializing hierarchy state and actions
- Keeping hierarchy map in sync across tabs
- Most complex option

### 4. Single Panel with Tab Switching

Keep one panel in the test harness, but allow switching which tab it monitors. Tearing down the store and frameStore before opening the new panel avoids singleton conflicts.

**Open question:** When the panel disconnects from Tab A to switch to Tab B, should the background keep buffering Tab A's messages? Currently the background drops messages for tabs without a connected panel (unless they're in `bufferingEnabledTabs`). Enabling buffering on disconnect would be a real behavior change in the background script, potentially useful in the real extension too ("closed DevTools briefly, don't want to lose messages") but changes production behavior.

**Pros:**
- Simplest approach — minimal changes
- No iframes, no refactoring singletons, no SharedWorker
- Could test cross-tab scenarios sequentially

**Cons:**
- Can't view two panels simultaneously
- Sequential testing is less intuitive than side-by-side
- Buffering-on-disconnect is a behavior change that may or may not be desirable

## Status

Design exploration paused. The core tension is between keeping the panel code unmodified (which pushes toward iframes or separate tabs) and keeping Playwright tests simple (which pushes toward everything in one JS context). No approach is clearly superior — each trades off along different axes.

The immediate need (testing opener/opened behavior) might be addressable without a full multi-panel UI — for example, programmatic multi-panel at the port level in Playwright tests (`env.connectPanel(tabId)`) without rendering any UI for the second panel.
