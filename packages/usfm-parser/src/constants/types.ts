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
 * Enhanced Syntax Definition System for Declarative Parsing
 */

/**
 * Basic syntax elements that can appear in a marker's parsing pattern
 */
export type SyntaxElement = 
  | "content"             // Parse content until next marker/newline
  | "special-content"     // Parse special content until next marker/newline
  | "mergeable-markers"   // Parse mergeable markers until next non-mergeable-marker/newline
  | "attributes"          // Parse |attr="value" or |devault-value format

export type SpecialContentType = 
  | "number"              // Parse a number and consume the whitespace after it
  | "number-reference"    // Parse a number and ranges and consume the whitespace after it.
  | "word"                // Parse a word and consume the whitespace after it.
  | "text"                // Parse text until | or \ are found. consume/trim the last whitespace after text.
  | "char"                // Parse note caller (+, -, *, etc.) and consume the whitespace after it.

/**
 * Pattern element - all elements are optional except opening-marker
 */
export type PatternElement = SyntaxElement;

/**
 * Pattern variation for different syntax forms of the same marker
 */
export interface PatternVariation {
  /** Name/description of this variation */
  name: string;
  /** The syntax pattern for this variation - always starts with opening-marker */
  pattern: PatternElement[];
  /** Rules specific to this variation */
  rules?: SyntaxRule[];
  /** When to use this variation (priority, conditions) */
  priority?: number;
}

/**
 * Parsing rules that modify how syntax elements are processed
 */
export type SyntaxRule = 
  | "skip-whitespace-after-closing"    // For milestones - skip whitespace after \*
  | "normalize-newlines-to-spaces"     // Convert newlines to spaces in content
  | "preserve-semantic-whitespace"     // Preserve whitespace around closings
  | "require-closing-marker"           // Must have closing \marker*
  | "allow-immediate-closing"          // Allow \marker\marker* pattern
  | "merge-consecutive-whitespace"     // Merge multiple spaces to single space
  | "trim-trailing-whitespace"         // Remove trailing whitespace
  | "content-can-span-lines"           // Content can contain newlines
  | "no-structural-whitespace"         // No required whitespace after marker
  | "structural-whitespace-optional";  // Structural whitespace is optional

export type ClosingCondition =
  | { template: 'white-space' | 'same-type' | 'closing-marker' | 'self-closing' | 'new-line' }
  | { marker: string }
  | { match: string | RegExp }
  | { type: UsfmStyleType }
  | { context: UsfmContextType };
/**
 * Complete syntax definition for a marker
 */
export interface MarkerSyntaxDefinition {
  /** The parsing pattern - sequence of syntax elements (for simple cases) */
  pattern: PatternElement[];
  /** The conditions that close this marker */
  closedBy?: ClosingCondition[];

  /** Multiple pattern variations for complex markers */
  variations?: PatternVariation[];

  /** Rules that modify parsing behavior */
  rules?: SyntaxRule[];

