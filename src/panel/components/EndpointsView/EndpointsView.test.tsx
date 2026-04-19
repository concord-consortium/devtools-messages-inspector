import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Frame } from '../../models/Frame';
import { FrameDocument } from '../../models/FrameDocument';
import { IFrame } from '../../models/IFrame';
import { logIframeElement, LogElementButton, NodeDetailPane } from './EndpointsView';
import { store } from '../../store';

const evalMock = vi.fn();

vi.stubGlobal('chrome', {
  storage: { local: { set: vi.fn(), get: vi.fn() } },
  devtools: {
    inspectedWindow: { tabId: 42, eval: evalMock },
  },
});

const frameLookup = { getFramesByParent: () => [] };
const docLookup = { getDocumentBySourceId: () => undefined };

function makeIframe(domPath: string, parentFrameId: number): IFrame {
  const frame = new Frame(42, parentFrameId, frameLookup);
  const parentDoc = new FrameDocument({ documentId: 'doc-parent' });
  parentDoc.frame = frame;
  return new IFrame(parentDoc, domPath, undefined, undefined, docLookup);
}

describe('logIframeElement', () => {
  beforeEach(() => {
    evalMock.mockClear();
  });

  it('calls inspectedWindow.eval with a console.log expression for the domPath', () => {
    const iframe = makeIframe('iframe#hello', 0);
    logIframeElement(iframe);

    expect(evalMock).toHaveBeenCalledTimes(1);
    expect(evalMock).toHaveBeenCalledWith(
      'console.log("Iframe " + "iframe#hello", document.querySelector("iframe#hello"))',
    );
  });

  it('JSON-escapes domPaths containing double quotes', () => {
    const iframe = makeIframe('iframe[src="https://x.com/a"]', 0);
    logIframeElement(iframe);

    const expr = evalMock.mock.calls[0][0] as string;
    // The expression must be valid JS that, when parsed, produces a console.log call.
    // We don't execute it; we just verify the embedded string literal round-trips.
    expect(expr).toBe(
      'console.log("Iframe " + "iframe[src=\\"https://x.com/a\\"]", document.querySelector("iframe[src=\\"https://x.com/a\\"]"))',
    );
  });
});

describe('LogElementButton', () => {
  beforeEach(() => {
    evalMock.mockClear();
  });

  it('renders enabled when parent document is the top-level frame', () => {
    const iframe = makeIframe('iframe#hello', 0);
    render(<LogElementButton iframe={iframe} />);

    const btn = screen.getByRole('button', { name: 'Log element' });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders disabled with tooltip when parent is a nested frame', () => {
    const iframe = makeIframe('iframe#nested', 5);
    render(<LogElementButton iframe={iframe} />);

    const btn = screen.getByRole('button', { name: 'Log element' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.getAttribute('title')).toBe(
      'Log element only supported for iframes directly in the top-level document',
    );
  });

  it('renders disabled when parent document has no frame attached', () => {
    const docLookup = { getDocumentBySourceId: () => undefined };
    const parentDoc = new FrameDocument({ documentId: 'doc-orphan' });
    // Note: parentDoc.frame intentionally left undefined
    const iframe = new IFrame(parentDoc, 'iframe#orphan', undefined, undefined, docLookup);

    render(<LogElementButton iframe={iframe} />);

    const btn = screen.getByRole('button', { name: 'Log element' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls logIframeElement on click when enabled', async () => {
    const user = userEvent.setup();
    const iframe = makeIframe('iframe#clickme', 0);
    render(<LogElementButton iframe={iframe} />);

    await user.click(screen.getByRole('button', { name: 'Log element' }));

    expect(evalMock).toHaveBeenCalledTimes(1);
    expect(evalMock).toHaveBeenCalledWith(
      'console.log("Iframe " + "iframe#clickme", document.querySelector("iframe#clickme"))',
    );
  });
});

describe('NodeDetailPane "Log element" button visibility', () => {
  beforeEach(() => {
    evalMock.mockClear();
    store.selectNode(null);
  });

  it('shows the Log element button for an iframe-element node', () => {
    const iframe = makeIframe('iframe#abc', 0);
    iframe.sourceIdFromParent = 'src-1';
    store.selectNode({ type: 'iframe-element', sourceId: 'src-1', iframeRef: iframe });

    render(<NodeDetailPane />);

    expect(screen.queryByRole('button', { name: 'Log element' })).toBeTruthy();
  });

  it('shows the Log element button for an iframe node with iframeRef', () => {
    const iframe = makeIframe('iframe#xyz', 0);
    store.selectNode({ type: 'iframe', tabId: 42, frameId: 7, iframeRef: iframe });

    render(<NodeDetailPane />);

    expect(screen.queryByRole('button', { name: 'Log element' })).toBeTruthy();
  });

  it('does not show the Log element button for a tab node', () => {
    store.selectNode({ type: 'tab', tabId: 42 });

    render(<NodeDetailPane />);

    expect(screen.queryByRole('button', { name: 'Log element' })).toBeNull();
  });

  it('does not show the Log element button for an unknown-iframe node', () => {
    store.selectNode({ type: 'unknown-iframe', tabId: 42, frameId: 9 });

    render(<NodeDetailPane />);

    expect(screen.queryByRole('button', { name: 'Log element' })).toBeNull();
  });

  it('does not show the Log element button for an iframe node lacking iframeRef', () => {
    store.selectNode({ type: 'iframe', tabId: 42, frameId: 7 });

    render(<NodeDetailPane />);

    expect(screen.queryByRole('button', { name: 'Log element' })).toBeNull();
  });
});
