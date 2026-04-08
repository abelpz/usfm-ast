/**
 * Bridge ProseMirror state to `@usfm-tools/editor-core` alignment strip/rebuild.
 */

import { reconcileAlignments, rebuildAlignedUsj, stripAlignments } from '@usfm-tools/editor-core';
import type { AlignmentGroup, AlignmentMap, EditableUSJ, UsjDocument } from '@usfm-tools/types';
import type { EditorState } from 'prosemirror-state';
import { createUSFMEditorState } from './editor';
import { pmDocumentToUsj } from './pm-to-usj';

export type { AlignmentGroup, AlignmentMap, AlignedWord, OriginalWord } from '@usfm-tools/types';

/**
 * Strip alignments from USJ, then build an `EditorState` for editing plain text + structure.
 */
export function stripAndLoad(usj: UsjDocument): { state: EditorState; alignments: AlignmentMap } {
  const { editable, alignments } = stripAlignments(usj);
  const usjLike: UsjDocument = {
    type: 'USJ',
    version: editable.version,
    content: editable.content as UsjDocument['content'],
  };
  return { state: createUSFMEditorState(usjLike), alignments };
}

/**
 * Serialize PM state to USJ, then merge alignment milestones + `\\w` nodes.
 */
export function serializeWithAlignments(
  state: EditorState,
  alignments: AlignmentMap
): { type: 'USJ'; version: string; content: unknown[] } {
  const usj = pmDocumentToUsj(state.doc);
  const editable: EditableUSJ = {
    type: 'EditableUSJ',
    version: usj.version,
    content: usj.content as EditableUSJ['content'],
  };
  return rebuildAlignedUsj(editable, alignments);
}

/** @see {@link reconcileAlignments} */
export function reconcileAfterEdit(
  oldVerseText: string,
  newVerseText: string,
  groups: AlignmentGroup[]
): AlignmentGroup[] {
  return reconcileAlignments(oldVerseText, newVerseText, groups);
}
