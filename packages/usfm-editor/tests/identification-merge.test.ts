import { mergeIdentificationPreservingBookId } from '../src/usj-to-pm';

describe('mergeIdentificationPreservingBookId', () => {
  const storeBook = { type: 'book', marker: 'id' as const, code: 'TIT', content: ['TIT EN ULT'] };
  const parsedH = { type: 'para', marker: 'h', content: ['Titus'] };

  it('uses parsed book when present', () => {
    const parsedBook = { type: 'book', marker: 'id' as const, code: 'GEN', content: [] };
    const out = mergeIdentificationPreservingBookId([storeBook], [parsedBook, parsedH]);
    expect(out[0]).toEqual(parsedBook);
  });

  it('prepends store book when parsed omits id', () => {
    const out = mergeIdentificationPreservingBookId([storeBook], [parsedH]);
    expect(out[0]).toEqual(storeBook);
    expect(out[1]).toEqual(parsedH);
  });

  it('returns parsed only when store also has no book', () => {
    const out = mergeIdentificationPreservingBookId([], [parsedH]);
    expect(out).toEqual([parsedH]);
  });
});
