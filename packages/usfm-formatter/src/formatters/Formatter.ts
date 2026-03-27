/**
 * Context-aware USFM Formatter
 *
 * The formatter analyzes the current output string and returns a complete
 * normalized string with the new marker properly formatted according to rules.
 */

import { MarkerTypeEnum } from '@usfm-tools/types';
import { USFMMarkerRegistry, USFMMarkerInfo, UsfmStyleType } from '@usfm-tools/parser';

// Legacy type import for backward-compat constructor (safe because we only typeof-check)
import type { USFMFormattingRule } from '../rules/types';

export interface USFMFormatterOptions {
  // Structural formatting choices (all valid USFM):
  paragraphContentOnNewLine?: boolean; // \p content on new line vs same line
  versesOnNewLine?: boolean; // \v on new line vs same line
  characterMarkersOnNewLine?: boolean; // \w on new line vs same line
  noteMarkersOnNewLine?: boolean; // \f on new line vs same line

  // Granular marker control (takes precedence over broad categories above):
  markersOnNewLine?: string[]; // Specific markers that should start on new lines: ['w', 'wj', 'qt']
  markersInline?: string[]; // Specific markers that should be inline: ['bd', 'it', 'em']

  // Category-wide overrides (takes precedence over broad categories, but not over specific arrays):
  allCharacterMarkersOnNewLine?: boolean; // All character markers on new lines
  allNoteMarkersOnNewLine?: boolean; // All note markers on new lines
  allNonParagraphMarkersOnNewLine?: boolean; // All non-paragraph markers on new lines

  // Line length management:
  maxLineLength?: number; // Split long lines
  splitLongLines?: boolean; // Whether to split

  // Custom marker support:
  customMarkers?: Record<string, USFMMarkerInfo>; // Custom marker definitions
}

export interface FormatResult {
  normalizedOutput: string; // The complete output string with the new marker properly formatted
}

export interface BuildNodeInput {
  marker: string;
  type: string; // using string to avoid circular enum import for now
  content?: string;
  attributes?: Record<string, string>;
  children?: BuildNodeInput[];
  ctx?: { previousMarker?: string };
}

export class USFMFormatter {
  private options: Required<
    Omit<USFMFormatterOptions, 'customMarkers' | 'markersOnNewLine' | 'markersInline'>
  > & {
    customMarkers?: Record<string, USFMMarkerInfo>;
    markersOnNewLine: string[];
    markersInline: string[];
  };
  private customRules: USFMFormattingRule[] = [];
  private markerRegistry: USFMMarkerRegistry;
  private inferredMarkers: Record<string, USFMMarkerInfo> = {};

  // Backwards-compat: accept old rules array as first arg
  constructor(optionsOrRules: USFMFormatterOptions | USFMFormattingRule[] = {}) {
    if (Array.isArray(optionsOrRules)) {
      this.customRules = optionsOrRules as USFMFormattingRule[];
      this.options = {
        paragraphContentOnNewLine: false,
        versesOnNewLine: true,
        characterMarkersOnNewLine: false,
        noteMarkersOnNewLine: false,
        markersOnNewLine: [],
        markersInline: [],
        allCharacterMarkersOnNewLine: false,
        allNoteMarkersOnNewLine: false,
        allNonParagraphMarkersOnNewLine: false,
        maxLineLength: 0,
        splitLongLines: false,
      };
      this.markerRegistry = USFMMarkerRegistry.getInstance();
    } else {
      this.customRules = [];
      const defaults = {
        paragraphContentOnNewLine: false,
        versesOnNewLine: true,
        characterMarkersOnNewLine: false,
        noteMarkersOnNewLine: false,
        markersOnNewLine: [],
        markersInline: [],
        allCharacterMarkersOnNewLine: false,
        allNoteMarkersOnNewLine: false,
        allNonParagraphMarkersOnNewLine: false,
        maxLineLength: 0, // 0 = no limit
        splitLongLines: false,
      };
      this.options = {
        ...defaults,
        ...optionsOrRules,
        // Ensure arrays are provided even if not in options
        markersOnNewLine: optionsOrRules.markersOnNewLine || defaults.markersOnNewLine,
        markersInline: optionsOrRules.markersInline || defaults.markersInline,
      };
      // Initialize registry with custom markers if provided
      this.markerRegistry = USFMMarkerRegistry.getInstance(this.options.customMarkers);
    }
  }

