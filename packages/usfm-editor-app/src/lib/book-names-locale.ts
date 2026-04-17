import { USFM_BOOK_CODES } from '@usfm-tools/editor';

/** Positional index for canonical OT+NT book codes (GEN=0 … REV=65). */
const BOOK_INDEX: Record<string, number> = {};
USFM_BOOK_CODES.slice(0, 66).forEach(([code], i) => {
  BOOK_INDEX[code] = i;
});

type Bundle = Record<string, string[]>;

let bundlePromise: Promise<Bundle> | null = null;
let bundleCache: Bundle | null = null;

async function loadBundle(): Promise<Bundle> {
  if (bundleCache) return bundleCache;
  if (!bundlePromise) {
    bundlePromise = fetch('/book-names-bundle.json')
      .then((r) => r.json() as Promise<Bundle>)
      .then((data) => {
        bundleCache = data;
        return data;
      })
      .catch(() => {
        bundlePromise = null;
        return {} as Bundle;
      });
  }
  return bundlePromise;
}

/**
 * Returns the localized name for a book code in the given BCP-47 language.
 * Falls back to the English `fallback` if the language or book is not in the bundle.
 * Supports subtag fallback: `es-419` → `es`, `zh-TW` → `zh`.
 */
export function getLocalizedBookName(lc: string, code: string, fallback: string): string {
  if (!bundleCache) return fallback;
  const base = lc.split('-')[0]!.toLowerCase();
  const names = bundleCache[lc] ?? bundleCache[base];
  if (!names) return fallback;
  const idx = BOOK_INDEX[code];
  if (idx === undefined) return fallback;
  return names[idx] ?? fallback;
}

/**
 * Ensures the bundle is loaded into memory. Call once when a component that needs
 * localized book names mounts. Resolves when ready (or silently fails → English fallback).
 */
export async function preloadBookNames(): Promise<void> {
  await loadBundle();
}
