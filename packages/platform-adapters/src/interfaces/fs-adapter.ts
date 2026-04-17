/**
 * Native filesystem access — available on Tauri (plugin-fs) and Capacitor
 * (@capacitor/filesystem), absent on web (returns `undefined` from
 * `PlatformAdapter.fs`).
 *
 * Paths are platform-relative. Implementations should document which base
 * directory they resolve against (e.g. app data dir, documents, etc.).
 */
export interface FileSystemAdapter {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, recursive?: boolean): Promise<void>;
  listDir(path: string): Promise<string[]>;
  remove(path: string, recursive?: boolean): Promise<void>;
  /** Copy src → dest (may optimise to rename on same volume). */
  copy(src: string, dest: string): Promise<void>;
}
