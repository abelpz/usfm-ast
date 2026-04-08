import { readFileSync } from 'fs';
import { join } from 'path';
import { USFMParser } from '@usfm-tools/parser';
import { TextSelection } from 'prosemirror-state';
import {
  insertVerse,
  changeParagraphMarker,
  insertParagraphAfterBlock,
  splitParagraphSmart,
} from '../src/commands';
import { createUSFMEditorState } from '../src/editor';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../usfm-parser/tests/fixtures/usfm', name), 'utf8');

describe('commands', () => {
  it('insertVerse adds a verse atom', () => {
    const parser = new USFMParser();
    parser.parse(fixture('basic.usfm'));
    const state0 = createUSFMEditorState(parser.toJSON());
    let textPos = 1;
    state0.doc.descendants((node, p) => {
      if (node.isText && node.text && node.text.length > 0) {
        textPos = p + 1;
        return false;
      }
    });
    const state1 = state0.apply(state0.tr.setSelection(TextSelection.create(state0.doc, textPos)));
    let sawVerse = false;
    const ok = insertVerse('99')(state1, (tr) => {
      const s = state1.apply(tr);
      s.doc.descendants((node) => {
        if (node.type.name === 'verse' && node.attrs.number === '99') sawVerse = true;
      });
    });
    expect(ok).toBe(true);
    expect(sawVerse).toBe(true);
  });

  it('changeParagraphMarker updates paragraph marker', () => {
    const parser = new USFMParser();
    parser.parse('\\id XX X\n\\c 1\n\\p\n\\v 1 Hi.');
    const state0 = createUSFMEditorState(parser.toJSON());
    let found = false;
    state0.doc.descendants((node, p) => {
      if (node.type.name !== 'paragraph' || found) return;
      const $r = state0.doc.resolve(p);
      let inChapter = false;
      for (let d = $r.depth; d > 0; d--) {
        if ($r.node(d).type.name === 'chapter') inChapter = true;
      }
      if (!inChapter) return;
      found = true;
      const inner = p + 1;
      const state1 = state0.apply(state0.tr.setSelection(TextSelection.create(state0.doc, inner)));
      changeParagraphMarker('q1')(state1, (tr) => {
        const s = state1.apply(tr);
        s.doc.descendants((n, pos) => {
          if (n.type.name !== 'paragraph') return;
          const $p = s.doc.resolve(pos);
          for (let d = $p.depth; d > 0; d--) {
            if ($p.node(d).type.name === 'chapter') {
              expect(n.attrs.marker).toBe('q1');
              return;
            }
          }
        });
      });
    });
    expect(found).toBe(true);
  });

  it('insertParagraphAfterBlock inserts after the given block', () => {
    const parser = new USFMParser();
    parser.parse('\\id XX X\n\\c 1\n\\p\n\\v 1 Hi.');
    const state0 = createUSFMEditorState(parser.toJSON());
    let paraStart = 0;
    state0.doc.descendants((node, p) => {
      if (node.type.name !== 'paragraph') return;
      const $r = state0.doc.resolve(p);
      for (let d = $r.depth; d > 0; d--) {
        if ($r.node(d).type.name === 'chapter') {
          paraStart = p;
          return false;
        }
      }
    });
    let inserted = false;
    insertParagraphAfterBlock(paraStart, 's1')(state0, (tr) => {
      const s = state0.apply(tr);
      const chapterParas: string[] = [];
      s.doc.descendants((n, pos) => {
        if (n.type.name !== 'paragraph') return;
        const $p = s.doc.resolve(pos);
        for (let d = $p.depth; d > 0; d--) {
          if ($p.node(d).type.name === 'chapter') {
            chapterParas.push(n.attrs.marker as string);
            return;
          }
        }
      });
      if (chapterParas.length >= 2 && chapterParas[0] === 'p' && chapterParas[1] === 's1') inserted = true;
    });
    expect(inserted).toBe(true);
  });

  it('splitParagraphSmart at end of chapter paragraph does not create a second \\id book', () => {
    const parser = new USFMParser();
    parser.parse('\\id XX X\n\\c 1\n\\p\n\\v 1 Hi.');
    const state0 = createUSFMEditorState(parser.toJSON());
    function countBook(doc: typeof state0.doc) {
      let n = 0;
      doc.descendants((node) => {
        if (node.type.name === 'book') n++;
      });
      return n;
    }
    expect(countBook(state0.doc)).toBe(1);
    let caretAtEndOfChapterP = 0;
    state0.doc.descendants((node, p) => {
      if (node.type.name !== 'paragraph') return;
      const $r = state0.doc.resolve(p + 1);
      let inChapter = false;
      for (let d = $r.depth; d > 0; d--) {
        if ($r.node(d).type.name === 'chapter') inChapter = true;
      }
      if (!inChapter || node.attrs.marker !== 'p') return;
      caretAtEndOfChapterP = p + 1 + node.content.size;
      return false;
    });
    expect(caretAtEndOfChapterP).toBeGreaterThan(0);
    const state1 = state0.apply(
      state0.tr.setSelection(TextSelection.create(state0.doc, caretAtEndOfChapterP))
    );
    let after: typeof state0 | null = null;
    const ok = splitParagraphSmart()(state1, (tr) => {
      after = state1.apply(tr);
    });
    expect(ok).toBe(true);
    expect(after).not.toBeNull();
    expect(countBook(after!.doc)).toBe(1);
  });
});
