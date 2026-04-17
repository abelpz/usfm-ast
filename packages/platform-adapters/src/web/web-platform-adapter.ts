import type { ProjectStorage } from '@usfm-tools/types';
import type { PlatformAdapter } from '../interfaces/platform-adapter';
import { WebFontAdapter } from './web-font-adapter';
import { WebKeyValueAdapter } from './web-kv-adapter';
import { WebNetworkAdapter } from './web-network-adapter';

export interface WebPlatformAdapterOptions {
  /**
   * `ProjectStorage` implementation. Defaults to `IndexedDbProjectStorage`
   * when not provided — callers in non-browser environments (tests, SSR) should
   * inject a stub to avoid pulling in IndexedDB.
   *
   * In `main.tsx`, pass `new IndexedDbProjectStorage()` explicitly so the
   * dependency on `@usfm-tools/editor-adapters` stays in the app, not in this
   * library package.
   */
  storage?: ProjectStorage;
  /**
   * Optional prefix for all localStorage keys.
   * Defaults to `'usfm-editor'`.
   */
  kvPrefix?: string;
  /**
   * Optional custom `fetch` implementation (e.g. a fetch wrapped with an
   * offline queue or request interceptor).
   * Defaults to `globalThis.fetch`.
   */
  httpFetch?: typeof fetch;
}

/**
 * Composes all web-specific adapter implementations into a single
 * `PlatformAdapter` ready to be provided via `PlatformContext`.
 *
 * @example
 * ```ts
 * import { IndexedDbProjectStorage } from '@usfm-tools/editor-adapters';
 * const adapter = createWebPlatformAdapter({
 *   storage: new IndexedDbProjectStorage(),
 *   kvPrefix: 'usfm-app:',
 * });
 * <PlatformProvider adapter={adapter}><App /></PlatformProvider>
 * ```
 */
export function createWebPlatformAdapter(opts: WebPlatformAdapterOptions = {}): PlatformAdapter {
  if (!opts.storage) {
    throw new Error(
      'createWebPlatformAdapter: opts.storage is required. ' +
      'Pass `new IndexedDbProjectStorage()` from @usfm-tools/editor-adapters.',
    );
  }
  return {
    platform: 'web',
    storage: opts.storage,
    kv: new WebKeyValueAdapter(opts.kvPrefix ?? 'usfm-editor'),
    network: new WebNetworkAdapter(),
    font: new WebFontAdapter(),
    fs: undefined,
    httpFetch: opts.httpFetch ?? globalThis.fetch.bind(globalThis),
  };
}
