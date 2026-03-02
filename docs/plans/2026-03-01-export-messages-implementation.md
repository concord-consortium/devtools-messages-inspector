# Export Messages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a download button to the log pane that exports all captured messages as a JSON file with metadata envelope.

**Architecture:** A pure function serializes Message instances to plain IMessage-shaped objects plus owner element snapshots, wraps them in a versioned envelope, and triggers a browser download. The button lives in the TopBar, right-aligned after FrameFocusDropdown.

**Tech Stack:** TypeScript, React, MobX, Vitest

---

### Task 1: Export serialization function with tests

**Files:**
- Create: `src/panel/export.ts`
- Create: `src/panel/export.test.ts`

**Step 1: Write the failing test**

Create `src/panel/export.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { serializeMessagesForExport } from './export';
import { Message } from './Message';
import { IMessage } from '../types';

function makeTestMessage(overrides: Partial<IMessage> = {}): IMessage {
  return {
    id: 'msg-1',
    timestamp: 1709312096789,
    data: { type: 'resize', height: 400 },
    buffered: false,
    source: {
      type: 'child',
      origin: 'https://child.example.com',
      sourceId: 'src-abc',
      iframe: { src: 'https://child.example.com/embed', id: 'embed1', domPath: 'body > iframe' },
      frameId: 3,
      tabId: 1,
      documentId: 'doc-source',
    },
    target: {
      url: 'https://parent.example.com/page',
      origin: 'https://parent.example.com',
      documentTitle: 'Parent Page',
      frameId: 0,
      tabId: 1,
      documentId: 'doc-target',
    },
    ...overrides,
  };
}

describe('serializeMessagesForExport', () => {
  it('produces envelope with version, exportedAt, messageCount, and messages', () => {
    const msg = new Message(makeTestMessage(), undefined, undefined);
    const result = serializeMessagesForExport([msg]);

    expect(result.version).toBe(1);
    expect(result.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.messageCount).toBe(1);
    expect(result.messages).toHaveLength(1);
  });

  it('serializes core IMessage fields', () => {
    const raw = makeTestMessage();
    const msg = new Message(raw, undefined, undefined);
    const result = serializeMessagesForExport([msg]);
    const exported = result.messages[0];

    expect(exported.id).toBe('msg-1');
    expect(exported.timestamp).toBe(1709312096789);
    expect(exported.data).toEqual({ type: 'resize', height: 400 });
    expect(exported.buffered).toBe(false);
    expect(exported.source.type).toBe('child');
    expect(exported.source.origin).toBe('https://child.example.com');
    expect(exported.source.sourceId).toBe('src-abc');
    expect(exported.source.iframe).toEqual({ src: 'https://child.example.com/embed', id: 'embed1', domPath: 'body > iframe' });
    expect(exported.target.origin).toBe('https://parent.example.com');
    expect(exported.target.frameId).toBe(0);
  });

  it('includes owner element snapshots when present', () => {
    const { OwnerElement } = require('./models/OwnerElement');
    const sourceOwner = new OwnerElement('body > iframe', 'https://child.example.com/embed', 'embed1');
    const msg = new Message(makeTestMessage(), undefined, sourceOwner);
    const result = serializeMessagesForExport([msg]);
    const exported = result.messages[0];

    expect(exported.sourceOwnerElement).toEqual({ domPath: 'body > iframe', src: 'https://child.example.com/embed', id: 'embed1' });
    expect(exported.targetOwnerElement).toBeUndefined();
  });

  it('handles empty message array', () => {
    const result = serializeMessagesForExport([]);
    expect(result.messageCount).toBe(0);
    expect(result.messages).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/panel/export.test.ts`
Expected: FAIL — cannot find `./export` module

**Step 3: Write the implementation**

Create `src/panel/export.ts`:

```typescript
import { Message } from './Message';

interface ExportedOwnerElement {
  domPath: string;
  src: string | undefined;
  id: string | undefined;
}

interface ExportedMessage {
  id: string;
  timestamp: number;
  data: unknown;
  buffered: boolean | undefined;
  source: {
    type: string;
    origin: string;
    sourceId: string | null;
    iframe: { src: string; id: string; domPath: string } | null;
    frameId: number | undefined;
    tabId: number | undefined;
    documentId: string | undefined;
  };
  target: {
    url: string;
    origin: string;
    documentTitle: string;
    frameId: number;
    tabId: number;
    documentId: string | undefined;
  };
  sourceOwnerElement: ExportedOwnerElement | undefined;
  targetOwnerElement: ExportedOwnerElement | undefined;
}

export interface ExportEnvelope {
  version: number;
  exportedAt: string;
  messageCount: number;
  messages: ExportedMessage[];
}

function serializeOwnerElement(oe: { domPath: string; src: string | undefined; id: string | undefined } | undefined): ExportedOwnerElement | undefined {
  if (!oe) return undefined;
  return { domPath: oe.domPath, src: oe.src, id: oe.id };
}

function serializeMessage(msg: Message): ExportedMessage {
  return {
    id: msg.id,
    timestamp: msg.timestamp,
    data: msg.data,
    buffered: msg.buffered,
    source: {
      type: msg.source.type,
      origin: msg.source.origin,
      sourceId: msg.source.sourceId,
      iframe: msg.source.iframe,
      frameId: msg.source.frameId,
      tabId: msg.source.tabId,
      documentId: msg.source.documentId,
    },
    target: {
      url: msg.target.url,
      origin: msg.target.origin,
      documentTitle: msg.target.documentTitle,
      frameId: msg.target.frameId,
      tabId: msg.target.tabId,
      documentId: msg.target.documentId,
    },
    sourceOwnerElement: serializeOwnerElement(msg.sourceOwnerElement),
    targetOwnerElement: serializeOwnerElement(msg.targetOwnerElement),
  };
}

export function serializeMessagesForExport(messages: Message[]): ExportEnvelope {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    messageCount: messages.length,
    messages: messages.map(serializeMessage),
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/panel/export.test.ts`
Expected: all 4 tests PASS

