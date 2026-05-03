import { getColumnLabel } from './field-info';

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
