/**
 * Rejects edits that touch a `chapter` node with `readonly: true` (context chapters in windowed mode).
 */

import { isHistoryTransaction } from 'prosemirror-history';
import { Plugin } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { ReplaceStep } from 'prosemirror-transform';

function posTouchesReadonlyChapter(doc: PMNode, pos: number): boolean {
  if (pos < 0 || pos > doc.content.size) return false;
  const $pos = doc.resolve(Math.min(pos, doc.content.size));
  for (let d = $pos.depth; d > 0; d--) {
    const n = $pos.node(d);
    if (n.type.name === 'chapter' && n.attrs.readonly) return true;
  }
  return false;
}

function rangeTouchesReadonlyChapter(doc: PMNode, from: number, to: number): boolean {
  const a = Math.max(0, Math.min(from, to));
  const b = Math.max(from, to);
  for (let pos = a; pos <= b; pos++) {
    if (posTouchesReadonlyChapter(doc, pos)) return true;
  }
  return false;
}

export function readonlyChapterGuardPlugin(): Plugin {
  return new Plugin({
    filterTransaction(tr, state) {
      if (!tr.docChanged) return true;
      // Undo/redo may remove or reshape context chapters (readonly) when reversing insertChapter, etc.
      if (isHistoryTransaction(tr)) return true;
      const oldDoc = state.doc;
      for (const step of tr.steps) {
        if (step instanceof ReplaceStep) {
          const from = step.from;
          const to = step.to;
          if (rangeTouchesReadonlyChapter(oldDoc, from, to)) return false;
        }
      }
      return true;
    },
  });
}
