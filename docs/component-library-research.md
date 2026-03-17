# Component Library Research

## Goal

Evaluate React component libraries for use in the extension panel to replace hand-built UI components.

## Current Custom UI Components

Inventory of all UI components/controls currently built from scratch in the panel.

### Layout

| Component | Location | Description |
|-----------|----------|-------------|
| **SplitPane** | `shared/SplitPane.tsx` | Horizontal draggable splitter with ResizeObserver-based responsive sizing, min/max constraints |
| **Sidebar navigation** | `App.tsx` | Vertical tab list (Log, Endpoints, Settings) with active indicator |
| **Top bar** | `LogView/TopBar.tsx` | Toolbar row with icon buttons and inline controls |

### Data Display

| Component | Location | Description |
|-----------|----------|-------------|
| **MessageTable** | `LogView/MessageTable.tsx` | Full-featured data table: sortable columns, resizable column widths, row selection, column visibility toggle via context menu |
| **FrameTable** | `EndpointsView/EndpointsView.tsx` | Hierarchical tree table showing frame parent-child relationships with indentation |
| **JsonTree** | `shared/JsonTree.tsx` | Recursive expandable/collapsible JSON viewer with color-coded value types |
| **FrameDetail** | `shared/FrameDetail.tsx` | Label-value property table for frame metadata |
| **DetailPane** | `LogView/DetailPane.tsx` | Tabbed panel (Data, Context) with close button for viewing message details |
| **DirectionIcon** | `shared/DirectionIcon.tsx` | SVG icon with 6 direction variants and 4 focus-highlight states |

### Controls & Inputs

| Component | Location | Description |
|-----------|----------|-------------|
| **Icon buttons** | `panel.css` (CSS-drawn icons) | Small action buttons: record, clear, export, refresh — icons via `::before`/`::after` pseudo-elements |
| **FilterBar** | `LogView/FilterBar.tsx` | Text input with optional togglable "Global filter" chip |
| **FrameFocusDropdown** | `LogView/FrameFocusDropdown.tsx` | `<select>` dropdown showing frame hierarchy with indentation via non-breaking spaces |
| **Settings checkboxes** | `App.tsx` | Native checkboxes with labels, nesting, and disabled states for settings form |
| **FrameActionButtons** | `shared/FrameActionButtons.tsx` | Inline group of 3 small icon buttons (filter, focus, view) |

### Overlays & Popups

| Component | Location | Description |
|-----------|----------|-------------|
| **Context menus** | `MessageTable.tsx` | Fixed-position menus for column visibility toggles and cell filter options |
| **FieldInfoPopup** | `shared/FieldInfoPopup.tsx` | Hover-triggered tooltip/popover with smart positioning and show/hide delays |

### Summary

**Key component types to evaluate in libraries:**
1. **Data table** — sortable, resizable columns, row selection, context menus, column visibility
2. **Resizable split pane** — draggable divider with constraints
3. **Tree view / JSON viewer** — recursive expand/collapse
4. **Hierarchical tree table** — table rows with parent-child indentation
5. **Tabs** — tab switcher with content panels
6. **Toolbar / icon buttons** — compact action bar with small icon-only buttons
7. **Context menu** — right-click floating menu
8. **Tooltip / popover** — hover-triggered with smart positioning
9. **Sidebar navigation** — vertical nav with active state
10. **Filter input with chips** — text field with togglable badge
11. **Settings form controls** — checkboxes, text inputs, grouped sections

## Candidate Libraries

### Popularity, Activity & Codebase Size (as of 2026-03-14)

