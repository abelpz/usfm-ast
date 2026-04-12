import { DocumentStore } from '@usfm-tools/editor-core';

import {
  resolveChapterLabelAction,
  type ChapterLabelAction,
} from '../src/chapter-label-policy';

function twoChapterStore(): DocumentStore {
  const s = new DocumentStore({ silentConsole: true });
  s.loadUSFM('\\id TIT Titus\n\\c 1\n\\p\n\\v 1 Hi.\n\\c 2\n\\p\n\\v 1 Bye.\n');
  return s;
}

function act(
  store: DocumentStore,
  draftRaw: string,
  oldChapter: number,
  readonly = false
): ChapterLabelAction {
  return resolveChapterLabelAction({ draftRaw, oldChapter, readonly }, store);
}

describe('resolveChapterLabelAction', () => {
  it('returns relocate for valid unused number', () => {
    const store = twoChapterStore();
    expect(act(store, '12', 1)).toEqual({ type: 'relocate', oldChapter: 1, newChapter: 12 });
  });

  it('returns revert when target chapter already exists', () => {
    const store = twoChapterStore();
    expect(act(store, '2', 1)).toEqual({ type: 'revert' });
  });

  it('returns merge when label is empty after stripping non-digits', () => {
    const store = twoChapterStore();
    expect(act(store, '', 2)).toEqual({ type: 'merge', oldChapter: 2 });
    expect(act(store, '   ', 1)).toEqual({ type: 'merge', oldChapter: 1 });
    expect(act(store, 'abc', 1)).toEqual({ type: 'merge', oldChapter: 1 });
  });

  it('returns noop when number unchanged', () => {
    const store = twoChapterStore();
    expect(act(store, '1', 1)).toEqual({ type: 'noop' });
    expect(act(store, '01', 1)).toEqual({ type: 'noop' });
  });

  it('returns revert for readonly chapter', () => {
    const store = twoChapterStore();
    expect(act(store, '9', 1, true)).toEqual({ type: 'revert' });
  });

  it('returns revert for non-positive parsed number', () => {
    const store = twoChapterStore();
    expect(act(store, '0', 1)).toEqual({ type: 'revert' });
  });

  it('strips non-digits before parsing valid relocate', () => {
    const store = twoChapterStore();
    expect(act(store, '12abc', 1)).toEqual({ type: 'relocate', oldChapter: 1, newChapter: 12 });
  });

  it('returns relocate to same high number when only that chapter exists', () => {
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM('\\id TIT\n\\c 21\n\\p\n\\v 1 Solo.\n');
    expect(act(store, '21', 21)).toEqual({ type: 'noop' });
    expect(act(store, '22', 21)).toEqual({ type: 'relocate', oldChapter: 21, newChapter: 22 });
  });
});
