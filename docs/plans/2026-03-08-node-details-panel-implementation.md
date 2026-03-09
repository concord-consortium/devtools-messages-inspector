# Node Details Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a collapsible details area to hierarchy map nodes so headers stay compact while full entity info is available on demand.

**Architecture:** Local `useState` per `NodeBox` for expand/collapse. A `getDetails()` function returns `{ label, value }[]` per node type. Info button and details div render only when details exist. Header labels are shortened; detailed info moves to the details area.

**Tech Stack:** React, TypeScript, CSS, vitest + @testing-library/react

---

### Task 1: Add `title` to DocumentNode type

**Files:**
- Modify: `src/hierarchy-map/types.ts`

**Step 1: Add the field**

In `types.ts`, add `title?: string` to `DocumentNode`:

```typescript
export interface DocumentNode {
  type: 'document';
  documentId?: string;
  url?: string;
  origin?: string;
  title?: string;    // <-- add this line
  stale?: boolean;
  iframes?: IframeNode[];
}
```

**Step 2: Add title to sample data**

In `test/hierarchy-map-sample.json`, add `"title"` fields to documents that have URLs:

- `doc-current`: `"title": "Dashboard"`
- `doc-widget`: `"title": "Widget"`

**Step 3: Commit**

```bash
git add src/hierarchy-map/types.ts test/hierarchy-map-sample.json
git commit -m "feat: add title field to DocumentNode type"
```

---

### Task 2: Extract `getDetails()` and shorten `getLabel()`

**Files:**
- Modify: `src/hierarchy-map/HierarchyMap.tsx`
- Create: `src/hierarchy-map/HierarchyMap.test.tsx`

**Step 1: Write tests for `getDetails` and updated `getLabel`**

Create `src/hierarchy-map/HierarchyMap.test.tsx`. Import `getLabel` and `getDetails` (these will be exported from `HierarchyMap.tsx`). Test cases:

```tsx
import { describe, it, expect } from 'vitest';
import { getLabel, getDetails } from './HierarchyMap';
import type { TabNode, FrameNode, DocumentNode, IframeNode } from './types';

describe('getLabel', () => {
  it('tab: shows tab ID without opener info', () => {
    const node: TabNode = { type: 'tab', tabId: 1, openerTabId: 2, openerFrameId: 0 };
    expect(getLabel(node)).toBe('Tab 1');
  });

  it('tab: uses custom label if present', () => {
    const node: TabNode = { type: 'tab', tabId: 1, label: 'My Tab' };
    expect(getLabel(node)).toBe('My Tab');
  });

  it('frame: shows frame ID', () => {
    const node: FrameNode = { type: 'frame', frameId: 0 };
    expect(getLabel(node)).toBe('frame[0]');
  });

  it('document: prefers origin', () => {
    const node: DocumentNode = {
      type: 'document', documentId: 'doc-1',
      url: 'https://example.com/page', origin: 'https://example.com',
    };
    expect(getLabel(node)).toBe('https://example.com');
  });

  it('document: falls back to documentId when no origin', () => {
    const node: DocumentNode = { type: 'document', documentId: 'doc-1' };
    expect(getLabel(node)).toBe('doc-1');
  });

  it('document: falls back to "document" when nothing available', () => {
    const node: DocumentNode = { type: 'document' };
    expect(getLabel(node)).toBe('document');
  });

  it('iframe: shows #id when present', () => {
    const node: IframeNode = { type: 'iframe', iframeId: 1, id: 'widget', src: 'https://x.com' };
    expect(getLabel(node)).toBe('#widget');
  });

  it('iframe: falls back to "iframe" when no id', () => {
    const node: IframeNode = { type: 'iframe', iframeId: 1, src: 'https://x.com' };
    expect(getLabel(node)).toBe('iframe');
  });
});

describe('getDetails', () => {
  it('tab with opener: returns opener detail', () => {
    const node: TabNode = { type: 'tab', tabId: 1, openerTabId: 2, openerFrameId: 0 };
    expect(getDetails(node)).toEqual([
      { label: 'opener', value: 'tab[2].frame[0]' },
    ]);
  });

  it('tab without opener: returns empty', () => {
    const node: TabNode = { type: 'tab', tabId: 1 };
    expect(getDetails(node)).toEqual([]);
  });

  it('frame: always returns empty', () => {
    const node: FrameNode = { type: 'frame', frameId: 0 };
    expect(getDetails(node)).toEqual([]);
  });

  it('document: returns available fields', () => {
    const node: DocumentNode = {
      type: 'document', documentId: 'doc-1',
      url: 'https://example.com/page', title: 'My Page',
    };
    expect(getDetails(node)).toEqual([
      { label: 'id', value: 'doc-1' },
      { label: 'url', value: 'https://example.com/page' },
      { label: 'title', value: 'My Page' },
    ]);
  });

  it('document: omits missing fields', () => {
    const node: DocumentNode = { type: 'document', origin: 'https://example.com' };
    expect(getDetails(node)).toEqual([]);
  });

  it('iframe: returns src and id', () => {
    const node: IframeNode = { type: 'iframe', iframeId: 1, src: 'https://x.com', id: 'w' };
    expect(getDetails(node)).toEqual([
      { label: 'src', value: 'https://x.com' },
      { label: 'id', value: 'w' },
    ]);
  });

  it('iframe: omits missing fields', () => {
    const node: IframeNode = { type: 'iframe', iframeId: 1 };
    expect(getDetails(node)).toEqual([]);
  });
});
```