| Library | Type | Age | Stars | npm/wk | Last Commit | PRs (30d) | ~Source Lines | Contribution Ease |
|---------|------|-----|-------|--------|-------------|-----------|---------------|-------------------|
| **shadcn/ui** | Copy-paste | ~2 yr | 109k | 2.1M | 2026-03-14 | 83 | N/A (copied) | N/A (you own code) |
| **MUI** | Styled | ~12 yr | 98k | 6.8M | 2026-03-14 | 154 | ~85k | Good (funded team, no CLA) |
| **Ant Design** | Styled | ~11 yr | 98k | 2.5M | 2026-03-14 | 192 | ~85k + 50 rc-* repos | Moderate (language barrier) |
| **Radix Primitives** | Headless | ~5 yr | 19k | 19.3M* | 2026-02-13 | 0 | ~23k | Poor (PRs go stale) |
| **React Aria** | Headless | ~6 yr | 15k | 1.8M | 2026-03-14 | 62 | ~91k | High friction (CLA, corporate priorities) |
| **Headless UI** | Headless | ~5 yr | 28k | 4.1M | 2025-12-12 | 0 | — | Impossible (dormant) |
| **Mantine** | Styled | ~5 yr | 31k | 1.2M | 2026-03-05 | 6 | ~58k | Good (welcoming, no CLA) |
| **Chakra UI** | Styled | ~5 yr | 40k | 1.0M | 2026-03-09 | 13 | — | Moderate |
| **Ariakit** | Headless | ~3 yr | 9k | 559k | 2026-03-14 | 129 | ~33k | Uncertain (solo maintainer) |
| **Ark UI** | Headless | ~3 yr | 5k | 479k | 2026-03-13 | 11 | ~24k (+Zag.js) | Small team |

\* Radix npm downloads are heavily inflated by shadcn/ui, which depends on Radix primitives under the hood.

All are MIT-licensed except React Aria (Apache-2.0). Both are permissive open-source licenses.

**Codebase size notes:** Smaller codebases are easier to contribute bug fixes to and less likely to become unmaintainable if the backing org moves on. Ant Design's true size is much larger than the in-repo 85k lines — core logic for table, select, tree, etc. lives in ~50 separate `rc-*` repos. Ark UI's 24k lines are thin React wrappers over Zag.js (a separate state machine library), so contributing a fix may require navigating two repos.

### Library Types

**Headless** libraries (Radix, React Aria, Headless UI, Ariakit, Ark UI) provide component behavior, state management, and accessibility (ARIA attributes, keyboard navigation, focus management) but ship no visual styling. You write all the CSS yourself. This gives full control over appearance but means more work to build a polished UI. Good fit when you have an existing design or need to match a specific visual style (like Chrome DevTools).

