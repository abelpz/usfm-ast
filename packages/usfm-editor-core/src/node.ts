/**
 * Node.js / Electron / Tauri persistence — import from `@usfm-tools/editor-core/node`.
 * Not included in the default package entry (browser-safe).
 */

export { FileSystemPersistenceAdapter } from './persistence/filesystem-adapter';
export { GitLocalPersistenceAdapter, type GitLocalPersistenceOptions } from './persistence/git-local-adapter';
