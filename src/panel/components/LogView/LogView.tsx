// Log view component

import { observer } from 'mobx-react-lite';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { store } from '../../store';
import { TopBar } from './TopBar';
import { FilterBar } from './FilterBar';
import { MessageTable } from './MessageTable';
import { DetailPane } from './DetailPane';

export const LogView = observer(() => {
  const isActive = store.currentView === 'log';
  const showDetail = !!store.selectedMessage;

  return (
    <div className={`view log-view ${isActive ? 'active' : ''}`}>
      <TopBar />
      <FilterBar />
      <div className="main-content">
        <Group>
          <Panel minSize={30}>
            <MessageTable />
          </Panel>
          {showDetail && (
            <>
              <Separator className="resize-handle" />
              <Panel defaultSize={40} minSize={20} maxSize={70}>
                <DetailPane />
              </Panel>
            </>
          )}
        </Group>
      </div>
    </div>
  );
});
