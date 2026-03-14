import React from 'react';
// @ts-ignore — virtual module provided by vite plugin
import gitBranch from 'virtual:git-branch';

export const HARNESS_EXAMPLES = [
  'harness.sendChildToParent({ type: "hello" })',
  'harness.sendParentToChild({ type: "hi" })',
  'harness.childWin.parent.postMessage(data, "*")',
  'harness.actions.addIframe(harness.topFrame, { url: "https://other.com/" })',
];

export function HarnessBanner() {
  return (
    <div style={{
      background: '#1e1e1e',
      color: '#fff',
      fontFamily: 'monospace',
      fontSize: 13,
      padding: '6px 0',
      textAlign: 'center',
      borderBottom: '1px solid #333',
    }}>
      Test Harness{gitBranch ? ` (${gitBranch})` : ''}
    </div>
  );
}
