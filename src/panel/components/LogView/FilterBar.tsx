// FilterBar component for Messages view

import { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import Markdown from 'react-markdown';
import { store } from '../../store';
import filterSyntaxMd from '../../../../docs/filter-syntax.md?raw';

export const FilterBar = observer(() => {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!helpOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        helpRef.current && !helpRef.current.contains(e.target as Node) &&
        helpButtonRef.current && !helpButtonRef.current.contains(e.target as Node)
      ) {
        setHelpOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [helpOpen]);

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
        <button
          ref={helpButtonRef}
          className="filter-help-button"
          onClick={() => setHelpOpen(!helpOpen)}
          title="Filter syntax help"
          aria-label="Filter syntax help"
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <circle cx="7" cy="7" r="6" fill="none" stroke="#5f6368" strokeWidth="1.2" />
            <text x="7" y="10.5" textAnchor="middle" fontSize="9" fill="#5f6368" fontFamily="system-ui">?</text>
          </svg>
        </button>
      </div>
      {helpOpen && (
        <div ref={helpRef} className="filter-help-panel">
          <Markdown>{filterSyntaxMd}</Markdown>
        </div>
      )}
    </div>
  );
});
