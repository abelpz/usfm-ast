/**
 * USFM Formatting Rules System
 *
 * This module provides a clean interface to the USFM formatting system:
 * - Rule types and interfaces
 * - Core formatting rules
 * - Rule matching utilities
 * - Formatter implementations
 */

// Re-export types from types module
export * from './types';

// Re-export core rules
export { coreUSFMFormattingRules } from './core';

// Re-export example rules
export * from './examples';

// Re-export strict validation rules
export * from './strict';

// Re-export from other modules for convenience
export { USFMFormattingRuleMatcher } from '../utils';
export { USFMFormatter } from '../formatters';
