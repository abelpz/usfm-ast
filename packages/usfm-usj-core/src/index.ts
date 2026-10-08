export type { UsjDocument } from './usj-document';
export type { ChapterSlice } from './chapter-chunker';
export type { AlignedWord, AlignmentGroup, AlignmentMap, OriginalWord } from '@usfm-tools/types';
export { splitUsjByChapter, ChapterChunker, chapterSliceToUsjDocument } from './chapter-chunker';
export { readsApartAfterGroup, stripAlignments, stripArray } from './alignment-layer';
export { appendGatewayText, needsSpaceBetween } from './gateway-text-spacing';
export {
  tokenizeWords,
  normalizeWordForAlignmentMatch,
  alignmentWordSurfacesEqual,
} from './gateway-word-split';
export { chapterFrontSid, isVerseTextSpan, walkVerseStretches, type VerseCursor } from './verse-reach';
export { collectVerseInlineNodes, findVerseInlineNodes } from './verse-inline';
export { collectVerseTextsFromContent } from './verse-gateway-text';
export {
  tokenizeGatewayUsj,
  occurrenceStats,
  type GatewayWordToken,
} from './gateway-word-tokens';
export { transIndexForAlignedWord } from './aligned-word-match';
