import { ChapterChunker, splitUsjByChapter } from '../dist';

describe('ChapterChunker', () => {
  it('matches splitUsjByChapter', () => {
    const doc = {
      type: 'USJ' as const,
      version: '3.1',
      content: [
        { type: 'book', code: 'TIT', content: [] },
        { type: 'chapter', number: '1' },
        { type: 'para', marker: 'p', content: [] },
      ],
    };
    const chunker = new ChapterChunker();
    expect(chunker.split(doc)).toEqual(splitUsjByChapter(doc));
  });
});
