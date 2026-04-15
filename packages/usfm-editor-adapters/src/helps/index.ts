export { ResourceTypeRegistry } from './resource-registry';
export {
  alignedGatewayQuoteForHelp,
  alignedGatewayQuoteMatchForHelp,
  annotateTokensByAlignment,
  buildGatewayTokenOccurrences,
  matchHelpEntryToTokenIndicesByAlignment,
  quoteMatchTokenIndicesForHelp,
  verseHasAlignmentTargets,
  type AlignedGatewayQuoteMatch,
} from './alignment-annotate';
export {
  annotateTokensByQuote,
  filterHelpsForVerse,
  findNthSubstringIndex,
  matchHelpQuoteToTokenIndices,
  tokenIndicesOverlappingRange,
  tokenJoinedSpans,
} from './quote-matcher';
export { parseHelpsTsvReference } from './parse-helps-reference';
export { parseTnTsv, parseTwlTsv } from './twl-tn-loaders';
export {
  collectTextFromVerseFragments,
  normalizeHelpsText,
  tokenCharRangesInPlainText,
  tokenizeVersePlainText,
  versePlainTextFromStore,
} from './verse-text';
export {
  door43WebRawFileUrl,
  helpLinksFromSupportReference,
  taArticlePathFromSupportReference,
  twArticlePathFromSupportReference,
  type Door43WebRawParams,
} from './content-helpers';
export { formatHelpsPathTemplate } from './path-template';
