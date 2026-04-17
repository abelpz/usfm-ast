import type { KeyValueAdapter } from '@usfm-tools/platform-adapters';
import { useCallback, useEffect, useState } from 'react';

/**
 * React hook for a single key-value setting backed by a `KeyValueAdapter`.
 *
 * Mirrors the pattern of `useState` but persists the value via the KV store.
 * On first render returns `defaultValue` synchronously; the stored value is
 * loaded asynchronously and updates state once available.
 *
 * @example
 * ```tsx
 * const [theme, setTheme] = useKVSetting(kv, 'usfm-theme', 'document');
 * ```
 */
export function useKVSetting<T extends string>(
  kv: KeyValueAdapter,
  key: string,
  defaultValue: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    let cancelled = false;
    kv.get(key).then((stored) => {
      if (!cancelled && stored !== null) setValue(stored as T);
    });
    return () => {
      cancelled = true;
    };
  }, [kv, key]);

  const setAndPersist = useCallback(
    (v: T) => {
      setValue(v);
      void kv.set(key, v);
    },
    [kv, key],
  );

  return [value, setAndPersist];
}

/**
 * Hook for a JSON-serialisable setting.
 *
 * @example
 * ```tsx
 * const [shortcuts, setShortcuts] = useKVJsonSetting(kv, 'marker-shortcuts', []);
 * ```
 */
export function useKVJsonSetting<T>(
  kv: KeyValueAdapter,
  key: string,
  defaultValue: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    let cancelled = false;
    kv.get(key).then((stored) => {
      if (!cancelled && stored !== null) {
        try {
          setValue(JSON.parse(stored) as T);
        } catch {
          /* ignore malformed JSON — fall back to defaultValue */
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [kv, key]);

  const setAndPersist = useCallback(
    (v: T) => {
      setValue(v);
      void kv.set(key, JSON.stringify(v));
    },
    [kv, key],
  );

  return [value, setAndPersist];
}
