/**
 * Strict, Non-Overridable USFM Formatting Rules
 *
 * These rules enforce the core principles documented in USFM_FORMATTING_RULES_SIMPLE.md
 * and CANNOT be overridden by user configuration. They represent the fundamental
 * constraints of the USFM format that must always be respected.
 *
 * ## Critical Constraints (NEVER OVERRIDE):
 *
 * 1. **Same-line content requirement**: Chapter, verse, identification, heading, title,
 *    and section markers MUST have their content on the same line. No formatting rule
 *    can place content on a new line for these markers.
 *
 * 2. **Minimum whitespace requirement**: All markers MUST have at least one space
 *    separating them from their content. No rule can remove this space (e.g., '\c 1'
 *    can never become '\c1').
 *
 * 3. **No structural indentation**: Leading whitespace becomes semantic content, not
 *    structural formatting. Rules cannot add indentation for visual layout.
 *
 * 4. **Newlines are structural**: Newlines never become rendered content. Use USFM
 *    markers (like \\//) for content line breaks.
 *
 * ## User Flexibility (ALLOWED):
 *
 * 1. **Newline before marker**: Users can prepend any marker with a single newline
 * 2. **Newline before content**: Only for paragraph-type markers (p, q1, li, etc.)
 * 3. **Split text content**: Across multiple lines with preserved semantic whitespace
 * 4. **Extra semantic whitespace**: After the first structural space (becomes content)
 *
 * @readonly
 * @immutable
 */

/**
 * Markers that MUST have their content on the same line.
 * This is a fundamental constraint of USFM and cannot be overridden.
 *
 * @readonly
 */
export const STRICT_SAME_LINE_CONTENT_MARKERS = Object.freeze([
  // Chapter/Verse markers - CRITICAL: Must have numbers on same line
  'c',
  'v',
  'va',
  'vp',

  // Identification markers - CRITICAL: Must have content on same line
  'id',
  'usfm',
  'ide',
  'sts',
  'rem',
  'h',
  'h1',
  'h2',
  'h3',
  'toc1',
  'toc2',
  'toc3',
  'toca1',
  'toca2',
  'toca3',

  // Heading/Title markers - CRITICAL: Must have text on same line
  'mt',
  'mt1',
  'mt2',
  'mt3',
  'mt4',
  'mte',
  'mte1',
  'mte2',
  'ms',
  'ms1',
  'ms2',
  'ms3',
  'mr',
  's',
  's1',
  's2',
  's3',
  's4',
  's5',
  'sr',
  'r',
  'd',
  'sp',

  // Section markers - CRITICAL: Must have content on same line
  'is',
  'is1',
  'is2',
  'ip',
  'ipi',
  'im',
  'imi',
  'ipq',
  'imq',
  'ipr',
] as const);

/**
 * Markers that CAN have content on new lines.
 * These are paragraph-type markers that allow flexible content placement.
 *
 * @readonly
 */
export const FLEXIBLE_CONTENT_MARKERS = Object.freeze([
  // Standard paragraph markers
  'p',
  'm',
  'po',
  'pr',
  'cls',
  'pmo',
  'pm',
  'pmc',
  'pmr',

  // Indented paragraph markers
  'pi',
  'pi1',
  'pi2',
  'pi3',
  'pc',

  // Poetry markers
  'q',
  'q1',
  'q2',
  'q3',
  'q4',
  'qr',
  'qc',
  'qa',
  'qac',
  'qm',
  'qm1',
  'qm2',
  'qm3',

  // List markers
  'li',
  'li1',
  'li2',
  'li3',
  'li4',
  'lh',
  'lf',
  'lim',
  'lim1',
  'lim2',
  'lim3',
  'lim4',

  // Break markers (no content)
  'b',
  'nb',
  'ib',
] as const);

/**
 * Core USFM formatting constraints that CANNOT be overridden.
 * These represent the fundamental rules of USFM format.
 */
export const STRICT_FORMATTING_CONSTRAINTS = Object.freeze({
  /**
   * Same-line content requirement
   * These markers MUST have their content on the same line, no exceptions.
   */
  SAME_LINE_CONTENT_REQUIRED: STRICT_SAME_LINE_CONTENT_MARKERS,

  /**
   * Minimum whitespace requirement
   * All markers MUST have at least one space or newline separating them from content.
   */
  MINIMUM_WHITESPACE_REQUIRED: true,

  /**
   * No structural indentation allowed
   * Leading whitespace becomes semantic content, not structural formatting.
   */
  NO_STRUCTURAL_INDENTATION: true,

  /**
   * Newlines are always structural
   * Newlines never become part of rendered content.
   */
  NEWLINES_ARE_STRUCTURAL: true,

  /**
   * First space after marker is structural
   * Only the first space after a marker is structural, additional spaces are semantic.
   */
  FIRST_SPACE_IS_STRUCTURAL: true,
} as const);

