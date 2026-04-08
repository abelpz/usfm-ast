import { USFMParser } from '@usfm-tools/parser';
import { TextSelection } from 'prosemirror-state';
import { createUSFMEditorState } from '../src/editor';
import { nextVerseNumberForSelection } from '../src/verse-number';

function stateWithCaretAfterUsfm(usfm: string, placeCaret: (doc: import('prosemirror-model').Node) => number): ReturnType<typeof createUSFMEditorState> {
  const parser = new USFMParser();
  parser.parse(usfm);
  const state0 = createUSFMEditorState(parser.toJSON());
  const pos = placeCaret(state0.doc);
  return state0.apply(state0.tr.setSelection(TextSelection.create(state0.doc, pos)));
}

describe('nextVerseNumberForSelection', () => {
  it('returns 1 in book header (no chapter)', () => {
    const state = stateWithCaretAfterUsfm('\\id XX X\n\\mt Hi\n', (doc) => {
      let p = 1;
      doc.descendants((node, pos) => {
        if (node.isText && node.text) {
          p = pos + 2;
          return false;
        }
      });
      return p;
    });
    expect(nextVerseNumberForSelection(state)).toBe('1');
  });

  it('returns 1 at the start of a chapter (no prior verse in that chapter)', () => {
    const state = stateWithCaretAfterUsfm(
      '\\id XX X\n\\c 1\n\\p\n\\v 1 First.\n\\c 2\n\\p\n',
      (doc) => {
        let ch2: number | null = null;
        doc.descendants((node, pos) => {
          if (node.type.name === 'chapter_label' && node.textContent.trim() === '2') {
            ch2 = pos - 1; // chapter node is one position before its label
            return false;
          }
        });
        if (ch2 === null) throw new Error('no ch2');
        // First position inside chapter 2's first paragraph: chapter(1) + label.nodeSize + para(1)
        const label = doc.nodeAt(ch2)!.firstChild!;
        return ch2 + 1 + label.nodeSize + 1;
      }
    );
    expect(nextVerseNumberForSelection(state)).toBe('1');
  });

  it('returns lastVerse+1 in the same chapter', () => {
    const state = stateWithCaretAfterUsfm('\\id XX X\n\\c 1\n\\p\n\\v 1 A.\n\\v 2 B.', (doc) => {
      let afterV2 = 1;
      doc.descendants((node, pos) => {
        if (node.type.name === 'verse' && node.attrs.number === '2') {
          afterV2 = pos + node.nodeSize;
          return false;
        }
      });
      return afterV2;
    });
    expect(nextVerseNumberForSelection(state)).toBe('3');
  });

  it('does not use verses from a previous chapter', () => {
    const state = stateWithCaretAfterUsfm(
      '\\id XX X\n\\c 1\n\\p\n\\v 1 A.\n\\v 9 Z.\n\\c 2\n\\p\n',
      (doc) => {
        let ch2: number | null = null;
        doc.descendants((node, pos) => {
          if (node.type.name === 'chapter_label' && node.textContent.trim() === '2') {
            ch2 = pos - 1;
            return false;
          }
        });
        if (ch2 === null) throw new Error('no ch2');
        const label = doc.nodeAt(ch2)!.firstChild!;
        return ch2 + 1 + label.nodeSize + 1;
      }
    );
    expect(nextVerseNumberForSelection(state)).toBe('1');
  });
});