  /**
   * Register a custom marker with the formatter
   */
  addCustomMarker(marker: string, markerInfo: USFMMarkerInfo): void {
    this.markerRegistry.addMarker(marker, markerInfo);
  }

  /**
   * Get all markers that were inferred during formatting
   * @returns Record of marker names to their inferred USFMMarkerInfo - same format as customMarkers option
   */
  getInferredMarkers(): Record<string, USFMMarkerInfo> {
    return { ...this.inferredMarkers };
  }

  /**
   * Clear the list of inferred markers
   */
  clearInferredMarkers(): void {
    this.inferredMarkers = {};
  }

  /**
   * Check if any markers were inferred during formatting
   */
  hasInferredMarkers(): boolean {
    return Object.keys(this.inferredMarkers).length > 0;
  }

  /**
   * Formats a marker by analyzing the current output string and returning
   * the complete normalized output with the new marker properly positioned
   * @private - Use addMarker instead
   */
  private formatMarker(
    currentOutput: string,
    marker: string,
    options: {
      isClosing?: boolean; // For closing markers like \w*
    } = {}
  ): FormatResult {
    const { isClosing = false } = options;

    // Build the marker string (without attributes - visitor handles those)
    const markerStr = isClosing ? `\\${marker}*` : `\\${marker}`;

    // Analyze the current output to determine context
    const isAtStart = currentOutput.length === 0;

    if (isAtStart) {
      // First marker in document - just add the marker with appropriate trailing space
      const afterWhitespace = !isClosing ? this.getStructuralWhitespaceAfter(marker) : '';
      return {
        normalizedOutput: markerStr + afterWhitespace,
      };
    }

    // Normalize the current output and determine what whitespace should precede the marker
    const normalizedOutput = this.normalizeAndAppendMarker(
      currentOutput,
      markerStr,
      marker,
      isClosing
    );

    return {
      normalizedOutput,
    };
  }

  /**
   * Normalizes the current output and appends the marker with proper spacing
   */
  private normalizeAndAppendMarker(
    currentOutput: string,
    markerStr: string,
    marker: string,
    isClosing: boolean
  ): string {
    // For closing markers, never add any whitespace - preserve existing content exactly
    if (isClosing) {
      return currentOutput + markerStr;
    }

    // For opening markers, we need to distinguish between:
    // 1. Newlines are always structural - can be added/normalized freely
    // 2. Spaces can be significant - be careful about adding where none existed

    // Analyze the current output to understand the whitespace situation
    const trailingWhitespaceMatch = currentOutput.match(/(\s*)$/);
    const trailingWhitespace = trailingWhitespaceMatch ? trailingWhitespaceMatch[1] : '';
    const hasTrailingWhitespace = trailingWhitespace.length > 0;
    const hasTrailingSpace = /[ \t]$/.test(currentOutput);
    const outputWithoutTrailingWhitespace = hasTrailingWhitespace
      ? currentOutput.slice(0, -trailingWhitespace.length)
      : currentOutput;

    // Determine what structural whitespace is required before this marker
    const requiredBefore = this.getStructuralWhitespaceBefore(marker, currentOutput);

    // Handle the different cases based on what we need to add
    let result: string;

    if (requiredBefore === '\n') {
      // We need to add a newline before the marker

      // Case 1: Already has newline at the end - don't add another
      if (currentOutput.endsWith('\n')) {
        result = currentOutput;
      }
      // Case 2: Has trailing whitespace - decide whether to remove it
      else if (hasTrailingWhitespace) {
        const isStructural = this.isTrailingWhitespaceStructural(currentOutput);
        if (isStructural) {
          // Remove structural whitespace and add newline
          result = outputWithoutTrailingWhitespace + '\n';
        } else {
          // Preserve significant whitespace and add newline
          result = currentOutput + '\n';
        }
      }
      // Case 3: No trailing whitespace - just add newline
      else {
        result = currentOutput + '\n';
      }
    } else {
      // Not adding newline - handle inline cases

      // For markers that don't require structural whitespace, preserve existing trailing whitespace
      if (requiredBefore === '' && hasTrailingWhitespace) {
        // Keep the original output with its trailing whitespace
        result = currentOutput;
      } else {
        // Remove trailing whitespace and add required structural whitespace
        result = outputWithoutTrailingWhitespace;

        // Add the required whitespace before the marker
        if (requiredBefore === ' ') {
          // Spaces might be significant - only add if there was already whitespace or it's required
          if (hasTrailingWhitespace || this.isSpaceRequired(marker, currentOutput)) {
            result += requiredBefore;
          }
          // If no trailing whitespace and space not required, don't add space (avoid significant whitespace)
        } else if (requiredBefore) {
          // Other whitespace types
          result += requiredBefore;
        }
      }
    }

    // Add the marker
    result += markerStr;

    // Add structural whitespace after the marker (like space after \v for verse number)
    const requiredAfter = this.getStructuralWhitespaceAfter(marker);
    if (requiredAfter) {
      result += requiredAfter;
    }

    return result;
  }