  /** Custom parsing hints for edge cases */
  hints?: {
    /** What to do when pattern doesn't match */
    fallback?: 'skip' | 'error' | 'parse-as-text';

    /** Maximum content length before stopping */
    maxContentLength?: number;

    /** Whether this marker can be nested */
    allowNesting?: boolean;

    /** Special handling for whitespace */
    whitespaceHandling?: 'strict' | 'flexible' | 'ignore';

    /** Default attribute name for shorthand syntax */
    defaultAttribute?: string;
  };
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

/**
 * Defines how special content immediately following a marker should be parsed
 */
export interface DirectSpecialContent {
  /** The attribute name this content becomes (e.g., 'number' for verse, 'caller' for note) */
  attributeName: string;
  /** How to parse the content */
  parseUntil: ('whitespace' | 'linebreak' | 'nextMarker' | 'attributes')[];
  /** Whether the content is required */
  required?: boolean;
  /** Content type for validation */
  contentType?: SpecialContentType;
}

/**
 * Defines how content from other markers merges into this marker
 */
export interface MergeableSpecialContent {
  /** The attribute name this merged content becomes */
  attributeName: string;
  /** Source markers that can merge their content */
  sourceMarkers: string[];
  /** Whether this merged content is required */
  required?: boolean;
  /** How to extract content from source marker */
  extractionMethod?: 'fullContent' | 'specialContent' | 'textContent';
  /** 
   * When to parse this mergeable content:
   * - 'immediate': Parse immediately after direct content (e.g., \f + \cat Names\cat*)
   * - 'deferred': Parse later during content processing (default)
   */
  parseOrder?: 'immediate' | 'deferred';
  /** 
   * Priority for parsing when multiple immediate mergeable content exists.
   * Lower numbers = higher priority (parsed first)
   */
  priority?: number;
}

/**
 * Enhanced special content specification
 */
export interface SpecialContentSpec {
  /** Content immediately following the marker */
  direct?: DirectSpecialContent;
  /** Content that can be merged from other markers */
  mergeable?: MergeableSpecialContent[];
  /** Pattern for special content */
  pattern?: RegExp;
  delimiter?: "space" | "marker" | "newline" | "attribute";
}

/**
 * Containment Rules System for Declarative Structural Relationships
 */

/**
 * Types of containers in USFM
 */
export type ContainerType = 'paragraph' | 'character' | 'note' | 'milestone' | 'table' | 'sidebar';

/**
 * Rules for what can be contained within a container
 */
export interface ContainmentRule {
  /** What types of markers can be contained */
  canContain?: UsfmStyleType[];
  /** What specific markers can be contained */
  canContainMarkers?: string[];
  /** What types cannot be contained (exclusions) */
  cannotContain?: UsfmStyleType[];
  /** What specific markers cannot be contained */
  cannotContainMarkers?: string[];
  /** Whether this container can contain text content */
  canContainText?: boolean;
  /** Whether this container auto-closes when certain markers appear */
  autoCloseOn?: {
    /** Auto-close when these marker types appear */
    markerTypes?: UsfmStyleType[];
    /** Auto-close when these specific markers appear */
    markers?: string[];
    /** Auto-close when markers with these contexts appear */
    contexts?: UsfmContextType[];
  };
  /** Special containment behaviors */
  specialBehaviors?: ContainmentBehavior[];
}

/**
 * Special containment behaviors
 */
export type ContainmentBehavior = 
  | 'implicit-close-on-same-context'  // Close when another marker of same context opens (for notes)
  | 'require-explicit-close'          // Must be explicitly closed with \marker*
  | 'auto-close-on-paragraph'         // Auto-close when paragraph marker appears
  | 'auto-close-on-verse'            // Auto-close when verse marker appears
  | 'merge-consecutive-text'         // Merge consecutive text nodes
  | 'preserve-whitespace'            // Preserve all whitespace
  | 'normalize-whitespace';          // Normalize whitespace

/**
 * Containment context for tracking open containers
 */
export interface ContainmentContext {
  /** Stack of currently open containers */
  containerStack: OpenContainer[];
  /** Current nesting level */
  nestingLevel: number;
  /** Whether we're inside a paragraph */
  insideParagraph: boolean;
  /** Whether we're inside a note */
  insideNote: boolean;
  /** Whether we're inside a character marker */
  insideCharacter: boolean;
  /** Current paragraph container (if any) */
  currentParagraph?: OpenContainer;
  /** Current note container (if any) */
  currentNote?: OpenContainer;
}

/**
 * An open container being tracked
 */
export interface OpenContainer {
  /** The marker that opened this container */
  marker: string;
  /** Type of container */
  type: ContainerType;
  /** The node being built */
  node: any;
  /** Containment rules for this container */
  rules: ContainmentRule;
  /** Position where container was opened */
  openPosition?: number;
  /** Whether this container requires explicit closing */
  requiresClosing?: boolean;
}

/**
 * Result of applying containment rules
 */
export interface ContainmentResult {
  /** Whether the node should be added to a container */
  shouldContain: boolean;
  /** The container to add to (if any) */
  targetContainer?: OpenContainer;
  /** Containers that should be closed */
  containersToClose?: OpenContainer[];
  /** Whether to create a new container */
  createNewContainer?: boolean;
  /** Warnings or notes about containment */
  warnings?: string[];
}

/**
 * Containment rules definitions for markers
 */
export interface ContainmentRuleSet {
  /** Default rules for marker types */
  byType: Record<UsfmStyleType, ContainmentRule>;
  /** Specific rules for individual markers */
  byMarker: Record<string, ContainmentRule>;
  /** Rules for contexts (like NoteContent) */
  byContext: Record<UsfmContextType, ContainmentRule>;
}

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
   * NEW: Declarative syntax definition for this marker
   * This defines how the marker should be parsed in a clear, readable way
   */
  syntax?: MarkerSyntaxDefinition;

  /**
   * NEW: Declarative containment rules for this marker
   * This defines what this marker can contain and how it behaves as a container
   */
  containment?: ContainmentRule;

  /**
   * Enhanced special content specification that defines how content immediately
   * following the marker and/or merged content should be parsed and structured.
   *
   * Examples:
   * - \v 1 Text → direct: { attributeName: 'number', parseUntil: 'whitespace' }
   * - \f + Note → direct: { attributeName: 'caller', parseUntil: 'whitespace' }
   * - \v 1 \va 2\va* → mergeable: [{ attributeName: 'altnumber', sourceMarkers: ['va'] }]
   * - \periph Title Page|id="title" → both direct and regular attributes
   */
  specialContent?: SpecialContentSpec;

  /**
   * @deprecated Use specialContent instead.
   * Indicates if this marker has special content that should be followed by structural whitespace.
   */
  hasSpecialContent?: boolean;

  specialContentPattern?: RegExp;
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

/** Optional sinks for parse-time messages. `getLogs()` always records regardless. */
export interface USFMParserLogger {
  warn?: (message: string) => void;
  error?: (message: string) => void;
}

export interface USFMParserOptions {
  customMarkers?: Record<string, USFMMarkerInfo>;
  /**
   * When true, record non-enumerable `_sourceSpan` `{ start, end }` on AST nodes (UTF-16 indices
   * into the input string). Root nodes and parsed leaves (e.g. text) get spans during parse;
   * containers may receive a span from {@link propagateSourceSpans}. Off by default.
   */
  sourcePositions?: boolean;
  positionTracking?: boolean;
  /**
   * When `true`, do not call `console.warn` / `console.error` for parse messages.
   * Use `getLogs()` for programmatic access. If `logger` supplies a handler for a channel,
   * that handler is still called.
   */
  silentConsole?: boolean;
  /** Custom logging; per-channel fallback is `console` unless `silentConsole` is set. */
  logger?: USFMParserLogger;
}
