import { USFMParser } from '@usfm-tools/parser';
import { EditorState, TextSelection } from 'prosemirror-state';
import { insertChapter } from '../src/commands';
import { resolveUSFMChrome } from '../src/chrome';
import { createUSFMEditorState, createUSFMPlugins } from '../src/editor';
import { readonlyChapterGuardPlugin } from '../src/plugins/readonly-guard';
import { undo } from '../src/plugins/history';
import { usfmSchema } from '../src/schema';
import { usjDocumentToPm } from '../src/usj-to-pm';

describe('insertChapter', () => {
  it('inserts a new chapter after the current one', () => {
    const parser = new USFMParser();
    parser.parse('\\id XX X\n\\c 1\n\\p\n\\v 1 Hi.');
    let state = createUSFMEditorState(parser.toJSON());
    let textPos = 1;
    state.doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        textPos = pos + 1;
        return false;
      }
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, textPos)));

    let chapters = 0;
    insertChapter('2')(state, (tr) => {
      state = state.apply(tr);
    });
    state.doc.descendants((node) => {
      if (node.type.name === 'chapter') chapters += 1;
    });
    expect(chapters).toBe(2);
  });

  it('undo removes an inserted chapter (structure guard must not block history)', () => {
    const parser = new USFMParser();
    parser.parse('\\id XX X\n\\c 1\n\\p\n\\v 1 Hi.');
    let state = createUSFMEditorState(parser.toJSON());
    let textPos = 1;
    state.doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        textPos = pos + 1;
        return false;
      }
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, textPos)));

    insertChapter('2')(state, (tr) => {
      state = state.apply(tr);
    });

    let chaptersAfterInsert = 0;
    state.doc.descendants((node) => {
      if (node.type.name === 'chapter') chaptersAfterInsert += 1;
    });
    expect(chaptersAfterInsert).toBe(2);

    undo(state, (tr) => {
      state = state.apply(tr);
    });

    let chaptersAfterUndo = 0;
    state.doc.descendants((node) => {
      if (node.type.name === 'chapter') chaptersAfterUndo += 1;
    });
    expect(chaptersAfterUndo).toBe(1);
  });

  it('undo works with readonly chapter guard (ScriptureSession plugin stack)', () => {
    const parser = new USFMParser();
    parser.parse('\\id XX X\n\\c 1\n\\p\n\\v 1 Hi.');
    const doc = usjDocumentToPm(parser.toJSON(), usfmSchema);
    const plugins = [
      ...createUSFMPlugins(usfmSchema, { chrome: resolveUSFMChrome({ preset: 'minimal' }) }),
      readonlyChapterGuardPlugin(),
    ];
    let state = EditorState.create({ doc, schema: usfmSchema, plugins });
    let textPos = 1;
    state.doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        textPos = pos + 1;
        return false;
      }
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, textPos)));

    insertChapter('2')(state, (tr) => {
      state = state.apply(tr);
    });

    let chaptersAfterInsert = 0;
    state.doc.descendants((node) => {
      if (node.type.name === 'chapter') chaptersAfterInsert += 1;
    });
    expect(chaptersAfterInsert).toBe(2);

    undo(state, (tr) => {
      state = state.apply(tr);
    });

    let chaptersAfterUndo = 0;
    state.doc.descendants((node) => {
      if (node.type.name === 'chapter') chaptersAfterUndo += 1;
    });
    expect(chaptersAfterUndo).toBe(1);
  });
});
