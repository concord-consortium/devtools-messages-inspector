// FilterBar component for Messages view

import { observer } from 'mobx-react-lite';
import { store } from '../../store';

export const FilterBar = observer(() => {
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    store.setFilter(e.target.value);
  };

  const hasGlobalFilter = store.settings.globalFilter.length > 0;

  return (
    <div className="filter-bar">
      {hasGlobalFilter && (
        <button
          className={`global-filter-chip ${!store.settings.globalFilterEnabled ? 'disabled' : ''}`}
          onClick={() => store.updateSettings({ globalFilterEnabled: !store.settings.globalFilterEnabled })}
          title={store.settings.globalFilterEnabled ? 'Click to disable global filter' : 'Click to enable global filter'}
          aria-pressed={store.settings.globalFilterEnabled}
        >
          Global filter
        </button>
      )}
      <div className="filter-input-wrapper">
        <input
          type="text"
          className="filter-input"
          placeholder="Filter (e.g., data.type:click, -data.source:react-devtools*, sourceType:child OR sourceType:parent)"
          value={store.filterText}
          onChange={handleFilterChange}
        />
        {store.filterText && (
          <button
            className="filter-clear-button"
            onClick={() => store.setFilter('')}
            title="Clear filter"
            aria-label="Clear filter"
          >
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="7" fill="#5f6368" />
              <path d="M4.5 4.5L9.5 9.5M9.5 4.5L4.5 9.5" stroke="white" strokeWidth="1.2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
});
