// Endpoints view component — hierarchical tree of Tabs, Documents, and IFrames

import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { store } from '../../store';
import { requestFrameHierarchy } from '../../connection';
import { frameStore } from '../../models';
import type { Frame } from '../../models/Frame';
import type { FrameDocument } from '../../models/FrameDocument';
import type { IFrame } from '../../models/IFrame';
import type { SelectedNode } from '../../types';

// --- Helpers ---

function nodesEqual(a: SelectedNode | null, b: SelectedNode): boolean {
  if (!a) return false;
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'tab': return (b as typeof a).tabId === a.tabId;
    case 'document': return (b as typeof a).documentId === a.documentId;
    case 'document-by-sourceId': return (b as typeof a).sourceId === a.sourceId;
    case 'iframe': return (b as typeof a).tabId === a.tabId && (b as typeof a).frameId === a.frameId;
    case 'unknown-iframe': return (b as typeof a).tabId === a.tabId && (b as typeof a).frameId === a.frameId;
    case 'unknown-document': return (b as typeof a).sourceId === a.sourceId;
  }
}

function documentNodeId(doc: FrameDocument): SelectedNode {
  if (doc.documentId) return { type: 'document', documentId: doc.documentId, docRef: doc };
  if (doc.sourceId) return { type: 'document-by-sourceId', sourceId: doc.sourceId, docRef: doc };
  // Fallback — shouldn't happen in practice
  return { type: 'document-by-sourceId', sourceId: '', docRef: doc };
}

// --- Expand/Collapse Toggle ---