  /**
   * Determines if trailing whitespace in the current output is structural (can be removed)
   * or significant (must be preserved) based on USFM structural patterns
   */
  private isTrailingWhitespaceStructural(usfmString: string): boolean {
    // Step 1: Make sure there is a " " space at the end of the string
    if (!usfmString.endsWith(' ')) {
      return false;
    }

    // Step 2: Start walking backwards from the end, skipping the last space
    let i = usfmString.length - 2; // Skip the trailing space we're checking

    // Walk backwards looking for either '\' or space
    while (i >= 0) {
      const char = usfmString[i];

      if (char === '\\') {
        // Found backslash first → pattern is "\marker " → trailing space is structural
        return true;
      }

      if (char === ' ') {
        // Found space first → keep walking back until we find another space or backslash
        i--; // Move past this space

        while (i >= 0) {
          const nextChar = usfmString[i];

          if (nextChar === '\\') {
            // Found backslash → we have "\marker content " pattern
            // Extract the marker name
            const markerStart = i + 1;
            let markerEnd = markerStart;
            while (markerEnd < usfmString.length && /[a-zA-Z0-9]/.test(usfmString[markerEnd])) {
              markerEnd++;
            }
            const marker = usfmString.substring(markerStart, markerEnd);

            // Extract the content between marker and trailing space
            const contentStart = markerEnd + 1; // Skip space after marker
            const contentEnd = usfmString.length - 1; // Before trailing space
            const content = usfmString.substring(contentStart, contentEnd);

            // Check if marker allows special content and content has no spaces
            const hasSpecialContentCapability = this.hasSpecialContent(marker);
            const contentHasNoSpaces = !content.includes(' ');

            return hasSpecialContentCapability && contentHasNoSpaces;
          }

          if (nextChar === ' ') {
            // Found another space → content spans multiple words → trailing space is significant
            return false;
          }

          i--;
        }

        // Reached beginning without finding backslash → not structural
        return false;
      }

      i--;
    }

    // Reached beginning without finding backslash or space → not structural
    return false;
  }

  /**
   * Determines if a space is absolutely required before this marker for valid USFM syntax
   * The formatter should not add spaces - all spacing should come from AST text nodes
   */
  private isSpaceRequired(marker: string, currentOutput: string): boolean {
    // The formatter should never add spaces before markers
    // All spacing should be handled by text nodes in the AST
    return false;
  }

  /**
   * Determines what structural whitespace is required before a marker for proper USFM syntax
   * This should never add significant whitespace, only what's required by the format
   */
  private getStructuralWhitespaceBefore(marker: string, currentOutput: string): string {
    // Special cases first
    if (marker === 'id') {
      return ''; // ID marker never requires whitespace before (document start)
    }

    // Priority 1: Check specific marker arrays first
    if (this.options.markersOnNewLine.includes(marker)) {
      return '\n';
    }
    if (this.options.markersInline.includes(marker)) {
      // For inline markers, determine appropriate inline whitespace based on marker type
      const markerType = this.getMarkerType(marker, currentOutput);
      return markerType === 'note' ? '' : ' ';
    }

    // Priority 2: Check category-wide overrides
    const markerType = this.getMarkerType(marker, currentOutput);

    if (this.options.allNonParagraphMarkersOnNewLine && markerType !== 'paragraph') {
      return '\n';
    }
    if (this.options.allCharacterMarkersOnNewLine && markerType === 'character') {
      return '\n';
    }
    if (this.options.allNoteMarkersOnNewLine && markerType === 'note') {
      return '\n';
    }

    // Priority 3: Fall back to existing broad category logic
    switch (markerType) {
      case 'paragraph':
        // Paragraph markers structurally require a newline before them
        return '\n';

      case 'character':
        if (marker === 'v') {
          // Verses can be on new line or inline based on options
          return this.options.versesOnNewLine ? '\n' : ' ';
        } else {
          // Character markers should attach directly to preceding text when inline
          return this.options.characterMarkersOnNewLine ? '\n' : '';
        }

      case 'note':
        // Note markers can be inline or on new line based on options
        return this.options.noteMarkersOnNewLine ? '\n' : '';

      case 'milestone':
        // Milestone markers typically need a space for readability
        return ' ';

      default:
        return ' ';
    }
  }