**Step 5: Commit**

```bash
git add src/panel/export.ts src/panel/export.test.ts
git commit -m "feat: add message export serialization with tests"
```

---

### Task 2: Download trigger function

**Files:**
- Modify: `src/panel/export.ts`
- Modify: `src/panel/export.test.ts`

**Step 1: Write the failing test**

Add to `src/panel/export.test.ts`:

```typescript
import { serializeMessagesForExport, downloadMessagesAsJson } from './export';

describe('downloadMessagesAsJson', () => {
  it('creates a JSON blob and triggers download with timestamped filename', () => {
    const clickedLinks: { href: string; download: string }[] = [];
    const revokedUrls: string[] = [];

    // Mock DOM APIs
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        const a = origCreateElement('a') as HTMLAnchorElement;
        a.click = () => clickedLinks.push({ href: a.href, download: a.download });
        return a;
      }
      return origCreateElement(tag);
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => revokedUrls.push(url));

    const msg = new Message(makeTestMessage(), undefined, undefined);
    downloadMessagesAsJson([msg]);

    expect(clickedLinks).toHaveLength(1);
    expect(clickedLinks[0].href).toContain('blob:mock-url');
    expect(clickedLinks[0].download).toMatch(/^messages-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
    expect(revokedUrls).toContain('blob:mock-url');

    vi.restoreAllMocks();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/panel/export.test.ts`
Expected: FAIL — `downloadMessagesAsJson` is not exported

**Step 3: Add to `src/panel/export.ts`**

Append at the end of the file:

```typescript
export function downloadMessagesAsJson(messages: Message[]): void {
  const envelope = serializeMessagesForExport(messages);
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, '');
  const filename = `messages-${timestamp}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/panel/export.test.ts`
Expected: all 5 tests PASS

**Step 5: Commit**

```bash
git add src/panel/export.ts src/panel/export.test.ts
git commit -m "feat: add JSON download trigger for message export"
```

---

### Task 3: Add export button to TopBar

**Files:**
- Modify: `src/panel/components/LogView/TopBar.tsx`
- Modify: `src/panel/panel.css`

**Step 1: Add the export icon CSS**

Add to `src/panel/panel.css` after the `.clear-icon::before` rule (around line 105):

```css
/* Export button - download arrow */
.export-icon {
  width: 14px;
  height: 14px;
  position: relative;
}

.export-icon::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 2px;
  width: 1.5px;
  height: 8px;
  background: #5f6368;
  transform: translateX(-50%);
}

.export-icon::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 6px;
  width: 6px;
  height: 6px;
  border-left: 1.5px solid #5f6368;
  border-bottom: 1.5px solid #5f6368;
  transform: translateX(-50%) rotate(-45deg);
}
```

**Step 2: Add the export button to TopBar**

In `src/panel/components/LogView/TopBar.tsx`:

Add import at top:
```typescript
import { downloadMessagesAsJson } from '../../export';
```

Add handler inside the component:
```typescript
const handleExportClick = () => {
  downloadMessagesAsJson(store.messages);
};
```

Add button after `<FrameFocusDropdown />`, with a separator before it:
```tsx
<FrameFocusDropdown />
<div className="separator"></div>
<button
  className="icon-btn"
  title="Export messages"
  onClick={handleExportClick}
>
  <span className="export-icon"></span>
</button>
```

**Step 3: Build and manually verify**

Run: `npm run build`
Expected: Build succeeds. Load extension in Chrome, open DevTools Messages tab, see the export button on the right side of the toolbar after the frame focus dropdown.

**Step 4: Commit**

```bash
git add src/panel/components/LogView/TopBar.tsx src/panel/panel.css
git commit -m "feat: add export button to log pane toolbar"
```

---

### Task 4: Run full test suite

**Step 1: Run vitest**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Run playwright**

Run: `npx playwright test`
Expected: All tests pass

**Step 3: Update roadmap**

In `docs/roadmap.md`, update the export line item to indicate it's done (or partially done — export implemented, import still pending).

**Step 4: Commit**

```bash
git add docs/roadmap.md
git commit -m "docs: mark export feature as implemented in roadmap"
```
