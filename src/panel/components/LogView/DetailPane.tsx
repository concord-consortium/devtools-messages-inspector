// Detail pane component for Messages view

import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { store } from '../../store';
import { Message } from '../../Message';
import { FIELD_INFO } from '../../field-info';
import { JsonTree } from '../shared/JsonTree';
import { FieldLabel } from '../shared/FieldInfoPopup';
import { DocumentSection } from '../shared/DocumentSection';
import { FrameSection } from '../shared/FrameSection';
import { FrameActionButtons } from '../shared/FrameActionButtons';
import { DirectionIcon } from '../shared/DirectionIcon';

// Data tab content
const DataTab = observer(({ message }: { message: Message }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(message.data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <button className="copy-btn" onClick={handleCopy}>
        {copied ? 'Copied!' : 'Copy JSON'}
      </button>
      <JsonTree data={message.data} />
    </>
  );
});

// Individual row component for context table
const Field = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const fieldInfo = FIELD_INFO[id];
  const label = fieldInfo ? fieldInfo.label : id;

  return (
    <tr>
      <th>
        {fieldInfo ? (
          <FieldLabel fieldId={id} label={label} />
        ) : (
          label
        )}
      </th>
      <td>{children}</td>
    </tr>
  );
};

// Separator row component
const SeparatorRow = () => (
  <tr>
    <td colSpan={2} className="context-separator"></td>
  </tr>
);

// Context tab content
const ContextTab = observer(({ message }: { message: Message }) => {
  const focusPosition = store.getFocusPosition(message);
  const showAdvanced = store.settings.showInternalFields;

  return (
    <table className="context-table">
      <tbody>
        {showAdvanced && (
          <Field id="messageId">{message.id}</Field>
        )}
        <Field id="timestamp">{new Date(message.timestamp).toISOString()}</Field>
        <Field id="messageType">{message.messageType || '(none)'}</Field>
        <Field id="dataSize">{store.formatSize(message.dataSize)}</Field>
        {showAdvanced && (
          <Field id="buffered">{message.buffered ? 'Yes' : 'No'}</Field>
        )}

        <SeparatorRow />
        <Field id="sourceType">
          <DirectionIcon sourceType={message.sourceType} focusPosition={focusPosition} /> {message.sourceType}
        </Field>

        <SeparatorRow />
        <tr><th colSpan={2} className="section-heading section-heading--top">
          Target{focusPosition === 'target' || focusPosition === 'both' ? ' (focused)' : ''}
          {message.targetFrame && (
            <FrameActionButtons tabId={message.targetFrame.tabId} frameId={message.targetFrame.frameId} />
          )}
        </th></tr>
        {(message.targetFrame || message.targetOwnerElement) && (
          <FrameSection
            frame={message.targetFrame}
            ownerElement={message.targetOwnerElement}
            showAdvanced={showAdvanced}
          />
        )}
        {message.targetDocument && (
          <DocumentSection doc={message.targetDocument} showAdvanced={showAdvanced} />
        )}
        {message.target.frameInfoError && (
          <Field id="frameError">{message.target.frameInfoError}</Field>
        )}

        <SeparatorRow />
        <tr><th colSpan={2} className="section-heading section-heading--top">
          Source{focusPosition === 'source' || focusPosition === 'both' ? ' (focused)' : ''}
          {message.sourceFrame && (
            <FrameActionButtons tabId={message.sourceFrame.tabId} frameId={message.sourceFrame.frameId} />
          )}
        </th></tr>
        {(message.sourceFrame || message.sourceOwnerElement) && (
          <FrameSection
            frame={message.sourceFrame}
            ownerElement={message.sourceOwnerElement}
            showAdvanced={showAdvanced}
          />
        )}
        {message.sourceDocument && (
          <DocumentSection doc={message.sourceDocument} showAdvanced={showAdvanced} />
        )}
        {showAdvanced && message.sourceDocument?.sourceIdRecords?.[0] && (
          <Field id="sourceId">{message.sourceDocument.sourceIdRecords[0].sourceId}</Field>
        )}
      </tbody>
    </table>
  );
});

// Main DetailPane component
export const DetailPane = observer(() => {
  const message = store.selectedMessage;
  const isVisible = !!message;

  const handleClose = () => {
    store.selectMessage(null);
  };

  const handleTabClick = (tab: 'data' | 'context') => {
    store.setActiveDetailTab(tab);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="detail-pane">
      <div className="detail-tabs">
        <button
          className={`tab-btn ${store.activeDetailTab === 'data' ? 'active' : ''}`}
          onClick={() => handleTabClick('data')}
        >
          Data
        </button>
        <button
          className={`tab-btn ${store.activeDetailTab === 'context' ? 'active' : ''}`}
          onClick={() => handleTabClick('context')}
        >
          Context
        </button>
        <button className="close-detail-btn" title="Close" onClick={handleClose}>
          ×
        </button>
      </div>
      <div className="tab-content">
        {store.activeDetailTab === 'data' ? (
          <DataTab message={message} />
        ) : (
          <ContextTab message={message} />
        )}
      </div>
    </div>
  );
});
