# Export Messages Design

## Overview

Add a download button to the log pane TopBar that exports all captured messages as a JSON file. Mirrors the "Export HAR" pattern from Chrome DevTools Network tab.

## Button Placement

In the TopBar, after the "Preserve log" checkbox and before the FrameFocusDropdown separator:

```
[Record] [Clear] | [x] Preserve log | [Frame Focus ▾] | [Export]
```

Right-aligned after the FrameFocusDropdown. Uses the existing `.icon-btn` pattern (22×22px, SVG download arrow icon). Tooltip: "Export messages".

## JSON Format

Envelope with metadata wrapping a messages array:

```json
{
  "version": 1,
  "exportedAt": "2026-03-01T12:34:56.789Z",
  "messageCount": 42,
  "messages": [
    {
      "id": "msg-123",
      "timestamp": 1234567890123,
      "data": { "type": "resize", "height": 400 },
      "buffered": false,
      "source": {
        "type": "child",
        "origin": "https://example.com",
        "sourceId": "src-abc",
        "iframe": { "src": "https://example.com/embed", "id": "embed1", "domPath": "body > iframe" },
        "frameId": 3,
        "tabId": 1,
        "documentId": "doc-456"
      },
      "target": {
        "url": "https://parent.com/page",
        "origin": "https://parent.com",
        "documentTitle": "Parent Page",
        "frameId": 0,
        "tabId": 1,
        "documentId": "doc-789"
      },
      "sourceOwnerElement": { "src": "https://example.com/embed", "id": "embed1", "domPath": "body > iframe" },
      "targetOwnerElement": null
    }
  ]
}
```

### Fields per message

- `id`, `timestamp`, `data`, `buffered` — core IMessage fields
- `source` — full source object including type, origin, sourceId, iframe, frameId, tabId, documentId
- `target` — full target object including url, origin, documentTitle, frameId, tabId, documentId
- `sourceOwnerElement`, `targetOwnerElement` — iframe element snapshots (src, id, domPath) or null

Computed-only fields (dataPreview, dataSize, messageType) are excluded since they're derivable from `data`.

### Envelope fields

- `version: 1` — schema version for future compatibility
- `exportedAt` — ISO 8601 timestamp of export
- `messageCount` — number of messages (convenience field)

## Export Scope

Exports all captured messages (`store.messages`), not just filtered ones.

## Download Mechanism

1. Map each `Message` instance to a plain object with the fields above
2. Wrap in the envelope object
3. `JSON.stringify` with 2-space indentation
4. Create a `Blob` with type `application/json`
5. Trigger download via temporary `<a>` element with `URL.createObjectURL`
6. Filename: `messages-YYYY-MM-DDTHH-MM-SS.json`

## File Structure

- `src/panel/export.ts` — `exportMessages(messages: Message[])` function
- `src/panel/components/LogView/TopBar.tsx` — add export button
- `src/panel/panel.css` — add `.export-icon` style (SVG download arrow)
- `src/panel/export.test.ts` — unit test for serialization and envelope format
