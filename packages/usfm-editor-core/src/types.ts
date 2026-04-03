/**
 * Scripture addressing and structured edit scaffolding (for future OperationEngine / OT).
 */

/** Identifies a span of scripture within one book */
export type USFMRef =
  | { book: string }
  | { book: string; chapter: number }
  | { book: string; chapter: number; verse: number }
  | { book: string; chapter: number; verseStart: number; verseEnd: number }
  | {
      book: string;
      chapterStart: number;
      verseStart: number;
      chapterEnd: number;
      verseEnd: number;
    };

/** Path to a node inside a chapter slice (indices are 0-based) */
export interface NodePath {
  chapter: number;
  indices: number[];
}