**Step 2: Run tests — verify they fail**

Run: `npx vitest run src/hierarchy-map/HierarchyMap.test.tsx`
Expected: FAIL — `getLabel` and `getDetails` are not exported.

**Step 3: Implement `getDetails` and update `getLabel`**

In `src/hierarchy-map/HierarchyMap.tsx`:

1. Export `getLabel` and change its logic:

```typescript
export function getLabel(node: HierarchyNode): string {
  switch (node.type) {
    case 'tab':
      return node.label ?? 'Tab ' + node.tabId;
    case 'frame':
      return node.label ?? 'frame[' + node.frameId + ']';
    case 'document':
      return node.origin ?? node.documentId ?? 'document';
    case 'iframe':
      return node.id ? '#' + node.id : 'iframe';
  }
}
```

2. Add and export `getDetails`:

```typescript
export function getDetails(node: HierarchyNode): { label: string; value: string }[] {
  const details: { label: string; value: string }[] = [];
  switch (node.type) {
    case 'tab':
      if (node.openerTabId != null && node.openerFrameId != null) {
        details.push({ label: 'opener', value: `tab[${node.openerTabId}].frame[${node.openerFrameId}]` });
      }
      break;
    case 'frame':
      break;
    case 'document':
      if (node.documentId) details.push({ label: 'id', value: node.documentId });
      if (node.url) details.push({ label: 'url', value: node.url });
      if (node.title) details.push({ label: 'title', value: node.title });
      break;
    case 'iframe':
      if (node.src) details.push({ label: 'src', value: node.src });
      if (node.id) details.push({ label: 'id', value: node.id });
      break;
  }
  return details;
}
```

**Step 4: Run tests — verify they pass**

Run: `npx vitest run src/hierarchy-map/HierarchyMap.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/hierarchy-map/HierarchyMap.tsx src/hierarchy-map/HierarchyMap.test.tsx
git commit -m "feat: add getDetails and shorten getLabel for hierarchy map nodes"
```

---

### Task 3: Render details area in NodeBox

**Files:**
- Modify: `src/hierarchy-map/HierarchyMap.tsx`
- Modify: `src/hierarchy-map/HierarchyMap.test.tsx`

**Step 1: Write rendering tests**

Add to `HierarchyMap.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HierarchyMap } from './HierarchyMap';
import type { TabNode } from './types';

describe('HierarchyMap details area', () => {
  const tab: TabNode = {
    type: 'tab', tabId: 1, openerTabId: 2, openerFrameId: 0,
    frames: [{
      type: 'frame', frameId: 0,
      documents: [{
        type: 'document', documentId: 'doc-1',
        url: 'https://example.com/page', origin: 'https://example.com',
        title: 'Example Page',
      }],
    }],
  };

  it('does not show details by default', () => {
    render(<HierarchyMap root={tab} />);
    expect(screen.queryByText('doc-1')).toBeNull();
  });

  it('shows info button for nodes with details', () => {
    render(<HierarchyMap root={tab} />);
    // Tab has opener info, document has details — both get info buttons
    // Frame has no details — no info button
    const infoButtons = screen.getAllByRole('button', { name: /info/i });
    // Tab (1) + Document (1) = 2 info buttons
    expect(infoButtons).toHaveLength(2);
  });

  it('toggles details when info button is clicked', async () => {
    const user = userEvent.setup();
    render(<HierarchyMap root={tab} />);

    // Click the first info button (on the tab node)
    const infoButtons = screen.getAllByRole('button', { name: /info/i });
    await user.click(infoButtons[0]);

    // Tab opener detail should now be visible
    expect(screen.getByText('tab[2].frame[0]')).toBeTruthy();

    // Click again to collapse
    await user.click(infoButtons[0]);
    expect(screen.queryByText('tab[2].frame[0]')).toBeNull();
  });

  it('does not show info button for frame nodes', () => {
    const frameOnly: TabNode = {
      type: 'tab', tabId: 1,
      frames: [{ type: 'frame', frameId: 0 }],
    };
    render(<HierarchyMap root={frameOnly} />);
    expect(screen.queryByRole('button', { name: /info/i })).toBeNull();
  });
});
```

