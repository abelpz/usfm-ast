import {
  appendCheckingEntry,
  emptyCheckingBook,
  parseCheckingBookJson,
  queryChecking,
  serializeCheckingBookJson,
} from '../src/checking-store';

describe('checking-store', () => {
  it('round-trips empty book', () => {
    const f = emptyCheckingBook('TIT');
    const s = serializeCheckingBookJson(f);
    const back = parseCheckingBookJson(s);
    expect(back.meta.book).toBe('TIT');
    expect(back.entries).toEqual([]);
  });

  it('appends and supersedes', () => {
    let f = emptyCheckingBook('TIT');
    const e1 = {
      id: 'a',
      type: 'comment' as const,
      ref: 'TIT 1:1',
      author: 'u@x',
      timestamp: '2026-01-01T00:00:00Z',
      body: 'first',
      resolved: false,
      supersedes: null,
    };
    f = appendCheckingEntry(f, e1);
    const e2 = {
      id: 'b',
      type: 'comment' as const,
      ref: 'TIT 1:1',
      author: 'u@x',
      timestamp: '2026-01-02T00:00:00Z',
      body: 'second',
      resolved: true,
      supersedes: 'a' as const,
    };
    f = appendCheckingEntry(f, e2);
    const active = queryChecking(f, { refPrefix: 'TIT' });
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe('b');
  });
});