const ExpandToggle = ({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) => (
  <span
    className="tree-node-expand"
    onClick={(e) => { e.stopPropagation(); onToggle(); }}
  >
    {expanded ? '▾' : '▸'}
  </span>
);

// --- Tree Node Components ---

const DocumentNode = observer(({ doc, frame, depth, isNavigatedAway }: {
  doc: FrameDocument;
  frame: Frame;
  depth: number;
  isNavigatedAway: boolean;
}) => {
  const [expanded, setExpanded] = useState(true);
  const nodeId = documentNodeId(doc);
  const isSelected = nodesEqual(store.selectedNode, nodeId);
  const label = doc.url || doc.origin || doc.sourceId || '(unknown)';
  const hasChildren = doc.iframes.length > 0 || frameStore.getUnknownChildFrames(frame, doc).length > 0;

  return (
    <div className="tree-node-group">
      <div
        className={`tree-node ${isSelected ? 'tree-node--selected' : ''} ${isNavigatedAway ? 'tree-node--dimmed' : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={() => store.selectNode(nodeId)}
      >
        {hasChildren ? <ExpandToggle expanded={expanded} onToggle={() => setExpanded(!expanded)} /> : <span className="tree-node-expand-spacer" />}
        <span className="tree-node-type tree-node-type--doc">Doc</span>
        <span className="tree-node-label" title={label}>{label}</span>
        {isNavigatedAway && <span className="tree-node-suffix">(navigated away)</span>}
      </div>
      {expanded && hasChildren && (
        <>
          {doc.iframes.map((iframe, i) => (
            <IFrameNode key={iframe.sourceId || `iframe-${i}`} iframe={iframe} depth={depth + 1} />
          ))}
          {frameStore.getUnknownChildFrames(frame, doc).map(childFrame => (
            <UnknownIFrameNode key={childFrame.key} frame={childFrame} depth={depth + 1} />
          ))}
        </>
      )}
    </div>
  );
});

const IFrameNode = observer(({ iframe, depth }: { iframe: IFrame; depth: number }) => {
  const [expanded, setExpanded] = useState(true);
  const childFrame = iframe.childFrame;
  const label = iframe.domPath || iframe.src || '(unknown iframe)';

  // Use child frame's identity if available
  const nodeId: SelectedNode | null = childFrame
    ? { type: 'iframe', tabId: childFrame.tabId, frameId: childFrame.frameId }
    : null;
  const isSelected = nodeId ? nodesEqual(store.selectedNode, nodeId) : false;
  const hasChildren = childFrame && childFrame.documents.length > 0;

  return (
    <div className="tree-node-group">
      <div
        className={`tree-node ${isSelected ? 'tree-node--selected' : ''} ${iframe.removedFromHierarchy ? 'tree-node--dimmed' : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={() => nodeId && store.selectNode(nodeId)}
      >
        {hasChildren ? <ExpandToggle expanded={expanded} onToggle={() => setExpanded(!expanded)} /> : <span className="tree-node-expand-spacer" />}
        <span className="tree-node-type tree-node-type--iframe">IFrame</span>
        <span className="tree-node-label" title={label}>{label}</span>
        {iframe.removedFromHierarchy && <span className="tree-node-suffix">(removed)</span>}
      </div>
      {expanded && childFrame && (
        <FrameDocuments frame={childFrame} depth={depth + 1} />
      )}
    </div>
  );
});

const UnknownIFrameNode = observer(({ frame, depth }: { frame: Frame; depth: number }) => {
  const [expanded, setExpanded] = useState(true);
  const nodeId: SelectedNode = { type: 'unknown-iframe', tabId: frame.tabId, frameId: frame.frameId };
  const isSelected = nodesEqual(store.selectedNode, nodeId);
  const hasChildren = frame.documents.length > 0;

  return (
    <div className="tree-node-group">
      <div
        className={`tree-node ${isSelected ? 'tree-node--selected' : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={() => store.selectNode(nodeId)}
      >
        {hasChildren ? <ExpandToggle expanded={expanded} onToggle={() => setExpanded(!expanded)} /> : <span className="tree-node-expand-spacer" />}
        <span className="tree-node-type tree-node-type--iframe">IFrame</span>
        <span className="tree-node-label">Unknown IFrame (frameId: {frame.frameId})</span>
      </div>
      {expanded && hasChildren && (
        <FrameDocuments frame={frame} depth={depth + 1} />
      )}
    </div>
  );
});

// Renders documents of a frame in reverse chronological order (most recent first)
const FrameDocuments = observer(({ frame, depth }: { frame: Frame; depth: number }) => {
  const docs = frame.documents;
  if (docs.length === 0) return null;

  return (
    <>
      {[...docs].reverse().map((doc, i) => (
        <DocumentNode
          key={doc.documentId || doc.sourceId || `doc-${i}`}
          doc={doc}
          frame={frame}
          depth={depth}
          isNavigatedAway={i > 0}
        />
      ))}
    </>
  );
});

const TabNode = observer(({ tabId, rootFrame, depth }: { tabId: number; rootFrame: Frame; depth: number }) => {
  const [expanded, setExpanded] = useState(true);
  const nodeId: SelectedNode = { type: 'tab', tabId };
  const isSelected = nodesEqual(store.selectedNode, nodeId);

  return (
    <div className="tree-node-group">
      <div
        className={`tree-node ${isSelected ? 'tree-node--selected' : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={() => store.selectNode(nodeId)}
      >
        <ExpandToggle expanded={expanded} onToggle={() => setExpanded(!expanded)} />
        <span className="tree-node-type tree-node-type--tab">Tab</span>
        <span className="tree-node-label">Tab [{tabId}]</span>
      </div>
      {expanded && (
        <FrameDocuments frame={rootFrame} depth={depth + 1} />
      )}
    </div>
  );
});

const UnknownDocumentNode = observer(({ doc }: { doc: FrameDocument }) => {
  const nodeId: SelectedNode = { type: 'unknown-document', sourceId: doc.sourceId! };
  const isSelected = nodesEqual(store.selectedNode, nodeId);

  return (
    <div
      className={`tree-node ${isSelected ? 'tree-node--selected' : ''}`}
      style={{ paddingLeft: 8 }}
      onClick={() => store.selectNode(nodeId)}
    >
      <span className="tree-node-expand-spacer" />
      <span className="tree-node-type tree-node-type--unknown">Unknown</span>
      <span className="tree-node-label">Unknown Document (sourceId: {doc.sourceId})</span>
    </div>
  );
});

// --- Tree View ---

const TreeView = observer(() => {
  // Group hierarchy roots by tabId to synthesize Tab nodes
  const roots = frameStore.hierarchyRoots;
  const tabIds = new Map<number, Frame>();
  for (const frame of roots) {
    // Use the root frame (frameId 0) for each tab, or the first root frame
    if (!tabIds.has(frame.tabId) || frame.frameId === 0) {
      tabIds.set(frame.tabId, frame);
    }
  }

  const nonHierarchy = frameStore.nonHierarchyFrames;
  const unknownDocs = frameStore.unknownDocuments;

  return (
    <div className="tree-view">
      {Array.from(tabIds.entries()).map(([tabId, rootFrame]) => (
        <TabNode key={tabId} tabId={tabId} rootFrame={rootFrame} depth={0} />
      ))}
      {nonHierarchy.length > 0 && (
        <>
          <div className="tree-section-separator">Other known frames</div>
          {nonHierarchy.map(frame => (
            <TabNode key={frame.key} tabId={frame.tabId} rootFrame={frame} depth={0} />
          ))}
        </>
      )}
      {unknownDocs.map(doc => (
        <UnknownDocumentNode key={doc.sourceId} doc={doc} />
      ))}
    </div>
  );
});

// --- Detail Pane ---

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <tr>
    <th>{label}</th>
    <td>{children}</td>
  </tr>
);

const SeparatorRow = () => (
  <tr><td colSpan={2} className="context-separator"></td></tr>
);

const TabDetail = observer(({ tabId }: { tabId: number }) => {
  const tab = frameStore.tabs.get(tabId);
  const rootFrame = frameStore.getFrame(tabId, 0);
  const doc = rootFrame?.currentDocument;

  return (
    <table className="context-table">
      <tbody>
        <Field label="tabId">tab[{tabId}]</Field>
        <Field label="frameId">frame[0]</Field>
        {doc?.url && <Field label="URL">{doc.url}</Field>}
        {doc?.origin && <Field label="Origin">{doc.origin}</Field>}
        {doc?.title && <Field label="Title">{doc.title}</Field>}
        {tab?.openerTab && (
          <Field label="Opener Tab">tab[{tab.openerTab.tabId}]</Field>
        )}
        {tab && tab.openedTabs.length > 0 && (
          <Field label="Opened Tabs">{tab.openedTabs.map(t => `tab[${t.tabId}]`).join(', ')}</Field>
        )}
      </tbody>
    </table>
  );
});

const DocumentDetail = observer(({ doc }: { doc: FrameDocument }) => {
  const showInternal = store.settings.showInternalFields;
  return (
    <table className="context-table">
      <tbody>
        {showInternal && doc.documentId && <Field label="documentId">{doc.documentId}</Field>}
        {showInternal && doc.sourceId && <Field label="sourceId">{doc.sourceId}</Field>}
        {doc.url && <Field label="URL">{doc.url}</Field>}
        {doc.origin && <Field label="Origin">{doc.origin}</Field>}
        {doc.title && <Field label="Title">{doc.title}</Field>}
        {doc.frame && (
          <>
            <Field label="Tab">tab[{doc.frame.tabId}]</Field>
            <Field label="Frame">frame[{doc.frame.frameId}]</Field>
          </>
        )}
        {showInternal && doc.sourceIdRecords.length > 0 && (
          <>
            <SeparatorRow />
            <tr><th colSpan={2} className="section-heading">Source ID Records</th></tr>
            {doc.sourceIdRecords.map((rec, i) => (
              <tr key={i}>
                <td className="field-label">{rec.sourceType}</td>
                <td className="field-value">
                  {rec.sourceId}
                  <span className="source-id-target"> from tab[{rec.targetTabId}].frame[{rec.targetFrameId}]
                    {rec.targetDocumentId && ` (${rec.targetDocumentId})`}
                  </span>
                </td>
              </tr>
            ))}
          </>
        )}
      </tbody>
    </table>
  );
});

const IFrameDetail = observer(({ tabId, frameId, isUnknown }: { tabId: number; frameId: number; isUnknown: boolean }) => {
  const frame = frameStore.getFrame(tabId, frameId);
  // Find the IFrame model by looking for an IFrame whose childFrame matches
  let iframeModel: IFrame | undefined;
  if (frame && frame.parentFrameId !== undefined && frame.parentFrameId >= 0) {
    const parentFrame = frameStore.getFrame(tabId, frame.parentFrameId);
    if (parentFrame?.currentDocument) {
      iframeModel = parentFrame.currentDocument.iframes.find(
        i => i.childFrame === frame
      );
    }
  }

  return (
    <table className="context-table">
      <tbody>
        {!isUnknown && iframeModel && (
          <>
            {iframeModel.removedFromHierarchy && <Field label="Status">Removed from page</Field>}
            {iframeModel.domPath && <Field label="domPath">{iframeModel.domPath}</Field>}
            {iframeModel.src && <Field label="src">{iframeModel.src}</Field>}
            {iframeModel.id && <Field label="id">{iframeModel.id}</Field>}
          </>
        )}
        <Field label="frameId">frame[{frameId}]</Field>
        <Field label="Tab">tab[{tabId}]</Field>
        {frame?.parentFrameId !== undefined && frame.parentFrameId >= 0 && (
          <Field label="Parent Frame">frame[{frame.parentFrameId}]</Field>
        )}
      </tbody>
    </table>
  );
});

const UnknownDocumentDetail = observer(({ sourceId }: { sourceId: string }) => {
  return (
    <table className="context-table">
      <tbody>
        <Field label="sourceId">{sourceId}</Field>
      </tbody>
    </table>
  );
});

function getDetailTitle(node: SelectedNode): string {
  switch (node.type) {
    case 'tab': return 'Tab Details';
    case 'document':
    case 'document-by-sourceId': return 'Document Details';
    case 'iframe': return 'IFrame Details';
    case 'unknown-iframe': return 'Unknown IFrame Details';
    case 'unknown-document': return 'Unknown Document Details';
  }
}

function resolveDocument(node: SelectedNode & { type: 'document' | 'document-by-sourceId' }): FrameDocument | undefined {
  if (node.docRef) return node.docRef;
  if (node.type === 'document') return frameStore.getDocumentById(node.documentId);
  return frameStore.getDocumentBySourceId(node.sourceId);
}

const NodeDetailPane = observer(() => {
  const node = store.selectedNode;

  const handleClose = () => {
    store.selectNode(null);
  };

  if (!node) {
    return (
      <div className="detail-pane hidden">
        <div className="detail-tabs">
          <span className="detail-title">Details</span>
          <button className="close-detail-btn" title="Close">×</button>
        </div>
        <div className="tab-content">
          <div className="placeholder">Select a node to view details</div>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-pane">
      <div className="detail-tabs">
        <span className="detail-title">{getDetailTitle(node)}</span>
        <button
          className="show-messages-btn"
          title="Show messages involving this node"
          onClick={() => store.navigateToNodeMessages(node)}
        >
          Show messages
        </button>
        <button className="close-detail-btn" title="Close" onClick={handleClose}>×</button>
      </div>
      <div className="tab-content">
        <div className="frame-properties">
          {node.type === 'tab' && <TabDetail tabId={node.tabId} />}
          {(node.type === 'document' || node.type === 'document-by-sourceId') && (() => {
            const doc = resolveDocument(node);
            return doc ? <DocumentDetail doc={doc} /> : <div className="placeholder">Document not found</div>;
          })()}
          {node.type === 'iframe' && <IFrameDetail tabId={node.tabId} frameId={node.frameId} isUnknown={false} />}
          {node.type === 'unknown-iframe' && <IFrameDetail tabId={node.tabId} frameId={node.frameId} isUnknown={true} />}
          {node.type === 'unknown-document' && <UnknownDocumentDetail sourceId={node.sourceId} />}
        </div>
      </div>
    </div>
  );
});

// --- Pane resize handle ---

const ResizeHandle = () => {
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const container = document.querySelector('#endpoints-view .main-content') as HTMLElement;
      if (!container) return;

      const containerWidth = container.offsetWidth;
      const newDetailWidth = containerWidth - e.clientX;
      const pct = Math.max(20, Math.min(70, (newDetailWidth / containerWidth) * 100));

      const detailPane = container.querySelector('.detail-pane') as HTMLElement;
      if (detailPane) {
        detailPane.style.width = pct + '%';
      }
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        document.body.style.cursor = '';
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
  };

  return (
    <div
      className="resize-handle"
      onMouseDown={handleMouseDown}
    />
  );
};

// --- Top bar ---

const EndpointsTopBar = () => {
  const handleRefresh = () => {
    requestFrameHierarchy();
  };

  return (
    <div className="top-bar">
      <button className="icon-btn" title="Refresh" onClick={handleRefresh}>
        <span className="refresh-icon"></span>
      </button>
    </div>
  );
};

// --- Main EndpointsView ---

export const EndpointsView = observer(() => {
  const isActive = store.currentView === 'endpoints';

  // Request hierarchy when view becomes active
  useEffect(() => {
    if (isActive) {
      requestFrameHierarchy();
    }
  }, [isActive]);

  return (
    <div id="endpoints-view" className={`view endpoints-view ${isActive ? 'active' : ''}`}>
      <EndpointsTopBar />
      <div className="main-content">
        <TreeView />
        <ResizeHandle />
        <NodeDetailPane />
      </div>
    </div>
  );
});
