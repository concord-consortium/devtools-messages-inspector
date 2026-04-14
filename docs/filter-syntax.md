# Filter Syntax

Filters use field-prefixed queries. Every query must specify which field to search.

## Fields

### Message Data

- `data.<path>` — filter by any property in the message data. Supports nested paths.
  - Example: `data.type:click`, `data.source:react-devtools*`
- `messageType` — shortcut for `data.type`
  - Example: `messageType:resize`

### Endpoints

- `source.origin` — the origin of the message sender
  - Example: `source.origin:example.com`
- `target.origin` — the origin of the message receiver
  - Example: `target.origin:example.com`
- `sourceType` — relationship between sender and receiver: parent, child, self, opener, opened, top
  - Example: `sourceType:child`

### Identity

- `documentId` — matches messages where either the source or target has the given document ID
  - Example: `documentId:ABC123`
- `frames` — matches messages where either the source or target is in the given frame (quotes required)
  - Example: `frames:"frame[0]"`, `frames:"tab[1].frame[2]"`

## Operators

| Operator | Syntax | Example |
|----------|--------|---------|
| Exclude | `-field:value` or `NOT field:value` | `-data.source:react-devtools*` |
| Or | `field:value OR field:value` | `sourceType:child OR sourceType:parent` |
| And | `(expr) AND (expr)` | `(sourceType:child) AND (data.type:click)` |
| Wildcard | `field:value*` | `data.source:react-devtools*` |
| Regex | `field:/pattern/flags` | `data.type:/click\|hover/i` |

## Examples

- `data.type:click` — messages with data.type equal to "click"
- `-data.source:react-devtools*` — exclude React DevTools messages
- `sourceType:child OR sourceType:parent` — messages from child or parent frames
- `source.origin:example.com` — messages from example.com
- `documentId:ABC123` — messages involving document ABC123
