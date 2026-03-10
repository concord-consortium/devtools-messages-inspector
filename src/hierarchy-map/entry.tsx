import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HierarchyMap } from './HierarchyMap';
import { initState, reduce } from '../hierarchy/reducer';
import type { HierarchyAction } from '../hierarchy/actions';
import type { TabNode } from '../hierarchy/types';
import Markdown from 'react-markdown';
import aboutMarkdown from '../../docs/hierarchy-actions.md?raw';
import './HierarchyMap.css';

type SideTab = 'log' | 'about';

function ActionLog({ log }: { log: HierarchyAction[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);
  return (
    <div className="action-log">
      {log.length === 0 && <div className="action-log-empty">No actions yet.</div>}
      {log.map((action, i) => (
        <pre key={i} className="action-log-entry">{JSON.stringify(action, null, 2)}</pre>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function AboutTab() {
  return <div className="about-content"><Markdown>{aboutMarkdown}</Markdown></div>;
}

function SidePanel({ log }: { log: HierarchyAction[] }) {
  const [activeTab, setActiveTab] = useState<SideTab>('log');
  return (
    <div className="side-panel">
      <div className="side-panel-tabs">
        <button
          className={`side-panel-tab ${activeTab === 'log' ? 'active' : ''}`}
          onClick={() => setActiveTab('log')}
        >Log</button>
        <button
          className={`side-panel-tab ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => setActiveTab('about')}
        >About</button>
      </div>
      <div className="side-panel-content">
        {activeTab === 'log' ? <ActionLog log={log} /> : <AboutTab />}
      </div>
    </div>
  );
}

function InteractiveMap({ root }: { root: TabNode }) {
  const [state, dispatch] = useReducer(reduce, root, initState);
  const [actionLog, setActionLog] = useState<HierarchyAction[]>([]);
  const loggedDispatch = useCallback((action: HierarchyAction) => {
    setActionLog(prev => [...prev, action]);
    dispatch(action);
  }, []);
  return (
    <div className="interactive-map-layout">
      <div className="interactive-map-left">
        <div style={{ padding: '8px 16px' }}>
          <button onClick={() => loggedDispatch({ type: 'purge-stale' })}>
            Purge Stale
          </button>
        </div>
        <HierarchyMap root={state.root} onAction={loggedDispatch} />
      </div>
      <SidePanel log={actionLog} />
    </div>
  );
}

function App() {
  const [data, setData] = useState<TabNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dataUrl = params.get('data');
    if (!dataUrl) {
      const defaultData: TabNode = {
        type: 'tab',
        tabId: 1,
        frames: [{
          type: 'frame',
          frameId: 0,
          documents: [{
            type: 'document',
            documentId: 'doc1',
            url: 'https://example.com',
            origin: 'https://example.com',
          }],
        }],
      };
      setData(defaultData);
      return;
    }
    fetch(dataUrl)
      .then(res => {
        if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
        return res.json();
      })
      .then(json => {
        if (!json || typeof json !== 'object' || !('type' in json)) {
          throw new Error('Invalid hierarchy data: root must have a "type" field');
        }
        setData(json as TabNode);
      })
      .catch(err => setError(String(err)));
  }, []);

  if (error) {
    return <div style={{ padding: 16, color: '#c00', fontFamily: 'system-ui' }}>{error}</div>;
  }
  if (!data) {
    return <div style={{ padding: 16, fontFamily: 'system-ui' }}>Loading...</div>;
  }
  return <InteractiveMap root={data} />;
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
