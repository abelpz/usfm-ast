/**
 * Structural tests for all three platform factory functions.
 *
 * Tauri and Capacitor adapters depend on native plugins that are not available
 * in Node.js. The Jest `moduleNameMapper` in `jest.config.js` redirects those
 * imports to `.d.ts` stub files, which means the factory functions can be
 * imported but the runtime native calls will throw/be no-ops.
 *
 * These tests only verify that each factory returns the correct `PlatformId`
 * and has the expected presence/absence of optional adapters (`fs`, `font`).
 * They do NOT call any native APIs.
 */
import type { ProjectStorage } from '@usfm-tools/types';
import { createWebPlatformAdapter } from '../src/web/web-platform-adapter';
import { createTauriPlatformAdapter } from '../src/tauri/tauri-platform-adapter';
import { createCapacitorPlatformAdapter } from '../src/capacitor/capacitor-platform-adapter';

const stubStorage = {} as ProjectStorage;

// ---------------------------------------------------------------------------
// createWebPlatformAdapter
// ---------------------------------------------------------------------------

describe('createWebPlatformAdapter (structural)', () => {
  it('platform identifier is "web"', () => {
    const a = createWebPlatformAdapter({ storage: stubStorage });
    expect(a.platform).toBe('web');
  });

  it('has kv, network, font adapters; no fs', () => {
    const a = createWebPlatformAdapter({ storage: stubStorage });
    expect(a.kv).toBeDefined();
    expect(a.network).toBeDefined();
    expect(a.font).toBeDefined();
    expect(a.fs).toBeUndefined();
  });

  it('exposes httpFetch', () => {
    const a = createWebPlatformAdapter({ storage: stubStorage });
    expect(typeof a.httpFetch).toBe('function');
  });

  it('exposes the passed storage', () => {
    const a = createWebPlatformAdapter({ storage: stubStorage });
    expect(a.storage).toBe(stubStorage);
  });
});

// ---------------------------------------------------------------------------
// createTauriPlatformAdapter
// ---------------------------------------------------------------------------

describe('createTauriPlatformAdapter (structural)', () => {
  it('platform identifier is "tauri"', () => {
    const a = createTauriPlatformAdapter({ storage: stubStorage });
    expect(a.platform).toBe('tauri');
  });

  it('has kv, network, fs, font adapters', () => {
    const a = createTauriPlatformAdapter({ storage: stubStorage });
    expect(a.kv).toBeDefined();
    expect(a.network).toBeDefined();
    expect(a.fs).toBeDefined();
    expect(a.font).toBeDefined();
  });

  it('exposes httpFetch', () => {
    const a = createTauriPlatformAdapter({ storage: stubStorage });
    expect(typeof a.httpFetch).toBe('function');
  });

  it('exposes the passed storage', () => {
    const a = createTauriPlatformAdapter({ storage: stubStorage });
    expect(a.storage).toBe(stubStorage);
  });
});

// ---------------------------------------------------------------------------
// createCapacitorPlatformAdapter
// ---------------------------------------------------------------------------

describe('createCapacitorPlatformAdapter (structural)', () => {
  it('platform identifier is "capacitor"', () => {
    const a = createCapacitorPlatformAdapter({ storage: stubStorage });
    expect(a.platform).toBe('capacitor');
  });

  it('has kv, network, fs adapters; no font', () => {
    const a = createCapacitorPlatformAdapter({ storage: stubStorage });
    expect(a.kv).toBeDefined();
    expect(a.network).toBeDefined();
    expect(a.fs).toBeDefined();
    expect(a.font).toBeUndefined();
  });

  it('exposes httpFetch', () => {
    const a = createCapacitorPlatformAdapter({ storage: stubStorage });
    expect(typeof a.httpFetch).toBe('function');
  });

  it('exposes the passed storage', () => {
    const a = createCapacitorPlatformAdapter({ storage: stubStorage });
    expect(a.storage).toBe(stubStorage);
  });
});
