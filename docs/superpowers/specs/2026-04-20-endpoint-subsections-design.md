# Endpoint Subsections — Consistent Presentation Across Panes

Date: 2026-04-20

## Goal

Make the presentation of endpoint information (frame + document) consistent between the
**message context pane** (Context tab of the message detail pane, in the Messages view) and
the **endpoints detail pane** (right-hand pane of the Endpoints view). Today each pane
renders these fields with its own table, its own labels, and its own ordering.

After this change:

- Both panes use the same two reusable subsection components.
- Field labels inside a subsection drop redundant prefixes (the heading provides context).
- FIELD_INFO gains a `scope` property that drives both the subsection membership and the
  derivation of column labels in the messages table.
- The "Source Type" row in the message context pane moves out of the Source section and
  becomes a top-level **Direction** row, matching the column name in the messages table.

## Non-goals

- No changes to the messages table columns or column defaults.
- No changes to the tree view on the left of the Endpoints view.
- No changes to the data model (`Frame`, `FrameDocument`, `IFrame`, `Tab`, `OwnerElement`).

## FIELD_INFO changes

### New `scope` property

```ts
export interface FieldInfoEntry {
  label: string;                                         // base label (no prefix)
  scope?: 'document' | 'frame' | 'iframeElement';        // new
  description: string;
  technical: string;
  filter: string | null;
}
```

Not every FIELD_INFO entry needs a scope — message-level fields (messageId, timestamp,
messageType, dataSize, buffered, sourceType) don't belong to an endpoint subsection. Only
fields rendered inside a subsection get a scope.

### Label and scope table

| Field ID | New `label` | Scope | Previous `label` |
|---|---|---|---|
| `document.documentId` | "ID" | document | "Document ID" |
| `document.url` | "URL" | document | "Document URL" |
| `document.origin` | "Origin" | document | "Document Origin" |
| `document.title` | "Title" | document | "Document Title" |
| `document.createdAt` *(new entry)* | "Created At" | document | — |
| `tabId` | "Tab" | frame | "Tab" |
| `frameId` | "Frame" | frame | "Frame" |
| `parentFrameId` | "Parent Frame" | frame | "Parent Frame" |
| `tab.openerTab` *(new entry)* | "Opener Tab" | frame | — |
| `tab.openedTabs` *(new entry)* | "Opened Tabs" | frame | — |
| `ownerElement.domPath` | "DOM Path" | iframeElement | "Owner Element" |
| `ownerElement.src` | "Src" | iframeElement | "Iframe Src" |
| `ownerElement.id` | "ID" | iframeElement | "Iframe ID" |

Entries with no scope: `messageId`, `timestamp`, `dataSize`, `messageType`, `buffered`,
`sourceType`, `sourceId`, `frameError`, `partnerFrame`, `partnerType`. Among these,
**`sourceType`'s label changes from "Source Type" to "Direction"** (description /
technical text unchanged). All others keep their current labels.

### `getColumnLabel` update

Rule: `side` + (scope prefix if scope is `document` or `iframeElement`) + `label`.

- `document` scope → prefix "Document"
- `iframeElement` scope → prefix "Iframe"
- `frame` scope → no extra prefix

Examples:

| Column ID | Produced label |
|---|---|
| `target.document.url` | "Target Document URL" (unchanged) |
| `source.ownerElement.src` | "Source Iframe Src" (unchanged) |
| `target.frameId` | "Target Frame" (unchanged) |
| `target.ownerElement.domPath` | "Target Iframe DOM Path" (was "Target Owner Element") |

Only `ownerElement.domPath`'s column label changes, and the new form is more descriptive.

The existing tests in `field-info.test.ts` continue to pass. Add a test for
`target.ownerElement.domPath` → `"Target Iframe DOM Path"` and for unscoped fields
(`target.frameId` → `"Target Frame"`).

## Reusable subsection components

Both components live in `src/panel/components/shared/`. Both render rows (`<tr>`) into an
existing `<table class="context-table"><tbody>`, so callers own the outer table.

Each component renders:

1. A separator row (`<SeparatorRow />` pattern already in use in DetailPane.tsx).
2. A heading row (`<tr><th colSpan={2} className="section-heading">{heading}</th></tr>`).
3. The field rows (same `<Field id=...>` pattern, using `FIELD_INFO[id].label` directly
   now that labels are already the base form).

