# Focused Frame Feature Implementation Plan

## Context

The Frames Inspector extension helps developers debug cross-origin postMessage communication between iframes. Currently, the Direction column shows arrows indicating the message relationship (parent→child, child→parent, etc.), but understanding which frame perspective you're viewing from requires mental translation.

This feature adds a "Focused Frame" selector that lets users anchor their view to a specific frame. When a frame is focused, the direction indicators visually show which side of the communication the focused frame is on, and new "Partner Frame" fields identify the other participant in the message exchange from the focused frame's perspective.

## Design Decisions

### Naming Convention
- **Focused Frame**: The selected frame that acts as the reference point
- **Partner Frame**: The other frame involved in a message exchange with the focused frame
- **Partner Type**: The relationship type of the partner frame from the focused frame's perspective

### Direction Indicator Approach
Use **SVG icons** to display direction arrows with frame focus indicators. This provides:
- Complete control over arrow and indicator styling
- Crisp rendering at any size
- Easy color customization
- Accessibility support via titles

Note: The current codebase uses Unicode characters for direction icons (`↘`, `↖`, `↻`, `→`, `←`) rendered as plain text. This change replaces them with inline SVG elements.

## Visual Design: SVG Direction Icons

### Icon Specifications
- Size: 16x16px viewBox
- Focus indicator: 3x3px solid rectangle
- Colors: Arrow inherits text color, indicator is blue (#1a73e8)
- Position: Indicator positioned on the source (left) or target (right) side

### Current Direction Icons (Unicode)
The current codebase maps sourceType to Unicode arrows in `store.getDirectionIcon()`:
- `parent` / `top` → `↘` (down-right)
- `child` → `↖` (up-left)
- `self` → `↻` (circular)
- `opener` → `→` (right arrow)
- `opened` → `←` (left arrow)

### The 8 Icon Variants (+ self)

In the diagrams below, `■` is the focus indicator rectangle and `▶`/`▼`/`◀` are arrowheads showing message direction.

**1. Focused Source: parent → Target: child**

Compact: `■↘`

```
■━┓
  ┗━▶
```

**2. Source: parent → Focused Target: child**

Compact: `↘■`

```
━┓
 ┗━▶■
```

**3. Focused Target: parent ← Source: child**

Compact: `■↖`

```
■◀━┓
   ┗━
```

**4. Target: parent ← Focused Source: child**

Compact: `↖■`

```
◀━┓
  ┗━■
```

**5. Focused Source: opener → Target: opened**

Compact: `■→`

```
■━━▶
```

**6. Source: opener → Focused Target: opened**

Compact: `→■`

```
━━▶■
```

**7. Focused Target: opener ← Source: opened**

Compact: `■←`

```
■◀━━
```

**8. Target: opener ← Focused Source: opened**

Compact: `←■`

```
◀━━■
```

**9. Self**

Compact: `↻`

```
┏▶■━┓
┗━━━┛
```

**10. Uninvolved (focus frame not part of message)**

Compact: `·`

When a frame focus is selected but a message doesn't involve the focused frame, replace the direction arrow with a small gray dot/dash. This strongly de-emphasizes uninvolved messages, making it easy to visually scan for the relevant ones. Use a neutral gray color (#80868b) regardless of sourceType.

## Implementation Steps

### Step 1: Create SVG Icon Component
**File**: `/src/panel/components/shared/DirectionIcon.tsx` (NEW)

Create a React component that renders SVG direction icons based on:
- `sourceType`: parent/top/child/opener/opened/self
- `focusPosition`: 'source' | 'target' | 'both' | 'none'

When `focusPosition` is `'none'`, the SVG should render the plain arrow (matching the current Unicode appearance). This replaces the Unicode characters entirely.

Component should:
- Inline SVG for each arrow type (down-right, up-left, right, left, circular)
- Conditionally render a 3x3 focus indicator rectangle on the appropriate side
- Use currentColor for arrow paths (to inherit the existing color classes)
- Use #1a73e8 for focus indicator rectangles
- Include title attribute for accessibility
- Handle unknown types with a question mark

### Step 2: Update Store State Management
**File**: `/src/panel/store.ts`

Add state and methods:
```typescript
// New state property
focusedFrameId: number | null = null;

// New action
setFocusedFrame(frameId: number | null): void

// New computed methods
getPartnerFrameId(msg: Message): number | undefined
getPartnerType(msg: Message): string | null
getFocusPosition(msg: Message): 'source' | 'target' | 'both' | 'none'
```

Source frame resolution already exists on the `Message` model via `msg.sourceFrame` and `msg.targetFrame` computed properties (which resolve through `FrameStore`). No need to add a separate `getSourceFrameId()` method.

The `invertSourceType()` helper can be a private method or standalone function.

Update `loadPersistedState()` to load/save `focusedFrameId` from chrome.storage (add `'focusedFrameId'` to the `chrome.storage.local.get()` keys array).

Key logic for `getFocusPosition()`:
```typescript
getFocusPosition(msg: Message): 'source' | 'target' | 'both' | 'none' {
  if (this.focusedFrameId == null) return 'none';

  const sourceFrame = msg.sourceFrame;
  const targetFrame = msg.targetFrame;

  const isSource = sourceFrame?.frameId === this.focusedFrameId
    && sourceFrame?.tabId === this.tabId;
  const isTarget = targetFrame?.frameId === this.focusedFrameId
    && targetFrame?.tabId === this.tabId;

  if (isSource && isTarget) return 'both';
  if (isSource) return 'source';
  if (isTarget) return 'target';
  return 'none';
}
```

Key logic for `getPartnerType()`:
- If focus is source: return sourceType as-is (parent, child, opener, opened, etc.)
- If focus is target: invert the relationship

### Step 3: Add New Column Definitions
**File**: `/src/panel/types.ts`

Add to `ALL_COLUMNS` array:
```typescript
{ id: 'partnerFrame', defaultVisible: false, width: 90 },
{ id: 'partnerType', defaultVisible: false, width: 80 },
```

Note: Column labels are derived from `FIELD_INFO` via `getColumnLabel()` in `field-info.ts`, not stored in the column definition.

### Step 4: Update Cell Value Handling
**File**: `/src/panel/store.ts` - `getCellValue()` method

Add cases:
```typescript
case 'partnerFrame': {
  const partnerFrame = this.getPartnerFrame(msg);
  return partnerFrame ? `frame[${partnerFrame.frameId}]` : '';
}
case 'partnerType': {
  return this.getPartnerType(msg) || '';
}
```

Also update the `direction` case. Currently `getCellValue` returns a string for direction:
```typescript
case 'direction': return this.getDirectionIcon(msg.sourceType);
```

Since we're switching to SVG, direction will need special handling in `MessageRow` (see Step 7). The `getCellValue` direction case can remain as-is for sorting/filtering purposes, but `MessageRow` will render an SVG component instead of the text value for that column.

### Step 5: Update Field Information
**File**: `/src/panel/field-info.ts`

Add entries to `FIELD_INFO`:
```typescript
partnerFrame: {
  label: 'Partner Frame',
  description: 'The frame ID of the communication partner from the focused frame\'s perspective.',
  technical: 'When Focused Frame is selected, shows the other frame in the message exchange. Empty if focus frame is not involved.',
  filter: null
},
partnerType: {
  label: 'Partner Type',
  description: 'The relationship type of the partner frame from the focused frame\'s perspective.',
  technical: 'Shows the relationship (parent, child, opener, opened, etc.) from the focused frame\'s viewpoint. Automatically inverted when focus is the message target.',
  filter: null
}
```

### Step 6: Create Focused Frame Dropdown Component
**File**: `/src/panel/components/MessagesView/FrameFocusDropdown.tsx` (NEW)

Create a dropdown that:
- Shows "None" as default option
- Lists all frames from `store.frameHierarchy`
- Displays frames with indentation showing hierarchy (via `store.buildFrameTree()`)
- Format: `frame[N] - origin` (using `frameStore` to look up the current document's origin)
- Calls `store.setFocusedFrame()` on selection

Frame options should use `frameKey` format (matching `store.frameKey()`) as the option value, with the frameId extracted on selection.

### Step 7: Integrate Dropdown into TopBar
**File**: `/src/panel/components/MessagesView/TopBar.tsx`

Add after the "Preserve log" checkbox:
```tsx
<div className="separator"></div>
<FrameFocusDropdown />
```

### Step 8: Update MessageTable Direction Rendering
**File**: `/src/panel/components/MessagesView/MessageTable.tsx`

Modify `MessageRow` component. Currently at line 187-188:
```tsx
const value = store.getCellValue(message, col.id);
const dirClass = col.id === 'direction' ? `dir-${message.sourceType}` : '';
```

Change the direction column to render a `DirectionIcon` component instead of text:
```tsx
return (
  <td
    key={col.id}
    data-column={col.id}
    className={col.id === 'direction' ? `dir-${message.sourceType}` : ''}
    onContextMenu={(e) => showCellMenu(e, message, col.id)}
  >
    {col.id === 'direction' ? (
      <DirectionIcon
        sourceType={message.sourceType}
        focusPosition={store.getFocusPosition(message)}
      />
    ) : (
      store.getCellValue(message, col.id)
    )}
  </td>
);
```

The existing `dir-${sourceType}` CSS class is kept for color styling (blue for parent/top, green for child, etc.). The SVG arrow uses `currentColor` so it inherits these colors.

Also update `FrameDetail.tsx` line 43 which currently renders the Unicode icon:
```tsx
<Field id="sourceType">{store.getDirectionIcon(sourceType)} {sourceType}</Field>
```
Change to use the `DirectionIcon` component (with `focusPosition='none'` since the detail view doesn't need focus indicators).

### Step 9: Update DetailPane
**File**: `/src/panel/components/MessagesView/DetailPane.tsx`

In the `ContextTab` component, modify the existing Target and Source section headings to indicate which is the focused frame. When a focused frame is selected and the message involves it, append "(focused)" to the relevant heading:

```tsx
<tr><th colSpan={2} className="section-heading">
  Target{focusPosition === 'target' || focusPosition === 'both' ? ' (focused)' : ''}
</th></tr>
```

```tsx
<tr><th colSpan={2} className="section-heading">
  Source{focusPosition === 'source' || focusPosition === 'both' ? ' (focused)' : ''}
</th></tr>
```

Where `focusPosition` is computed once from `store.getFocusPosition(message)`. For self-messages (`'both'`), both headings get the "(focused)" label.

### Step 10: Add CSS Styling
**File**: `/src/panel/panel.css`

Add styles:
```css
/* Focused Frame Dropdown */
.frame-focus-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}

.frame-focus-selector label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.frame-focus-selector select {
  font-size: 12px;
  padding: 2px 4px;
  border: 1px solid #cacdd1;
  border-radius: 2px;
  background: white;
  max-width: 300px;
}

/* Direction Icon SVG */
.direction-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.direction-icon svg {
  width: 16px;
  height: 16px;
}
```

The existing `.dir-parent`, `.dir-child`, etc. color classes already set `color` on the `<td>`, which the SVG inherits via `currentColor`.

## Critical Implementation Details

### Source Frame Resolution
The `Message` model already provides computed `sourceFrame` and `targetFrame` properties that resolve through `FrameStore`. These return `Frame` objects with `tabId` and `frameId` properties. No need for a separate resolution method — just use `msg.sourceFrame` and `msg.targetFrame`.

Key consideration: `sourceFrame` may be `undefined` if the source hasn't registered yet. `targetFrame` may also be `undefined` if the target document hasn't been correlated. The `getFocusPosition()` method must handle these gracefully by returning `'none'` when frames can't be resolved.

### Partner Type Inversion Logic
When focused frame is the **target** of a message, invert the source type:
- `parent` → `child`
- `child` → `parent`
- `top` → `child` (treat as child from the target's perspective)
- `opener` → `opened`
- `opened` → `opener`
- `self` → `self`

### Focus Position Determination
Logic in `getFocusPosition()`:
1. If no focus selected (`focusedFrameId == null`): return `'none'`
2. Get `msg.sourceFrame` and `msg.targetFrame`
3. Compare both `frameId` AND `tabId` (to handle cross-tab messages correctly)
4. If both match focusedFrameId: return `'both'` (self-message)
5. If source matches: return `'source'`
6. If target matches: return `'target'`
7. Otherwise: return `'none'` (focus not involved)

### SVG Icon Generation
For each sourceType and focusPosition combination:
- Draw arrow path in `currentColor`
- Add 3x3 rectangle on appropriate side if focus is `'source'` or `'target'`
- Rectangle color: #1a73e8 (blue, matching DevTools theme)
- Include appropriate spacing so indicator doesn't overlap arrow
- For `'both'` (self-messages): render without indicator since it's the same frame on both sides

### getDirectionIcon() Backward Compatibility
`store.getDirectionIcon()` is used in two places:
1. `getCellValue()` for the direction column — still returns a string for sorting/filtering
2. `FrameDetail.tsx` line 43 — renders inline with sourceType text

The string-returning method can remain for sorting purposes. `FrameDetail.tsx` should be updated to use the `DirectionIcon` component for visual consistency.

## Testing Plan

Tests go in `e2e/panel.spec.ts` alongside the existing Playwright tests. The test harness already provides a parent frame (frameId=0, `https://parent.example.com/`) and child iframe (frameId=1, `https://child.example.com/`) with cross-origin messaging. Use the existing `sendAndWait()` helper for message timing.

### Test Harness Additions

The harness (`src/test/test-harness-entry.ts`) needs a convenience method for selecting the focused frame dropdown, or tests can interact with the `<select>` element directly:

```typescript
// Select focused frame by value
const dropdown = page.locator('.frame-focus-selector select');
await dropdown.selectOption('0');  // frame[0]

// Clear focused frame
await dropdown.selectOption('');   // "None"
```

For SVG direction icon assertions, check for the presence/absence of the focus indicator rectangle element:

```typescript
const dirCell = row.locator('td[data-column="direction"]');
const indicator = dirCell.locator('.focus-indicator');  // or svg rect with specific class
await expect(indicator).toBeVisible();
```

For opener/opened tests, the harness's `env.openPopup()` can set up popup windows.

### Playwright Test Descriptions

**File**: `e2e/panel.spec.ts` — new `test.describe('focused frame')` block

#### Default State (no focus selected)

```typescript
test('dropdown defaults to None', async ({ page }) => {
  // Verify the focused frame dropdown exists and shows "None" / empty value
});

test('direction icons have no focus indicator when no frame focused', async ({ page }) => {
  await sendAndWait(page, 'window.harness.sendChildToParent({ type: "test" })');
  // Verify direction cell SVG has no focus indicator element
});
```

#### Focus on Parent Frame

```typescript
test('parent-to-child message shows source focus indicator when parent focused', async ({ page }) => {
  // Select frame[0] in dropdown
  // sendParentToChild
  // Verify direction cell has focus indicator on source (left) side
});

test('child-to-parent message shows target focus indicator when parent focused', async ({ page }) => {
  // Select frame[0] in dropdown
  // sendChildToParent
  // Verify direction cell has focus indicator on target (right) side
});
```

#### Focus on Child Frame

```typescript
test('child-to-parent message shows source focus indicator when child focused', async ({ page }) => {
  // Select frame[1] in dropdown
  // sendChildToParent
  // Verify direction cell has focus indicator on source (left) side
});

test('parent-to-child message shows target focus indicator when child focused', async ({ page }) => {
  // Select frame[1] in dropdown
  // sendParentToChild
  // Verify direction cell has focus indicator on target (right) side
});
```

#### Opener/Opened Windows

```typescript
test('opener-to-opened shows source focus indicator when opener focused', async ({ page }) => {
  // Use env.openPopup() to create popup
  // Select opener frame in dropdown
  // Send message from opener to opened
  // Verify direction cell has focus indicator on source (left) side
});

test('opened-to-opener shows target focus indicator when opener focused', async ({ page }) => {
  // Use env.openPopup() to create popup
  // Select opener frame in dropdown
  // Send message from opened to opener
  // Verify direction cell has focus indicator on target (right) side
});
```

#### Uninvolved Messages

```typescript
test('messages not involving focused frame show gray dot', async ({ page }) => {
  // Add a third frame (frame[2]) via topFrame.addIframe()
  // Select frame[2] in dropdown
  // sendChildToParent (between frame[0] and frame[1], not involving frame[2])
  // Verify direction cell shows uninvolved indicator (gray dot), not an arrow
});
```

#### Self-Messages

```typescript
test('self-message shows circular arrow without focus indicator', async ({ page }) => {
  // Select frame[0] in dropdown
  // Send message from parent to itself
  // Verify direction shows self arrow without focus indicator rectangles
});
```

#### Detail Pane Section Headings

```typescript
test('detail pane shows (focused) on target heading when target is focused', async ({ page }) => {
  // Select frame[0] (parent) in dropdown
  // sendChildToParent (parent is target)
  // Click row to open detail pane, switch to Context tab
  // Verify "Target (focused)" heading text
  // Verify "Source" heading text (no focused label)
});

test('detail pane shows (focused) on source heading when source is focused', async ({ page }) => {
  // Select frame[1] (child) in dropdown
  // sendChildToParent (child is source)
  // Click row, switch to Context tab
  // Verify "Source (focused)" heading text
  // Verify "Target" heading text (no focused label)
});
```

#### Partner Columns

```typescript
test('partner columns show correct values when focused frame is source', async ({ page }) => {
  // Enable partnerFrame and partnerType columns via store or context menu
  // Select frame[0] in dropdown
  // sendParentToChild
  // Verify partnerFrame cell shows "frame[1]"
  // Verify partnerType cell shows "child"
});

test('partner columns show inverted type when focused frame is target', async ({ page }) => {
  // Enable partnerFrame and partnerType columns
  // Select frame[0] in dropdown
  // sendChildToParent (parent is target, sourceType is "child")
  // Verify partnerType cell shows "child" (inverted: the partner is a child)
});

test('partner columns are empty for uninvolved messages', async ({ page }) => {
  // Add frame[2], select it as focused
  // sendChildToParent (between frame[0] and frame[1])
  // Verify partnerFrame and partnerType cells are empty
});
```

#### Retroactive Calculation

```typescript
test('setting focus after messages are captured updates direction icons', async ({ page }) => {
  // Send messages first (no focus set)
  // Then select frame[0] in dropdown
  // Verify existing rows now show focus indicators
  // (MobX reactivity should handle this automatically)
});
```

#### Persistence

```typescript
test('focused frame selection persists across page reload', async ({ page }) => {
  // Select frame[0] in dropdown
  // Reload page (page.goto('/test.html') again)
  // Wait for harness
  // Verify dropdown still shows frame[0] selected
});
```

#### Dropdown Content

```typescript
test('dropdown lists all frames from hierarchy', async ({ page }) => {
  // Verify dropdown has options for frame[0] and frame[1]
  // Each option should show frame ID and origin
});

test('dropdown shows dynamically added frames', async ({ page }) => {
  // Add frame via topFrame.addIframe()
  // Verify new frame appears in dropdown options
});
```

## Build and Test Process

```bash
# Run Playwright e2e tests
npm run test:e2e

# Run with UI for debugging
npm run test:e2e:ui

# Run a specific test
npx playwright test -g "focused frame"

# Build the extension for manual testing
npm run build
```

## Critical Files to Modify

1. `/src/panel/store.ts` - Add focusedFrameId state, setFocusedFrame action, getFocusPosition/getPartnerFrame/getPartnerType methods, update loadPersistedState
2. `/src/panel/types.ts` - Add partnerFrame and partnerType to ALL_COLUMNS
3. `/src/panel/components/shared/DirectionIcon.tsx` - NEW: SVG icon component
4. `/src/panel/components/MessagesView/FrameFocusDropdown.tsx` - NEW: Frame focus selector dropdown
5. `/src/panel/components/MessagesView/TopBar.tsx` - Add FrameFocusDropdown after Preserve log
6. `/src/panel/components/MessagesView/MessageTable.tsx` - Render DirectionIcon in MessageRow for direction column
7. `/src/panel/components/MessagesView/DetailPane.tsx` - Add Partner section in ContextTab
8. `/src/panel/components/shared/FrameDetail.tsx` - Update sourceType line to use DirectionIcon component
9. `/src/panel/field-info.ts` - Add partnerFrame and partnerType field metadata
10. `/src/panel/panel.css` - Add frame-focus-selector and direction-icon styles

## Success Criteria

- Frame focus dropdown populated from frame hierarchy
- Focus selection persists across DevTools close/reopen
- Direction SVG icons visually match the previous Unicode arrows when no focus is selected
- Direction icons clearly show which side has the focused frame via indicator rectangle
- Partner frame and type correctly calculated from focus perspective
- Partner type properly inverted when focus is target
- All features work in cross-origin scenarios
- No performance degradation with many messages
- Graceful handling when focus frame not involved in message or frames not yet resolved