  /**
   * Determines what structural whitespace is required after a marker for proper USFM syntax
   */
  private getStructuralWhitespaceAfter(marker: string): string {
    // Markers that require same-line content always need a space after them
    if (this.isSameLineContentMarker(marker)) {
      return ' ';
    }

    // Get marker type to determine spacing requirements
    const markerType = this.markerRegistry.getMarkerInfo(marker, 'type') || 'character';

    switch (markerType) {
      case 'paragraph':
        return this.options.paragraphContentOnNewLine ? '\n' : ' ';

      case 'character':
      case 'note':
        return ' '; // Character and note markers need space for content

      default:
        return ' ';
    }
  }

  /**
   * Gets the marker type from registry or infers it using the same logic as the parser
   */
  private getMarkerType(marker: string, currentOutput: string): UsfmStyleType {
    // Try to get from registry first
    let markerType = this.markerRegistry.getMarkerInfo(marker, 'type');

    if (!markerType) {
      // Infer marker type using the same logic as the parser
      markerType = this.inferMarkerType(marker, currentOutput);

      // Register the inferred marker and track it
      if (markerType) {
        const markerInfo: USFMMarkerInfo = { type: markerType };

        try {
          this.markerRegistry.addMarker(marker, markerInfo);
          // Track this as an inferred marker for user reference
          this.inferredMarkers[marker] = markerInfo;
        } catch {
          // Ignore errors if marker already exists
        }
      }
    }

    return markerType || 'character'; // Default to character if inference fails
  }

  /**
   * Infers marker type using the same logic as the parser
   */
  private inferMarkerType(marker: string, currentOutput: string): UsfmStyleType {
    // Check if it's a milestone marker
    if (this.isMilestoneMarker(marker)) {
      return 'milestone';
    }

    // Check if there's a line break before the marker (based on current output)
    const hasLineBreakBefore = this.checkForPrecedingLineBreak(currentOutput);

    // If there's no line break before the marker then it's a character marker
    if (!hasLineBreakBefore) {
      return 'character';
    }

    // Default to paragraph marker
    return 'paragraph';
  }

  /**
   * Checks if there's a line break before the current position in the output
   */
  private checkForPrecedingLineBreak(currentOutput: string): boolean {
    if (currentOutput.length === 0) {
      return true; // Beginning of document counts as having a line break
    }

    // Look backwards from the end for the first non-whitespace character
    for (let i = currentOutput.length - 1; i >= 0; i--) {
      const char = currentOutput[i];
      if (char === '\n' || char === '\r') {
        return true;
      }
      if (char !== ' ' && char !== '\t') {
        return false; // Found non-whitespace, non-newline character
      }
    }

    return true; // Only whitespace found, treat as line break
  }

  /**
   * Checks if a marker is a milestone marker
   */
  private isMilestoneMarker(marker: string): boolean {
    // Check for -s/-e suffix (milestone start/end)
    if (marker.endsWith('-s') || marker.endsWith('-e')) {
      return true;
    }

    // Note: We can't check for self-closing markers (\*) here since we only have the marker name
    // The parser can check this because it has access to the full input string
    return false;
  }

