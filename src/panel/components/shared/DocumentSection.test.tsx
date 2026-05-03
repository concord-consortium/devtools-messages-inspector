import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { FrameDocument } from '../../models/FrameDocument';
import { DocumentSection } from './DocumentSection';

function renderInTable(node: React.ReactNode) {
  return render(
    <table>
      <tbody>{node}</tbody>
    </table>,
  );
}

describe('DocumentSection', () => {
  it('renders default heading "Document"', () => {
    const doc = new FrameDocument({ documentId: 'doc-1', url: 'https://example.com/' });
    renderInTable(<DocumentSection doc={doc} />);
    expect(screen.getByText('Document')).toBeTruthy();
  });

  it('renders custom heading when provided', () => {
    const doc = new FrameDocument({ documentId: 'doc-1' });
    renderInTable(<DocumentSection doc={doc} heading="Current Document" />);
    expect(screen.getByText('Current Document')).toBeTruthy();
  });

  it('renders documentId, url, origin, title rows when present', () => {
    const doc = new FrameDocument({
      documentId: 'doc-1',
      url: 'https://example.com/page',
      origin: 'https://example.com',
      title: 'Example',
    });
    renderInTable(<DocumentSection doc={doc} />);
    expect(screen.getByText('doc-1')).toBeTruthy();
    expect(screen.getByText('https://example.com/page')).toBeTruthy();
    expect(screen.getByText('https://example.com')).toBeTruthy();
    expect(screen.getByText('Example')).toBeTruthy();
  });

  it('omits rows with missing values', () => {
    const doc = new FrameDocument({ documentId: 'doc-1' });
    renderInTable(<DocumentSection doc={doc} />);
    expect(screen.queryByText('URL')).toBeNull();
    expect(screen.queryByText('Origin')).toBeNull();
    expect(screen.queryByText('Title')).toBeNull();
    expect(screen.getByText('ID')).toBeTruthy();
  });

  it('renders Created At only when showAdvanced is true', () => {
    const doc = new FrameDocument({ documentId: 'doc-1' });
    const { rerender, container } = render(
      <table><tbody><DocumentSection doc={doc} /></tbody></table>,
    );
    expect(within(container).queryByText('Created At')).toBeNull();
    rerender(
      <table><tbody><DocumentSection doc={doc} showAdvanced /></tbody></table>,
    );
    expect(within(container).queryByText('Created At')).toBeTruthy();
  });
});
