# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Messages Inspector - Chrome DevTools extension (Manifest V3) for inspecting postMessage communication between iframes. Provides a Network-tab-like UI with sortable/filterable table and detail panel.

## Development

Uses Vite for building TypeScript/React. Load dist/ as unpacked extension in Chrome.

**Build and test:**
```bash
npm run build          # Build to dist/
npm run dev            # Start Vite dev server
npx vitest run         # Unit tests
npx playwright test    # E2e tests (requires build)
# Open http://localhost:5173/test/test-page.html in Chrome
# DevTools → Messages tab to see captured messages
```

**Validation:** Run both `npx vitest run` and `npx playwright test` to validate changes before committing.

**Reload after changes:** Run `npm run build`, then go to `chrome://extensions/` and click the refresh icon on the extension.

## Architecture

### Dynamic Injection

The extension uses programmatic script injection to minimize impact on pages:

- Content script is injected only when the Messages panel is opened for a tab
- Popups opened from monitored tabs get buffering enabled automatically (captures early messages before panel connects)
- Once monitoring starts, it persists until page reload (even if DevTools closes)

### Message Flow

```
Isolated World                Service Worker      DevTools
──────────────                ──────────────      ────────
content.js ──runtime.msg──►   background.js ──►   panel.js
(message listener)            (routes by tabId)   (UI)
```

**Key files:**
- `content.ts` - Content script that listens for `message` events, identifies source type (parent, child, self, etc.), and forwards to service worker
- `background.ts` - Service worker that routes messages to appropriate DevTools panel by tab ID
- `panel.tsx` - Panel UI: React-based table rendering, filtering, column customization, detail view

## Design Constraints

- **Cross-origin is the ONLY use case that matters.** This extension exists specifically for debugging cross-origin postMessage communication. Same-origin scenarios are trivial to debug with standard DevTools.
  - NEVER add features that only work for same-origin iframes or windows
  - NEVER add fallback text like "(cross-origin)" or "(unavailable)" - if information isn't available cross-origin, find a way to get it or leave it blank
  - NEVER add special styling (opacity, italics, etc.) to indicate cross-origin limitations
  - If a feature can't work cross-origin, it's not worth adding
  - Always test features with cross-origin iframes first

## Filter Syntax

Uses [liqe](https://github.com/gajus/liqe) (Lucene-like query language). All queries require field prefixes.

- `data.type:value` - Filter by data.type property
- `data.source:react-devtools*` - Wildcard match on any data property
- `source.origin:value` - Filter by source origin
- `target.origin:value` - Filter by target origin
- `sourceType:child` - Filter by source type (parent, child, self, opener, opened, top)
- `messageType:value` - Shortcut for data.type
- `frames:"frame[N]"` - Filter by frame ID (matches source or target frame; quotes required because of brackets)
- `frames:"tab[T].frame[N]"` - Filter by tab and frame ID
- `-field:value` - Exclude messages matching the query
- `NOT field:value` - Same as above
- `field:value OR field:value` - Match either condition
- `field:/regex/i` - Regex match
- `(expr) AND (expr)` - Grouped boolean expressions

## Workflow Preferences

- **Design documents:** After generating a design/plan document, show it to the user for review before committing. Do not auto-commit design docs.
