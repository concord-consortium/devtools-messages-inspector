// Visual catalog of all DirectionIcon variants.
// Renders every sourceType × focusPosition combination plus special icons.

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DirectionIcon, UninvolvedIcon } from '../panel/components/shared/DirectionIcon';
import type { FocusPosition } from '../panel/types';

const SOURCE_TYPES = ['parent', 'child', 'opener', 'opened', 'self', 'unknown'] as const;
const FOCUS_POSITIONS: FocusPosition[] = ['none', 'source', 'target', 'both'];

function ArrowCatalog() {
  const [showBorder, setShowBorder] = useState(false);
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>
      <h2 style={{ marginTop: 0 }}>Direction Icon Catalog</h2>
      <label style={{ display: 'block', marginBottom: 12 }}>
        <input type="checkbox" checked={showBorder} onChange={e => setShowBorder(e.target.checked)} />
        {' '}Show bounds
      </label>

      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>sourceType</th>
            {FOCUS_POSITIONS.map(fp => (
              <th key={fp} style={thStyle}>focus: {fp}</th>
            ))}
            <th style={thStyle}>uninvolved</th>
          </tr>
        </thead>
        <tbody>
          {SOURCE_TYPES.map(st => (
            <tr key={st}>
              <td style={tdStyle}><code>{st}</code></td>
              {FOCUS_POSITIONS.map(fp => (
                <td key={fp} style={tdStyle} className={`dir-${st}`}>
                  {/* "both" only applies to self */}
                  {fp === 'both' && st !== 'self' ? null : (
                    <div style={{ border: showBorder ? '1px solid #000000' : undefined, display: 'inline-block', lineHeight: 0 }}>
                      <DirectionIcon sourceType={st} focusPosition={fp} />
                    </div>
                  )}
                </td>
              ))}
              <td style={tdStyle} className="dir-uninvolved">
                <UninvolvedIcon />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 16px',
  borderBottom: '2px solid #ccc',
};

const tdStyle: React.CSSProperties = {
  padding: '6px 16px',
  borderBottom: '1px solid #eee',
};

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<ArrowCatalog />);
}
