# Cross-Pane Frame Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable navigation between Log and Sources panes via frame identifiers — action buttons on section headers in the Log context pane, and a "Show messages" button in the Sources frame detail title bar.

**Architecture:** Add a `navigateToFrameMessages(tabId, frameId)` helper on the store that combines set-focused-frame + set-filter + switch-view. The Log context pane's Target/Source section headers get inline icon buttons (filter, pin, view-in-sources). The Sources frame detail title bar gets a "Show messages" button. A shared `FrameActionButtons` component renders the icon buttons.

**Tech Stack:** React, MobX, CSS (existing icon-btn pattern)

---

### Task 1: Add store helper methods

**Files:**
- Modify: `src/panel/store.ts:206-254` (focused frame methods section)
- Test: `src/panel/store.test.ts` (new file)

**Step 1: Write tests for the new store methods**

Create `src/panel/store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { store } from './store';
import { frameStore } from './models';

// Mock chrome.storage.local
vi.stubGlobal('chrome', {
  storage: { local: { set: vi.fn(), get: vi.fn() } },
  devtools: { inspectedWindow: { tabId: 42 } },
});

const TAB_ID = 42;

describe('store.buildFrameFilter', () => {
  it('returns frames filter with tab and frame id', () => {
    expect(store.buildFrameFilter(TAB_ID, 3))
      .toBe('frames:"tab[42].frame[3]"');
  });
});

describe('store.navigateToFrameMessages', () => {
  beforeEach(() => {
    store.setFilter('');
    store.setFocusedFrame(null);
    store.setCurrentView('sources');
  });

  it('sets focused frame, filter, and switches to log view', () => {
    store.navigateToFrameMessages(TAB_ID, 3);

    expect(store.focusedFrame).toEqual({ tabId: TAB_ID, frameId: 3 });
    expect(store.filterText).toBe('frames:"tab[42].frame[3]"');
    expect(store.currentView).toBe('log');
  });
});

describe('store.viewFrameInSources', () => {
  beforeEach(() => {
    store.selectFrame(null);
    store.setCurrentView('log');
  });

  it('selects the frame and switches to sources view', () => {
    store.viewFrameInSources(TAB_ID, 3);

    expect(store.selectedFrameKey).toBe(`${TAB_ID}:3`);
    expect(store.currentView).toBe('sources');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/panel/store.test.ts`
Expected: FAIL — `store.buildFrameFilter` is not a function

**Step 3: Implement the store methods**

Add to `src/panel/store.ts` in the `PanelStore` class, after the `setFocusedFrame` method (around line 208):

```typescript
  // Build a frames filter string for a specific frame
  buildFrameFilter(tabId: number, frameId: number): string {
    return `frames:"tab[${tabId}].frame[${frameId}]"`;
  }

  // Navigate to log view filtered to a specific frame's messages
  navigateToFrameMessages(tabId: number, frameId: number): void {
    this.setFocusedFrame({ tabId, frameId });
    this.setFilter(this.buildFrameFilter(tabId, frameId));
    this.setCurrentView('log');
  }

  // Navigate to sources view and select a specific frame
  viewFrameInSources(tabId: number, frameId: number): void {
    this.selectFrame(`${tabId}:${frameId}`);
    this.setCurrentView('sources');
  }
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/panel/store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/panel/store.ts src/panel/store.test.ts
git commit -m "feat: add store methods for cross-pane frame navigation"
```

---

### Task 2: Create FrameActionButtons component

**Files:**
- Create: `src/panel/components/shared/FrameActionButtons.tsx`

**Step 1: Create the FrameActionButtons component**

Create `src/panel/components/shared/FrameActionButtons.tsx`:

```tsx
// Inline action buttons for frame navigation (filter, focus, view in sources)

import { observer } from 'mobx-react-lite';
import { store } from '../../store';

interface FrameActionButtonsProps {
  tabId: number;
  frameId: number;
}

export const FrameActionButtons = observer(({ tabId, frameId }: FrameActionButtonsProps) => {
  const handleFilter = (e: React.MouseEvent) => {
    e.stopPropagation();
    store.setFilter(store.buildFrameFilter(tabId, frameId));
  };

  const handleFocus = (e: React.MouseEvent) => {
    e.stopPropagation();
    store.setFocusedFrame({ tabId, frameId });
  };

  const handleViewInSources = (e: React.MouseEvent) => {
    e.stopPropagation();
    store.viewFrameInSources(tabId, frameId);
  };

  return (
    <span className="frame-action-buttons">
      <button className="frame-action-btn" title="Filter by this frame" onClick={handleFilter}>
        <svg width="12" height="12" viewBox="0 0 16 16">
          <path fill="currentColor" d="M1 2h14l-5.5 6.5V14l-3-2v-3.5z"/>
        </svg>
      </button>
      <button className="frame-action-btn" title="Set as focused frame" onClick={handleFocus}>
        <svg width="12" height="12" viewBox="0 0 16 16">
          <path fill="currentColor" d="M8 1a5 5 0 00-5 5c0 4 5 9 5 9s5-5 5-9a5 5 0 00-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z"/>
        </svg>
      </button>
      <button className="frame-action-btn" title="View in Sources" onClick={handleViewInSources}>
        <svg width="12" height="12" viewBox="0 0 16 16">
          <path fill="currentColor" d="M3 1v14l10-7z"/>
        </svg>
      </button>
    </span>
  );
});
```