**Step 2: Run tests — verify they fail**

Run: `npx vitest run src/hierarchy-map/HierarchyMap.test.tsx`
Expected: FAIL — no info buttons rendered yet.

**Step 3: Add info button and details area to NodeBox**

Update `NodeBox` in `HierarchyMap.tsx`:

```tsx
function NodeBox({ node, tabId, onAction }: {
  node: HierarchyNode;
  tabId: number;
  onAction?: (action: HierarchyAction) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const currentTabId = node.type === 'tab' ? node.tabId : tabId;
  const details = getDetails(node);

  const className = [
    'node-box',
    `node-${node.type}`,
    node.stale ? 'node-stale' : '',
  ].filter(Boolean).join(' ');

  const children = getChildren(node);

  return (
    <div className={className}>
      <div className="node-header">
        <span className="node-type-badge">{node.type === 'document' ? 'doc' : node.type}</span>
        <span className="node-label" title={getLabel(node)}>{getLabel(node)}</span>
        {details.length > 0 && (
          <button
            className="node-info-btn"
            aria-label="info"
            onClick={() => setDetailsOpen(prev => !prev)}
          >
            ℹ
          </button>
        )}
        {onAction && <NodeActions node={node} tabId={currentTabId} onAction={onAction} />}
      </div>
      {detailsOpen && details.length > 0 && (
        <div className="node-details">
          {details.map(({ label, value }) => (
            <div key={label} className="node-detail-row">
              <span className="node-detail-label">{label}</span>
              <span className="node-detail-value" title={value}>{value}</span>
            </div>
          ))}
        </div>
      )}
      {children.length > 0 && (
        <div className="node-body">
          {children.map((child) => (
            <NodeBox key={getKey(child)} node={child} tabId={currentTabId} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}
```

Add the `useState` import if not already present (it's already imported in `entry.tsx` but needs to be imported in `HierarchyMap.tsx`):

```typescript
import React, { useState } from 'react';
```

**Step 4: Run tests — verify they pass**

Run: `npx vitest run src/hierarchy-map/HierarchyMap.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/hierarchy-map/HierarchyMap.tsx src/hierarchy-map/HierarchyMap.test.tsx
git commit -m "feat: render collapsible details area with info button in hierarchy map nodes"
```

---

### Task 4: Style the details area and info button

**Files:**
- Modify: `src/hierarchy-map/HierarchyMap.css`

**Step 1: Add CSS for info button, details area, and detail rows**

Append to `HierarchyMap.css`:

```css
/* --- Info button --- */

.node-info-btn {
  font-size: 12px;
  padding: 0 4px;
  border: 1px solid var(--node-color);
  border-radius: 3px;
  background: white;
  color: var(--node-color);
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
  line-height: 1.4;
}

.node-info-btn:hover {
  background: var(--node-bg);
}

/* --- Details area --- */

.node-details {
  background: var(--node-bg);
  padding: 4px 8px;
  border-bottom: 2px solid var(--node-color);
}

.node-detail-row {
  display: flex;
  gap: 8px;
  line-height: 1.6;
}

.node-detail-label {
  color: #888;
  flex-shrink: 0;
}

.node-detail-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
```

**Step 2: Verify visually**

Run: `npm run dev`
Open: `http://localhost:5173/test/hierarchy-map.html?data=../test/hierarchy-map-sample.json`
Check: Info buttons appear on tab and document nodes. Clicking toggles details. Frame nodes have no info button.

**Step 3: Commit**

```bash
git add src/hierarchy-map/HierarchyMap.css
git commit -m "style: add CSS for node details area and info button"
```

---

### Task 5: Run full validation

**Step 1: Run unit tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 3: Run e2e tests**

Run: `npx playwright test`
Expected: All tests pass.