  /**
   * Check if marker requires same-line content
   * Uses marker registry information instead of hardcoded list
   */
  private isSameLineContentMarker(marker: string): boolean {
    // First check: markers with special content always require same-line content
    const hasSpecialContent = this.markerRegistry.getMarkerInfo(marker, 'hasSpecialContent');
    if (hasSpecialContent) {
      return true;
    }

    // Second check: derive from marker type and common patterns
    const markerType = this.markerRegistry.getMarkerInfo(marker, 'type');

    if (markerType === 'paragraph') {
      // Paragraph markers that are typically used for headings/titles/identification
      // These usually require same-line content
      const headingTitlePatterns = [
        /^h\d*$/, // h, h1, h2, h3, etc.
        /^toc\d*$/, // toc1, toc2, toc3
        /^toca\d*$/, // toca1, toca2, toca3
        /^mt\d*$/, // mt, mt1, mt2, mt3, mt4
        /^mte\d*$/, // mte, mte1, mte2
        /^ms\d*$/, // ms, ms1, ms2, ms3
        /^s\d*$/, // s, s1, s2, s3, s4, s5
        /^is\d*$/, // is, is1, is2
        /^i(p|pi|m|mi|pq|mq|pr)$/, // ip, ipi, im, imi, ipq, imq, ipr
      ];

      const isHeadingTitle = headingTitlePatterns.some((pattern) => pattern.test(marker));
      if (isHeadingTitle) {
        return true;
      }

      // Identification markers
      const identificationMarkers = ['id', 'usfm', 'ide', 'sts', 'rem', 'restore'];
      if (identificationMarkers.includes(marker)) {
        return true;
      }

      // Other special paragraph markers
      const specialParagraphMarkers = ['mr', 'sr', 'r', 'd', 'sp'];
      if (specialParagraphMarkers.includes(marker)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get formatter options
   */
  getOptions(): Required<
    Omit<USFMFormatterOptions, 'customMarkers' | 'markersOnNewLine' | 'markersInline'>
  > & {
    customMarkers?: Record<string, USFMMarkerInfo>;
    markersOnNewLine: string[];
    markersInline: string[];
  } {
    return { ...this.options };
  }

  /**
   * Update formatter options
   */
  updateOptions(newOptions: Partial<USFMFormatterOptions>): void {
    this.options = {
      ...this.options,
      ...newOptions,
      // Ensure arrays are properly handled
      markersOnNewLine: newOptions.markersOnNewLine || this.options.markersOnNewLine,
      markersInline: newOptions.markersInline || this.options.markersInline,
    };

    // If custom markers are updated, reinitialize the registry
    if (newOptions.customMarkers) {
      this.markerRegistry = USFMMarkerRegistry.getInstance(newOptions.customMarkers);
    }
  }

  // === Compatibility helpers (deprecated) ===
  /** @deprecated use addMarker instead */
  formatParagraphWithContext(
    marker: string,
    _nextMarker?: string,
    _nextMarkerType?: string
  ): FormatResult {
    return this.formatMarker('', marker, {
      isClosing: false,
    });
  }

  /** @deprecated use addMarker instead */
  formatVerseWithContext(_preceding: unknown = 'none'): FormatResult {
    return this.formatMarker('', 'v', {
      isClosing: false,
    });
  }

  /**
   * Build a complete USFM snippet for a node (marker + optional content/children)
   * This is a convenience wrapper around formatMarker so builders don't have
   * to assemble whitespace / closing tags manually.
   * @private - Internal method for complex node building
   */
  private buildNode(node: BuildNodeInput): string {
    const { marker, type, content = '', attributes = {}, children = [], ctx = {} } = node;
    const ws = this.formatMarker('', marker, {
      isClosing: false,
    });

    // Build opening marker
    let out = ws.normalizedOutput;

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
      out += content;
    }

    // Build children recursively
    if (hasChildContent) {
      out += children
        .map((c) => this.buildNode({ ...c, ctx: { previousMarker: marker } }))
        .join('');
    }

    // Closing for character markers that are not milestones or note-content
    const markerType = this.getMarkerType(marker, '');
    const needsClosing = markerType === 'character' && !this.isSameLineContentMarker(marker);
    if (needsClosing) {
      out += `\\${marker}*`;
    }

    return out;
  }

  /**
   * Formats a marker with its content by analyzing the current output string and returning
   * the complete normalized output with the marker and content properly formatted
   * @private - Use addMarker + addTextContent instead
   */
  private formatMarkerWithContent(
    currentOutput: string,
    marker: string,
    content: string = '',
    options: {
      isClosing?: boolean;
      attributes?: Record<string, string>;
    } = {}
  ): FormatResult {
    const { isClosing = false, attributes = {} } = options;

    // For closing markers, just add the closing marker - no content
    if (isClosing) {
      const markerStr = `\\${marker}*`;
      return {
        normalizedOutput: currentOutput + markerStr,
      };
    }

    // Build the marker string
    let markerStr = `\\${marker}`;

    // Add attributes if provided
    if (Object.keys(attributes).length > 0) {
      const attrStr = Object.entries(attributes)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      markerStr += ` ${attrStr}`;
    }

    // Handle document start case
    if (currentOutput.length === 0) {
      const afterMarkerWhitespace = this.getStructuralWhitespaceAfter(marker);
      return {
        normalizedOutput: markerStr + afterMarkerWhitespace + content,
      };
    }

    // Get the normalized output with the marker properly positioned
    const withMarker = this.normalizeAndAppendMarker(currentOutput, markerStr, marker, false);

    // Now add the content with proper spacing
    const withContent = this.addContentToMarker(withMarker, marker, content);

    return {
      normalizedOutput: withContent,
    };
  }

  /**
   * Adds content to a marker that's already been formatted, handling the spacing between marker and content
   */
  private addContentToMarker(currentOutput: string, marker: string, content: string): string {
    if (!content) {
      return currentOutput;
    }

    // For verses, we need to handle the special case where the verse number needs a space after it
    if (marker === 'v') {
      // Parse the verse number from the content
      const verseMatch = content.match(/^(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?)\s*(.*)/);
      if (verseMatch) {
        const [, verseNumber, verseText] = verseMatch;
        // Add the verse number immediately after the marker, then space, then text
        return currentOutput + verseNumber + (verseText ? ' ' + verseText : '');
      }
    }

    // For chapter markers, similar handling
    if (marker === 'c') {
      const chapterMatch = content.match(/^(\d+)\s*(.*)/);
      if (chapterMatch) {
        const [, chapterNumber, chapterText] = chapterMatch;
        return currentOutput + chapterNumber + (chapterText ? ' ' + chapterText : '');
      }
    }

    // For most other markers, just add the content directly
    // The structural whitespace after the marker was already added by getStructuralWhitespaceAfter
    return currentOutput + content;
  }

  /**
   * Adds text content to the current USFM string, intelligently handling spacing
   * based on the marker that precedes the content
   */
  addTextContent(currentOutput: string, textContent: string): FormatResult {
    if (!textContent) {
      return { normalizedOutput: currentOutput };
    }

    // Find the last marker in the current output
    const lastMarker = this.findLastMarker(currentOutput.trimEnd());

    if (!lastMarker) {
      // No marker found, just append the content
      return { normalizedOutput: currentOutput + textContent };
    }

    // Handle special content formatting based on marker type
    // No attributes since this is called right after marker formatting
    const formattedContent = this.formatContentForMarker(lastMarker, textContent, false);

    return { normalizedOutput: currentOutput + formattedContent };
  }

  /**
   * Adds attributes to the current USFM string, typically to the last marker
   * Format: |key1="value1" key2="value2" (includes USFM | separator)
   */
  addAttributes(currentOutput: string, attributes: Record<string, string>): FormatResult {
    if (!attributes || Object.keys(attributes).length === 0) {
      return { normalizedOutput: currentOutput };
    }

    // Build attribute string with proper USFM syntax
    const attrStr = Object.entries(attributes)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');

    // Add USFM attributes separator | followed by attributes
    const attributeString = `|${attrStr}`;

    return { normalizedOutput: currentOutput + attributeString };
  }

  /**
   * Finds the last marker in the USFM string and returns the marker name
   * Optimized for use case: called right after marker formatting, before content addition
   * Simple algorithm:
   * 1. Find the last backslash by searching backwards
   * 2. Extract marker name efficiently
   * 3. No attribute detection needed (handled during marker formatting)
   */
  private findLastMarker(usfmString: string): string | null {
    if (!usfmString) {
      return null;
    }

    const len = usfmString.length;
    if (len === 0) {
      return null;
    }

    // Find the last backslash by searching backwards
    let backslashPos = -1;
    for (let i = len - 1; i >= 0; i--) {
      if (usfmString[i] === '\n' || usfmString[i] === ' ') {
        break;
      }
      if (usfmString[i] === '\\') {
        backslashPos = i;
        break;
      }
    }

    if (backslashPos === -1) {
      return null; // No backslash found
    }

    // Extract marker name efficiently
    const markerStart = backslashPos + 1;
    let markerEnd = markerStart;

    // Find the end of the marker name (valid marker characters only)
    while (markerEnd < len) {
      const char = usfmString[markerEnd];
      if (/[a-zA-Z0-9\-+*]/.test(char)) {
        markerEnd++;
      } else {
        break;
      }
    }

    if (markerEnd === markerStart) {
      return null; // No valid marker characters found
    }

    const marker = usfmString.substring(markerStart, markerEnd);

    // Handle closing markers (ending with *)
    if (marker.endsWith('*')) {
      return null; // Closing marker, not relevant for content addition
    }

    // No attribute detection needed - this is called right after marker formatting
    // Attributes would have been handled during the marker formatting phase
    return marker;
  }

  /**
   * Formats text content appropriately for the given marker
   */
  private formatContentForMarker(marker: string, content: string, hasAttributes: boolean): string {
    // For markers with attributes, content usually follows directly
    if (hasAttributes) {
      return content;
    }

    // Check if this marker has special content that needs parsing
    if (this.hasSpecialContent(marker)) {
      return this.parseAndFormatSpecialContent(marker, content);
    }

    // For most markers that expect same-line content, just add the content
    if (this.isSameLineContentMarker(marker)) {
      return content;
    }

    // For other markers, add content directly (the structural whitespace was already added)
    return content;
  }

  /**
   * Parses content for markers with special content and formats it properly
   */
  private parseAndFormatSpecialContent(marker: string, content: string): string {
    if (!content.trim()) {
      return content;
    }

    // Parse based on marker type
    switch (marker) {
      case 'v':
      case 'va':
      case 'vp':
        return this.parseVerseContent(content);

      case 'c':
      case 'ca':
      case 'cp':
        return this.parseChapterContent(content);

      case 'id':
        return this.parseIdContent(content);

      case 'f':
      case 'fe':
      case 'ef':
      case 'x':
      case 'ex':
        return this.parseNoteContent(content);

      default:
        // For other special content markers, assume first token is special
        return this.parseGenericSpecialContent(content);
    }
  }

  /**
   * Parses verse content: verse number + optional text
   */
  private parseVerseContent(content: string): string {
    // Match verse number patterns: 1, 1-2, 1.5, 1-2.5, etc.
    const verseMatch = content.match(/^(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?)\s*(.*)/);
    if (verseMatch) {
      const [, verseNumber, verseText] = verseMatch;
      if (verseText.trim()) {
        // Has text after verse number - space is already in the content
        return content;
      } else {
        // Only verse number - add structural space
        return verseNumber + ' ';
      }
    }
    // Fallback: treat entire content as verse number
    return content + ' ';
  }

  /**
   * Parses chapter content: chapter number + optional title
   */
  private parseChapterContent(content: string): string {
    const chapterMatch = content.match(/^(\d+)\s*(.*)/);
    if (chapterMatch) {
      const [, chapterNumber, chapterTitle] = chapterMatch;
      if (chapterTitle.trim()) {
        // Has title after chapter number
        return content;
      } else {
        // Only chapter number - no trailing space for chapters
        return chapterNumber;
      }
    }
    return content;
  }

  /**
   * Parses ID content: book code + optional title
   */
  private parseIdContent(content: string): string {
    const idMatch = content.match(/^([A-Z0-9]{2,4})\s*(.*)/);
    if (idMatch) {
      const [, bookCode, bookTitle] = idMatch;
      if (bookTitle.trim()) {
        // Has title after book code
        return content;
      } else {
        // Only book code - add structural space
        return bookCode + ' ';
      }
    }
    // Fallback: assume entire content is book code
    return content + ' ';
  }

  /**
   * Parses note content: caller + optional note text
   */
  private parseNoteContent(content: string): string {
    // Note callers are typically single characters or short strings
    const noteMatch = content.match(/^([+*a-zA-Z0-9]{1,3})\s*(.*)/);
    if (noteMatch) {
      const [, caller, noteText] = noteMatch;
      if (noteText.trim()) {
        // Has text after caller
        return content;
      } else {
        // Only caller - add structural space
        return caller + ' ';
      }
    }
    return content + ' ';
  }

  /**
   * Generic parser for special content: first token + optional remaining text
   */
  private parseGenericSpecialContent(content: string): string {
    const match = content.match(/^(\S+)\s*(.*)/);
    if (match) {
      const [, specialPart, remainingText] = match;
      if (remainingText.trim()) {
        return content;
      } else {
        return specialPart + ' ';
      }
    }
    return content + ' ';
  }

  /**
   * Checks if a marker has special content that should be followed by structural whitespace.
   * Special content is typically a string without spaces (like verse numbers, chapter numbers,
   * book IDs, footnote callers) where a space after the content is structural, not significant.
   */
  private hasSpecialContent(marker: string): boolean {
    // Check built-in markers from registry
    const builtInMarker = this.markerRegistry.getMarkerInfo(marker);
    if (builtInMarker?.hasSpecialContent) {
      return true;
    }

    // Check custom markers
    const customMarker = this.options.customMarkers?.[marker];
    if (customMarker?.hasSpecialContent) {
      return true;
    }

    return false;
  }

  /**
   * Adds a marker to the current USFM string with proper structural whitespace
   * This handles the placement and structural spacing of markers
   * If the marker is detected/inferred as a milestone, automatically uses milestone formatting
   */
  addMarker(currentOutput: string, marker: string, isClosing: boolean = false): FormatResult {
    // For closing markers, just use the standard formatting
    if (isClosing) {
      return this.formatMarker(currentOutput, marker, { isClosing });
    }

    // Check if this marker should be treated as a milestone
    // This includes both registered milestones and inferred milestones
    let markerType = this.markerRegistry.getMarkerInfo(marker, 'type');

    // If not registered, infer the type
    if (!markerType) {
      markerType = this.inferMarkerType(marker, currentOutput);

      // Register the inferred marker
      if (markerType) {
        const markerInfo = { type: markerType };
        try {
          this.markerRegistry.addMarker(marker, markerInfo);
          // Track this as an inferred marker for user reference
          this.inferredMarkers[marker] = markerInfo;
        } catch {
          // Ignore errors if marker already exists
        }
      }
    }

    // If it's a milestone, automatically use milestone formatting
    if (markerType === 'milestone') {
      return this.addMilestone(currentOutput, marker);
    }

    // Otherwise, use standard marker formatting
    return this.formatMarker(currentOutput, marker, { isClosing });
  }

  /**
   * Adds a milestone marker to the current USFM string with proper formatting
   * Milestone markers are self-closing and use the syntax: \marker\* or \marker |attr="value"\*
   *
   * @param currentOutput - The current USFM string being built
   * @param marker - The milestone marker name (without backslash or asterisk)
   * @param attributes - Optional attributes to add to the milestone
   * @returns FormatResult with the milestone marker properly formatted
   *
   * @example
   * // Without attributes
   * formatter.addMilestone('text', 'zaln-s');
   * // Result: "text\\zaln-s\\*"
   *
   * // With attributes
   * formatter.addMilestone('text', 'zaln-s', { who: 'Jesus' });
   * // Result: "text\\zaln-s |who=\"Jesus\"\\*"
   */
  addMilestone(
    currentOutput: string,
    marker: string,
    attributes?: Record<string, string>
  ): FormatResult {
    // First, ensure the marker is registered as a milestone type
    const markerType = this.markerRegistry.getMarkerInfo(marker, 'type');
    if (!markerType) {
      // Unknown marker - register it as a milestone since we're in addMilestone context
      const markerInfo = { type: 'milestone' as const };
      try {
        this.markerRegistry.addMarker(marker, markerInfo);
      } catch {
        // Ignore errors if marker already exists (might have been registered by addMarker)
      }
      // Always track as inferred marker for user reference, regardless of registration outcome
      this.inferredMarkers[marker] = markerInfo;
    }

    // For milestones, we handle whitespace differently - no surrounding spaces by default
    // Only add newline if marker is specifically configured in markersOnNewLine
    let result = currentOutput;

    // Check if this milestone should be on a new line
    const shouldBeOnNewLine = this.options.markersOnNewLine.includes(marker);

    if (shouldBeOnNewLine) {
      // Add newline before milestone if configured
      if (result.length > 0 && !result.endsWith('\n')) {
        result += '\n';
      }
    }
    // Otherwise, no spacing is added - milestones attach directly to preceding content

    // Add the milestone marker (no trailing space)
    result += `\\${marker}`;

    // If there are attributes, add them with proper USFM spacing
    if (attributes && Object.keys(attributes).length > 0) {
      const attrStr = Object.entries(attributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      result += ` |${attrStr}`;
    }

    // Add the self-closing \*
    result += '\\*';

    return { normalizedOutput: result };
  }
}
