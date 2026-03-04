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
        >
          Global filter
        </button>
      )}
      <input
        type="text"
        className="filter-input"
        placeholder="Filter (e.g., data.type:click, -data.source:react-devtools*, sourceType:child OR sourceType:parent)"
        value={store.filterText}
        onChange={handleFilterChange}
      />
    </div>
  );
});
