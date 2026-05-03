import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Frame } from '../../models/Frame';
import { Tab } from '../../models/Tab';
import { OwnerElement } from '../../models/OwnerElement';
import { frameStore } from '../../models';
import { FrameSection } from './FrameSection';

function renderInTable(node: React.ReactNode) {
  return render(
    <table>
      <tbody>{node}</tbody>
    </table>,
  );
}

const frameLookup = { getFramesByParent: () => [] };

describe('FrameSection', () => {
  beforeEach(() => {
    frameStore.clear?.();
    // tabs map is reused across tests; clear by deletion if no clear() helper exists.
    for (const tabId of Array.from(frameStore.tabs.keys())) {
      frameStore.tabs.delete(tabId);
    }
  });

  it('derives "Tab" heading when frame is a root frame', () => {
    const frame = new Frame(42, 0, frameLookup);
    const { container } = renderInTable(<FrameSection frame={frame} />);
    const heading = container.querySelector('.section-heading');
    expect(heading?.textContent).toBe('Tab');
  });

  it('derives "IFrame" heading when frame is non-root', () => {
    const frame = new Frame(42, 5, frameLookup);
    renderInTable(<FrameSection frame={frame} />);
    expect(screen.getByText('IFrame')).toBeTruthy();
  });

  it('derives "IFrame" heading when no frame is given', () => {
    const owner = new OwnerElement('iframe#x', undefined, undefined);
    renderInTable(<FrameSection ownerElement={owner} />);
    expect(screen.getByText('IFrame')).toBeTruthy();
  });

  it('uses provided heading verbatim', () => {
    const frame = new Frame(42, 5, frameLookup);
    renderInTable(<FrameSection frame={frame} heading="Custom" />);
    expect(screen.getByText('Custom')).toBeTruthy();
  });

  it('renders tabId, frameId, parentFrameId rows', () => {
    const frame = new Frame(42, 5, frameLookup);
    frame.parentFrameId = 0;
    renderInTable(<FrameSection frame={frame} />);
    expect(screen.getByText('tab[42]')).toBeTruthy();
    expect(screen.getByText('frame[5]')).toBeTruthy();
    expect(screen.getByText('frame[0]')).toBeTruthy();
  });

  it('omits parentFrameId when undefined or -1', () => {
    const frame = new Frame(42, 0, frameLookup);
    frame.parentFrameId = -1;
    renderInTable(<FrameSection frame={frame} />);
    expect(screen.queryByText('Parent Frame')).toBeNull();
  });

  it('renders ownerElement fields when provided', () => {
    const owner = new OwnerElement('iframe#x', 'https://child.example/', 'my-iframe');
    renderInTable(<FrameSection ownerElement={owner} />);
    expect(screen.getByText('iframe#x')).toBeTruthy();
    expect(screen.getByText('https://child.example/')).toBeTruthy();
    expect(screen.getByText('my-iframe')).toBeTruthy();
  });

  it('renders status row when status prop is provided', () => {
    const frame = new Frame(42, 5, frameLookup);
    renderInTable(<FrameSection frame={frame} status="Removed from page" />);
    expect(screen.getByText('Removed from page')).toBeTruthy();
  });

  it('renders openerTab and openedTabs only when frame is root and the Tab has them', () => {
    const root = new Frame(42, 0, frameLookup);
    const tab = new Tab(42, root);
    const opener = new Tab(99, new Frame(99, 0, frameLookup));
    tab.openerTab = opener;
    const opened = new Tab(101, new Frame(101, 0, frameLookup));
    tab.openedTabs.push(opened);
    frameStore.tabs.set(42, tab);

    renderInTable(<FrameSection frame={root} />);
    expect(screen.getByText('tab[99]')).toBeTruthy();
    expect(screen.getByText('tab[101]')).toBeTruthy();
  });

  it('does not render openerTab/openedTabs for non-root frames', () => {
    const child = new Frame(42, 5, frameLookup);
    renderInTable(<FrameSection frame={child} />);
    expect(screen.queryByText('Opener Tab')).toBeNull();
    expect(screen.queryByText('Opened Tabs')).toBeNull();
  });

  it('falls back to tabId/frameId props when frame is undefined', () => {
    renderInTable(<FrameSection tabId={42} frameId={5} />);
    expect(screen.getByText('tab[42]')).toBeTruthy();
    expect(screen.getByText('frame[5]')).toBeTruthy();
  });

  it('derives "Tab" heading from frameId prop when frame is undefined', () => {
    const { container } = renderInTable(<FrameSection tabId={42} frameId={0} />);
    const heading = container.querySelector('.section-heading');
    expect(heading?.textContent).toBe('Tab');
  });
});
