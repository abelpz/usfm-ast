/**
 * Structured editing operations (chapter-scoped paths; OT-friendly).
 */

import type { AlignmentGroup, AlignedWord, OriginalWord } from '@usfm-tools/types';
import type { NodePath } from './types';

export type ContentOperation =
  | { type: 'insertNode'; path: NodePath; node: unknown }
  | { type: 'removeNode'; path: NodePath; removedNode?: unknown }
  | { type: 'replaceNode'; path: NodePath; node: unknown; oldNode?: unknown }
  | { type: 'setText'; path: NodePath; text: string; oldText?: string }
  | {
      type: 'setAttr';
      path: NodePath;
      key: string;
      value: string | undefined;
      oldValue?: string | undefined;
    }
  | { type: 'moveNode'; from: NodePath; to: NodePath };

export type AlignmentOperation =
  | { type: 'alignWord'; verseRef: string; target: AlignedWord; sources: OriginalWord[] }
  | { type: 'unalignWord'; verseRef: string; target: AlignedWord }
  | { type: 'updateGroup'; verseRef: string; groupIndex: number; group: AlignmentGroup };

export type Operation = ContentOperation | AlignmentOperation;
