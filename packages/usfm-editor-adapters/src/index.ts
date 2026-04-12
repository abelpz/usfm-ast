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

export {
  createDcsJournalTransport,
  type ScriptureDcsPluginOptions,
} from './dcs-journal-transport';
export { DcsGitSyncAdapter, type DcsGitSyncAdapterOptions } from './dcs-git-sync-adapter';
export { IndexedDBPersistenceAdapter } from './indexeddb-persistence';
export { FileSourceTextProvider, DcsSourceTextProvider, type DcsSourceTextOptions } from './source-providers';
