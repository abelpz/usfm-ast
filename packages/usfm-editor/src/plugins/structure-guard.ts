/**
 * Prevents deletion of structural USFM singleton nodes:
 *  - `header` — book identification section (`\id`, `\h`, `\toc*`, …)
 *  - `book_titles` — book title section (`\mt`, `\mte`, …)
 *  - `book_introduction` — book introduction (`\ip`, `\is#`, …)
 *  - `book` — the `\id` line itself
 *  - `chapter_label` — the chapter number label (first child of `chapter`)
 *  - Any `paragraph` / `book` child of those containers
 *
 * Also strips non-digit characters from `chapter_label` nodes via appendTransaction.
 *
 * User can still edit content inside these blocks freely.
 * Programmatic state replacement (`view.updateState(…)`) bypasses this filter entirely.
 */

import { isHistoryTransaction } from 'prosemirror-history';
import { Plugin } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';

/** Count occurrences of a given node type in the document. */
function countType(doc: PMNode, typeName: string): number {
  let n = 0;
  doc.descendants((node) => {
    if (node.type.name === typeName) n++;
  });
  return n;
}

/**
 * Count direct block-level children (paragraphs + book) inside `header` and `book_titles` nodes.
 * Protecting these individually stops the user from Backspace-merging header rows together.
 */
function countProtectedChildren(doc: PMNode): number {
  let n = 0;
  doc.descendants((node) => {
    if (
      node.type.name === 'header' ||
      node.type.name === 'book_titles' ||
      node.type.name === 'book_introduction'
    ) {
      node.forEach((child) => {
        if (child.type.name === 'paragraph' || child.type.name === 'book') n++;
      });
      return false;
    }
  });
  return n;
}

export function structureGuardPlugin(): Plugin {
  return new Plugin({
    filterTransaction(tr, state) {
      if (!tr.docChanged) return true;
      // Undo/redo removes chapter nodes (and labels) to reverse insertChapter, etc.
      // Those inverses must not be blocked by the counts below.
      if (isHistoryTransaction(tr)) return true;

      const before = state.doc;
      const after = tr.doc;

      for (const typeName of ['header', 'book_titles', 'book_introduction'] as const) {
        if (countType(before, typeName) > 0 && countType(after, typeName) === 0) return false;
      }

      if (countType(before, 'book') > 0 && countType(after, 'book') === 0) return false;

      // chapter_label nodes must not be deleted
      const labelsBefore = countType(before, 'chapter_label');
      const labelsAfter = countType(after, 'chapter_label');
      if (labelsBefore > 0 && labelsAfter < labelsBefore) return false;

      const childrenBefore = countProtectedChildren(before);
      const childrenAfter = countProtectedChildren(after);
      if (childrenBefore > 0 && childrenAfter < childrenBefore) return false;

      return true;
    },

    appendTransaction(_transactions, _oldState, newState) {
      // Enforce chapter_label invariants on every transaction:
      //  1. Strip any non-digit characters.
      //  2. If empty AND the selection has moved outside the label, restore to the
      //     chapter's sequential position in the document (same fallback as verse → '1').
      const { from: selFrom } = newState.selection;

      type Change = { from: number; to: number; text: string | null };
      const changes: Change[] = [];
      let chapterIdx = 0;

      newState.doc.descendants((node, pos) => {
        if (node.type.name !== 'chapter') return true;
        chapterIdx++;

        const label = node.firstChild;
        if (!label || label.type.name !== 'chapter_label') return false;

        const text = label.textContent;
        const digits = text.replace(/\D/g, '');
        // pos+1 = inside chapter, pos+2 = inside chapter_label (after its open token)
        const labelFrom = pos + 2;
        const labelTo = labelFrom + label.content.size;
        const selInLabel = selFrom >= labelFrom && selFrom <= labelTo;

        if (digits !== text) {
          // Strip non-digit characters (e.g. user pasted letters).
          changes.push({ from: labelFrom, to: labelTo, text: digits || null });
        } else if (!digits && !selInLabel) {
          // Empty and cursor is outside — restore to sequential chapter number.
          changes.push({ from: labelFrom, to: labelTo, text: String(chapterIdx) });
        }

        return false; // chapter_label is handled above; skip other chapter descendants
      });

      if (changes.length === 0) return null;

      // Apply in reverse order so earlier positions are not shifted by later edits.
      let tr = newState.tr;
      for (let i = changes.length - 1; i >= 0; i--) {
        const { from, to, text } = changes[i]!;
        if (text) {
          tr = tr.replaceWith(from, to, newState.schema.text(text));
        } else if (from < to) {
          tr = tr.delete(from, to);
        }
      }
      return tr;
    },
  });
}
