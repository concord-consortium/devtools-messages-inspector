// Inline action buttons for frame navigation (filter, focus, view in endpoints)

import { observer } from 'mobx-react-lite';
import { store } from '../../store';
import { Icon } from '../../icons/Icon';
import { EndpointsIcon } from '../../icons/EndpointsIcon';

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

  const handleViewInEndpoints = (e: React.MouseEvent) => {
    e.stopPropagation();
    store.viewFrameInEndpoints(tabId, frameId);
  };

  return (
    <span className="frame-action-buttons">
      <button className="frame-action-btn" title="Filter by this frame" onClick={handleFilter}>
        <Icon name="filterList" size={12} />
      </button>
      <button className="frame-action-btn" title="Set as focused frame" onClick={handleFocus}>
        <Icon name="centerFocus" size={12} />
      </button>
      <button className="frame-action-btn" title="View in Endpoints" onClick={handleViewInEndpoints}>
        <EndpointsIcon size={12} />
      </button>
    </span>
  );
});
