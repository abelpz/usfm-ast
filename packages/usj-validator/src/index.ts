/**
 * USJ validation — structural checks live in `@usj-tools/core`; this package re-exports them for a
 * stable `@usj-tools/validator` entry point (future: schema / richer rules).
 */
export { validateUsjStructure, type UsjValidationResult } from '@usj-tools/core';
