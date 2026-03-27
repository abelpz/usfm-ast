/**
 * USFM Formatting Rules System
 *
 * This module defines a rule-based system for formatting USFM text that can be used by:
 * - Normalizers (USFM → normalized USFM)
 * - Converters (USJ/USX → USFM)
 * - Validators (checking USFM compliance)
 */

export type WhitespaceType = 'none' | 'space' | 'newline' | 'preserve';
export type MarkerType = 'paragraph' | 'character' | 'note' | 'milestone';
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

/**
 * Core USFM formatting rules based on USFM 3.1 specification
 */
export const coreUSFMFormattingRules: USFMFormattingRule[] = [
  // Line ending normalization (highest priority)
  {
    id: 'normalize-line-endings',
    description: 'Normalize all line endings to LF',
    priority: 1000,
    applies: { pattern: /\r\n|\r/g },
    whitespace: {},
    content: {
      // This is handled by preprocessing, not marker rules
    },
  },

  // Paragraph markers - context-aware rules (highest priority for paragraphs)
  {
    id: 'paragraph-with-immediate-text',
    description: 'Paragraph markers followed by text content stay on same line',
    priority: 150,
    applies: { type: 'paragraph' },
    whitespace: {
      before: { type: 'newline', exceptions: ['document-start'] },
      after: { type: 'space', count: 1 },
    },
    exceptions: [
      {
        context: 'paragraph-with-verse',
        whitespace: {
          after: { type: 'newline' }, // Paragraph followed by verse gets newline after
        },
      },
    ],
    content: {
      trimTrailing: true,
    },
  },

  // Character markers (general)
  {
    id: 'character-marker-inline',
    description: 'Character markers are inline with space before, no space after',
    priority: 80,
    applies: { type: 'character' },
    whitespace: {
      before: { type: 'space', count: 1, exceptions: ['after-newline', 'document-start'] },
      after: { type: 'none' },
    },
  },

  // Note markers
  {
    id: 'note-marker-spacing',
    description: 'Note markers have space before and after',
    priority: 90,
    applies: { type: 'note' },
    whitespace: {
      before: { type: 'space', count: 1, exceptions: ['after-newline', 'document-start'] },
      after: { type: 'space', count: 1 },
    },
  },

  // Milestone markers
  {
    id: 'milestone-marker-spacing',
    description: 'Milestone markers have space before, no space after',
    priority: 85,
    applies: { type: 'milestone' },
    whitespace: {
      before: { type: 'space', count: 1, exceptions: ['after-newline', 'document-start'] },
      after: { type: 'none' },
    },
  },

  // Verse markers - context-aware (higher priority than character)
  {
    id: 'verse-marker-context-aware',
    description: 'Verse markers adapt to context: newline after paragraph, space in text flow',
    priority: 160,
    applies: { marker: 'v' },
    whitespace: {
      before: { type: 'newline', exceptions: ['document-start', 'after-paragraph-text'] },
      after: { type: 'space', count: 1 },
    },
    content: {
      normalizeInternalWhitespace: true,
      collapseSpaces: true,
    },
    exceptions: [
      {
        context: 'after-paragraph-text',
        whitespace: {
          before: { type: 'space', count: 1 }, // Verse after paragraph text gets space, not newline
        },
      },
    ],
  },

  // Chapter markers
  {
    id: 'chapter-marker-special',
    description: 'Chapter markers have newline before and space after',
    priority: 150,
    applies: { marker: 'c' },
    whitespace: {
      before: { type: 'newline', exceptions: ['document-start'] },
      after: { type: 'space', count: 1 },
    },
    content: {
      normalizeInternalWhitespace: true,
      collapseSpaces: true,
    },
  },

  // ID marker (document start)
  {
    id: 'id-marker-document-start',
    description: 'ID marker at document start, space after',
    priority: 200,
    applies: { marker: 'id' },
    whitespace: {
      before: { type: 'none' },
      after: { type: 'space', count: 1 },
    },
  },

  // Break markers (special role)
  {
    id: 'break-marker-spacing',
    description: 'Break markers have newline before, no content after',
    priority: 120,
    applies: { role: 'break' },
    whitespace: {
      before: { type: 'newline', exceptions: ['document-start'] },
      after: { type: 'none' },
    },
  },

  // Table cell markers (implicit closing)
  {
    id: 'table-cell-markers',
    description: 'Table cell markers have special implicit closing behavior',
    priority: 110,
    applies: { pattern: /^(th|tc|thr|tcr|thc|tcc)\d+(-\d+)?$/ },
    whitespace: {
      before: { type: 'space', count: 1, exceptions: ['after-newline'] },
      after: { type: 'none' },
    },
    exceptions: [
      {
        context: 'table-cell',
        whitespace: {
          before: { type: 'none' }, // Implicit closing - no space between cells
        },
      },
    ],
  },
];