/**
 * User-allowed formatting flexibility within strict constraints.
 * These are the ONLY formatting choices users can make.
 */
export const ALLOWED_USER_FORMATTING = Object.freeze({
  /**
   * Users CAN add a single newline between marker and content
   * (only for flexible content markers, not same-line markers)
   */
  NEWLINE_BEFORE_CONTENT: {
    allowed: true,
    constraint: 'Only for paragraph-type markers, not same-line content markers',
    markers: FLEXIBLE_CONTENT_MARKERS,
  },

  /**
   * Users CAN split text content across multiple lines
   * (preserving semantic whitespace)
   */
  SPLIT_TEXT_CONTENT: {
    allowed: true,
    constraint: 'Must preserve semantic whitespace and line continuation rules',
    note: 'Trailing/leading whitespace preserved, implicit space joining for bare content',
  },

  /**
   * Users CAN prepend any marker with a single newline
   * (for structural formatting)
   */
  NEWLINE_BEFORE_MARKER: {
    allowed: true,
    constraint: 'Single newline only, no multiple newlines for spacing',
    note: 'Multiple newlines should use appropriate USFM break markers (\\b, \\nb)',
  },

  /**
   * Users CAN add extra semantic whitespace after the first structural space
   * (becomes part of rendered content)
   */
  EXTRA_SEMANTIC_WHITESPACE: {
    allowed: true,
    constraint: 'Only after the first structural space, becomes rendered content',
    note: 'Use sparingly and only when semantically meaningful',
  },
} as const);

/**
 * Validates that a formatting rule respects strict constraints.
 * This function ensures no user rules can violate the fundamental USFM principles.
 *
 * @param marker - The marker being formatted
 * @param whitespace - The whitespace configuration for the rule
 * @returns Validation result with any constraint violations
 */
export function validateRuleCompliance(
  marker: string,
  whitespace: { before?: string; after?: string; beforeContent?: string; afterContent?: string }
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Check minimum whitespace requirement for ALL markers
  // All markers MUST have either a single space OR a single newline separating them from content
  if (!whitespace.after || (!whitespace.after.includes(' ') && !whitespace.after.includes('\n'))) {
    violations.push(
      `Marker '\\${marker}' requires whitespace after marker for content separation (space or newline) (got: '${whitespace.after || 'undefined'}')`
    );
  }

  // Check same-line content constraint
  // For same-line markers, content must immediately follow the marker on the same line
  // These markers can ONLY have space, not newlines
  if (STRICT_SAME_LINE_CONTENT_MARKERS.includes(marker as any)) {
    // Check if rule tries to put content on new line via 'after' property
    if (whitespace.after && whitespace.after.includes('\n')) {
      violations.push(
        `Marker '\\${marker}' requires same-line content but rule has newline in 'after' property`
      );
    }

    // Check if rule tries to put content on new line via beforeContent
    if (whitespace.beforeContent && whitespace.beforeContent.includes('\n')) {
      violations.push(
        `Marker '\\${marker}' requires same-line content but rule has newline in beforeContent`
      );
    }

    // For same-line markers, the 'after' property should contain a space
    if (whitespace.after && !whitespace.after.includes(' ')) {
      violations.push(
        `Marker '\\${marker}' requires same-line content and must have a space after marker (got: '${whitespace.after}')`
      );
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Gets the strict formatting requirements for a marker.
 * Returns the non-negotiable formatting constraints.
 *
 * @param marker - The USFM marker
 * @returns Strict formatting requirements
 */
export function getStrictRequirements(marker: string) {
  const isSameLineRequired = STRICT_SAME_LINE_CONTENT_MARKERS.includes(marker as any);
  const isFlexibleContent = FLEXIBLE_CONTENT_MARKERS.includes(marker as any);

  return Object.freeze({
    marker,
    sameLineContentRequired: isSameLineRequired,
    canHaveContentOnNewLine: isFlexibleContent && !isSameLineRequired,
    minimumWhitespaceRequired: true,
    firstSpaceIsStructural: true,
    newlinesAreStructural: true,
    noStructuralIndentation: true,
  });
}

/**
 * Type guard to check if a marker requires same-line content
 */
export function requiresSameLineContent(marker: string): boolean {
  return STRICT_SAME_LINE_CONTENT_MARKERS.includes(marker as any);
}

/**
 * Type guard to check if a marker allows flexible content placement
 */
export function allowsFlexibleContent(marker: string): boolean {
  return FLEXIBLE_CONTENT_MARKERS.includes(marker as any);
}
