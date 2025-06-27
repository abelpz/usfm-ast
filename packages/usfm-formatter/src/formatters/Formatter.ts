/**
 * Simplified USFM Formatter API
 *
 * Focuses on structural formatting decisions that don't affect parsing.
 * Provides strict USFM compliance with minimal user customization.
 */

import { MarkerTypeEnum } from '@usfm-tools/types';

// Legacy type import for backward-compat constructor (safe because we only typeof-check)
// eslint-disable-next-line import/no-extraneous-dependencies, @typescript-eslint/consistent-type-imports
import type { USFMFormattingRule } from '../rules/types';

export interface USFMFormatterOptions {
  // Structural formatting choices (all valid USFM):
  paragraphsOnNewLine?: boolean; // \p on new line vs same line
  versesOnNewLine?: boolean; // \v on new line vs same line
  characterMarkersOnNewLine?: boolean; // \w on new line vs same line
  noteMarkersOnNewLine?: boolean; // \f on new line vs same line

  // Line length management:
  maxLineLength?: number; // Split long lines
  splitLongLines?: boolean; // Whether to split
}

export interface FormatResult {
  before: string; // Whitespace before marker
  after: string; // Whitespace after marker
  beforeContent?: string; // Whitespace before content (for flexible markers)
  afterContent?: string; // Whitespace after content
}

export interface BuildNodeInput {
  marker: string;
  type: string; // using string to avoid circular enum import for now
  content?: string;
  attributes?: Record<string, string>;
  children?: BuildNodeInput[];
  ctx?: { isDocumentStart?: boolean; previousMarker?: string };
}

export class USFMFormatter {
  private options: Required<USFMFormatterOptions>;

  // Backwards-compat: accept old rules array as first arg
  constructor(optionsOrRules: USFMFormatterOptions | USFMFormattingRule[] = {}) {
    if (Array.isArray(optionsOrRules)) {
      // eslint-disable-next-line no-console
      console.warn(
        '[usfm-formatter] Passing custom rule arrays to USFMFormatter is deprecated. ' +
          'The formatter now only accepts structural options. Custom rules are ignored.'
      );
      this.options = {
        paragraphsOnNewLine: false,
        versesOnNewLine: false,
        characterMarkersOnNewLine: false,
        noteMarkersOnNewLine: false,
        maxLineLength: 0,
        splitLongLines: false,
      };
    } else {
      this.options = {
        paragraphsOnNewLine: false,
        versesOnNewLine: false,
        characterMarkersOnNewLine: false,
        noteMarkersOnNewLine: false,
        maxLineLength: 0, // 0 = no limit
        splitLongLines: false,
        ...optionsOrRules,
      };
    }
  }

  /**
   * Get formatting for a marker based on strict USFM rules + user preferences
   */
  formatMarker(
    marker: string,
    markerType: string,
    context?: {
      isDocumentStart?: boolean;
      previousMarker?: string;
      hasContent?: boolean;
    }
  ): FormatResult {
    // Apply strict USFM rules first
    const strictFormat = this.getStrictFormat(marker, markerType, context);

    // Apply user preferences for structural formatting
    const userFormat = this.getUserFormat(marker, markerType, context);

    // Merge: user preferences can only add structural whitespace, never remove required whitespace
    return {
      before: userFormat.before || strictFormat.before,
      after: strictFormat.after, // Strict rules always apply
      beforeContent: userFormat.beforeContent || strictFormat.beforeContent,
      afterContent: strictFormat.afterContent,
    };
  }

  /**
   * Get strict USFM formatting rules (non-negotiable)
   */
  private getStrictFormat(
    marker: string,
    markerType: string,
    context?: { isDocumentStart?: boolean; previousMarker?: string; hasContent?: boolean }
  ): FormatResult {
    // Same-line content markers - MUST have content on same line
    if (this.isSameLineContentMarker(marker)) {
      return {
        before: context?.isDocumentStart ? '' : '\n',
        after: ' ', // Required space after marker
        beforeContent: '', // No newline before content
        afterContent: '',
      };
    }

    // Paragraph markers - can have content on new line
    if (markerType === MarkerTypeEnum.PARAGRAPH) {
      return {
        before: context?.isDocumentStart ? '' : '\n',
        after: ' ', // Required space after marker
        beforeContent: '', // Can be overridden by user preference
        afterContent: '',
      };
    }

    // Character markers - MUST have content on same line
    if (markerType === MarkerTypeEnum.CHARACTER) {
      return {
        before: ' ', // Space before character marker
        after: ' ', // Required space after marker
        beforeContent: '', // No newline before content
        afterContent: '',
      };
    }

    // Note markers - attach to preceding text
    if (markerType === MarkerTypeEnum.NOTE) {
      return {
        before: '', // No space before note markers
        after: ' ', // Required space after marker
        beforeContent: '', // No newline before content
        afterContent: '',
      };
    }

    // Default for other markers
    return {
      before: context?.isDocumentStart ? '' : '\n',
      after: ' ', // Required space after marker
      beforeContent: '',
      afterContent: '',
    };
  }