**Styled** libraries (MUI, Ant Design, Mantine, Chakra UI) ship complete visual designs out of the box — buttons look like buttons, tables look like tables immediately. They include theming systems to customize colors, spacing, etc., but overriding their built-in styles to match a very different design language (e.g., DevTools' compact look) can require fighting the library's defaults. Good fit when you're happy adopting the library's visual style or only need light theming.

**Copy-paste** (shadcn/ui) is a hybrid approach: you run a CLI that copies component source code directly into your project (built on Radix primitives + Tailwind CSS). You own the code and can modify it freely, but you also own the maintenance burden. Updates require re-running the CLI and reconciling changes. Good fit when you want a starting point with full control, but adds a Tailwind CSS dependency.

### Note on Tailwind CSS

Several libraries above depend on **Tailwind CSS** (shadcn/ui, Park UI, JollyUI, HeroUI, Catalyst). Tailwind is a utility-first CSS framework where instead of writing CSS rules in a separate file, you compose styles directly in JSX via small single-purpose class names (e.g., `className="flex items-center px-2 py-1 bg-gray-100 border-b"`). Tailwind provides a consistent design token scale for spacing, colors, and typography, and only generates CSS for classes actually used.

Adopting a Tailwind-based library would mean replacing the current vanilla CSS approach (~900 lines in `panel.css`) with utility classes spread across component files, and adding a Tailwind build plugin. This is a significant style-system change on top of the component library change itself. Libraries that don't require Tailwind (Radix Themes, React Spectrum, MUI, Ant Design, Mantine, Chakra UI, and the headless libraries with custom CSS) avoid this additional dependency.

### Styled Layers for Headless Libraries

Each headless library has official or community-built styled companions:

| Headless Library | Official Styled Layer | Community Styled Layers |
|------------------|----------------------|------------------------|
| **Radix Primitives** | Radix Themes (`@radix-ui/themes`) | shadcn/ui (copy-paste + Tailwind) |
| **React Aria** | React Spectrum (`@adobe/react-spectrum`) — Adobe's design system | JollyUI (shadcn-style + React Aria), HeroUI (Tailwind) |
| **Headless UI** | Catalyst / Tailwind Plus (paid) | — |
| **Ariakit** | `@ariakit/tailwind` plugin; Ariakit Plus (paid examples) | — |
| **Ark UI** | Park UI (`@park-ui/*`, copy-paste + Tailwind or Panda CSS) | — |

Radix has the largest ecosystem of styled options, largely driven by shadcn/ui's popularity. React Aria is second with JollyUI and HeroUI. The others have official companions but limited third-party activity.

### Activity Observations

- **Most actively maintained:** Ant Design, MUI, and Ariakit have the highest PR merge rates.
- **Appears dormant:** Headless UI has had no commits since Dec 2025 and zero PRs merged/issues closed. Radix Primitives also shows near-zero activity in the last 30 days.
- **Ariakit** has unusually high development activity (129 PRs merged) relative to its star count (9k), suggesting rapid iteration.
- **Issue health:** shadcn/ui, Ant Design, and MUI are closing more issues than they open. Headless UI and Chakra UI have growing backlogs.

## Component Coverage Gaps

Headless libraries generally focus on interactive controls (dialogs, menus, dropdowns, tabs, tooltips) rather than layout primitives. Some of our component types aren't covered by most libraries:

### Split Pane / Resizable Panels

Only 3 of the 10 candidate libraries include a splitter component:
- **Ark UI** — `Splitter.Root` / `Splitter.Panel` / `Splitter.ResizeHandle` (built on Zag.js)
- **Chakra UI** (v3) — inherits Ark UI's splitter
- **Ant Design** — `Splitter` / `Splitter.Panel`

The rest (Radix, React Aria, Headless UI, Ariakit, MUI, Mantine, shadcn/ui) do not provide one.

The dominant standalone option is **react-resizable-panels** (~6.9M weekly downloads, 5k stars) by Brian Vaughn (former React core team, created React DevTools). It's headless/unstyled, follows WAI-ARIA accessibility patterns, and is what shadcn/ui wraps as its "Resizable" component. For any library that lacks a built-in splitter, this would be the complement.

## Library Evaluation

### Coverage Matrix

| Component | shadcn | MUI | Ant Design | Radix | React Aria | Headless UI | Mantine | Chakra UI | Ariakit | Ark UI |
|-----------|--------|-----|------------|-------|------------|-------------|---------|-----------|---------|--------|
| Data table | Partial | **Yes** | Partial | No | Partial | No | Partial | Partial | No | No |
| Split pane | **Yes** | No | **Yes** | No | No | No | No | **Yes** | No | **Yes** |
| Tree view | No | **Yes** | **Yes** | No | **Yes** | No | **Yes** | **Yes** | No | **Yes** |
| Tree table | Partial | **Yes**\* | **Yes** | No | Partial | No | No | No | No | No |
| Tabs | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** |
| Toolbar | Partial | Partial | Partial | **Yes** | **Yes** | No | Partial | Partial | **Yes** | No |
| Context menu | **Yes** | Partial | **Yes** | **Yes** | Partial | No | Partial | **Yes** | Partial | Partial |
| Tooltip/popover | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** |
| Sidebar nav | **Yes** | **Yes** | **Yes** | Partial | No | No | **Yes** | Partial | No | No |
| Filter + chips | No | **Yes** | Partial | No | Partial | No | **Yes** | **Yes** | No | **Yes** |
| Form controls | **Yes** | **Yes** | **Yes** | Partial | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** |
| **Covered** | **6:2** | **8:2** | **7:3** | **4:2** | **5:3** | **3:0** | **7:2** | **7:2** | **4:1** | **6:1** |

\* MUI DataGrid tree data requires the paid Pro plan.

### Coverage Tally

| Library | Yes | Partial | No |
|---------|-----|---------|-----|
| **MUI** | 8 | 2 | 1 |
| **Ant Design** | 7 | 3 | 1 |
| **Mantine** | 7 | 2 | 2 |
| **Chakra UI** | 7 | 2 | 2 |
| **shadcn/ui** | 6 | 2 | 3 |
| **Ark UI** | 6 | 1 | 4 |
| **React Aria** | 5 | 3 | 3 |
| **Radix Primitives** | 4 | 2 | 5 |
| **Ariakit** | 4 | 1 | 6 |
| **Headless UI** | 3 | 0 | 8 |

### Notable Details

**Data table** is the most critical component (it's the main UI) and the hardest to cover:
- **MUI** is the only library with a full-featured DataGrid out of the box (sorting, resizable columns, row selection, column visibility, column menus). Free Community tier covers all our needs.
- **shadcn/ui**, **Ant Design**, **Mantine**, and **Chakra UI** have partial table support — typically sorting and row selection, but column resizing requires manual integration with TanStack Table or third-party packages.
- Headless libraries (Radix, Ariakit, Headless UI) have no table component at all. React Aria has a table with sorting, selection, and resizable columns but no column visibility toggle.

**Tree table** (hierarchical frame table) is rare:
- Only **Ant Design** provides this free out of the box (via `children` in dataSource).
- **MUI** has it in the paid DataGrid Pro tier.

**Toolbar** with proper ARIA keyboard navigation (roving tabindex) is only in **Radix**, **React Aria**, and **Ariakit**. Other libraries have button groups but without the accessibility pattern.

**Context menu** (right-click triggered) is a dedicated component in **shadcn/ui**, **Radix**, **Ant Design**, and **Chakra UI**. Others require manual `onContextMenu` wiring.

**No library provides a JSON viewer.** All tree components are general-purpose trees. A JSON viewer would remain custom or use a standalone package (see react-inspector below).

## DevTools-Style Packages

Chrome DevTools itself doesn't use React — it's built with custom Web Components and lit-html. There is no published DevTools design spec (unlike Google's Material Design). The CSS variables and design tokens live in the Chromium source under `front_end/ui/legacy/` and `front_end/ui/components/`, and internal design guidelines exist at Google but aren't public. In practice, people building DevTools-like UIs inspect Chrome DevTools with a second DevTools instance (undock DevTools, then Ctrl+Shift+I on it) and copy values directly. This lack of a formal spec reinforces the headless approach — since there's no spec to implement as a theme, keeping your own CSS that's already tuned to look right is simpler than expressing DevTools aesthetics through a styled library's theming system.

No DevTools-specific themes exist for any of the major component libraries. However, there are packages specifically built to replicate the DevTools look:

| Package | Downloads/week | Stars | Last Update | Description |
|---------|---------------|-------|-------------|-------------|
| **react-inspector** (Storybook) | ~2M | 844 | Jan 2026 | Object/Table/DOM inspectors with Chrome light/dark themes |
| **@devtools-ds/\*** (Intuit) | ~179k (inspector) | 215 | Jun 2024 | Full DevTools design system: table, tree, console, inspector, navigation. Auto-switches Chrome/Firefox themes. Low activity. |

### react-inspector Deep Dive

`react-inspector` provides 4 components:
- **ObjectInspector** — tree-view object explorer, like `console.log` output in DevTools
- **TableInspector** — tabular data display, like `console.table`
- **DOMInspector** — renders DOM nodes with HTML-like syntax (tag names, attributes, colors)
- **Inspector** — auto-selector that picks the right inspector based on the data type

**Bundle:** ~6.5 KB gzipped, zero runtime dependencies, peer dep on React 18/19.

**Theming:** Built-in `chromeLight` (default) and `chromeDark` presets. Customizable via theme object with variables for colors (keys, strings, numbers, booleans, null), fonts, indent, arrow styles, and preview limits.

**Key features beyond our custom JsonTree:**
- `expandLevel={N}` — control initial expansion depth
- `expandPaths={['$.foo', '$.bar.baz']}` — programmatically expand specific paths
- Richer collapsed previews: shows `{key: value, ...}` instead of just `{...}`
- `sortObjectKeys` — alphabetical or custom sort
- `showNonenumerable` — show non-enumerable properties
- `nodeRenderer` — fully custom node rendering
- Built-in theming with easy customization

**Comparison with our JsonTree:**

| Feature | Our JsonTree | react-inspector |
|---------|-------------|-----------------|
| Expand/collapse | Per-node | Per-node + `expandLevel` + `expandPaths` |
| Color-coded values | Yes (via CSS classes) | Yes (via theme variables) |
| Collapsed preview | `{...}` / `Array(n)` | `{key: value, ...}` / `(n) [item, ...]` |
| Indent | 16px | 12px default (configurable) |
| Initial expand depth | All expanded | Configurable via `expandLevel` |
| Custom rendering | No | `nodeRenderer` prop |
| Dark theme | Manual CSS | Built-in `chromeDark` preset |
| Sort keys | No | `sortObjectKeys` prop |
| Search/filter | No | No |
| Bundle cost | 0 KB (custom) | ~6.5 KB gzipped |

react-inspector would be a strong replacement for our custom JsonTree — more features, DevTools-accurate styling, and minimal bundle cost. The main limitation is no search/filter (which our JsonTree also lacks).

## Library Reviews

Evaluated against these priorities: (1) longevity — will it still be maintained in 5 years, (2) contribution friendliness — can I get a bug fix PR merged upstream (smaller codebases are easier to contribute to), (3) net maintenance reduction — does it reduce what I maintain (both code volume and complexity of interaction logic like accessibility, keyboard nav, focus management), (4) learning curve — how much effort to use and update, (5) DevTools theme viability — if popular, is a reusable DevTools theme worth creating.

**Approach philosophy:** Prefer a small framework that provides basic interactive components (tabs, menus, tooltips, context menus, popovers) and makes it easy to integrate standalone libraries for complex components (data table, split pane, JSON viewer). Complex standalone components that work across multiple frameworks are more flexible and more likely to survive. A monolithic library with a built-in table is a liability — if the library dies, the table migration is painful.

### Tier 1: Worth Prototyping

#### Ariakit (headless)

**Longevity:** Uncertain but trending well. Solo maintainer (Diego Haz), 9k stars, 3 years old. Very actively developed (129 PRs/month — all by the maintainer). Funded via Open Collective/GitHub Sponsors. Bus factor is 1, but the codebase is small enough (~33k lines) that forking is realistic if needed.

**Contribution:** No CLA. ~33k lines is manageable to navigate. Solo-maintainer means review capacity is limited and API decisions are one person's opinion, but the small codebase means you can understand the code and make a compelling case for a fix.

**Maintenance reduction:** Offloads the hardest-to-maintain code: keyboard navigation, focus management, ARIA attributes, open/close state machines, click-outside dismissal, escape key handling, scroll locking, portal rendering. You keep your CSS (which is the easier part to maintain). Covers the basic interactive components well: tabs, menus, context menus, tooltips, popovers, toolbar with roving tabindex. No opinion on complex components (table, split pane) — you integrate standalone libraries for those.

**Learning curve:** Low. Clean, focused API. Good docs and examples. Composable pattern (`useMenuStore()`, `<Menu>`, `<MenuItem>`) is straightforward.

**DevTools theme:** N/A — headless, so your existing CSS works as-is. This is actually an advantage: no theming layer to fight. Zero visual opinions to override.

**Verdict:** Best match for the "small framework + standalone components" philosophy. Small codebase, no visual opinions to fight, handles the interaction complexity you don't want to maintain. Integrates naturally with standalone table/splitter/JSON libraries. Worth prototyping to see how much interaction code it replaces in practice (FieldInfoPopup, context menus, tabs, toolbar).

#### Mantine (styled)

**Longevity:** Good. 31k stars, 1.2M weekly downloads, 5 years old, actively maintained. Risk: primarily one maintainer (Vitaly Rtishchev). If he steps away, the project could stall. Mitigated by the large contributor base (500+) and its established position.

**Contribution:** Very welcoming. No CLA. Contributing guide explicitly says "if you cannot finish your task, that's totally fine." Over 500 contributors. Low-pressure culture. Codebase is ~58k lines — mid-range, navigable for bug fixes.

**Maintenance reduction:** Goes further than headless — replaces both interaction logic AND most of panel.css with theme tokens. Compact sizes built-in (`compact-xs`, `compact-sm`). Flat aesthetic already close to DevTools. CSS variable system makes overrides straightforward. Delegates complex components to standalone libraries (e.g., TanStack Table for data table), consistent with the "small framework + integrate" philosophy.

**Learning curve:** Low. Clean API, good docs. Theme customization via `createTheme()` is intuitive. No unusual patterns.

**DevTools theme:** Promising. Mantine's flat aesthetic and CSS variable theming make a DevTools theme relatively easy to build and maintain. The compact size system is a strong foundation. Could be reusable by others building DevTools extensions.

**Verdict:** Best option if the goal expands to also reducing CSS maintenance. The question is whether its visual opinions help (less CSS to write) or hurt (theming friction to match DevTools). Worth prototyping alongside Ariakit to compare the two approaches: pure headless + own CSS vs. styled with DevTools theme.

### Tier 2: Possible But With Tradeoffs

#### Ant Design (styled)

**Longevity:** Excellent. 98k stars, 2.5M weekly downloads, 11 years old, backed by Alibaba. 192 PRs merged in 30 days.

**Contribution:** Structured process. No CLA. But the codebase is huge (~85k in-repo + ~50 separate rc-* repos for core logic). Contributing a fix to the table means navigating rc-table, a separate repo. Language/timezone barriers with the China-based team add friction.

**Maintenance reduction:** Best built-in coverage — but this is a double-edged sword. The built-in tree table, splitter, and context menu are tightly coupled to Ant Design. If you ever need to leave, migrating those components is painful. Compact + dark theme algorithms get 70-80% to DevTools aesthetic, but the remaining 20-30% has quirks (compact algorithm modifies font sizes unexpectedly).

**Learning curve:** Moderate. Large API surface. Theming via design tokens is powerful but the compact algorithm's surprising behaviors add friction.

**Verdict:** Best raw component coverage, but the large monolithic codebase and tight coupling work against the "small framework + integrate standalone" philosophy. The rc-* repo structure makes contribution harder than the star count suggests.

#### React Aria / React Spectrum (Adobe, headless)

**Longevity:** Excellent. Backed by Adobe, actively maintained (62 PRs/month). Will exist as long as Adobe needs it.

**Contribution:** Friction. Requires a signed CLA. Described as "by Adobe, for Adobe." Codebase is ~91k lines — the largest of any option. Getting a fix merged depends on Adobe's priorities, not yours.

**Maintenance reduction:** Similar to Ariakit — offloads interaction logic, keeps CSS. Strong accessibility. But the large codebase, CLA requirement, and corporate governance make it harder to work with when you hit issues.

**Learning curve:** Moderate. Well-documented but strict. Some patterns feel restrictive.

**Verdict:** Strong technically but the contribution model is misaligned. If you find a bug, you may be stuck waiting for Adobe to prioritize it. Ariakit offers similar benefits with a much smaller, more accessible codebase.

#### MUI (Material UI, styled)

**Longevity:** Excellent. 98k stars, 6.8M weekly downloads, 12 years old, funded company.

**Contribution:** Welcoming. No CLA for core library. Best contribution infrastructure. But ~85k line codebase is large.

**Maintenance reduction:** Best data table (DataGrid covers all our needs in free tier). But Material Design's visual identity fights DevTools aesthetic everywhere else. The data table is compelling, but adopting the full library means fighting rounded corners, elevation shadows, and ripple effects across every component.

**Verdict:** Consider using MUI DataGrid standalone for just the table rather than adopting the full library. As a full framework, the styling fight negates maintenance savings.

### Tier 3: Not Recommended

#### shadcn/ui

**Longevity:** The CLI and patterns will likely persist given 109k stars. But you own the copied code — library updates require re-running CLI and reconciling diffs. Depends on Radix Primitives underneath (see Radix concerns below).

**Contribution:** N/A in the traditional sense — you own the code. Can contribute to the shadcn/ui registry or Radix upstream, but your local copies are your maintenance burden.

**Code reduction:** Negative. You copy component source into your project and own it. Requires adding Tailwind CSS (replacing ~891 lines of vanilla CSS with utility classes across all component files). You maintain more code, not less.

**Learning curve:** Low for initial setup (CLI is slick). Higher ongoing — Tailwind utility classes, Radix primitive APIs, plus reconciling updates.

**DevTools theme:** The copy-paste model makes a "theme" meaningless — everyone's copy diverges.

**Verdict:** Goes directly against the goal of reducing maintained code. Skip.

#### Radix Primitives

**Longevity:** Concerning. Near-zero activity in last 30 days (0 PRs merged, 1 issue closed). Original co-creator publicly called it a "liability." Now owned by WorkOS, which is investing in recovery, but track record is poor. The massive shadcn/ui dependency creates pressure to maintain, but that could also mean "good enough" stagnation.

**Contribution:** Poor. PRs and issues have historically gone stale. WorkOS is hiring to address this, but the backlog is deep. Getting a fix merged is unreliable.

**Code reduction:** Low. Headless — you keep all CSS.

**Learning curve:** Low. Clean composable API.

**DevTools theme:** N/A (headless). Radix Themes exists but has its own aesthetic.

**Verdict:** Maintenance concerns make this risky. Even if WorkOS stabilizes it, the contribution path is unreliable. Skip as a standalone choice. (If using shadcn/ui, you inherit this risk.)

#### Headless UI

**Longevity:** Appears dormant. No commits since Dec 2025, zero PRs merged or issues closed in 30 days. Built by Tailwind Labs but seems deprioritized.

**Contribution:** Effectively impossible right now — no one is reviewing PRs.

**Code reduction:** Very low. Headless, and only covers 3 of our 11 component needs.

**Verdict:** Skip. Dormant project with minimal coverage.

#### Chakra UI

**Longevity:** Moderate risk. v3 was a major rewrite that fragmented the community. 40k stars but downloads declining (1.0M, down from peak). Growing issue backlog.

**Contribution:** No CLA. 13 PRs merged in 30 days — moderate activity. But v3 migration instability raises concerns.

**Code reduction:** Mixed. Good component coverage (7/11) but no compact/dense mode. Making everything DevTools-compact requires per-component style overrides. Most styling work of any styled library.

**Learning curve:** High right now. v3 API changes are significant, LLM tooling support is poor (most training data is v2), docs are still catching up.

**DevTools theme:** Most effort required. No density shortcut, generous-spacing philosophy fights DevTools aesthetic.

**Verdict:** The v3 rewrite created too much instability. Per-component sizing overrides negate maintenance savings. Skip.

#### Ark UI

**Longevity:** Young (3 years, 5k stars, 479k downloads). Built on Zag.js state machines. Too early to judge longevity confidently.

**Contribution:** Small team, moderate activity (11 PRs/month). No CLA.

**Code reduction:** Low-moderate. Headless but has splitter component. Limited coverage otherwise.

**Verdict:** Too young and too low coverage. Skip for now.

### Recommendation

**Prototype two approaches to compare:**

1. **Ariakit (headless) + standalone components** — Keep existing CSS, let Ariakit handle interaction logic (context menus, tabs, tooltips, toolbar keyboard nav). Pair with react-resizable-panels for split pane and react-inspector for JSON viewer. Data table stays custom or uses TanStack Table. Tests whether offloading interaction complexity alone is worth the dependency.

2. **Mantine (styled) + standalone components** — Replace both interaction logic and most CSS. Tests whether a styled library can match DevTools aesthetic without excessive theming. Same standalone components for table/splitter/JSON viewer.

The comparison answers the key question: is the CSS maintenance burden large enough to justify fighting a styled library's opinions, or is interaction logic the real pain point?

**Standalone components (independent of framework choice):**
- **react-inspector** to replace JsonTree (DevTools-accurate styling, 6.5 KB, zero deps)
- **react-resizable-panels** to replace SplitPane (6.9M downloads, by former React core team member)
- **TanStack Table** for data table if the custom table becomes hard to maintain (framework-agnostic, works with any UI library)
