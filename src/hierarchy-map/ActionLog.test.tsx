import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActionLog } from './ActionLog';

describe('ActionLog', () => {
  it('shows empty message when log is empty', () => {
    render(<ActionLog log={[]} />);
    expect(screen.getByText('No actions yet.')).toBeTruthy();
  });

  it('renders action entries', () => {
    const log = [{
      action: { type: 'add-iframe' as const, documentId: 'doc-1', url: 'https://b.com/' },
      events: [{ type: 'iframeAdded' as const, scope: 'dom' as const, tabId: 1, parentFrameId: 0, frameId: 1, src: 'https://b.com/' }],
    }];
    render(<ActionLog log={log} />);
    expect(screen.getByText(/add-iframe/)).toBeTruthy();
    expect(screen.getByText(/iframeAdded/)).toBeTruthy();
  });
});
