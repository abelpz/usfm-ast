import {
  compareUsxSimilarity,
  countXmlTagNames,
  extractXmlTextContent,
} from '../src/oracle/compareUsx';

describe('compareUsx oracle helpers', () => {
  it('extractXmlTextContent strips tags', () => {
    const xml = '<?xml?><root><p>Hello</p> <p>world</p></root>';
    expect(extractXmlTextContent(xml)).toBe('Hello world');
  });

  it('countXmlTagNames counts local names', () => {
    const m = countXmlTagNames('<usx><para style="p">a</para><para style="p">b</para></usx>');
    expect(m.get('usx')).toBe(1);
    expect(m.get('para')).toBe(2);
  });

  it('compareUsxSimilarity passes for identical XML', () => {
    const x = '<?xml version="1.0"?><usx version="3.0"><book code="TIT"/></usx>';
    const r = compareUsxSimilarity(x, x);
    expect(r.ok).toBe(true);
    expect(r.structureSimilarity).toBeGreaterThan(0.99);
    expect(r.attributeSimilarity).toBeGreaterThan(0.99);
    expect(r.tagHistogramSimilarity).toBeGreaterThan(0.99);
  });

  it('compareUsxSimilarity ignores text content differences', () => {
    const a = '<usx><para style="p">Hello</para></usx>';
    const b = '<usx><para style="p">Different words</para></usx>';
    const r = compareUsxSimilarity(a, b);
    expect(r.ok).toBe(true);
    expect(r.structureSimilarity).toBeGreaterThan(0.99);
  });

  it('compareUsxSimilarity fails on different element names', () => {
    const a = '<usx><para style="p"/></usx>';
    const b = '<usx><div style="p"/></usx>';
    const r = compareUsxSimilarity(a, b);
    expect(r.ok).toBe(false);
    expect(r.structureSimilarity).toBeLessThan(0.5);
  });

  it('compareUsxSimilarity reflects attribute mismatch', () => {
    const a = '<usx><book code="TIT"/></usx>';
    const b = '<usx><book code="GEN"/></usx>';
    const r = compareUsxSimilarity(a, b);
    expect(r.structureSimilarity).toBeGreaterThan(0.7);
    expect(r.attributeSimilarity).toBeLessThan(1);
  });
});
