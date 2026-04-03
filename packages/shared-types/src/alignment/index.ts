/**
 * Types for the alignment editing layer (gateway ↔ original-language word links).
 * Used by `@usfm-tools/editor-core` and optional UI adapters — not part of raw USJ schema.
 */

/** A single original-language word in an alignment group */
export interface OriginalWord {
  strong: string;
  lemma: string;
  morph?: string;
  content: string;
  occurrence: number;
  occurrences: number;
}

/** A single gateway-language word that participates in alignment */
export interface AlignedWord {
  word: string;
  occurrence: number;
  occurrences: number;
}

/**
 * Connects one or more original-language words to one or more gateway words
 * (1:1, 1:N, N:1, N:M).
 */
export interface AlignmentGroup {
  sources: OriginalWord[];
  targets: AlignedWord[];
}

/** Alignment groups keyed by verse reference, e.g. `"TIT 3:1"` */
export type AlignmentMap = Record<string, AlignmentGroup[]>;

/**
 * Document shape for content editing: same as USJ but alignment milestones stripped
 * and `\\w` wrappers merged into plain text strings.
 */
export interface EditableUSJ {
  type: 'EditableUSJ';
  version: string;
  content: EditableNode[];
}

/** Content nodes for editable view (loosely typed; mirrors USJ minus alignment noise) */
export type EditableNode = Record<string, unknown> | string;
