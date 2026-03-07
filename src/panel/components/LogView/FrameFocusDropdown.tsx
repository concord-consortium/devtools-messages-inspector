// Focused frame selector dropdown

import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { store } from '../../store';
import { requestFrameHierarchy } from '../../connection';
import type { Frame } from '../../models/Frame';

function frameLabel(frame: Frame): string {
  const isOtherTab = frame.tabId !== store.tabId;
  const name = isOtherTab
    ? `tab[${frame.tabId}].frame[${frame.frameId}]`
    : `frame[${frame.frameId}]`;
  const origin = frame.currentDocument?.origin || '';
  return `${name} - ${origin}`;
}

// Build flat list of options with indentation from frame tree
function flattenTree(nodes: Frame[], depth: number = 0): Array<{ frame: Frame; depth: number }> {
  const result: Array<{ frame: Frame; depth: number }> = [];
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

  // Re-request when messages arrive but no hierarchy roots exist
  const messageCount = store.messages.length;
  useEffect(() => {
    if (messageCount > 0 && store.hierarchyRoots.length === 0) {
      requestFrameHierarchy();
    }
  }, [messageCount]);

  const tree = store.buildFrameTree();
  const options = flattenTree(tree);
  const nonHierarchy = store.nonHierarchyFrames;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === '') {
      store.setFocusedFrame(null);
    } else {
      const [tabId, frameId] = value.split(':').map(Number);
      store.setFocusedFrame({ tabId, frameId });
    }
  };

  const selectedKey = store.focusedFrame
    ? `${store.focusedFrame.tabId}:${store.focusedFrame.frameId}`
    : '';

  return (
    <div className="frame-focus-selector">
      <label>
        Focus
        <select
          value={selectedKey}
          onChange={handleChange}
        >
          <option value="">None</option>
          {options.map(({ frame, depth }) => {
            const indent = '\u00A0\u00A0'.repeat(depth);
            const key = store.frameKey(frame);
            return (
              <option key={key} value={key}>
                {indent}{frameLabel(frame)}
              </option>
            );
          })}
          {nonHierarchy.length > 0 && (
            <option disabled>──────────</option>
          )}
          {nonHierarchy.map(frame => {
            const key = store.frameKey(frame);
            return (
              <option key={key} value={key}>
                {frameLabel(frame)}
              </option>
            );
          })}
        </select>
      </label>
    </div>
  );
});
