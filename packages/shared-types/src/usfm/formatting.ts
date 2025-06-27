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
  | 'document-start'
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

// Formatting function interface to break circular dependencies
export interface FormatResult {
  before: string;
  after: string;
  afterContent?: string;
  beforeContent?: string;
}

export interface FormattingFunction {
  formatMarker(
    marker: string,
    markerType: MarkerType,
    nextMarker?: string,
    context?: ExceptionContext,
    isDocumentStart?: boolean
  ): FormatResult;
  formatParagraphWithContext(
    marker: string,
    nextMarker?: string,
    nextMarkerType?: MarkerType,
    isDocumentStart?: boolean
  ): FormatResult;
  formatVerseWithContext(context?: string): FormatResult;
  formatMarkerWithContext?(
    marker: string,
    markerType: MarkerType,
    context?: {
      previousMarker?: string;
      nextMarker?: string;
      ancestorMarkers?: string[];
      isDocumentStart?: boolean;
      hasContent?: boolean;
      content?: string;
    }
  ): FormatResult;
}
