// Endpoints view component

import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { store } from '../../store';
import { requestFrameHierarchy } from '../../connection';
import { FrameDetail } from '../shared/FrameDetail';
import type { Frame } from '../../models/Frame';

// Frame row component
const FrameRow = observer(({ frame, depth }: { frame: Frame; depth: number }) => {
  const key = store.frameKey(frame);
  const isSelected = key === store.selectedFrameKey;

  const handleClick = () => {
    store.selectFrame(key);
  };

  const indentClass = `frame-indent-${Math.min(depth, 4)}`;
  const url = frame.currentDocument?.url || '';
  const origin = frame.currentDocument?.origin || '';
  const title = frame.currentDocument?.title || '';

  return (
    <>
      <tr
        data-frame-id={String(frame.frameId)}
        className={isSelected ? 'selected' : ''}
        onClick={handleClick}
      >
        <td className={indentClass} style={frame.isOpener ? { fontStyle: 'italic' } : undefined}>
          {frame.isOpener ? 'opener' : `frame[${frame.frameId}]`}
        </td>
        <td>{url}</td>
        <td>{origin}</td>
        <td>{title}</td>
        <td>{frame.parentFrameId === undefined ? '?' : frame.parentFrameId === -1 ? '-' : `frame[${frame.parentFrameId}]`}</td>
      </tr>
      {frame.children?.map(child => (
        <FrameRow key={store.frameKey(child)} frame={child} depth={depth + 1} />
      ))}
    </>
  );
});

// Frame table component
const FrameTable = observer(() => {
  const frameTree = store.buildFrameTree();
  const nonHierarchy = store.nonHierarchyFrames;

  return (
    <div className="table-pane">
      <table id="frame-table">
        <thead>
          <tr>
            <th>Frame</th>
            <th>URL</th>
            <th>Origin</th>
            <th>Title</th>
            <th>Parent</th>
          </tr>
        </thead>
        <tbody>
          {frameTree.map(frame => (
            <FrameRow key={store.frameKey(frame)} frame={frame} depth={0} />
          ))}
          {nonHierarchy.length > 0 && (
            <tr className="section-separator">
              <td colSpan={5}>Other known frames</td>
            </tr>
          )}
          {nonHierarchy.map(frame => (
            <FrameRow key={store.frameKey(frame)} frame={frame} depth={0} />
          ))}
        </tbody>
      </table>
    </div>
  );
});

// Frame detail pane
const FrameDetailPane = observer(() => {
  const frame = store.selectedFrame;

  const handleClose = () => {
    store.selectFrame(null);
  };

  if (!frame) {
    return (
      <div className="detail-pane hidden">
        <div className="detail-tabs">
          <span className="detail-title">Frame Details</span>
          <button className="close-detail-btn" title="Close">×</button>
        </div>
        <div className="tab-content">
          <div className="placeholder">Select a frame to view details</div>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-pane">
      <div className="detail-tabs">
        <span className="detail-title">Frame Details</span>
        <button
          className="show-messages-btn"
          title="Show messages involving this frame"
          onClick={() => store.navigateToFrameMessages(frame.tabId, frame.frameId)}
        >
          Show messages
        </button>
        <button className="close-detail-btn" title="Close" onClick={handleClose}>×</button>
      </div>
      <div className="tab-content">
        <div className="frame-properties">
          <table className="context-table">
            <tbody>
              <FrameDetail
                frame={frame}
                sourceType={frame.isOpener ? 'opener' : undefined}
              />
            </tbody>
          </table>
        </div>
        <div className="frame-iframes">
          <h4>Child iframes ({frame.iframes.length})</h4>
          {frame.iframes.length === 0 ? (
            <p className="placeholder">No iframes in this frame</p>
          ) : (
            frame.iframes.map((iframe, index) => (
              <div key={index} className="iframe-item">
                <div><strong>src:</strong> {iframe.src || '(empty)'}</div>
                <div><strong>id:</strong> {iframe.id || '(none)'}</div>
                <div><strong>path:</strong> {iframe.domPath}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
});

// Pane resize handle
const ResizeHandle = () => {
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const container = document.querySelector('#endpoints-view .main-content') as HTMLElement;
      if (!container) return;

      const containerWidth = container.offsetWidth;
      const newDetailWidth = containerWidth - e.clientX;
      const pct = Math.max(20, Math.min(70, (newDetailWidth / containerWidth) * 100));

      const detailPane = container.querySelector('.detail-pane') as HTMLElement;
      if (detailPane) {
        detailPane.style.width = pct + '%';
      }
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        document.body.style.cursor = '';
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
  };

  return (
    <div
      className="resize-handle"
      onMouseDown={handleMouseDown}
    />
  );
};

// Top bar for endpoints view
const EndpointsTopBar = () => {
  const handleRefresh = () => {
    requestFrameHierarchy();
  };

  return (
    <div className="top-bar">
      <button className="icon-btn" title="Refresh" onClick={handleRefresh}>
        <span className="refresh-icon"></span>
      </button>
    </div>
  );
};

// Main EndpointsView component
export const EndpointsView = observer(() => {
  const isActive = store.currentView === 'endpoints';

  // Request hierarchy when view becomes active
  useEffect(() => {
    if (isActive) {
      requestFrameHierarchy();
    }
  }, [isActive]);

  return (
    <div id="endpoints-view" className={`view endpoints-view ${isActive ? 'active' : ''}`}>
      <EndpointsTopBar />
      <div className="main-content">
        <FrameTable />
        <ResizeHandle />
        <FrameDetailPane />
      </div>
    </div>
  );
});
