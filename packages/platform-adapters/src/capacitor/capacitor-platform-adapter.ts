import type { ProjectStorage } from '@usfm-tools/types';
import type { PlatformAdapter } from '../interfaces/platform-adapter';
import { CapacitorFileSystemAdapter } from './capacitor-fs-adapter';
import { CapacitorKeyValueAdapter } from './capacitor-kv-adapter';
import { CapacitorNetworkAdapter } from './capacitor-network-adapter';

export interface CapacitorPlatformAdapterOptions {
  /** `ProjectStorage` implementation (e.g. `@capacitor-community/sqlite` backed). */
  storage: ProjectStorage;
  /** Optional preference group for the KV adapter (default: `"usfm-editor"`). */
  preferencesGroup?: string;
  /** Optional custom fetch. */
  httpFetch?: typeof fetch;
}

/**
 * Composes Capacitor-specific adapter implementations into a single
 * `PlatformAdapter` for use via `PlatformContext`.
 *
 * The Capacitor mobile shell entry point (`apps/mobile`) calls this and passes
 * the result to `<PlatformProvider adapter={...}>`.
 *
 * @example
 * ```ts
 * // In apps/mobile/src/main.tsx
 * import { createCapacitorPlatformAdapter } from '@usfm-tools/platform-adapters/capacitor';
 * import { CapacitorSqliteProjectStorage } from './storage/capacitor-sqlite-project-storage';
 *
 * const adapter = await createCapacitorPlatformAdapter({
 *   storage: new CapacitorSqliteProjectStorage(),
 * });
 * ```
 */
export function createCapacitorPlatformAdapter(
  opts: CapacitorPlatformAdapterOptions,
): PlatformAdapter {
  return {
    platform: 'capacitor',
    storage: opts.storage,
    kv: new CapacitorKeyValueAdapter(opts.preferencesGroup ?? 'usfm-editor'),
    network: new CapacitorNetworkAdapter(),
    fs: new CapacitorFileSystemAdapter(),
    font: undefined, // No custom font support needed on mobile (OS handles font rendering)
    httpFetch: opts.httpFetch ?? globalThis.fetch.bind(globalThis),
  };
}
