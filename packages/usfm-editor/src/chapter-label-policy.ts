import type { DocumentStore } from '@usfm-tools/editor-core';

/**
 * What to do after the user commits a chapter label edit (blur).
 * The executor (e.g. {@link ScriptureSession}) applies side effects.
 */
export type ChapterLabelAction =
  | { type: 'noop' }
  | { type: 'revert' }
  | { type: 'merge'; oldChapter: number }
  | { type: 'relocate'; oldChapter: number; newChapter: number };

/** Plain inputs for {@link resolveChapterLabelAction} (no ProseMirror / DOM). */
export interface ChapterLabelInput {
  draftRaw: string;
  oldChapter: number;
  readonly: boolean;
}

/**
 * Pure policy: decide relocate, merge (empty label), noop (unchanged), or revert (invalid / collision / readonly).
 * Callers run store mutations and UI updates based on the returned action.
 */
export function resolveChapterLabelAction(
  input: ChapterLabelInput,
  store: DocumentStore
): ChapterLabelAction {
  if (input.readonly) return { type: 'revert' };

  const digits = input.draftRaw.replace(/\D/g, '');

  if (!digits) {
    return { type: 'merge', oldChapter: input.oldChapter };
  }

  const newNum = parseInt(digits, 10);
  if (!Number.isFinite(newNum) || newNum < 1) return { type: 'revert' };
  if (newNum === input.oldChapter) return { type: 'noop' };
  if (store.getChapter(newNum)) return { type: 'revert' };

  return { type: 'relocate', oldChapter: input.oldChapter, newChapter: newNum };
}
