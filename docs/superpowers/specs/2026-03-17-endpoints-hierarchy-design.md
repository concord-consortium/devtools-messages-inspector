# Endpoints Pane Hierarchy Redesign

## Overview

Reorganize the endpoints pane from a flat frame list into a hierarchical tree with three visible node types: Tabs, Documents, and IFrames. The underlying Frame concept is preserved in the data model but collapsed (hidden) in the UI.

## Hierarchy

### Data Model (internal)

```
Tab → Frame → Document → IFrame → Frame → Document → ...
```

### UI Display (Frame collapsed)

```
Tab → Document → IFrame → Document → ...
```

### Node Types

**Tab** — Top-level node, one per monitored browser tab. Represents the main frame (frameId 0).
- Label: `Tab [tabId]`
- Icon + "Tab" type label
- Tabs opened via `window.open()` are separate top-level peers; opener relationship shown only in detail view

**Document** — A page loaded in a Tab or IFrame. Multiple Documents exist under a single parent when navigation occurs.
- Label: document URL (or origin if URL unavailable)
- Icon + "Doc" type label
- Listed in reverse chronological order (most recent first)
- Older documents visually dimmed with "(navigated away)" suffix
- Most recent document displayed at normal brightness with no suffix

**IFrame (known)** — An iframe element matched to a DOM element within a parent Document.
- Label: domPath (e.g., `body > div.main > iframe#editor`)
- Icon + "IFrame" type label

**IFrame (unknown)** — A child document exists but can't be matched to a specific iframe DOM element. This happens when registration messages are disabled or haven't arrived yet and we only know the child's frameId.
- Label: `Unknown IFrame (frameId: N)`
- Icon + "IFrame" type label
- Individual items under the parent Document (not grouped)

**Unknown Document** — Top-level node for message sources that can't be placed in the hierarchy. Example: an opened tab sends a message to its opener before registration occurs.
- Label: sourceId (e.g., `sourceId: a7f3c`)
- Detail view shows which target document received the message that caused this Unknown Document to be created

### Example Tree

```
Tab [1]
  Doc  https://app.example.com/dashboard
    IFrame  body > div.main > iframe#editor
      Doc  https://editor.example.com/v2
      Doc  https://editor.example.com/v1  (navigated away)
    IFrame  body > div.sidebar > iframe.chat
      Doc  https://chat.example.com/
    IFrame  Unknown IFrame (frameId: 3)
      Doc  https://analytics.example.com/
  Doc  https://app.example.com/login  (navigated away)
Tab [2]
  Doc  https://popup.example.com/settings
Unknown Document (sourceId: a7f3c)
```

## Detail Pane

Clicking any node shows its properties in the right pane. Properties vary by node type:

| Node Type | Properties |
|-----------|-----------|
| Tab | tabId, frameId (always 0), current URL, origin, title, opened tabs list, opener tab (if applicable) |
| Document | documentId, sourceId, URL, origin, title, parent frame info |
| IFrame (known) | domPath, src, id attributes, frameId, parent document info |
| IFrame (unknown) | frameId, parent document info |
| Unknown Document | sourceId, triggered by (the target document that received the message) |

## Show Messages Filtering

The "Show messages" button filters the LogView differently per node type:

| Node Type | Filter | Notes |
|-----------|--------|-------|
| Tab | `frames:"tab[T].frame[0]"` | Messages where the tab's main frame is source or target. Does NOT include messages between nested iframes. |
| IFrame (known) | `frames:"tab[T].frame[N]"` | Messages where the iframe's frameId is source or target. Does NOT cascade into child iframes. |
| IFrame (unknown) | `frames:"tab[T].frame[N]"` | Same as known IFrame — we have the frameId. |
| Document | `source.documentId:<id> OR target.documentId:<id>` | Messages where that specific document is source or target. Liqe operates on the full message object so these nested properties work directly. |
| Unknown Document | `source.sourceId:<id>` | Only shows messages where this document was the source (it has no documentId, only a sourceId). |

## Implementation Phases

### Phase 1: Data Model Refactoring

Refactor existing models so the data naturally represents the hierarchy:

- Promote `OwnerElement` (or similar) to serve as the IFrame's parent role in the model
- `Frame` remains in the data model as the stable identity (keyed by tabId:frameId) bridging Tab/IFrame to Documents
- `FrameDocument` remains but gains proper parent relationships (owned by a Tab or IFrame via Frame)
- Introduce a `Tab` concept in the model
- Update `FrameStore` and `connection.ts` message processing to populate the new structure

This phase is its own brainstorming/implementation cycle.

### Phase 2: Endpoints Pane UI Update

- Replace the flat `FrameTable` with a tree view rendering the new hierarchy
- Each node has an icon and type label (Tab, Doc, IFrame)
- Tree supports expand/collapse
- Detail pane shows type-appropriate properties
- "Show messages" button applies type-specific filtering
- Unknown IFrames and Unknown Documents handled as described above

## Design Decisions

- **Frame hidden in UI**: The Frame concept (stable identity across navigations) is valuable in the data model but adds no clarity in the UI. Collapsing it makes the tree directly represent what users care about: which page is in which iframe.
- **Opened tabs as top-level peers**: Nesting opened tabs under their opener would create deep trees. The opener/opened relationship is available in the detail view.
- **Reverse chronological documents**: Most recent document first since it's most likely what users care about. Older documents dimmed to reduce noise.
- **Unknown IFrame as individual items**: Rather than grouping unknowns, each gets its own tree node under its parent document, matching the structure of known IFrames.
- **Unknown Document filtered by sourceId**: Since we only know the sourceId (not documentId), we can only show messages where it was the source. Liqe already supports `source.sourceId` since it operates on the full message object.
