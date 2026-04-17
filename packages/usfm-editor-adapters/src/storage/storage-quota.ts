/**
 * Browser storage quota utilities.
 *
 * - `requestPersistentStorage()`: requests persistent storage so the browser
 *   won't auto-evict IndexedDB data under quota pressure.
 * - `checkQuotaBeforeDownload()`: estimates available space and warns if
 *   the download might not fit.
 */

/**
 * Request persistent storage permission from the browser.
 * This prevents the browser from auto-evicting cached source files under
 * quota pressure. Should be called once on first cache write.
 * Returns `true` if persistence was granted, `false` otherwise.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * Estimate how much free storage space is available.
 * Returns `null` when the Storage API is not available.
 */
export async function estimateAvailableBytes(): Promise<number | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const { quota = 0, usage = 0 } = await navigator.storage.estimate();
    return Math.max(0, quota - usage);
  } catch {
    return null;
  }
}

/**
 * Check whether there is enough storage quota for a download of the given size.
 * Returns `{ ok: true }` if there is space or quota cannot be determined.
 * Returns `{ ok: false, availableBytes, requiredBytes }` if space is tight.
 *
 * @param requiredBytes Estimated size of the download (bytes).
 * @param safetyMarginBytes Extra headroom required beyond the download (default: 50 MB).
 */
export async function checkQuotaBeforeDownload(
  requiredBytes: number,
  safetyMarginBytes = 50 * 1024 * 1024,
): Promise<
  | { ok: true }
  | { ok: false; availableBytes: number; requiredBytes: number }
> {
  const available = await estimateAvailableBytes();
  if (available === null) return { ok: true }; // Cannot determine — proceed.
  const needed = requiredBytes + safetyMarginBytes;
  if (available >= needed) return { ok: true };
  return { ok: false, availableBytes: available, requiredBytes: needed };
}