/**
 * Rule matcher utility functions
 */
export class USFMFormattingRuleMatcher {
  constructor(private rules: USFMFormattingRule[]) {}

  /**
   * Find the highest priority rule that matches the given marker
   */
  findMatchingRule(
    marker: string,
    markerType?: MarkerType,
    role?: string
  ): USFMFormattingRule | null {
    const matchingRules = this.rules.filter((rule) =>
      this.ruleMatches(rule, marker, markerType, role)
    );

    if (matchingRules.length === 0) {
      return null;
    }

    // Return highest priority rule
    return matchingRules.reduce((highest, current) =>
      current.priority > highest.priority ? current : highest
    );
  }

  /**
   * Get whitespace rule for a specific context
   */
  getWhitespaceRule(
    marker: string,
    markerType?: MarkerType,
    position: 'before' | 'after' = 'before',
    context?: ExceptionContext
  ): WhitespaceRule | null {
    const rule = this.findMatchingRule(marker, markerType);
    if (!rule) return null;

    const whitespaceRule = position === 'before' ? rule.whitespace.before : rule.whitespace.after;
    if (!whitespaceRule) return null;

    // Check for exception overrides
    if (context && rule.exceptions) {
      const exception = rule.exceptions.find((ex) => ex.context === context);
      if (exception?.whitespace) {
        const exceptionRule =
          position === 'before' ? exception.whitespace.before : exception.whitespace.after;
        if (exceptionRule) return exceptionRule;
      }
    }

    // Check if context is in exceptions list
    if (context && whitespaceRule.exceptions?.includes(context)) {
      return { type: 'none' }; // Exception means no whitespace
    }

    return whitespaceRule;
  }

  private ruleMatches(
    rule: USFMFormattingRule,
    marker: string,
    markerType?: MarkerType,
    role?: string
  ): boolean {
    const { applies } = rule;

    // Check marker type
    if (applies.type && markerType && applies.type !== markerType) {
      return false;
    }

    // Check specific marker
    if (applies.marker) {
      if (Array.isArray(applies.marker)) {
        if (!applies.marker.includes(marker)) return false;
      } else {
        if (applies.marker !== marker) return false;
      }
    }

    // Check pattern
    if (applies.pattern && !applies.pattern.test(marker)) {
      return false;
    }

    // Check role
    if (applies.role && role !== applies.role) {
      return false;
    }

    return true;
  }
}

/**
 * USFM Formatter that applies the rules
 */
export class USFMFormatter {
  private ruleMatcher: USFMFormattingRuleMatcher;

  constructor(rules: USFMFormattingRule[] = coreUSFMFormattingRules) {
    this.ruleMatcher = new USFMFormattingRuleMatcher(rules);
  }

  /**
   * Get the appropriate whitespace for a marker in a given context
   */
  getMarkerWhitespace(
    marker: string,
    markerType?: MarkerType,
    role?: string,
    position: 'before' | 'after' = 'before',
    context?: ExceptionContext
  ): string {
    const rule = this.ruleMatcher.getWhitespaceRule(marker, markerType, position, context);

    if (!rule) {
      // Default fallback
      return position === 'before' ? ' ' : '';
    }

    switch (rule.type) {
      case 'none':
        return '';
      case 'space':
        return ' '.repeat(rule.count || 1);
      case 'newline':
        return '\n';
      case 'preserve':
        return ''; // Preserve means don't change existing
      default:
        return '';
    }
  }

