// Core interfaces and types
export {
  BaseUSFMVisitor,
  USFMVisitorWithContext,
  USFMNodeType,
  MilestoneAttributes,
  USFMNode,
  ParagraphNode,
  CharacterNode,
  NoteNode,
  TextNode,
  MilestoneNode,
  AttributedNode,
} from './grammar/interfaces/USFMNodes';

// Parser and options
export { USFMParser } from './grammar';
export type { MarkerType, CustomMarkerRule, USFMParserOptions } from './grammar';

// Import for internal use
import type { USFMParserOptions as USFMParserOptionsType } from './grammar';
import { USFMParser } from './grammar';
import {
  USFMFormatter,
  USFMFormattingRule,
  coreUSFMFormattingRules,
} from './grammar/handlers/USFMFormattingRules';
import { USJVisitor } from './grammar/visitors/USJ';
import { USJToUSFMConverter } from './converters/USJToUSFM';
import { USFMVisitor } from './grammar/visitors/USFM';

// Built-in visitors
export { HTMLVisitor } from './grammar/visitors/HTMLVisitor';
export { USXVisitor } from './grammar/visitors/USX';
export { USJVisitor } from './grammar/visitors/USJ';
export { TextVisitor } from './grammar/visitors/TextVisitor';
export { USFMVisitor } from './grammar/visitors/USFM';
export type { USFMVisitorOptions } from './grammar/visitors/USFM';

// Converters
export { USJToUSFMConverter } from './converters/USJToUSFM';
export type { USJNode, USJToUSFMOptions } from './converters/USJToUSFM';

// USFM Formatting Rules System
export {
  USFMFormatter,
  USFMFormattingRuleMatcher,
  defaultUSFMFormatter,
  coreUSFMFormattingRules,
} from './grammar/handlers/USFMFormattingRules';
export type {
  USFMFormattingRule,
  WhitespaceRule,
  ContentRule,
  MarkerMatcher,
  ExceptionRule,
  WhitespaceType,
  ExceptionContext,
} from './grammar/handlers/USFMFormattingRules';

// Utility functions
/**
 * Normalizes USFM text according to configurable formatting rules.
 * This function uses the enhanced USFMVisitor with USFMFormattingRules to handle
 * whitespace normalization, line ending standardization, and proper marker
 * spacing according to USFM 3.1 specification.
 *
 * @param usfm - The USFM text to normalize
 * @param options - Optional parser configuration
 * @param formattingRules - Optional custom formatting rules (defaults to coreUSFMFormattingRules)
 * @returns The normalized USFM text
 *
 * @example
 * ```typescript
 * import { normalizeUSFM, coreUSFMFormattingRules } from 'usfm-ast';
 *
 * const input = '\\id TIT\r\n\\c  1\n\n\\p\n\\v 1   Text';
 * const normalized = normalizeUSFM(input);
 * // Result: '\\id TIT\n\\c 1\n\\p\\v 1 Text'
 *
 * // With custom rules:
 * const customRules = [...coreUSFMFormattingRules, myCustomRule];
 * const customNormalized = normalizeUSFM(input, undefined, customRules);
 * ```
 */
export function normalizeUSFM(
  usfm: string,
  options?: USFMParserOptionsType,
  formattingRules?: USFMFormattingRule[]
): string {
  // Use the enhanced USFM visitor with formatting rules - no round-trip needed!

  // Parse the USFM to get structured data
  const parser = new USFMParser(options);
  const ast = parser.load(usfm).parse();

  // Use the enhanced USFM visitor with formatting rules
  const usfmVisitor = new USFMVisitor({
    formattingRules: formattingRules || coreUSFMFormattingRules,
    isDocumentStart: true,
    normalizeLineEndings: true,
    preserveWhitespace: false,
  });

  // Visit all nodes and apply formatting rules
  ast.visit(usfmVisitor);

  return usfmVisitor.getResult();
}

/**
 * Normalizes USFM text using the built-in parser normalization.
 * This is a lighter-weight alternative that uses the parser's built-in
 * normalization logic instead of the full formatting rules system.
 *
 * @param usfm - The USFM text to normalize
 * @param options - Optional parser configuration
 * @returns The normalized USFM text
 */
export function normalizeUSFMSimple(usfm: string, options?: USFMParserOptionsType): string {
  const parser = new USFMParser(options);
  return parser.load(usfm).normalize().getInput();
}