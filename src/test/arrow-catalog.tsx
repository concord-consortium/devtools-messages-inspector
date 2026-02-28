// Visual catalog of all DirectionIcon variants.
// Renders every sourceType × focusPosition combination plus special icons.

import React from 'react';
import { createRoot } from 'react-dom/client';
import { DirectionIcon, UninvolvedIcon, type FocusPosition } from '../panel/components/shared/DirectionIcon';

const SOURCE_TYPES = ['parent', 'top', 'child', 'opener', 'opened', 'self', 'unknown'] as const;
const FOCUS_POSITIONS: FocusPosition[] = ['none', 'source', 'target', 'both'];

function ArrowCatalog() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>
      <h2 style={{ marginTop: 0 }}>Direction Icon Catalog</h2>

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
                    <DirectionIcon sourceType={st} focusPosition={fp} />
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
