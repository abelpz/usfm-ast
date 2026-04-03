import { DocumentStore } from '../dist';
import type { EditableUSJ } from '@usfm-tools/types';

describe('DocumentStore', () => {
  it('loadUSJ and getFullUSJ round-trip', () => {
    const store = new DocumentStore();
    const usj = {
      type: 'USJ' as const,
      version: '3.1',
      content: [{ type: 'book', code: 'TIT', content: ['Intro'] }],
    };
    store.loadUSJ(usj);
    expect(store.getFullUSJ()).toEqual(usj);
    expect(store.getVersion()).toBe('3.1');
    expect(store.getBookCode()).toBe('TIT');
  });

  it('getChapterCount and getChapter', () => {
    const store = new DocumentStore();
    store.loadUSFM('\\id TIT Titus\n\\c 1\n\\p\n\\v 1 Hi.\n\\c 2\n\\p\n\\v 1 Bye.\n');
    expect(store.getChapterCount()).toBeGreaterThanOrEqual(1);
    const ch1 = store.getChapter(1);
    expect(ch1?.chapter).toBe(1);
  });

  it('updateAlignments and getAlignments', () => {
    const store = new DocumentStore();
    store.loadUSFM('\\id TIT Titus\n\\c 1\n\\p\n\\v 1 Hello world.\n');
    store.updateAlignments(1, {
      'TIT 1:1': [],
    });
    const align = store.getAlignments(1);
    expect(align).toEqual(expect.objectContaining({}));
  });

  it('updateEditableContent aliases to updateEditableChapter', () => {
    const store = new DocumentStore();
    store.loadUSFM('\\id TIT Titus\n\\c 1\n\\p\n\\v 1 Hello.\n');
    const editable: EditableUSJ = {
      type: 'EditableUSJ',
      version: '3.1',
      content: store.getEditableChapter(1).editable.content,
    };
    store.updateEditableContent(1, editable, {});
    expect(store.getChapter(1)).toBeDefined();
  });

  it('diff returns operations when chapters differ', () => {
    const a = new DocumentStore();
    const b = new DocumentStore();
    a.loadUSFM('\\id TIT Titus\n\\c 1\n\\p\n\\v 1 One.\n');
    b.loadUSFM('\\id TIT Titus\n\\c 1\n\\p\n\\v 1 Two.\n');
    const ops = a.diff(b);
    expect(Array.isArray(ops)).toBe(true);
    expect(ops.length).toBeGreaterThan(0);
  });

  it('onChange fires on updateAlignments and updateEditableChapter', () => {
    const store = new DocumentStore();
    store.loadUSFM('\\id TIT Titus\n\\c 1\n\\p\n\\v 1 Hi.\n');
    let count = 0;
    const unsub = store.onChange(() => {
      count++;
    });
    store.updateAlignments(1, {});
    const { editable } = store.getEditableChapter(1);
    store.updateEditableChapter(1, editable, {});
    unsub();
    expect(count).toBe(2);
  });

  it('replaceChapter with slice nodes and toUSFM(chapter) serializes that chapter only', () => {
    const store = new DocumentStore();
    store.loadUSFM('\\id TIT Titus\n\\c 1\n\\p\n\\v 1 One.\n\\c 2\n\\p\n\\v 1 Two.\n');
    const slice = store.getChapter(1);
    expect(slice?.nodes?.length).toBeGreaterThan(0);
    store.replaceChapter(1, slice!.nodes);
    const usfm = store.toUSFM(1);
    expect(usfm).toContain('\\c 1');
    expect(usfm).toContain('One');
    expect(usfm).not.toMatch(/\\c 2/);
    expect(usfm).not.toContain('Two');
  });
});
