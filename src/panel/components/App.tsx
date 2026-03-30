// Root App component for Frames Inspector panel

import { observer } from 'mobx-react-lite';
import { store } from '../store';
import { ViewType } from '../types';
import { LogView } from './LogView';
import { EndpointsView } from './EndpointsView';
import { FieldInfoPopup } from './shared/FieldInfoPopup';

interface SidebarItemProps {
  view: ViewType;
  icon: React.ReactNode;
  label: string;
}

const SidebarItem = observer(({ view, icon, label }: SidebarItemProps) => {
  const isActive = store.currentView === view;

  return (
    <div
      className={`sidebar-item ${isActive ? 'active' : ''}`}
      onClick={() => store.setCurrentView(view)}
    >
      <span className="sidebar-icon">{icon}</span>
      <span className="sidebar-label">{label}</span>
    </div>
  );
});

const EndpointsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="8" height="10" rx="1.5" />
    <path d="M5 8h9.5M12 5.5 14.5 8 12 10.5" />
  </svg>
);

const Sidebar = () => (
  <div className="sidebar">
    <SidebarItem view="log" icon="📋" label="Log" />
    <SidebarItem view="endpoints" icon={<EndpointsIcon />} label="Endpoints" />
    <SidebarItem view="settings" icon="⚙️" label="Settings" />
  </div>
);

const SettingsView = observer(() => (
  <div className={`view settings-view ${store.currentView === 'settings' ? 'active' : ''}`}>
    <div className="settings-content">
      <h3>Settings</h3>
      <label className="settings-item">
        <input
          type="checkbox"
          checked={store.settings.showInternalFields}
          onChange={(e) => store.updateSettings({ showInternalFields: e.target.checked })}
        />
        Show internal fields
      </label>
      <label className="settings-item">
        <input
          type="checkbox"
          checked={store.settings.enableFrameRegistration}
          onChange={(e) => {
            store.updateSettings({ enableFrameRegistration: e.target.checked });
            chrome.storage.local.set({ enableFrameRegistration: e.target.checked });
          }}
        />
        Enable frame registration (identifies source frame for child/opener messages)
      </label>
      <label className="settings-item nested">
        <input
          type="checkbox"
          checked={store.settings.showRegistrationMessages}
          disabled={!store.settings.enableFrameRegistration}
          onChange={(e) => store.updateSettings({ showRegistrationMessages: e.target.checked })}
        />
        Show registration messages in table
      </label>
      <div className="settings-section">
        <h4>Global Filter</h4>
        <p className="settings-description">
          Always applied across all panel instances. Uses the same filter syntax as the toolbar.
        </p>
        <label className="settings-item">
          <input
            type="checkbox"
            checked={store.settings.globalFilterEnabled}
            onChange={(e) => store.updateSettings({ globalFilterEnabled: e.target.checked })}
          />
          Enable global filter
        </label>
        <div className="settings-filter-row">
          <input
            type="text"
            className="settings-filter-input"
            placeholder="e.g., -data.source:react-devtools*"
            value={store.settings.globalFilter}
            disabled={!store.settings.globalFilterEnabled}
            onChange={(e) => store.updateSettings({ globalFilter: e.target.value })}
          />
        </div>
      </div>
    </div>
  </div>
));

export const App = observer(() => (
  <>
    <Sidebar />
    <div className="view-container">
      <LogView />
      <EndpointsView />
      <SettingsView />
    </div>
    <FieldInfoPopup />
  </>
));