**Step 2: Add CSS for the action buttons**

Add to the end of `src/panel/panel.css`:

```css
/* Frame action buttons */
.frame-action-buttons {
  display: inline-flex;
  gap: 2px;
  margin-left: 8px;
  vertical-align: middle;
}

.frame-action-btn {
  width: 18px;
  height: 18px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: #5f6368;
}

.frame-action-btn:hover {
  background: #e0e0e0;
  color: #202124;
}
```

**Step 3: Commit**

```bash
git add src/panel/components/shared/FrameActionButtons.tsx src/panel/panel.css
git commit -m "feat: add FrameActionButtons component with filter, focus, sources actions"
```

---

### Task 3: Add action buttons to Log context pane section headers

**Files:**
- Modify: `src/panel/components/LogView/DetailPane.tsx:58-106` (ContextTab component)

**Step 1: Update the ContextTab component**

In `src/panel/components/LogView/DetailPane.tsx`, add import at the top:

```typescript
import { FrameActionButtons } from '../shared/FrameActionButtons';
```

Then replace the Target and Source section header `<tr>` elements (lines 81-83 and 94-96) to include action buttons:

Replace the Target section header (line 81-83):
```tsx
        <tr><th colSpan={2} className="section-heading">
          Target{focusPosition === 'target' || focusPosition === 'both' ? ' (focused)' : ''}
          {message.targetFrame && (
            <FrameActionButtons tabId={message.targetFrame.tabId} frameId={message.targetFrame.frameId} />
          )}
        </th></tr>
```

Replace the Source section header (line 94-96):
```tsx
        <tr><th colSpan={2} className="section-heading">
          Source{focusPosition === 'source' || focusPosition === 'both' ? ' (focused)' : ''}
          {message.sourceFrame && (
            <FrameActionButtons tabId={message.sourceFrame.tabId} frameId={message.sourceFrame.frameId} />
          )}
        </th></tr>
```

**Step 2: Commit**

```bash
git add src/panel/components/LogView/DetailPane.tsx
git commit -m "feat: add frame action buttons to Target/Source section headers in context pane"
```

---

### Task 4: Add "Show messages" button to Sources frame detail title bar

**Files:**
- Modify: `src/panel/components/SourcesView/SourcesView.tsx:70-130` (FrameDetailPane component)

**Step 1: Update FrameDetailPane**

In `src/panel/components/SourcesView/SourcesView.tsx`, add store import (already present) and update the FrameDetailPane's title bar.

In the FrameDetailPane component (line 96-100), replace the detail-tabs div when a frame is selected:

```tsx
      <div className="detail-tabs">
        <span className="detail-title">Frame Details</span>
        {typeof frameInfo.frameId === 'number' && frameInfo.tabId != null && (
          <button
            className="show-messages-btn"
            title="Show messages involving this frame"
            onClick={() => store.navigateToFrameMessages(frameInfo.tabId!, frameInfo.frameId as number)}
          >
            Show messages
          </button>
        )}
        <button className="close-detail-btn" title="Close" onClick={handleClose}>×</button>
      </div>
```

**Step 2: Add CSS for the show-messages button**

Add to `src/panel/panel.css`:

```css
/* Show messages button in Sources detail pane */
.show-messages-btn {
  padding: 2px 8px;
  border: 1px solid #cacdd1;
  border-radius: 2px;
  background: #fff;
  font-size: 11px;
  cursor: pointer;
  margin-left: auto;
  margin-right: 4px;
}

.show-messages-btn:hover {
  background: #e8eaed;
}
```

**Step 3: Commit**

```bash
git add src/panel/components/SourcesView/SourcesView.tsx src/panel/panel.css
git commit -m "feat: add Show messages button to Sources frame detail title bar"
```

---

### Task 5: Run full test suite and validate

**Step 1: Run unit tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Build the extension**

Run: `npm run build`
Expected: Clean build, no errors

**Step 3: Run e2e tests**

Run: `npx playwright test`
Expected: All tests pass

**Step 4: Commit any fixes if needed**

---

### Task 6: Manual testing checklist

Test in Chrome with the extension loaded:

1. Open a page with cross-origin iframes
2. Open DevTools → Messages tab
3. Capture some messages, click one to open detail pane
4. Switch to Context tab — verify Target and Source headers show action buttons
5. Click filter button on Target — verify filter is set to `frames:"tab[T].frame[N]"`
6. Clear filter, click pin button on Source — verify focused frame is set
7. Click view-in-sources button — verify it switches to Sources view with the frame selected
8. In Sources view, select a frame — verify "Show messages" button appears in title bar
9. Click "Show messages" — verify it switches to Log with focused frame set and filter applied
