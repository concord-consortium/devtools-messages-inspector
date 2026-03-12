import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getLabel, getDetails, HierarchyMap } from './HierarchyMap';
import type { TabNode, FrameNode, DocumentNode, IframeNode } from '../hierarchy/types';

describe('getLabel', () => {
  it('tab: shows tab ID without opener info', () => {
    const node: TabNode = { type: 'tab', tabId: 1, openerTabId: 2, openerFrameId: 0 };
    expect(getLabel(node)).toBe('Tab 1');
  });

  it('tab: uses custom label if present', () => {
    const node: TabNode = { type: 'tab', tabId: 1, label: 'My Tab' };
    expect(getLabel(node)).toBe('My Tab');
  });

  it('frame: shows frame ID', () => {
    const node: FrameNode = { type: 'frame', frameId: 0 };
    expect(getLabel(node)).toBe('frame[0]');
  });

  it('document: prefers origin', () => {
    const node: DocumentNode = {
      type: 'document', documentId: 'doc-1',
      url: 'https://example.com/page', origin: 'https://example.com',
    };
    expect(getLabel(node)).toBe('https://example.com');
  });

  it('document: falls back to documentId when no origin', () => {
    const node: DocumentNode = { type: 'document', documentId: 'doc-1' };
    expect(getLabel(node)).toBe('doc-1');
  });

  it('document: falls back to "document" when nothing available', () => {
    const node: DocumentNode = { type: 'document' };
    expect(getLabel(node)).toBe('document');
  });

  it('iframe: shows #id when present', () => {
    const node: IframeNode = { type: 'iframe', iframeId: 1, id: 'widget', src: 'https://x.com' };
    expect(getLabel(node)).toBe('#widget');
  });

  it('iframe: falls back to "iframe" when no id', () => {
    const node: IframeNode = { type: 'iframe', iframeId: 1, src: 'https://x.com' };
    expect(getLabel(node)).toBe('iframe');
  });
});

describe('getDetails', () => {
  it('tab with opener: returns opener detail', () => {
    const node: TabNode = { type: 'tab', tabId: 1, openerTabId: 2, openerFrameId: 0 };
    expect(getDetails(node)).toEqual([
      { label: 'opener', value: 'tab[2].frame[0]' },
    ]);
  });

  it('tab without opener: returns empty', () => {
    const node: TabNode = { type: 'tab', tabId: 1 };
    expect(getDetails(node)).toEqual([]);
  });

  it('frame: always returns empty', () => {
    const node: FrameNode = { type: 'frame', frameId: 0 };
    expect(getDetails(node)).toEqual([]);
  });

  it('document: returns available fields', () => {
    const node: DocumentNode = {
      type: 'document', documentId: 'doc-1',
      url: 'https://example.com/page', title: 'My Page',
    };
    expect(getDetails(node)).toEqual([
      { label: 'id', value: 'doc-1' },
      { label: 'url', value: 'https://example.com/page' },
      { label: 'title', value: 'My Page' },
    ]);
  });

  it('document: omits missing fields', () => {
    const node: DocumentNode = { type: 'document', origin: 'https://example.com' };
    expect(getDetails(node)).toEqual([]);
  });

  it('iframe: returns src and id', () => {
    const node: IframeNode = { type: 'iframe', iframeId: 1, src: 'https://x.com', id: 'w' };
    expect(getDetails(node)).toEqual([
      { label: 'src', value: 'https://x.com' },
      { label: 'id', value: 'w' },
    ]);
  });

  it('iframe: omits missing fields', () => {
    const node: IframeNode = { type: 'iframe', iframeId: 1 };
    expect(getDetails(node)).toEqual([]);
  });
});

describe('HierarchyMap details area', () => {
  const tab: TabNode = {
    type: 'tab', tabId: 1, openerTabId: 2, openerFrameId: 0,
    frames: [{
      type: 'frame', frameId: 0,
      documents: [{
        type: 'document', documentId: 'doc-1',
        url: 'https://example.com/page', origin: 'https://example.com',
        title: 'Example Page',
      }],
    }],
  };

  it('does not show details by default', () => {
    render(<HierarchyMap root={tab} />);
    expect(screen.queryByText('doc-1')).toBeNull();
  });

  it('shows info button for nodes with details', () => {
    render(<HierarchyMap root={tab} />);
    // Tab has opener info, document has details — both get info buttons
    // Frame has no details — no info button
    const infoButtons = screen.getAllByRole('button', { name: /info/i });
    // Tab (1) + Document (1) = 2 info buttons
    expect(infoButtons).toHaveLength(2);
  });

  it('toggles details when info button is clicked', async () => {
    const user = userEvent.setup();
    render(<HierarchyMap root={tab} />);

    // Click the first info button (on the tab node)
    const infoButtons = screen.getAllByRole('button', { name: /info/i });
    await user.click(infoButtons[0]);

    // Tab opener detail should now be visible
    expect(screen.getByText('tab[2].frame[0]')).toBeTruthy();

    // Click again to collapse
    await user.click(infoButtons[0]);
    expect(screen.queryByText('tab[2].frame[0]')).toBeNull();
  });

  it('does not show info button for frame nodes', () => {
    const frameOnly: TabNode = {
      type: 'tab', tabId: 1,
      frames: [{ type: 'frame', frameId: 0 }],
    };
    render(<HierarchyMap root={frameOnly} />);
    expect(screen.queryByRole('button', { name: /info/i })).toBeNull();
  });
});
