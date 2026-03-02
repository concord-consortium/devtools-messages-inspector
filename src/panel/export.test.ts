import { describe, it, expect, vi } from 'vitest';
import { serializeMessagesForExport, downloadMessagesAsJson } from './export';
import { Message } from './Message';
import { OwnerElement } from './models/OwnerElement';
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

describe('downloadMessagesAsJson', () => {
  it('creates a JSON blob and triggers download with timestamped filename', () => {
    const clickedLinks: { href: string; download: string }[] = [];
    const revokedUrls: string[] = [];

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