  /**
   * Format a complete USFM marker with appropriate whitespace
   */
  formatMarker(
    marker: string,
    markerType?: MarkerType,
    role?: string,
    context?: ExceptionContext,
    isDocumentStart: boolean = false
  ): { before: string; after: string } {
    const beforeContext = isDocumentStart ? 'document-start' : context;

    return {
      before: this.getMarkerWhitespace(marker, markerType, role, 'before', beforeContext),
      after: this.getMarkerWhitespace(marker, markerType, role, 'after', context),
    };
  }

  /**
   * Context-aware paragraph formatting
   * Determines appropriate spacing based on what follows the paragraph
   */
  formatParagraphWithContext(
    paragraphMarker: string,
    followingMarker?: string,
    followingMarkerType?: MarkerType,
    isDocumentStart: boolean = false
  ): { before: string; after: string } {
    // Determine context based on what follows
    let context: ExceptionContext | undefined;

    if (followingMarker === 'v') {
      context = 'paragraph-with-verse';
    } else if (followingMarker && followingMarkerType !== 'paragraph') {
      context = 'paragraph-with-text';
    }

    return this.formatMarker(paragraphMarker, 'paragraph', undefined, context, isDocumentStart);
  }

  /**
   * Context-aware verse formatting
   * Determines appropriate spacing based on what precedes the verse
   */
  formatVerseWithContext(
    precedingContent: 'paragraph' | 'text' | 'verse' | 'none',
    isDocumentStart: boolean = false
  ): { before: string; after: string } {
    let context: ExceptionContext | undefined;

    if (precedingContent === 'text') {
      context = 'after-paragraph-text';
    }

    return this.formatMarker('v', 'character', undefined, context, isDocumentStart);
  }

  /**
   * Utility method to determine paragraph content type from next marker
   */
  static determineParagraphContentType(nextMarker?: string): 'verse' | 'text' | 'empty' {
    if (!nextMarker) return 'empty';
    if (nextMarker === 'v') return 'verse';
    return 'text';
  }

  /**
   * Format a sequence of markers with proper context awareness
   */
  formatMarkerSequence(
    markers: Array<{
      marker: string;
      markerType?: MarkerType;
      role?: string;
      content?: string;
    }>
  ): Array<{ before: string; after: string }> {
    return markers.map((current, index) => {
      const isFirst = index === 0;
      const previous = index > 0 ? markers[index - 1] : null;
      const next = index < markers.length - 1 ? markers[index + 1] : null;

      // Special handling for paragraph markers
      if (current.markerType === 'paragraph') {
        return this.formatParagraphWithContext(
          current.marker,
          next?.marker,
          next?.markerType,
          isFirst
        );
      }

      // Special handling for verse markers
      if (current.marker === 'v') {
        const precedingContent = this.determinePrecedingContent(previous, current.content);
        return this.formatVerseWithContext(precedingContent, isFirst);
      }

      // Default formatting
      return this.formatMarker(
        current.marker,
        current.markerType,
        current.role,
        undefined,
        isFirst
      );
    });
  }

  private determinePrecedingContent(
    previousMarker: { marker: string; markerType?: MarkerType; content?: string } | null,
    currentContent?: string
  ): 'paragraph' | 'text' | 'verse' | 'none' {
    if (!previousMarker) return 'none';

    if (previousMarker.markerType === 'paragraph') {
      // If paragraph has content, verse comes after text
      if (previousMarker.content && previousMarker.content.trim()) {
        return 'text';
      }
      // Empty paragraph, verse is first content
      return 'paragraph';
    }

    if (previousMarker.marker === 'v') return 'verse';

    return 'text';
  }
}

// Export default formatter instance
export const defaultUSFMFormatter = new USFMFormatter();
