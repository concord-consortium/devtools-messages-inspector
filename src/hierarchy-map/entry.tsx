import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HierarchyMap } from './HierarchyMap';
import type { TabNode } from './types';
import './HierarchyMap.css';

function App() {
  const [data, setData] = useState<TabNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dataUrl = params.get('data');
    if (!dataUrl) {
      setError('Missing ?data= parameter. Provide a URL to a JSON file.');
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
  return <HierarchyMap root={data} />;
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
