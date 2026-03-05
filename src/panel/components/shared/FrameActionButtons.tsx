// Inline action buttons for frame navigation (filter, focus, view in sources)

import { observer } from 'mobx-react-lite';
import { store } from '../../store';

interface FrameActionButtonsProps {
  tabId: number;
  frameId: number;
}

export const FrameActionButtons = observer(({ tabId, frameId }: FrameActionButtonsProps) => {
  const handleFilter = (e: React.MouseEvent) => {
    e.stopPropagation();
    store.setFilter(store.buildFrameFilter(tabId, frameId));
  };

  const handleFocus = (e: React.MouseEvent) => {
    e.stopPropagation();
    store.setFocusedFrame({ tabId, frameId });
  };

  const handleViewInSources = (e: React.MouseEvent) => {
    e.stopPropagation();
    store.viewFrameInSources(tabId, frameId);
  };

  return (
    <span className="frame-action-buttons">
      <button className="frame-action-btn" title="Filter by this frame" onClick={handleFilter}>
        <svg width="12" height="12" viewBox="0 0 16 16">
          <path fill="currentColor" d="M1 2h14l-5.5 6.5V14l-3-2v-3.5z"/>
        </svg>
      </button>
      <button className="frame-action-btn" title="Set as focused frame" onClick={handleFocus}>
        <svg width="12" height="12" viewBox="0 0 16 16">
          <path fill="currentColor" d="M8 1a5 5 0 00-5 5c0 4 5 9 5 9s5-5 5-9a5 5 0 00-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z"/>
        </svg>
      </button>
      <button className="frame-action-btn" title="View in Sources" onClick={handleViewInSources}>
        <svg width="12" height="12" viewBox="0 0 16 16">
          <path fill="currentColor" d="M3 1v14l10-7z"/>
        </svg>
      </button>
    </span>
  );
});