### `<DocumentSection>`

```ts
interface DocumentSectionProps {
  doc: FrameDocument;
  heading?: string;          // defaults to "Document"
  showAdvanced?: boolean;
}
```

Rendered fields (in order, only if value is present):

- `document.documentId` — `doc.documentId`
- `document.createdAt` — `new Date(doc.createdAt).toISOString()` (only when `showAdvanced`)
- `document.url` — `doc.url`
- `document.origin` — `doc.origin`
- `document.title` — `doc.title`

Does **not** render Source ID Records or Changes tables — those are endpoints-view-only
extras that callers append separately (see below).

### `<FrameSection>`

```ts
interface FrameSectionProps {
  frame?: Frame;
  ownerElement?: OwnerElement;
  // If provided, forces the heading ("Tab" or "IFrame"). Otherwise derived:
  // "Tab" if frame && frame.frameId === 0, else "IFrame".
  heading?: string;
  // Optional status row rendered before the frame fields. Used only by the
  // endpoints view when an IFrame or iframe-element has been removed from the
  // page; value will be the string "Removed from page".
  status?: string;
  showAdvanced?: boolean;
}
```

Heading derivation:

- If `heading` prop passed, use it verbatim.
- Else if `frame && frame.frameId === 0`, heading is "Tab".
- Else heading is "IFrame".

Rendered fields (in order, only if value is present):

- `tabId` — `tab[{frame.tabId}]`
- `frameId` — `frame[{frame.frameId}]`
- `parentFrameId` — `frame[{frame.parentFrameId}]` (only if defined and ≥ 0)
- `ownerElement.domPath` — `ownerElement.domPath`
- `ownerElement.src` — `ownerElement.src`
- `ownerElement.id` — `ownerElement.id`
- `tab.openerTab` — `tab[{tab.openerTab.tabId}]` (only when frame is root and tab has opener)
- `tab.openedTabs` — comma-separated list (only when frame is root and tab has opened tabs)

The `Tab` lookup for opener/opened is `frameStore.tabs.get(frame.tabId)` when
`frame.frameId === 0`.

## Message context pane (DetailPane.tsx)

New order in the Context tab:

1. Message-level fields (messageId [internal], timestamp, messageType, dataSize,
   buffered [internal]).
2. **Direction** row. Rename the existing `sourceType` FIELD_INFO entry's label from
   "Source Type" to "Direction"; its description and technical text stay the same (they
   already describe the sender→receiver relationship). The row renders
   `<DirectionIcon sourceType={...} focusPosition={...} /> {sourceType}` — same content
   as today, just moved out of the Source section and retitled via the FIELD_INFO label
   change. The FieldLabel popup continues to work because the entry still exists.
3. **Target** section heading (existing "(focused)" suffix and `FrameActionButtons`
   preserved).
4. `<FrameSection frame={message.targetFrame} ownerElement={message.targetOwnerElement} showAdvanced={showInternal} />`
5. `<DocumentSection doc={message.targetDocument} showAdvanced={showInternal} />`
6. If `message.target.frameInfoError`, a `frameError` row.
7. **Source** section heading (same pattern as Target).
8. `<FrameSection frame={message.sourceFrame} ownerElement={message.sourceOwnerElement} showAdvanced={showInternal} />`
9. `<DocumentSection doc={message.sourceDocument} showAdvanced={showInternal} />`

Target/Source remain top-level headings (bolder / larger than the FrameSection /
DocumentSection sub-headings) — this is a CSS question handled during implementation,
not a behavioral one.

The old `FrameDetail.tsx` component is removed; its single call site (DetailPane) is
replaced by the combination above.

## Endpoints detail pane (EndpointsView.tsx)

Replace the custom `TabDetail`, `DocumentDetail`, `IFrameDetail`, `IFrameElementDetail`,
`UnknownDocumentDetail` components with compositions of the shared subsection components.

Each case renders a single `<table class="context-table"><tbody>` with the subsection
components slotted in.

### Tab

```
<FrameSection frame={rootFrame} />
<DocumentSection doc={rootFrame.currentDocument} heading="Current Document" showAdvanced={showInternal} />
```

