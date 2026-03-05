# Cross-Pane Frame Navigation

## Goal

Make it easy for users to navigate between the Log and Sources panes using frame identifiers. Frame actions are available in the Log pane's context tab and the Sources pane's frame detail pane.

## Log Pane — Context Tab

The "Target" and "Source" section headers get inline SVG icon action buttons via a shared `FrameActionButtons` component. Buttons are conditionally rendered only when the corresponding frame (targetFrame/sourceFrame) exists.

```
Target (focused)              [funnel] [pin] [arrow]
  tab       tab[1]
  frame     frame[0]
  origin    example.com

Source                        [funnel] [pin] [arrow]
  sourceType  ↘ child
  tab         tab[1]
  frame       frame[1]
```

Three actions per section:
1. **Filter** (funnel icon) — Sets filter to `frames:"tab[T].frame[N]"` for that frame
2. **Focus** (map pin icon) — Sets the focused frame via `store.setFocusedFrame`
3. **View in Sources** (play/arrow icon) — Switches to Sources view and selects that frame

Buttons are 18x18px icon-only buttons (smaller than the 22px `.icon-btn` pattern since they appear inline). All handlers call `e.stopPropagation()` to prevent row selection side effects.

## Sources Pane — Frame Detail Pane

A "Show messages" text button in the title bar, between "Frame Details" and the close button. Uses `margin-left: auto` to push right in the flexbox title bar. Conditionally rendered only when `frameInfo.frameId` is a number and `frameInfo.tabId` is not null.

```
┌──────────────────────────────────┐
│ Frame Details     [Show messages] │
├──────────────────────────────────┤
│ tab       tab[1]                  │
│ frame     frame[1]                │
│ origin    child.example.com       │
└──────────────────────────────────┘
```

This single action:
1. Sets focused frame to the selected frame
2. Sets filter to `frames:"tab[T].frame[N]"`
3. Switches view to Log

## Files Changed

- `src/panel/store.ts` — Added `buildFrameFilter`, `navigateToFrameMessages`, `viewFrameInSources` methods
- `src/panel/store.test.ts` — Unit tests for the store methods
- `src/panel/components/shared/FrameActionButtons.tsx` — Shared component rendering the 3 icon buttons
- `src/panel/components/LogView/DetailPane.tsx` — Added `FrameActionButtons` to Target/Source section headers
- `src/panel/components/SourcesView/SourcesView.tsx` — Added "Show messages" button to FrameDetailPane title bar
- `src/panel/panel.css` — Added `.frame-action-buttons`, `.frame-action-btn`, `.show-messages-btn` styles
- `e2e/panel.spec.ts` — 4 e2e tests covering action buttons, filter, view-in-sources, and show-messages
