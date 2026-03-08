import React from 'react';
import type { HierarchyNode } from './types';

function getLabel(node: HierarchyNode): string {
  switch (node.type) {
    case 'tab':
      return node.label ?? 'Tab ' + node.tabId;
    case 'frame':
      return node.label ?? 'frame[' + node.frameId + ']';
    case 'document':
      return node.url ?? node.origin ?? node.documentId ?? 'document';
    case 'iframe': {
      const parts: string[] = [];
      if (node.id) parts.push('#' + node.id);
      if (node.src) parts.push(node.src);
      return parts.length > 0 ? parts.join(' ') : 'iframe';
    }
  }
}

function getChildren(node: HierarchyNode): HierarchyNode[] {
  switch (node.type) {
    case 'tab':
      return node.frames ?? [];
    case 'frame':
      return node.documents ?? [];
    case 'document':
      return node.iframes ?? [];
    case 'iframe':
      return node.frame ? [node.frame] : [];
  }
}

function NodeBox({ node }: { node: HierarchyNode }) {
  const className = [
    'node-box',
    `node-${node.type}`,
    node.stale ? 'node-stale' : '',
  ].filter(Boolean).join(' ');

  const children = getChildren(node);

  return (
    <div className={className}>
      <div className="node-header">
        <span className="node-type-badge">{node.type}</span>
        <span className="node-label">{getLabel(node)}</span>
      </div>
      {children.length > 0 && (
        <div className="node-body">
          {children.map((child, i) => (
            <NodeBox key={i} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

export function HierarchyMap({ root }: { root: HierarchyNode }) {
  return (
    <div className="hierarchy-map">
      <NodeBox node={root} />
    </div>
  );
}
