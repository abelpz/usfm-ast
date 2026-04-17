/**
 * Tests for web platform adapter implementations.
 * These run in Node with mocked browser globals (set up in jest-setup.ts).
 */
import { WebKeyValueAdapter } from '../src/web/web-kv-adapter';
import { WebNetworkAdapter } from '../src/web/web-network-adapter';
import { createWebPlatformAdapter } from '../src/web/web-platform-adapter';
import type { ProjectStorage } from '@usfm-tools/types';

// Minimal ProjectStorage stub for factory tests.
const stubStorage = {} as ProjectStorage;

// ---------------------------------------------------------------------------
// WebKeyValueAdapter
// ---------------------------------------------------------------------------

describe('WebKeyValueAdapter', () => {
  it('sets and gets a value without prefix', async () => {
    const kv = new WebKeyValueAdapter();
    await kv.set('foo', 'bar');
    expect(await kv.get('foo')).toBe('bar');
  });

  it('returns null for missing key', async () => {
    const kv = new WebKeyValueAdapter();
    expect(await kv.get('missing')).toBeNull();
  });

  it('namespaces keys with prefix', async () => {
    const kv = new WebKeyValueAdapter('myapp');
    await kv.set('setting', 'value');
    // The raw localStorage key should include the prefix.
    expect(localStorage.getItem('myapp.setting')).toBe('value');
    // The adapter's get should also find it.
    expect(await kv.get('setting')).toBe('value');
  });

  it('two adapters with different prefixes do not collide', async () => {
    const a = new WebKeyValueAdapter('app-a');
    const b = new WebKeyValueAdapter('app-b');
    await a.set('key', 'alpha');
    await b.set('key', 'beta');
    expect(await a.get('key')).toBe('alpha');
    expect(await b.get('key')).toBe('beta');
  });

  it('removes a key', async () => {
    const kv = new WebKeyValueAdapter();
    await kv.set('temp', 'data');
    await kv.remove('temp');
    expect(await kv.get('temp')).toBeNull();
  });

  it('clear() with prefix removes only prefixed keys', async () => {
    const kv = new WebKeyValueAdapter('ns');
    await kv.set('a', '1');
    await kv.set('b', '2');
    // Add an unrelated key directly.
    localStorage.setItem('other', 'keep-me');
    await kv.clear();
    expect(await kv.get('a')).toBeNull();
    expect(await kv.get('b')).toBeNull();
    expect(localStorage.getItem('other')).toBe('keep-me');
  });

  it('clear() without prefix clears all localStorage', async () => {
    const kv = new WebKeyValueAdapter();
    await kv.set('x', '1');
    localStorage.setItem('y', '2');
    await kv.clear();
    expect(localStorage.length).toBe(0);
  });

  it('getSync() returns value synchronously', async () => {
    const kv = new WebKeyValueAdapter();
    await kv.set('sync-key', 'sync-val');
    expect(kv.getSync('sync-key')).toBe('sync-val');
  });

  it('getSync() returns null for missing key', () => {
    const kv = new WebKeyValueAdapter();
    expect(kv.getSync('missing-sync')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// WebNetworkAdapter
// ---------------------------------------------------------------------------

describe('WebNetworkAdapter', () => {
  it('isOnline() reflects navigator.onLine', () => {
    const net = new WebNetworkAdapter();
    (global.navigator as { onLine: boolean }).onLine = true;
    expect(net.isOnline()).toBe(true);
    (global.navigator as { onLine: boolean }).onLine = false;
    expect(net.isOnline()).toBe(false);
  });

  it('onStatusChange callback fires when online event is dispatched', () => {
    const net = new WebNetworkAdapter();
    const calls: boolean[] = [];
    const unsub = net.onStatusChange((online) => calls.push(online));

    // Simulate going online.
    window.dispatchEvent({ type: 'online' } as Event);
    expect(calls).toEqual([true]);

    // Simulate going offline.
    window.dispatchEvent({ type: 'offline' } as Event);
    expect(calls).toEqual([true, false]);

    unsub();
  });

  it('onStatusChange unsubscribes correctly', () => {
    const net = new WebNetworkAdapter();
    const calls: boolean[] = [];
    const unsub = net.onStatusChange((online) => calls.push(online));

    unsub();
    window.dispatchEvent({ type: 'online' } as Event);
    // After unsub, no more calls.
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createWebPlatformAdapter
// ---------------------------------------------------------------------------

describe('createWebPlatformAdapter', () => {
  it('returns platform identifier "web"', () => {
    const adapter = createWebPlatformAdapter({ storage: stubStorage });
    expect(adapter.platform).toBe('web');
  });

  it('fs is undefined (no native filesystem on web)', () => {
    const adapter = createWebPlatformAdapter({ storage: stubStorage });
    expect(adapter.fs).toBeUndefined();
  });

  it('font adapter is defined', () => {
    const adapter = createWebPlatformAdapter({ storage: stubStorage });
    expect(adapter.font).toBeDefined();
  });

  it('kv adapter uses the provided kvPrefix', async () => {
    const adapter = createWebPlatformAdapter({
      storage: stubStorage,
      kvPrefix: 'test-prefix',
    });
    await adapter.kv.set('hello', 'world');
    expect(localStorage.getItem('test-prefix.hello')).toBe('world');
  });

  it('kv adapter defaults to "usfm-editor" prefix', async () => {
    const adapter = createWebPlatformAdapter({ storage: stubStorage });
    await adapter.kv.set('x', 'y');
    expect(localStorage.getItem('usfm-editor.x')).toBe('y');
  });

  it('passes through the provided storage', () => {
    const adapter = createWebPlatformAdapter({ storage: stubStorage });
    expect(adapter.storage).toBe(stubStorage);
  });

  it('uses the provided httpFetch', () => {
    const myFetch = jest.fn();
    const adapter = createWebPlatformAdapter({
      storage: stubStorage,
      httpFetch: myFetch as unknown as typeof fetch,
    });
    expect(adapter.httpFetch).toBe(myFetch);
  });
});
