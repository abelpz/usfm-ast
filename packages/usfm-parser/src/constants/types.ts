/**
 * USFM Marker Type Definitions
 */

import { MarkerType, MarkerTypeEnum } from '@usfm-tools/types';

export type UsfmStyleType = 'paragraph' | 'character' | 'milestone' | 'note';

export type UsxStyleType =
  | 'book'
  | 'chapter'
  | 'para'
  | 'table'
  | 'sidebar'
  | 'figure'
  | 'periph'
  | 'optbreak'
  | 'ref'
  | 'char'
  | 'verse'
  | 'ms'
  | 'note'
  | 'whitespace'
  | 'table:row'
  | 'table:cell';

export type UsfmRole =
  | 'identification'
  | 'introduction'
  | 'title'
  | 'section'
  | 'body'
  | 'poetry'
  | 'list'
  | 'table'
  | 'formatting'
  | 'break'
  | 'note'
  | 'mark'
  | 'sidebar'
  | 'versification'
  | 'peripheral';

export type UsfmContextType =
  | 'ScriptureContent'
  | 'PeripheralContent'
  | 'IntroductionContent'
  | 'ChapterContent'
  | 'VerseContent'
  | 'ParagraphContent'
  | 'PoetryContent'
  | 'TableContent'
  | 'NoteContent'
  | 'ListContent'
  | 'SidebarContent';

export interface USFMAttributeInfo {
  description: string;
  required?: boolean;
  values?: string[];
  type?: 'string' | 'number' | 'boolean';
  defaultValue?: string | number | boolean;
}

/**
 * Sophisticated merge target specification for declaring what a marker can merge into
 */
export interface MarkerMergeTarget {
  /** Specific marker names (e.g., ['esb', 'c', 'v']) */
  markers?: string[];
  /** Marker types (e.g., ['note', 'paragraph']) */
  types?: UsfmStyleType[];
  /** Marker roles (e.g., ['note', 'sidebar']) */
  roles?: UsfmRole[];
}

/**
 * Flexible merge specification using sophisticated objects
 */
export type MergeIntoSpecification =
  | MarkerMergeTarget // Sophisticated object
  | MarkerMergeTarget[]; // Array of sophisticated objects

export interface USFMMarkerBaseInfo {
  type: UsfmStyleType;
  role?: UsfmRole;
  context?: UsfmContextType[];
  displayName?: string;
  contentType?: 'text' | 'mixed' | 'none';
  label?: string;
  styleType?: UsxStyleType;
  tags?: string[];
  implicitAttributes?: Record<string, USFMAttributeInfo>;
  /**
   * Indicates if this marker has special content that should be followed by structural whitespace.
   * Special content is typically a string without spaces (like verse numbers, chapter numbers,
   * book IDs, footnote callers) where a space after the content is structural, not significant.
   *
   * Examples:
   * - \v 1 Text (verse number "1" + structural space + verse text)
   * - \c 1 (chapter number "1" + structural space/newline)
   * - \id GEN Genesis (book ID "GEN" + structural space + title)
   * - \f + Note text (caller "+" + structural space + note text)
   */
  hasSpecialContent?: boolean;
  /**
   * Indicates that this marker closes a section started by another marker
   * (e.g., \esbe closes \esb)
   */
  closes?: string;
  /**
   * Indicates that this marker starts a section that must be closed by another marker
   * (e.g., \esb is closed by \esbe)
   */
  closedBy?: string;
  /**
   * Indicates that this marker is a section container that can contain other paragraphs
   */
  sectionContainer?: boolean;
  /**
   * Indicates that this marker should be merged into another marker as a property.
   *
   * Uses sophisticated merge target specification:
   * - Single object: mergesInto: { markers: ['esb'], types: ['note'] }
   * - Array of objects: mergesInto: [{ markers: ['esb'] }, { types: ['note'] }]
   *
   * Each object can specify:
   * - markers: Array of specific marker names (e.g., ['esb', 'c', 'v'])
   * - types: Array of marker types (e.g., ['note', 'paragraph'])
   * - roles: Array of marker roles (e.g., ['note', 'sidebar'])
   *
   * Examples:
   * - \cat merges into \esb markers and any marker with type 'note'
   * - \cp merges into \c markers specifically
   * - \va merges into \v markers specifically
   */
  mergesInto?: MergeIntoSpecification;
  /**
   * The property name to use when merging this marker into another
   */
  mergeAs?: string;
}

export interface USFMMarkerWithoutAttributes extends USFMMarkerBaseInfo {
  allowsAttributes?: false;
  defaultAttribute?: never;
  attributes?: never;
}

export interface USFMMarkerWithAttributes extends USFMMarkerBaseInfo {
  allowsAttributes: true;
  defaultAttribute?: string;
  attributes?: Record<string, USFMAttributeInfo>;
}

export type USFMMarkerInfo = USFMMarkerWithoutAttributes | USFMMarkerWithAttributes;

// Import shared marker types

export interface CustomMarkerRule {
  type: MarkerType;
  requiresClosing?: boolean;
  isMilestone?: boolean;
}

export interface USFMParserOptions {
  customMarkers?: Record<string, USFMMarkerInfo>;
  positionTracking?: boolean;
}
