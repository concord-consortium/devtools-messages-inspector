import { FIELD_INFO, getColumnLabel } from './field-info';

describe('getColumnLabel', () => {
  it('returns the label for a top-level field', () => {
    expect(getColumnLabel('messageType')).toBe('Type');
  });

  it('prepends "Target" for target-prefixed document fields', () => {
    expect(getColumnLabel('target.document.origin')).toBe('Target Document Origin');
  });

  it('prepends "Source" for source-prefixed iframeElement fields', () => {
    expect(getColumnLabel('source.ownerElement.src')).toBe('Source Iframe Src');
  });

  it('uses base label for ownerElement.domPath with iframe prefix', () => {
    expect(getColumnLabel('target.ownerElement.domPath')).toBe('Target Iframe DOM Path');
  });

  it('does not add a scope prefix for frame-scoped fields', () => {
    expect(getColumnLabel('target.frameId')).toBe('Target Frame');
    expect(getColumnLabel('source.tabId')).toBe('Source Tab');
    expect(getColumnLabel('target.parentFrameId')).toBe('Target Parent Frame');
  });

  it('returns the raw ID when no label is found', () => {
    expect(getColumnLabel('unknownField')).toBe('unknownField');
  });
});

describe('FIELD_INFO additions', () => {
  it('has document.createdAt with document scope', () => {
    expect(FIELD_INFO['document.createdAt']).toBeDefined();
    expect(FIELD_INFO['document.createdAt'].label).toBe('Created At');
    expect(FIELD_INFO['document.createdAt'].scope).toBe('document');
  });

  it('has tab.openerTab with frame scope', () => {
    expect(FIELD_INFO['tab.openerTab']).toBeDefined();
    expect(FIELD_INFO['tab.openerTab'].label).toBe('Opener Tab');
    expect(FIELD_INFO['tab.openerTab'].scope).toBe('frame');
  });

  it('has tab.openedTabs with frame scope', () => {
    expect(FIELD_INFO['tab.openedTabs']).toBeDefined();
    expect(FIELD_INFO['tab.openedTabs'].label).toBe('Opened Tabs');
    expect(FIELD_INFO['tab.openedTabs'].scope).toBe('frame');
  });
});
