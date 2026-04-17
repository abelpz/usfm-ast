/**
 * @usfm-tools/platform-adapters
 *
 * Platform abstraction interfaces for storage, settings, network, filesystem,
 * and fonts. Concrete implementations live in the shell packages:
 *   - src/web/   — browser (IndexedDB + localStorage + navigator)
 *   - src/tauri/ — Tauri desktop (SQLite + plugin-fs + Graphite)
 *   - src/capacitor/ — Capacitor mobile (SQLite + @capacitor/*)
 */

export type { KeyValueAdapter } from './interfaces/kv-adapter';
export type { NetworkAdapter } from './interfaces/network-adapter';
export type { FileSystemAdapter } from './interfaces/fs-adapter';
export type { FontAdapter, FontRegisterOptions, ShapedGlyph } from './interfaces/font-adapter';
export type { PlatformAdapter, PlatformId } from './interfaces/platform-adapter';

// Web implementation is exported from the ./web sub-path to avoid pulling
// browser globals into non-browser builds.
// Usage: import { createWebPlatformAdapter } from '@usfm-tools/platform-adapters/web';
