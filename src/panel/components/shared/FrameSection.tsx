// Renders Frame + iframe-element + Tab fields as <tr> rows for use
// inside a <table class="context-table"><tbody>.

import { observer } from 'mobx-react-lite';
import type { Frame } from '../../models/Frame';
import type { OwnerElement } from '../../models/OwnerElement';
import { frameStore } from '../../models';
import { FIELD_INFO } from '../../field-info';
import { FieldLabel } from './FieldInfoPopup';

interface FrameSectionProps {
  frame?: Frame;
  ownerElement?: OwnerElement;
  heading?: string;
  status?: string;
  showAdvanced?: boolean;
  // Fallbacks used when frame is undefined (e.g. selected node refers to a
  // frame that's no longer in frameStore after a refresh).
  tabId?: number;
  frameId?: number;
}

const Field = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const fieldInfo = FIELD_INFO[id];
  const label = fieldInfo ? fieldInfo.label : id;
  return (
    <tr>
      <th>{fieldInfo ? <FieldLabel fieldId={id} label={label} /> : label}</th>
      <td>{children}</td>
    </tr>
  );
};

const SeparatorRow = () => (
  <tr><td colSpan={2} className="context-separator"></td></tr>
);

function deriveHeading(frameId: number | undefined): string {
  if (frameId === 0) return 'Tab';
  return 'IFrame';
}

export const FrameSection = observer(({ frame, ownerElement, heading, status, tabId: tabIdProp, frameId: frameIdProp }: FrameSectionProps) => {
  const tabId = frame?.tabId ?? tabIdProp;
  const frameId = frame?.frameId ?? frameIdProp;
  const resolvedHeading = heading ?? deriveHeading(frameId);
  const tab = frameId === 0 && tabId !== undefined ? frameStore.tabs.get(tabId) : undefined;

  return (
    <>
      <SeparatorRow />
      <tr><th colSpan={2} className="section-heading">{resolvedHeading}</th></tr>
      {status && (
        <tr><th>Status</th><td>{status}</td></tr>
      )}
      {tabId !== undefined && (
        <Field id="tabId">tab[{tabId}]</Field>
      )}
      {frameId !== undefined && (
        <Field id="frameId">frame[{frameId}]</Field>
      )}
      {frame && frame.parentFrameId !== undefined && frame.parentFrameId >= 0 && (
        <Field id="parentFrameId">frame[{frame.parentFrameId}]</Field>
      )}
      {ownerElement?.domPath && (
        <Field id="ownerElement.domPath">{ownerElement.domPath}</Field>
      )}
      {ownerElement?.src && (
        <Field id="ownerElement.src">{ownerElement.src}</Field>
      )}
      {ownerElement?.id && (
        <Field id="ownerElement.id">{ownerElement.id}</Field>
      )}
      {tab?.openerTab && (
        <Field id="tab.openerTab">tab[{tab.openerTab.tabId}]</Field>
      )}
      {tab && tab.openedTabs.length > 0 && (
        <Field id="tab.openedTabs">{tab.openedTabs.map(t => `tab[${t.tabId}]`).join(', ')}</Field>
      )}
    </>
  );
});
