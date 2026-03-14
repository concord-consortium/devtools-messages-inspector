import React, { useEffect, useRef } from 'react';
import type { HierarchyAction } from '../hierarchy/actions';
import type { HierarchyEvent } from '../hierarchy/events';

export interface ActionLogEntry {
  action: HierarchyAction;
  events: HierarchyEvent[];
}

export function ActionLog({ log }: { log: ActionLogEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);
  return (
    <div className="action-log">
      {log.length === 0 && <div className="action-log-empty">No actions yet.</div>}
      {log.map((entry, i) => (
        <div key={i} className="action-log-entry-group">
          <pre className="action-log-entry">{JSON.stringify(entry.action, null, 2)}</pre>
          {entry.events.map((event, j) => (
            <pre key={j} className="action-log-event">{'\u2192'} {JSON.stringify(event, null, 2)}</pre>
          ))}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
