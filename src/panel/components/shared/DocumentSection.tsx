// Renders Document fields as <tr> rows for use inside a <table class="context-table"><tbody>.

import { observer } from 'mobx-react-lite';
import type { FrameDocument } from '../../models/FrameDocument';
import { FIELD_INFO } from '../../field-info';
import { FieldLabel } from './FieldInfoPopup';

interface DocumentSectionProps {
  doc: FrameDocument;
  heading?: string;
  showAdvanced?: boolean;
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

export const DocumentSection = observer(({ doc, heading = 'Document', showAdvanced }: DocumentSectionProps) => {
  return (
    <>
      <SeparatorRow />
      <tr><th colSpan={2} className="section-heading">{heading}</th></tr>
      {doc.documentId && (
        <Field id="document.documentId">{doc.documentId}</Field>
      )}
      {showAdvanced && (
        <Field id="document.createdAt">{new Date(doc.createdAt).toISOString()}</Field>
      )}
      {doc.url && (
        <Field id="document.url">{doc.url}</Field>
      )}
      {doc.origin && (
        <Field id="document.origin">{doc.origin}</Field>
      )}
      {doc.title && (
        <Field id="document.title">{doc.title}</Field>
      )}
    </>
  );
});
