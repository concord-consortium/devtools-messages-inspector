import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { HierarchyMap } from '../hierarchy-map/HierarchyMap';
import { ActionLog } from '../hierarchy-map/ActionLog';
import type { HarnessRuntime } from './harness-runtime';
import '../hierarchy-map/HierarchyMap.css';

type SidebarTab = 'map' | 'log';

export const HarnessSidebar = observer(function HarnessSidebar({ runtime }: { runtime: HarnessRuntime }) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('map');

  return (
    <div className="harness-sidebar">
      <div className="side-panel-tabs">
        <button
          className={`side-panel-tab ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >Map</button>
        <button
          className={`side-panel-tab ${activeTab === 'log' ? 'active' : ''}`}
          onClick={() => setActiveTab('log')}
        >Log</button>
      </div>
      <div className="harness-sidebar-content">
        {activeTab === 'map' ? (
          <div className="harness-sidebar-map">
            <HierarchyMap
              root={runtime.hierarchyState.root}
              onAction={(action) => runtime.dispatch(action)}
            />
            <div className="harness-sidebar-buttons">
              <button
                className="node-action-btn"
                onClick={() => runtime.dispatch({ type: 'create-tab', url: 'https://new-tab.example.com/' })}
              >+ Tab</button>
              <button
                className="node-action-btn"
                onClick={() => runtime.dispatch({ type: 'purge-stale' })}
              >Purge Stale</button>
            </div>
          </div>
        ) : (
          <ActionLog log={runtime.actionLog} />
        )}
      </div>
    </div>
  );
});
