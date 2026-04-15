import type { SelectedText, VerseSnapshot } from '@usfm-tools/types';
import { resolveTextReference } from './text-reference';

describe('resolveTextReference', () => {
  it('returns exact for unchanged single verse slice', () => {
    const selected: SelectedText = {
      text: 'Hello world',
      startOffset: 0,
      endOffset: 11,
      verseSnapshots: [{ chapter: 1, verse: 1, text: 'Hello world.' }],
    };
    const current: VerseSnapshot[] = [{ chapter: 1, verse: 1, text: 'Hello world.' }];
    const r = resolveTextReference(selected, current);
    expect(r.status).toBe('exact');
    expect(r.highlightStart).toBe(0);
    expect(r.highlightEnd).toBe(11);
  });

  it('returns relocated when substring moved', () => {
    const selected: SelectedText = {
      text: 'world',
      startOffset: 6,
      endOffset: 11,
      verseSnapshots: [{ chapter: 1, verse: 1, text: 'Hello world.' }],
    };
    const current: VerseSnapshot[] = [{ chapter: 1, verse: 1, text: 'Hi world there.' }];
    const r = resolveTextReference(selected, current);
    expect(r.status).toBe('relocated');
    expect(r.highlightStart).toBe(3);
    expect(r.highlightEnd).toBe(8);
  });
});
