import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HierarchyMap } from './HierarchyMap';
import type { HierarchyNode } from './types';
import './HierarchyMap.css';

function App() {
  const [data, setData] = useState<HierarchyNode | null>(null);
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
      .then(json => setData(json as HierarchyNode))
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
