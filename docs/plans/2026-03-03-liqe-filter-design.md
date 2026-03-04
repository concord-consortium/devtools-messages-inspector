# Liqe-Based Filter System

## Summary

Replace the custom filter system with [liqe](https://github.com/gajus/liqe), a Lucene-like query engine for JavaScript objects. This enables filtering on any nested data property (e.g., `data.source:react-devtools*`), boolean operators (AND, OR, NOT), wildcards, and regex — replacing ~55 lines of custom filter parsing with a well-tested library.

## Motivation

The current filter system only supports a fixed set of keyed filters (`type:`, `source:`, `target:`, `sourceType:`, `frame:`) and plain-text search on a truncated 100-char data preview. There's no way to filter on arbitrary properties inside message data, no OR operator, and no wildcard support.

The immediate use case: filtering out React DevTools messages, which have a `data.source` property with values like `react-devtools-hook`, `react-devtools-bridge`, etc. With liqe: `-data.source:react-devtools*`.

## Design

### Query target

Liqe's `test(ast, object)` operates directly on Message class instances. Liqe uses bracket notation (`value[key]`) for property access, which works with class getters and MobX computed properties. No wrapper/view object is needed.

All queries require field prefixes — there is no unfielded plain-text search.

### Searchable properties

Properties available for querying (mix of stored and computed on Message):

| Property path | Example query | Description |
|---|---|---|
| `source.origin` | `source.origin:example.com` | Source origin |
| `source.type` | `source.type:child` | Source type |
| `target.origin` | `target.origin:app.com` | Target origin |
| `data.*` | `data.source:react*` | Any property in the postMessage payload |
| `messageType` | `messageType:click` | Shortcut for data.type |
| `sourceType` | `sourceType:child` | Shortcut for source.type |
| `buffered` | `buffered:true` | Whether message was buffered |
| `frames` | `frames:frame[1]` | Match source or target frame (see below) |

### Frame matching via `frames` computed property

Replace the custom `frame:` filter pre-processing with a `frames` computed getter on Message that returns an array of string identifiers for both source and target frames:

The relative `frame[N]` form is only included for frames in the current tab, so that `frames:frame[1]` doesn't match frames from other tabs. The Message class needs access to the current tab ID (via `store.tabId`) to make this distinction.

```ts
get frames(): string[] {
  const frames: string[] = [];
  const currentTabId = store.tabId;
  const sf = this.sourceFrame;
  const tf = this.targetFrame;
  if (sf) {
    if (sf.tabId === currentTabId) frames.push(`frame[${sf.frameId}]`);
    if (sf.tabId != null) frames.push(`tab[${sf.tabId}].frame[${sf.frameId}]`);
  }
  if (tf) {
    if (tf.tabId === currentTabId) frames.push(`frame[${tf.frameId}]`);
    if (tf.tabId != null) frames.push(`tab[${tf.tabId}].frame[${tf.frameId}]`);
  }
  return frames;
}
```

Liqe natively iterates arrays and matches if any element matches, so:
- `frames:frame[1]` — matches messages involving frame 1 in the current tab only
- `frames:tab[5].frame[2]` — matches specific tab+frame combo (any tab)

### Syntax migration

| Old syntax | New liqe syntax |
|---|---|
| `type:click` | `messageType:click` or `data.type:click` |
| `source:example.com` | `source.origin:example.com` |
| `target:app.com` | `target.origin:app.com` |
| `sourceType:child` | `sourceType:child` or `source.type:child` |
| `frame:frame[1]` | `frames:frame[1]` |
| `frame:tab[5].frame[1]` | `frames:tab[5].frame[1]` |
| `-react` | `-data.source:react*` (must be field-prefixed now) |
| plain text search | No equivalent; use field-prefixed queries |

### New capabilities

| Query | Description |
|---|---|
| `data.source:react-devtools*` | Wildcard match on nested data property |
| `-data.source:react-devtools*` | Exclude by data property wildcard |
| `source.origin:a.com OR source.origin:b.com` | OR operator |
| `NOT sourceType:self` | NOT operator |
| `data.action:/^user_.*/i` | Regex match on data property |
| `(sourceType:child OR sourceType:parent) AND data.type:click` | Grouped boolean expressions |

### Store changes

Replace `matchesFilter`, `matchesTerm`, and `parseFrameFilterValue` (~55 lines) with:

```ts
import { parse, test } from 'liqe';

private matchesFilter(msg: Message, filter: string): boolean {
  if (!filter) return true;
  try {
    return test(parse(filter), msg);
  } catch {
    // Invalid query syntax — show all messages rather than none
    return true;
  }
}
```

### FilterBar UI

Update placeholder text to reflect new syntax. No structural UI changes.

### Error handling

If the user types an invalid liqe query (e.g., unbalanced parentheses, incomplete field prefix), `parse()` throws. The `catch` block returns `true` so all messages remain visible while typing. Optionally add a visual indicator (red border or icon) on parse error.

### Testing

Unit tests for:
- Basic field queries (`data.source:react*`, `source.origin:example.com`)
- Negation (`-data.source:react*`, `NOT source.type:self`)
- Boolean operators (`source.origin:a.com OR source.origin:b.com`)
- Frame matching via `frames` array (`frames:frame[1]`, `frames:tab[5].frame[2]`)
- Invalid query graceful fallback (shows all messages)
- `messageType` and `sourceType` shortcut properties

### Dependencies

- Add `liqe` npm package (~15-20KB estimated bundle size)
