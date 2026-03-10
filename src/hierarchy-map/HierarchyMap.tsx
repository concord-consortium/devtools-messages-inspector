import React, { useState } from 'react';
import type { HierarchyAction } from '../hierarchy/actions';
import type { HierarchyNode, TabNode } from '../hierarchy/types';

export function getLabel(node: HierarchyNode): string {
  switch (node.type) {
    case 'tab':
      return node.label ?? 'Tab ' + node.tabId;
    case 'frame':
      return node.label ?? 'frame[' + node.frameId + ']';
    case 'document':
      return node.origin ?? node.documentId ?? 'document';
    case 'iframe':
      return node.id ? '#' + node.id : 'iframe';
  }
}

export function getDetails(node: HierarchyNode): { label: string; value: string }[] {
  const details: { label: string; value: string }[] = [];
  switch (node.type) {
    case 'tab':
      if (node.openerTabId != null && node.openerFrameId != null) {
        details.push({ label: 'opener', value: `tab[${node.openerTabId}].frame[${node.openerFrameId}]` });
      }
      break;
    case 'frame':
      break;
    case 'document':
      if (node.documentId) details.push({ label: 'id', value: node.documentId });
      if (node.url) details.push({ label: 'url', value: node.url });
      if (node.title) details.push({ label: 'title', value: node.title });
      break;
    case 'iframe':
      if (node.src) details.push({ label: 'src', value: node.src });
      if (node.id) details.push({ label: 'id', value: node.id });
      break;
  }
  return details;
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

function NodeActions({ node, tabId, onAction }: {
  node: HierarchyNode;
  tabId: number;
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
        { label: 'Open Tab', action: { type: 'open-tab', tabId, frameId: node.frameId } },
      );
      break;
    case 'document':
      if (node.documentId) {
        buttons.push(
          { label: '+ Iframe', action: { type: 'add-iframe', documentId: node.documentId } },
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

function NodeBox({ node, tabId, onAction }: {
  node: HierarchyNode;
  tabId: number;
  onAction?: (action: HierarchyAction) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const currentTabId = node.type === 'tab' ? node.tabId : tabId;
  const details = getDetails(node);

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
        {details.length > 0 && (
          <button
            className="node-info-btn"
            aria-label="info"
            onClick={() => setDetailsOpen(prev => !prev)}
          >
            ℹ
          </button>
        )}
        {onAction && <NodeActions node={node} tabId={currentTabId} onAction={onAction} />}
      </div>
      {detailsOpen && details.length > 0 && (
        <div className="node-details">
          {details.map(({ label, value }) => (
            <div key={label} className="node-detail-row">
              <span className="node-detail-label">{label}</span>
              <span className="node-detail-value" title={value}>{value}</span>
            </div>
          ))}
        </div>
      )}
      {children.length > 0 && (
        <div className="node-body">
          {children.map((child) => (
            <NodeBox key={getKey(child)} node={child} tabId={currentTabId} onAction={onAction} />
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
        <NodeBox key={getKey(tab)} node={tab} tabId={tab.tabId} onAction={onAction} />
      ))}
    </div>
  );
}
