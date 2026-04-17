/**
 * Increment this string whenever the processed-cache schema or parsing logic
 * changes in a way that makes existing entries incompatible.
 *
 * - All entries stored with a different version are treated as cache misses and
 *   rebuilt from raw storage on the next read.
 * - `scheduleCacheSweep` uses this value to proactively delete stale entries
 *   during idle time.
 *
 * Convention: simple incrementing integer strings ("1", "2", …) are sufficient
 * — semantic versioning is unnecessary here because this is an internal cache,
 * not a public API.
 */
export const PROCESSED_CACHE_VERSION = '1';
