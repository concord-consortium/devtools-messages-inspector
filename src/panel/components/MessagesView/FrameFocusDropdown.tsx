// Focused frame selector dropdown

import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { store } from '../../store';
import { requestFrameHierarchy } from '../../connection';
import type { FrameInfo } from '../../../types';

// Build flat list of options with indentation from frame tree
function flattenTree(nodes: FrameInfo[], depth: number = 0): Array<{ frame: FrameInfo; depth: number }> {
  const result: Array<{ frame: FrameInfo; depth: number }> = [];
  for (const node of nodes) {
    result.push({ frame: node, depth });
    if (node.children?.length) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

export const FrameFocusDropdown = observer(() => {
  // Request frame hierarchy on mount so the dropdown is populated
  useEffect(() => {
    requestFrameHierarchy();
  }, []);

  // Re-request when messages arrive but hierarchy is empty
  const messageCount = store.messages.length;
  useEffect(() => {
    if (messageCount > 0 && store.frameHierarchy.length === 0) {
      requestFrameHierarchy();
    }
  }, [messageCount]);

  const tree = store.buildFrameTree();
  const options = flattenTree(tree);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    store.setFocusedFrame(value === '' ? null : Number(value));
  };

  return (
    <div className="frame-focus-selector">
      <label>
        Focus
        <select
          value={store.focusedFrameId ?? ''}
          onChange={handleChange}
        >
          <option value="">None</option>
          {options.map(({ frame, depth }) => {
            const indent = '\u00A0\u00A0'.repeat(depth);
            const frameId = typeof frame.frameId === 'number' ? frame.frameId : frame.frameId;
            const label = `${indent}frame[${frameId}] - ${frame.origin}`;
            return (
              <option key={store.frameKey(frame)} value={String(frameId)}>
                {label}
              </option>
            );
          })}
        </select>
      </label>
    </div>
  );
});