  /**
   * Get user preference formatting (structural only)
   */
  private getUserFormat(
    marker: string,
    markerType: string,
    context?: { isDocumentStart?: boolean; previousMarker?: string; hasContent?: boolean }
  ): FormatResult {
    const format: FormatResult = {
      before: '',
      after: '',
      beforeContent: '',
      afterContent: '',
    };

    // User can only add structural whitespace, never remove required whitespace

    // Paragraph markers can have content on new line
    if (markerType === MarkerTypeEnum.PARAGRAPH && this.options.paragraphsOnNewLine) {
      format.beforeContent = '\n';
    }

    // Verse markers can be on new line
    if (marker === 'v' && this.options.versesOnNewLine) {
      format.before = '\n';
    }

    // Character markers can be on new line (but content must stay on same line)
    if (markerType === MarkerTypeEnum.CHARACTER && this.options.characterMarkersOnNewLine) {
      format.before = '\n';
    }

    // Note markers can be on new line
    if (markerType === MarkerTypeEnum.NOTE && this.options.noteMarkersOnNewLine) {
      format.before = '\n';
    }

    return format;
  }

  /**
   * Check if marker requires same-line content
   */
  private isSameLineContentMarker(marker: string): boolean {
    const sameLineMarkers = [
      'c',
      'v',
      'va',
      'vp', // Chapter/Verse
      'id',
      'usfm',
      'ide',
      'sts',
      'rem',
      'h',
      'h1',
      'h2',
      'h3', // Identification
      'toc1',
      'toc2',
      'toc3',
      'toca1',
      'toca2',
      'toca3',
      'mt',
      'mt1',
      'mt2',
      'mt3',
      'mt4',
      'mte',
      'mte1',
      'mte2', // Headings/Titles
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
      'is',
      'is1',
      'is2',
      'ip',
      'ipi',
      'im',
      'imi',
      'ipq',
      'imq',
      'ipr', // Section markers
    ];
    return sameLineMarkers.includes(marker);
  }

  /**
   * Check if marker allows flexible content placement
   */
  private allowsFlexibleContent(marker: string, markerType: string): boolean {
    // Only paragraph-type markers can have content on new lines
    return markerType === MarkerTypeEnum.PARAGRAPH && !this.isSameLineContentMarker(marker);
  }

  /**
   * Get formatter options
   */
  getOptions(): Required<USFMFormatterOptions> {
    return { ...this.options };
  }

  /**
   * Update formatter options
   */
  updateOptions(newOptions: Partial<USFMFormatterOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  // === Compatibility helpers (deprecated) ===
  /** @deprecated use formatMarker */
  formatParagraphWithContext(
    marker: string,
    _nextMarker?: string,
    _nextMarkerType?: string,
    isDocumentStart: boolean = false
  ): FormatResult {
    return this.formatMarker(marker, 'paragraph', { isDocumentStart });
  }

  /** @deprecated use formatMarker */
  formatVerseWithContext(
    _preceding: unknown = 'none',
    _isDocumentStart: boolean = false
  ): FormatResult {
    return this.formatMarker('v', 'character');
  }

  /**
   * Build a complete USFM snippet for a node (marker + optional content/children)
   * This is a convenience wrapper around formatMarker so builders don't have
   * to assemble whitespace / closing tags manually.
   */
  public buildNode(node: BuildNodeInput): string {
    const { marker, type, content = '', attributes = {}, children = [], ctx = {} } = node;
    const ws = this.formatMarker(marker, type, ctx);

    // Build opening marker
    let out = ws.before + `\\${marker}`;

    // Attributes
    if (Object.keys(attributes).length) {
      const attrStr = Object.entries(attributes)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      out += ` ${attrStr}`;
    }

    const hasChildContent = children.length > 0;
    const hasOwnContent = content.length > 0;

    if (hasOwnContent) {
      out += ws.after + content;
    }

    // beforeContent for children
    if (hasChildContent && ws.beforeContent) out += ws.beforeContent;

    // Build children recursively
    if (hasChildContent) {
      out += children
        .map((c) => this.buildNode({ ...c, ctx: { previousMarker: marker } }))
        .join('');
    }

    if (hasChildContent && ws.afterContent) out += ws.afterContent;

    // Closing for character markers that are not milestones or note-content
    const sameLineMarkers = this.isSameLineContentMarker(marker);
    const needsClosing = type === MarkerTypeEnum.CHARACTER && !sameLineMarkers;
    if (needsClosing) out += `\\${marker}*`;

    return out;
  }
}
