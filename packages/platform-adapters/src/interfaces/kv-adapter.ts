/**
 * Key-value settings store — replaces direct `localStorage` calls so the same
 * settings code works on web (localStorage), Tauri (plugin-store), and
 * Capacitor (@capacitor/preferences).
 *
 * All methods are async so implementations can use storage that requires I/O.
 */
export interface KeyValueAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Clear all keys managed by this adapter (optional; may be scoped). */
  clear?(): Promise<void>;
  /**
   * Synchronous read for code paths that cannot be async (e.g. React lazy
   * state initializers, ProseMirror plugin setup).
   * Returns `null` on adapters whose backing store is async-only (Tauri, Capacitor).
   * Prefer `get()` everywhere this limitation is acceptable.
   */
  getSync(key: string): string | null;
}
