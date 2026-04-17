/**
 * Editor-oriented adapters: format helpers, DCS/Gitea I/O, browser persistence, and source-text
 * providers. Core interfaces (`GitSyncAdapter`, `JournalRemoteTransport`, …) live in
 * `@usfm-tools/editor-core`.
 *
 * For full visitors (USFMVisitor, USXVisitor, HTML, …) depend on `@usfm-tools/adapters` directly.
 */

export type { UsjDocumentRoot } from '@usfm-tools/adapters';
export {
  convertUSJDocumentToUSFM,
  parseUsxToUsjDocument,
  usjDocumentToUsx,
} from '@usfm-tools/adapters';

/** Door43 / Gitea repo contents (list, read, write, delete) — shared with editor-app. */
export {
  createOrUpdateRepoFile,
  deleteRepoFile,
  getFileContent,
  listRepoContents,
  DOOR43_HOST_DEFAULT,
  door43ApiV1BaseUrl,
  normalizeDoor43Host,
  type CreateOrUpdateRepoFileOptions,
  type DeleteRepoFileOptions,
  type Door43ContentEntry,
  type Door43ContentsWriteResult,
  type Door43FileContent,
  type GetFileContentOptions,
  type ListRepoContentsOptions,
} from '@usfm-tools/door43-rest';

export {
  ResourceTypeRegistry,
  alignedGatewayQuoteForHelp,
  alignedGatewayQuoteMatchForHelp,
  annotateTokensByAlignment,
  annotateTokensByQuote,
  buildGatewayTokenOccurrences,
  collectTextFromVerseFragments,
  door43WebRawFileUrl,
  formatHelpsPathTemplate,
  filterHelpsForVerse,
  findNthSubstringIndex,
  helpLinksFromSupportReference,
  matchHelpEntryToTokenIndicesByAlignment,
  matchHelpQuoteToTokenIndices,
  quoteMatchTokenIndicesForHelp,
  normalizeHelpsText,
  parseHelpsTsvReference,
  parseTnTsv,
  parseTwlTsv,
  taArticlePathFromSupportReference,
  tokenIndicesOverlappingRange,
  tokenJoinedSpans,
  tokenCharRangesInPlainText,
  tokenizeVersePlainText,
  twArticlePathFromSupportReference,
  verseHasAlignmentTargets,
  versePlainTextFromStore,
  type AlignedGatewayQuoteMatch,
  type Door43WebRawParams,
} from './helps';

export {
  createDcsJournalTransport,
  type ScriptureDcsPluginOptions,
} from './dcs-journal-transport';
export { DcsGitSyncAdapter, type DcsGitSyncAdapterOptions } from './dcs-git-sync-adapter';
export { IndexedDBPersistenceAdapter } from './indexeddb-persistence';
export { FileSourceTextProvider, DcsSourceTextProvider, type DcsSourceTextOptions } from './source-providers';

export {
  DEFAULT_PROJECT_STORAGE_DB_NAME,
  IndexedDbProjectStorage,
  DcsRestProjectSync,
  gitBlobShaHex,
  IndexedDbSyncQueue,
  IndexedDbSourceCacheStorage,
  IndexedDbProcessedCacheStorage,
  IndexedDbDownloadQueue,
  requestPersistentStorage,
  estimateAvailableBytes,
  checkQuotaBeforeDownload,
  journalRepoPathForBook,
  journalSnapshotPathForBook,
  ProjectBookJournalStore,
  mergeJournalJsonlThreeWay,
  parseJournalJsonl,
  serializeJournalJsonl,
  type DcsRestProjectSyncOptions,
  type ProjectBookJournalStoreOptions,
  type JournalJsonlHeader,
} from './storage';

export {
  mergeProjectMaps,
  mergeUsfmFile,
  mergeFileContent,
  isBinarySyncPath,
  type MergeUsfmResult,
  type MergeProjectResult,
} from './three-way-merge-project';

export {
  CatalogSyncEngine,
  DEFAULT_CATALOG_SUBJECTS,
  CachedSourceTextProvider,
  CacheFirstSourceTextProvider,
  SyncScheduler,
  DownloadScheduler,
  UpdateChecker,
  scheduleCacheSweep,
  PROCESSED_CACHE_VERSION,
  pinProjectToLatestCachedRelease,
  upgradeProjectPin,
  clearProjectSourcePins,
  notifyNewReleaseAvailable,
  type CatalogEntryInfo,
  type CatalogIngredient,
  type CatalogSyncEngineOptions,
  type DownloadProgress,
  type CachedSourceTextProviderOptions,
  type CacheFirstSourceTextProviderOptions,
  type SyncDeliveryFn,
  type SyncSchedulerOptions,
  type DownloadSchedulerOptions,
  type DownloadProgressEvent,
  type UpdateCheckerOptions,
} from './source-cache';
