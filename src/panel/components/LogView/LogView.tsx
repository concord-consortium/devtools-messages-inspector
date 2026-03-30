// Log view component

import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import { store } from '../../store';
import { TopBar } from './TopBar';
import { FilterBar } from './FilterBar';
import { MessageTable } from './MessageTable';
import { DetailPane } from './DetailPane';

export const LogView = observer(() => {
  const isActive = store.currentView === 'log';
  const showDetail = !!store.selectedMessage;
  const detailPanelRef = usePanelRef();

  useEffect(() => {
    if (showDetail) {
      detailPanelRef.current?.expand();
    } else {
      detailPanelRef.current?.collapse();
    }
  }, [showDetail, detailPanelRef]);

  return (
    <div className={`view log-view ${isActive ? 'active' : ''}`}>
      <TopBar />
      <FilterBar />
      <div className="main-content">
        <Group>
          <Panel minSize="30%">
            <MessageTable />
          </Panel>
          <Separator className={`resize-handle${showDetail ? '' : ' hidden'}`} disabled={!showDetail} />
          <Panel
            panelRef={detailPanelRef}
            defaultSize="40%"
            minSize="20%"
            maxSize="70%"
            collapsible
            collapsedSize={0}
          >
            <DetailPane />
          </Panel>
        </Group>
      </div>
    </div>
  );
});
