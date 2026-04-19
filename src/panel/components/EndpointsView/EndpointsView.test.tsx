import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Frame } from '../../models/Frame';
import { FrameDocument } from '../../models/FrameDocument';
import { IFrame } from '../../models/IFrame';
import { logIframeElement } from './EndpointsView';

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
