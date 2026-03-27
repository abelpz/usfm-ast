/**
 * USFM Formatting Types
 *
 * Types and interfaces for USFM formatting rules and configurations.
 * These types are shared between the formatter and adapters packages.
 */

// Parser-specific enums and types
export enum MarkerTypeEnum {
  PARAGRAPH = 'paragraph',
  CHARACTER = 'character',
  NOTE = 'note',
  NOTE_CONTENT = 'noteContent',
  MILESTONE = 'milestone',
}

export type MarkerType =
  | MarkerTypeEnum.PARAGRAPH
  | MarkerTypeEnum.CHARACTER
  | MarkerTypeEnum.NOTE
  | MarkerTypeEnum.NOTE_CONTENT
  | MarkerTypeEnum.MILESTONE;

export type WhitespaceType = 'none' | 'space' | 'newline' | 'preserve';

export type ExceptionContext =
  | 'after-newline'
  | 'after-break'
  | 'within-note'
  | 'table-cell'
  | 'after-paragraph-text'
  | 'paragraph-with-verse'
  | 'paragraph-with-text';

export interface WhitespaceRule {
  type: WhitespaceType;
  count?: number;
  exceptions?: ExceptionContext[];
}

export interface ContentRule {
  normalizeInternalWhitespace?: boolean;
  trimTrailing?: boolean;
  collapseSpaces?: boolean;
  preserveLineBreaks?: boolean;
}

export interface MarkerMatcher {
  type?: MarkerType;
  marker?: string | string[];
  pattern?: RegExp;
  role?: string; // e.g., 'break', 'title', etc.
}

export interface ExceptionRule {
  context: ExceptionContext;
  marker?: string;
  overrides?: string; // Rule ID to override
  whitespace?: {
    before?: WhitespaceRule;
    after?: WhitespaceRule;
  };
}

export interface USFMFormattingRule {
  id: string;
  description: string;
  priority: number; // Higher priority rules override lower priority ones
  applies: MarkerMatcher;
  whitespace: {
    before?: WhitespaceRule;
    after?: WhitespaceRule;
  };
  content?: ContentRule;
  exceptions?: ExceptionRule[];
}

// Re-export for convenience
export type FormattingRule = USFMFormattingRule;

// Formatting function interface for USFM conversion
export interface FormatResult {
  normalizedOutput: string; // The complete output string with the new marker properly formatted
}

export interface FormattingFunction {
  /**
   * Format a marker with current output context, returning the complete normalized output
   */
  formatMarker(
    currentOutput: string,
    marker: string,
    options?: {
      isClosing?: boolean;
    }
  ): FormatResult;

  /**
   * Format a marker with its content, allowing the formatter to handle proper spacing
   * between marker and content (e.g., verse numbers, chapter numbers)
   */
  formatMarkerWithContent?(
    currentOutput: string,
    marker: string,
    content?: string,
    options?: {
      isClosing?: boolean;
      attributes?: Record<string, string>;
    }
  ): FormatResult;

  /**
   * Add text content to the current USFM string, intelligently handling spacing
   * based on the marker that precedes the content
   */
  addTextContent?(currentOutput: string, textContent: string): FormatResult;
}
