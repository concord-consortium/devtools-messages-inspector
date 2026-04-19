import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Frame } from '../../models/Frame';
import { FrameDocument } from '../../models/FrameDocument';
import { IFrame } from '../../models/IFrame';
import { logIframeElement, LogElementButton, NodeDetailPane } from './EndpointsView';
import { store } from '../../store';
import * as connection from '../../connection';

vi.stubGlobal('chrome', {
  storage: { local: { set: vi.fn(), get: vi.fn() } },
  devtools: { inspectedWindow: { tabId: 42 } },
});

const sendSpy = vi.spyOn(connection, 'sendLogIframeElement').mockImplementation(() => {});

const frameLookup = { getFramesByParent: () => [] };
const docLookup = { getDocumentBySourceId: () => undefined };

function makeIframe(domPath: string, frameId: number, documentId: string | null = 'doc-parent'): IFrame {
  const frame = new Frame(42, frameId, frameLookup);
  const parentDoc = new FrameDocument({ documentId: documentId ?? undefined });
  parentDoc.frame = frame;
  return new IFrame(parentDoc, domPath, undefined, undefined, docLookup);
}

describe('logIframeElement', () => {
  beforeEach(() => {
    sendSpy.mockClear();
  });

  it('calls sendLogIframeElement with the parent documentId and domPath', () => {
    const iframe = makeIframe('iframe#hello', 0, 'doc-abc');
    logIframeElement(iframe);
    expect(sendSpy).toHaveBeenCalledWith('doc-abc', 'iframe#hello');
  });

  it('is a no-op when parentDocument has no documentId', () => {
    const iframe = makeIframe('iframe#orphan', 0, null);
    logIframeElement(iframe);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe('LogElementButton', () => {
  beforeEach(() => {
    sendSpy.mockClear();
  });

  it('renders enabled when parent document has a documentId', () => {
    const iframe = makeIframe('iframe#hello', 0, 'doc-abc');
    render(<LogElementButton iframe={iframe} />);

    const btn = screen.getByRole('button', { name: 'Log element' });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders enabled for nested iframes too', () => {
    const iframe = makeIframe('iframe#nested', 5, 'doc-nested');
    render(<LogElementButton iframe={iframe} />);

    const btn = screen.getByRole('button', { name: 'Log element' });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders disabled with tooltip when parentDocument has no documentId', () => {
    const iframe = makeIframe('iframe#orphan', 0, null);
    render(<LogElementButton iframe={iframe} />);

    const btn = screen.getByRole('button', { name: 'Log element' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.getAttribute('title')).toBe(
      'Parent document identity unknown — cannot target log',
    );
  });

  it('calls sendLogIframeElement on click when enabled', async () => {
    const user = userEvent.setup();
    const iframe = makeIframe('iframe#clickme', 0, 'doc-click');
    render(<LogElementButton iframe={iframe} />);

    await user.click(screen.getByRole('button', { name: 'Log element' }));

    expect(sendSpy).toHaveBeenCalledWith('doc-click', 'iframe#clickme');
  });
});

describe('NodeDetailPane "Log element" button visibility', () => {
  beforeEach(() => {
    sendSpy.mockClear();
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
