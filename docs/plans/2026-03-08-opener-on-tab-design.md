# Opener Relationship on TabNode

## Context

`window.opener` returns a WindowProxy tied to a browsing context (frame), not a document or tab. When an iframe calls `window.open()`, the opener is the iframe's frame. The reference persists across navigations of both the opener and the opened tab.

This means:
- The opener relationship belongs on **TabNode** (the opened tab knows who opened it)
- The opener points to a **frame** (browsing context), identified by tabId + frameId
- The "Open Tab" button belongs on **Frame** nodes (not Document), since the action originates from a browsing context

## Changes

### `types.ts`

Add optional opener fields to `TabNode`:

```typescript
interface TabNode {
  type: 'tab';
  tabId: number;
  openerTabId?: number;
  openerFrameId?: number;
  label?: string;
  stale?: boolean;
  frames?: FrameNode[];
}
```

### `actions.ts`

Change `open-tab` to identify the source frame:

```typescript
{ type: 'open-tab'; tabId: number; frameId: number }
```

Was: `{ type: 'open-tab'; documentId: string }`

### `reducer.ts`

`openTab` stores `openerTabId` and `openerFrameId` on the new tab from the action payload.

### `HierarchyMap.tsx`

1. Move "Open Tab" button from `document` case to `frame` case in `NodeActions`
2. Thread `tabId` through `NodeBox` as a prop so nested frames know their containing tab
3. Show "opened by tab[X].frame[Y]" in the tab header when opener fields are present

### `reducer.test.ts`

Update `open-tab` tests to use `{ tabId, frameId }` and assert opener fields on created tab.

## UI: Button placement

| Node type | Buttons |
|-----------|---------|
| Tab | `Close` |
| Frame | `Navigate` · `Reload` · `Open Tab` |
| Document | `+ Iframe` |
| Iframe | `Remove` · `Navigate` |

## UI: Opener label

Tabs with an opener show it after the tab label:

```
tab 2 (opened by tab[0].frame[0])
```
