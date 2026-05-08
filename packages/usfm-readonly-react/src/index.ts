export {
  UsfmReadonlyView,
  type UsfmReadonlyViewProps,
  type UsfmReadonlyViewReadyPayload,
  type WordClickPayload,
  type WordDecorationInfo,
  type WordTokenAlignment,
} from './UsfmReadonlyView.js';
export { normalizeWordIdentity } from './wordTokens.js';
export { getUsfmChapters, getUsjChapters, parseUsfmToUsj, parseUsfmToUsjWithAlignments, type ParseUsfmOptions } from './parseUsfm.js';
export {
  buildPieceKeyToGatewayIndex,
  resolveWordTokenAlignment,
  verseSidFromParts,
} from './wordAlignment.js';
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

export { splitUsjByChapter } from '@usfm-tools/usj-core';
export type { ChapterSlice, UsjDocument } from '@usfm-tools/usj-core';
