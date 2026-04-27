import * as UsjCoreNs from '@usfm-tools/usj-core';
import { cjsNamed } from './interop.js';

export { UsfmReadonlyView, type UsfmReadonlyViewProps, type WordClickPayload } from './UsfmReadonlyView.js';
export { normalizeWordIdentity } from './wordTokens.js';
export { parseUsfmToUsj, type ParseUsfmOptions } from './parseUsfm.js';
export { collectSegments, type RenderSegment, type SegmentKind } from './segments.js';
export {
  commitExpandedWordTokenSelection,
  expandRangeToWordTokenBoundaries,
  scriptureSelectionFromDom,
  selectedPlainTextExcludingVerseNumbers,
  wordTokensIntersectingRange,
  type ScriptureSelectionFromDomOptions,
  type ScriptureSelectionRef,
  type ScriptureSelectionWordToken,
} from './selectionRef.js';

export const splitUsjByChapter = cjsNamed<
  (doc: { content?: unknown[] }) => import('@usfm-tools/usj-core').ChapterSlice[]
>(UsjCoreNs, 'splitUsjByChapter');

export type { ChapterSlice, UsjDocument } from '@usfm-tools/usj-core';
