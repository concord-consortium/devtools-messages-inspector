import React from 'react';
import type { HierarchyAction } from './actions';
import type { HierarchyNode, TabNode } from './types';

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

function getKey(node: HierarchyNode): string {
  switch (node.type) {
    case 'tab': return `tab-${node.tabId}`;
    case 'frame': return `frame-${node.frameId}`;
    case 'document': return `doc-${node.documentId ?? node.url ?? ''}`;
    case 'iframe': return `iframe-${node.iframeId}`;
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

function ActionButton({ label, action, onAction }: {
  label: string;
  action: HierarchyAction;
  onAction: (action: HierarchyAction) => void;
}) {
  return (
    <button
      className="node-action-btn"
      onClick={(e) => {
        e.stopPropagation();
        onAction(action);
      }}
    >
      {label}
    </button>
  );
}

function NodeActions({ node, onAction }: {
  node: HierarchyNode;
  onAction: (action: HierarchyAction) => void;
}) {
  if (node.stale) return null;

  const buttons: { label: string; action: HierarchyAction }[] = [];

  switch (node.type) {
    case 'tab':
      buttons.push(
        { label: 'Close', action: { type: 'close-tab', tabId: node.tabId } },
      );
      break;
    case 'frame':
      buttons.push(
        { label: 'Navigate', action: { type: 'navigate-frame', frameId: node.frameId } },
        { label: 'Reload', action: { type: 'reload-frame', frameId: node.frameId } },
      );
      break;
    case 'document':
      if (node.documentId) {
        buttons.push(
          { label: '+ Iframe', action: { type: 'add-iframe', documentId: node.documentId } },
          { label: 'Open Tab', action: { type: 'open-tab', documentId: node.documentId } },
        );
      }
      break;
    case 'iframe':
      buttons.push(
        { label: 'Remove', action: { type: 'remove-iframe', iframeId: node.iframeId } },
        { label: 'Navigate', action: { type: 'navigate-iframe', iframeId: node.iframeId } },
      );
      break;
  }

  if (buttons.length === 0) return null;

  return (
    <span className="node-actions">
      {buttons.map((btn) => (
        <ActionButton
          key={btn.label}
          label={btn.label}
          action={btn.action}
          onAction={onAction}
        />
      ))}
    </span>
  );
}

function NodeBox({ node, onAction }: {
  node: HierarchyNode;
  onAction?: (action: HierarchyAction) => void;
}) {
  const className = [
    'node-box',
    `node-${node.type}`,
    node.stale ? 'node-stale' : '',
  ].filter(Boolean).join(' ');

  const children = getChildren(node);

  return (
    <div className={className}>
      <div className="node-header">
        <span className="node-type-badge">{node.type === 'document' ? 'doc' : node.type}</span>
        <span className="node-label" title={getLabel(node)}>{getLabel(node)}</span>
        {onAction && <NodeActions node={node} onAction={onAction} />}
      </div>
      {children.length > 0 && (
        <div className="node-body">
          {children.map((child) => (
            <NodeBox key={getKey(child)} node={child} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}

interface HierarchyMapProps {
  root: TabNode | TabNode[];
  onAction?: (action: HierarchyAction) => void;
}

export function HierarchyMap({ root, onAction }: HierarchyMapProps) {
  const tabs = Array.isArray(root) ? root : [root];
  return (
    <div className="hierarchy-map">
      {tabs.map((tab) => (
        <NodeBox key={getKey(tab)} node={tab} onAction={onAction} />
      ))}
    </div>
  );
}
