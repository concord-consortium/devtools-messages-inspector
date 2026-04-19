# Log Iframe Element Button Design

## Overview

Add a button labeled **"Log element"** to the detail-pane header in the Endpoints view. Clicking it runs `console.log("Iframe " + domPath, document.querySelector(domPath))` in the inspected page via `chrome.devtools.inspectedWindow.eval`. This gives the user a logged DOM element they can hover to highlight on the page, right-click to reveal in the Elements panel, or store as a global (`temp1`, `temp2`…) from the console's built-in context menu.

## Scope

The button is only rendered when the selected node is one of the two iframe detail types that carry an `IFrame` reference:

- `iframe` — selected from `IFrameNode` when a child `Frame` has been linked. Handled by `IFrameDetail` with an `iframeRef` prop.
- `iframe-element` — selected when the iframe has no linked child Frame. Handled by `IFrameElementDetail`.

The button is **not** rendered for `tab`, `document`, `document-by-sourceId`, `unknown-iframe`, or `unknown-document` nodes.

This first version supports iframes whose parent document is the top-level document of the page. For nested iframes (parent is itself in an iframe) the button is rendered but disabled with an explanatory tooltip, so the user sees it exists and understands why it doesn't apply.

## Behavior

### Eval expression

The button click runs:

```js
console.log("Iframe " + <domPath-literal>, document.querySelector(<domPath-literal>))
```

where `<domPath-literal>` is the iframe's `domPath` string passed through `JSON.stringify` and interpolated into the expression. This avoids all quote/escape issues regardless of what characters the domPath contains.

The expression is evaluated via `chrome.devtools.inspectedWindow.eval(expression, callback)` with no `options` argument — so it runs in the top frame of the inspected page.

### Log output

Two arguments:

1. A string label `"Iframe " + domPath` — makes the log self-describing when multiple elements are logged.
2. The element returned by `document.querySelector(domPath)` — may be `null` if the element is no longer in the DOM.

A `null` result is acceptable: the console simply shows `null`, which confirms for the user that the element is gone.

### Enabled vs. disabled

The button is **enabled** when the iframe's parent document is the top-level document. Concretely:

```ts
iframe.parentDocument.frame?.frameId === 0
```

When **disabled**, the button still renders in the header, with:

- `disabled` attribute set
- `title="Log element only supported for iframes directly in the top-level document"`

No change to the button's appearance beyond the browser's default disabled styling (matching any existing disabled-button treatment in the codebase, if present).

## Components

### 1. Helper: `logIframeElement`

A small module-local function in `EndpointsView.tsx`:

```ts
function logIframeElement(iframe: IFrame): void {
  const selector = JSON.stringify(iframe.domPath);
  const expression = `console.log("Iframe " + ${selector}, document.querySelector(${selector}))`;
  chrome.devtools.inspectedWindow.eval(expression);
}
```

Kept in the same file as its only caller. No new module unless a second caller appears.

### 2. Button rendering in `NodeDetailPane`

Inside the existing `<div className="detail-tabs">` block, after the "Show messages" button and before the close button, add:

```tsx
{(node.type === 'iframe' || node.type === 'iframe-element') && node.iframeRef && (
  <LogElementButton iframe={node.iframeRef} />
)}
```

### 3. `LogElementButton` component

A small component that encapsulates the enabled/disabled logic:

```tsx
const LogElementButton = observer(({ iframe }: { iframe: IFrame }) => {
  const canLog = iframe.parentDocument.frame?.frameId === 0;
  return (
    <button
      className="log-element-btn"
      disabled={!canLog}
      title={canLog ? undefined : "Log element only supported for iframes directly in the top-level document"}
      onClick={() => logIframeElement(iframe)}
    >
      Log element
    </button>
  );
});
```

Defined in `EndpointsView.tsx` alongside the other local components.

### 4. Styling

The existing `.show-messages-btn` rule in `src/panel/panel.css` includes `margin-left: auto`, which pushes the button to the right side of the flex row. When a second action button is added, the two buttons should sit together at the right.

Plan:

- Add a new `.log-element-btn` rule in `src/panel/panel.css` with the same visual properties as `.show-messages-btn` (padding, border, border-radius, background, font-size, cursor) but *without* `margin-left: auto`. Instead give it `margin-right: 4px` to match the gap before the close button.
- Add a selector rule `.log-element-btn + .close-detail-btn { margin-left: 0; }` mirroring the existing `.show-messages-btn + .close-detail-btn` rule, so the close button sits tight against whichever action button is last.
- Disabled appearance: rely on the browser default for `button:disabled`. No custom rule.

Rendering order inside `.detail-tabs`: `detail-title`, `show-messages-btn` (push-right via its `margin-left: auto`), `log-element-btn`, `close-detail-btn`.

## Files Changed

| File | Change |
|------|--------|
| `src/panel/components/EndpointsView/EndpointsView.tsx` | Add `logIframeElement` helper and `LogElementButton` component; render it in `NodeDetailPane` header between "Show messages" and the close button, for `iframe` and `iframe-element` node types. |
| `src/panel/panel.css` | Add `.log-element-btn` rule and `.log-element-btn + .close-detail-btn` rule (see Styling above). |
| `src/panel/components/EndpointsView/EndpointsView.test.tsx` (new) | Unit tests for button visibility, enabled/disabled state, and click behavior. |

## Testing

### Unit tests

Using the existing vitest + React Testing Library setup:

1. Renders "Log element" button when `iframe` node is selected and `parentDocument.frame.frameId === 0`; button is enabled.
2. Renders "Log element" button when `iframe-element` node is selected and `parentDocument.frame.frameId === 0`; button is enabled.
3. Renders button as disabled with the tooltip text when `parentDocument.frame.frameId !== 0`.
4. Does not render button for `tab`, `document`, `document-by-sourceId`, `unknown-iframe`, or `unknown-document` node types.
5. Clicking the enabled button calls `chrome.devtools.inspectedWindow.eval` with an expression matching `console.log("Iframe " + "<domPath>", document.querySelector("<domPath>"))`, with `chrome.devtools.inspectedWindow.eval` mocked.
6. `JSON.stringify` escaping: if the `domPath` contains a double quote, the produced expression is still valid JS (verified by running it through `new Function(...)` in the test, or by string-matching the expected escaped form).

### Manual verification

- Open the test page with iframes in the top-level document; select one in the Endpoints tree; click "Log element"; confirm the element appears in the console and can be hovered, revealed in Elements, and stored as a global.
- Select a nested iframe; confirm the button is disabled with the expected tooltip.
- Select a `document` or `tab` node; confirm no button appears.

## Non-Goals

- **Nested iframes.** Not supported in this version. The `frameURL` option to `inspectedWindow.eval` picks the first frame matching a URL with no way to disambiguate duplicates, and the alternative (content-script routing by frameId) adds significant machinery. The button is disabled in this case.
- **Elements panel reveal.** The roadmap mentions using `chrome.devtools.inspectedWindow.eval('inspect(element)')` to switch to the Elements panel. That's tracked separately.
- **Named globals.** The user can right-click the logged element → "Store as global variable" to get `temp1`, `temp2`, etc. The extension does not create named globals itself.
- **Unknown iframes.** Iframes known only from Chrome's frame hierarchy (no DOM observation, no `domPath`) do not get a button.
