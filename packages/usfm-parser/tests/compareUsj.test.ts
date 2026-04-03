import {
  compareUsjSimilarity,
  diceBigramSimilarity,
  flattenTextNodes,
  histogramCosine,
  normalizeComparableText,
} from '../src/oracle/compareUsj';

describe('compareUsj oracle helpers', () => {
  it('flattenTextNodes collects nested strings', () => {
    const doc = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'para', marker: 'p', content: ['Hello ', { type: 'char', marker: 'w', content: ['world'] }] },
      ],
    };
    expect(normalizeComparableText(flattenTextNodes(doc))).toBe('Hello world');
  });

  it('diceBigramSimilarity is 1 for identical strings', () => {
    expect(diceBigramSimilarity('abc', 'abc')).toBe(1);
  });

  it('histogramCosine is 1 for identical type maps', () => {
    const m = new Map([
      ['para', 2],
      ['verse', 1],
    ]);
    expect(histogramCosine(m, new Map(m))).toBeCloseTo(1, 10);
  });

  it('compareUsjSimilarity passes for identical documents', () => {
    const doc = { type: 'USJ', version: '3.1', content: [{ type: 'para', marker: 'p', content: ['x'] }] };
    const r = compareUsjSimilarity(doc, JSON.parse(JSON.stringify(doc)));
    expect(r.ok).toBe(true);
    expect(r.textSimilarity).toBeGreaterThan(0.99);
    expect(r.structureSimilarity).toBeGreaterThan(0.99);
  });

  it('compareUsjSimilarity tolerates small text drift if structure matches', () => {
    const a = {
      type: 'USJ',
      version: '3.1',
      content: [{ type: 'para', marker: 'p', content: ['The quick brown fox.'] }],
    };
    const b = {
      type: 'USJ',
      version: '3.1',
      content: [{ type: 'para', marker: 'p', content: ['The quick brown  fox.'] }],
    };
    const r = compareUsjSimilarity(a, b, { minScore: 0.5, minTextSimilarity: 0.5, minStructureSimilarity: 0.5 });
    expect(r.ok).toBe(true);
  });
});
