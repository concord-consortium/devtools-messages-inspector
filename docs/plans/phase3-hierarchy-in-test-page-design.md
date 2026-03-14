# Phase 3: Integrate Hierarchy Map into Test Page

## Goal

Embed the hierarchy map in the test harness page (`test.html`) as a left sidebar alongside the Messages Inspector panel. The map serves two purposes: interactive control (click action buttons to manipulate the harness) and visual reference (stays in sync when the harness is driven from console or Playwright tests).

## Layout

Left sidebar (around 280px wide) added to `#panel-container` in `test.html`, with a border separating it from the panel. The sidebar CSS goes in `test.html`'s existing `<style>` block. `#root` gets `flex: 1; min-width: 0;` to fill remaining space. The sidebar contains two tabs across the top:

- **Map** (default): The `HierarchyMap` component showing the frame tree with action buttons, plus a "+ Tab" button for creating new tabs.
- **Log**: The action log showing dispatched actions and their resulting hierarchy events, same format as the standalone hierarchy map page.

The Messages Inspector panel takes the remaining width on the right.

```
┌──────────────────────────────────────────────────────┐
│ Banner                                               │
├──────────────────┬───────────────────────────────────┤
│ [Map] [Log]      │                                   │
│──────────────────│   Messages Inspector Panel        │
│ tab[1]           │                                   │
│   frame[1]       │   #  Source    Target    Data      │
│     doc[1]       │   1  parent   child     {..}      │
│       iframe[1]  │   2  child    parent    {..}      │
│         frame[2] │                                   │
│           doc[2] │                                   │
│                  │                                   │
│ [+ Tab]          │                                   │
│ [Purge Stale]    │                                   │
├──────────────────┴───────────────────────────────────┤
```

## State Management

`HarnessRuntime` already holds `hierarchyState` and `actionLog`. Make these MobX observables:

- Add `makeObservable(this, { hierarchyState: observable.ref, actionLog: observable.ref })` to the `HarnessRuntime` constructor.
- Use `observable.ref` (not deep) — both properties are replaced with new values (not mutated in place).
- In `dispatch()`, wrap mutations in `runInAction()` and replace `actionLog` with a new array (`this.actionLog = [...this.actionLog, entry]`) instead of using `push()`, since `observable.ref` only tracks reference identity.

The sidebar React component uses `observer()` from `mobx-react-lite` to auto-re-render when either property changes. This handles all update sources: button clicks in the map, console commands via `harness.actions.*()`, and Playwright test automation.

## New Component: HarnessSidebar

File: `src/test/HarnessSidebar.tsx`

An `observer()` component that takes `runtime: HarnessRuntime` as a prop and renders:

1. **Tab bar** with "Map" and "Log" tabs. "Map" is active by default.
2. **Map tab**:
   - "+ Tab" button and "Purge Stale" button below the tree
   - "+ Tab" dispatches `create-tab` with a default URL (e.g., `https://new-tab.example.com/`)
   - `HierarchyMap` component with `root={runtime.hierarchyState.root}` and `onAction={(action) => runtime.dispatch(action)}`
3. **Log tab**:
   - Reuses the `ActionLog` component pattern from `src/hierarchy-map/entry.tsx` — each entry shows the action as JSON and its resulting events indented below.

The component imports `HierarchyMap.css` for hierarchy map styles.

## Reuse from Standalone Page

The `ActionLog` component in `src/hierarchy-map/entry.tsx` renders the log format we want. Extract it (and its `ActionLogEntry` type) into a shared location so both the standalone page and `HarnessSidebar` can use it. A reasonable location is `src/hierarchy-map/ActionLog.tsx`. The extracted file imports the relevant CSS classes from `HierarchyMap.css`.

## Wiring in test-harness-entry.ts

After mounting the panel `App` into `#root`, also mount `HarnessSidebar` into `#hierarchy-sidebar`:

```ts
const sidebar = document.getElementById('hierarchy-sidebar');
if (sidebar) {
  createRoot(sidebar).render(React.createElement(HarnessSidebar, { runtime }));
}
```

## Files Changed

- `test.html` — add `#hierarchy-sidebar` div inside `#panel-container`, before `#root`
- `src/test/harness-runtime.ts` — add MobX `makeObservable` and `runInAction` to make `hierarchyState` and `actionLog` observable
- `src/test/HarnessSidebar.tsx` — new component
- `src/hierarchy-map/ActionLog.tsx` — extract `ActionLog` component from `entry.tsx`
- `src/hierarchy-map/entry.tsx` — import `ActionLog` from new shared location
- `src/test/test-harness-entry.ts` — mount `HarnessSidebar` into `#hierarchy-sidebar`

## New Phase in Design Doc

Add to the "Remaining Phases" section of `docs/action-centric-hierarchy-design.md` (not implemented in Phase 3):

**Phase 6: Multi-panel extension instances.** Add an "Open Extension" action on tab nodes in the hierarchy map. Each click creates a new Messages Inspector panel instance connected to that tab. The right side becomes a tabbed container with one UI tab per open panel, allowing simultaneous monitoring of multiple harness tabs without losing messages.
