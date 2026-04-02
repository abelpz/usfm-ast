/**
 * USFM Formatter - Formatting and normalization tools for USFM
 */

// Export main formatter functionality
export * from './formatters';

// Export rule system
export * from './rules';

// Export utilities
export * from './utils';

// Interfaces are type-only — use `export type` so ESM consumers (Vite dev + native ESM) do not expect runtime exports.
export type { USFMFormatterOptions, BuildNodeInput, FormatResult } from './formatters/Formatter';
