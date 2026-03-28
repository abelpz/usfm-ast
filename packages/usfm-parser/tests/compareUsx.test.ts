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
    expect(r.textSimilarity).toBeGreaterThan(0.99);
    expect(r.tagSimilarity).toBeGreaterThan(0.99);
  });
});
