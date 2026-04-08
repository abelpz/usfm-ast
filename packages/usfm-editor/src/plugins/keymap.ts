import { baseKeymap } from 'prosemirror-commands';
import { undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { insertNextChapter, insertNextVerse, insertParagraph, splitParagraphSmart, toggleCharMarker } from '../commands';

/**
 * Default keymap: ProseMirror base + scripture-oriented shortcuts.
 * Includes undo/redo bindings (safe even without the history plugin — they return false).
 */
export function usfmKeymap() {
  return keymap({
    ...baseKeymap,
    Enter: splitParagraphSmart(),
    'Mod-z': undo,
    'Shift-Mod-z': redo,
    'Mod-y': redo,
    'Mod-b': toggleCharMarker('bd'),
    'Mod-i': toggleCharMarker('it'),
    'Mod-Shift-v': (state, dispatch) => insertNextVerse()(state, dispatch),
    'Mod-Shift-c': (state, dispatch) => insertNextChapter()(state, dispatch),
    'Mod-Shift-p': (state, dispatch) => insertParagraph('p')(state, dispatch),
  });
}