The Frame section renders tabId, frameId (= 0), openerTab, openedTabs. Heading is "Tab".

### Document

```
<DocumentSection doc={doc} showAdvanced={showInternal} />
<FrameSection frame={doc.frame} ownerElement={doc.frame?.ownerElement /* see below */} showAdvanced={showInternal} />
```

Heading on the document section is "Document". The frame section heading is "Tab" or
"IFrame" depending on `frame.frameId`. If the document has no frame (orphaned), the
frame section is omitted.

*ownerElement acquisition:* The `Frame` model exposes the iframe element that owns it via
the existing `iframe` relationship (check `IFrame` / `Frame` links in the frame-model
wiring — the current `IFrameDetail` has access to an `iframeRef` prop; the new
composition needs the equivalent via the frame graph). If not readily available from the
`Frame`, the caller passes `ownerElement` explicitly.

**Also render**, after the two sections, the existing endpoints-view-only extras when
`showInternal`:

- **Source ID Records** sub-table (unchanged from current `DocumentDetail`).
- **Changes** sub-table (unchanged from current `DocumentDetail`).

These are appended as additional rows/sub-tables inside the same `<tbody>`, preserving
current styling.

### IFrame (has child frame)

```
<FrameSection frame={childFrame} ownerElement={iframeRef} showAdvanced={showInternal} />
<DocumentSection doc={childFrame.currentDocument} heading="Current Document" showAdvanced={showInternal} />
```

Frame section heading: "IFrame". Also renders a `Status: Removed from page` row when
`iframeRef.removedFromHierarchy`. Status is a frame-section-local concern and stays on
`FrameSection` as an optional `status?: string` prop (only used here).

### IFrame element (no child frame yet)

```
<FrameSection ownerElement={iframeRef} status={iframeRef.removedFromHierarchy ? 'Removed from page' : undefined} />
```

With no `frame`, the heading defaults to "IFrame" (since we're here because an iframe
element is selected).

### Unknown IFrame

```
<FrameSection frame={frame} />
```

Heading: "IFrame". Shows whatever frame fields are populated.

### Unknown Document

```
<DocumentSection doc={doc} />
```

Heading: "Document". Only `sourceId` and whatever else the doc has will show.

### Delete / merge

After the refactor, delete:

- `TabDetail`
- `DocumentDetail`
- `IFrameDetail`
- `IFrameElementDetail`
- `UnknownDocumentDetail`
- `FrameDetail` (the old shared component in `shared/FrameDetail.tsx`)

The extras (Source ID Records, Changes) stay in the endpoints view — either inline in
the new `NodeDetailPane` Document branch, or extracted into small local components
next to it.

## CSS

- Sub-subsection headings (from `FrameSection` / `DocumentSection`) use the existing
  `.section-heading` class.
- Top-level Target / Source headings in the message context pane get a slightly heavier
  style to distinguish them — add `.section-heading--top` or equivalent modifier.

## Testing

- Unit tests for `getColumnLabel`: add cases for `target.ownerElement.domPath` and for
  unscoped frame fields (`target.frameId`).
- Unit tests for `DocumentSection`: renders expected fields, respects `showAdvanced`,
  honors custom heading.
- Unit tests for `FrameSection`: derives heading from frameId, renders ownerElement
  fields when provided, renders openerTab/openedTabs only when frame is root.
- Existing `EndpointsView.test.tsx` should continue to pass; update expectations for any
  label changes (e.g. "domPath" → "DOM Path").
- Existing e2e tests that read field labels in the context pane (if any) may need
  adjustment.

## Migration checklist

1. Update `FIELD_INFO` entries + add new ones.
2. Update `getColumnLabel` implementation.
3. Add `DocumentSection` and `FrameSection` in `src/panel/components/shared/`.
4. Refactor `DetailPane.tsx` Context tab to use the new components + Direction row.
5. Refactor `NodeDetailPane` in `EndpointsView.tsx` to use the new components; extract
   Source ID Records / Changes extras for the Document branch.
6. Delete old detail components (`FrameDetail`, `TabDetail`, etc.).
7. Update unit tests and snapshot any label changes.
8. Run `npm run build`, `npx vitest run`, `npx playwright test`. Manual smoke test
   against `test/test-page.html`.
