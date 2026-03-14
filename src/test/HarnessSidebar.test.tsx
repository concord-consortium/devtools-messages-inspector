import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChromeExtensionEnv } from './chrome-extension-env';
import { HarnessRuntime } from './harness-runtime';
import { HarnessSidebar } from './HarnessSidebar';
import { initContentScript } from '../content-core';
import type { TabNode } from '../hierarchy/types';

describe('HarnessSidebar', () => {
  let env: ChromeExtensionEnv;
  let runtime: HarnessRuntime;

  beforeEach(() => {
    env = new ChromeExtensionEnv(initContentScript);
    env.storageData.enableFrameRegistration = false;
    runtime = new HarnessRuntime(env);
    const tree: TabNode = {
      type: 'tab', tabId: 1,
      frames: [{ type: 'frame', frameId: 0, documents: [{ type: 'document', documentId: 'doc-1', url: 'https://a.com/', origin: 'https://a.com' }] }],
    };
    runtime.materializeTree(tree);
  });

  it('renders Map tab by default showing the hierarchy', () => {
    render(<HarnessSidebar runtime={runtime} />);
    // Map tab should be active
    expect(screen.getByText('Map')).toBeTruthy();
    // Hierarchy map should show the tab node
    expect(screen.getByText('Tab 1')).toBeTruthy();
  });

  it('switches to Log tab', async () => {
    const user = userEvent.setup();
    render(<HarnessSidebar runtime={runtime} />);
    await user.click(screen.getByText('Log'));
    expect(screen.getByText('No actions yet.')).toBeTruthy();
  });

  it('renders + Tab button that dispatches create-tab', async () => {
    const user = userEvent.setup();
    render(<HarnessSidebar runtime={runtime} />);
    await user.click(screen.getByText('+ Tab'));
    // Should now have 2 tabs in the hierarchy
    expect(screen.getByText('Tab 1')).toBeTruthy();
    expect(screen.getByText('Tab 2')).toBeTruthy();
  });

  it('updates when runtime state changes externally', () => {
    render(<HarnessSidebar runtime={runtime} />);
    // No iframe nodes initially
    expect(screen.queryByText('iframe')).toBeNull();

    // Dispatch externally (simulating console/Playwright)
    act(() => {
      runtime.dispatch({ type: 'add-iframe', documentId: 'doc-1', url: 'https://b.com/' });
    });

    expect(screen.getAllByText('iframe').length).toBeGreaterThan(0);
  });
});
