import { noteContentMarkers } from '../../constants/defaultMarkers';
import { BaseUSFMVisitor, NoteNode } from '../../interfaces/USFMNodes';
import { CharacterUSFMNode, MilestoneUSFMNode, ParagraphUSFMNode, TextUSFMNode } from '../../nodes';
import {
  USFMFormatter,
  USFMFormattingRule,
  coreUSFMFormattingRules,
  MarkerType,
  ExceptionContext,
} from '../../handlers/USFMFormattingRules';
import { USFMMarkerRegistry } from '../../constants/USMMarkersRegistry';

export interface USFMVisitorOptions {
  /** Custom formatting rules to apply during conversion */
  formattingRules?: USFMFormattingRule[];
  /** Whether this is the start of the document */
  isDocumentStart?: boolean;
  /** Whether to normalize line endings */
  normalizeLineEndings?: boolean;
  /** Whether to preserve existing whitespace */
  preserveWhitespace?: boolean;
}

/**
 * USFMVisitor implements the visitor pattern to convert USFM AST nodes back into USFM text.
 * Each visit method handles a specific type of node and returns the USFM string representation.
 * This visitor can accept formatting rules to control the output formatting.
 */
export class USFMVisitor implements BaseUSFMVisitor<string> {
  /** Accumulates the USFM text parts during traversal */
  private result: string[] = [];
  /** Formatter instance for applying rules */
  private formatter: USFMFormatter;
  /** Marker registry for getting marker information */
  private markerRegistry: USFMMarkerRegistry;
  /** Visitor options */
  private options: USFMVisitorOptions;
  /** Track if we're at document start */
  private isDocumentStart: boolean = true;
  /** Track previous node for context */
  private previousNode: any = null;

  constructor(options: USFMVisitorOptions = {}) {
    this.options = {
      formattingRules: coreUSFMFormattingRules,
      isDocumentStart: true,
      normalizeLineEndings: true,
      preserveWhitespace: false,
      ...options,
    };

    this.formatter = new USFMFormatter(this.options.formattingRules);
    this.markerRegistry = USFMMarkerRegistry.getInstance();
    this.isDocumentStart = this.options.isDocumentStart ?? true;
  }

  /**
   * Smart whitespace addition that avoids double spaces and handles newlines properly
   */
  private addWhitespace(whitespace: string): void {
    if (!whitespace) return;

    const lastPart = this.result[this.result.length - 1] || '';
    const lastChar = lastPart.slice(-1);
    const firstChar = whitespace[0];

    // Handle newlines
    if (firstChar === '\n') {
      // Remove trailing whitespace before newline
      if (lastChar === ' ' || lastChar === '\t') {
        this.result[this.result.length - 1] = lastPart.trimEnd();
      }
      this.result.push(whitespace);
      return;
    }

    // Handle spaces
    if (firstChar === ' ') {
      // Don't add space if:
      // 1. Already have whitespace at the end
      // 2. At the beginning of result
      // 3. After a newline
      if (lastChar === ' ' || lastChar === '\t' || lastChar === '\n' || this.result.length === 0) {
        return;
      }
    }

    this.result.push(whitespace);
  }

  /**
   * Add content to result, handling whitespace intelligently
   */
  private addContent(content: string): void {
    if (!content) return;
    this.result.push(content);
  }

  /**
   * Visits a paragraph node and converts it to USFM format.
   * Applies formatting rules for proper whitespace before and after the marker.
   *
   * @example
   * \p This is a paragraph
   *
   * @param node The paragraph node to visit
   */
  visitParagraph(node: ParagraphUSFMNode): string {
    const marker = node.marker;
    const markerInfo = this.markerRegistry.getMarkerInfo(marker);
    const markerType: MarkerType = 'paragraph';

    // Determine context for formatting
    const nextNode = this.peekNextNode(node);
    const context = this.determineContext(node, nextNode);

    // Get formatting rules for this marker
    const formatting = this.formatter.formatParagraphWithContext(
      marker,
      nextNode?.marker,
      this.getMarkerType(nextNode),
      this.isDocumentStart
    );

    // Apply whitespace before marker
    if (!this.options.preserveWhitespace) {
      this.addWhitespace(formatting.before);
    }

    // Add the marker
    this.addContent(`\\${marker}`);

    // Apply whitespace after marker
    if (!this.options.preserveWhitespace) {
      this.addWhitespace(formatting.after);
    } else if (node.content.length > 0) {
      // Default space if preserving whitespace but has content
      this.addWhitespace(' ');
    }

    // Visit all child nodes
    node.content.forEach((child) => child.accept(this));

    this.isDocumentStart = false;
    this.previousNode = node;
    return this.result.join('');
  }

  /**
   * Visits a character node and converts it to USFM format.
   * Applies formatting rules for character markers, verses, and note content.
   *
   * @example
   * \w word\w*          // Regular character marker
   * \v 1               // Verse marker
   * \+w nested\+w*     // Nested character marker
   * \ft note           // Note content marker
   *
   * @param node The character node to visit
   */
  visitCharacter(node: CharacterUSFMNode): string {
    const marker = node.marker;
    const isVerse = marker === 'v';
    const nestedChar = node.getParent()?.type === 'character' ? '+' : '';
    const isNoteContent = noteContentMarkers.has(marker);
    const markerType: MarkerType = 'character';

    // Determine context
    const context = this.determineCharacterContext(node);

    // Get formatting rules
    const formatting = this.formatter.formatMarker(
      marker,
      markerType,
      undefined,
      context,
      this.isDocumentStart
    );

    // Apply whitespace before marker
    if (!this.options.preserveWhitespace) {
      this.result.push(formatting.before);
    }

    // Add opening marker
    this.result.push(`\\${nestedChar}${marker}`);

    // Apply whitespace after marker
    if (!this.options.preserveWhitespace) {
      this.result.push(formatting.after);
    } else {
      this.result.push(' '); // Default space
    }

    // Process child nodes
    node.content.forEach((child) => child.accept(this));

    // Handle attributes if present
    if (node.attributes) {
      const attributes = Object.entries(node.attributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      this.result.push(`|${attributes}`);
    }

    // Add appropriate closing based on marker type
    if (isVerse) {
      // Verse markers don't have closing tags, just extra space
      if (!this.options.preserveWhitespace) {
        this.result.push(' ');
      }
    } else if (!isNoteContent) {
      this.result.push(`\\${nestedChar}${marker}*`); // Regular closing marker
    }

    this.previousNode = node;
    return this.result.join('');
  }

  /**
   * Visits a note node and converts it to USFM format.
   * Applies formatting rules for note markers.
   *
   * @example
   * \f + footnote content\f*
   *
   * @param node The note node to visit
   */
  visitNote(node: NoteNode): string {
    const marker = node.marker;
    const markerType: MarkerType = 'note';

    // Get formatting rules
    const formatting = this.formatter.formatMarker(
      marker,
      markerType,
      undefined,
      'within-note',
      this.isDocumentStart
    );

    // Apply whitespace before marker
    if (!this.options.preserveWhitespace) {
      this.result.push(formatting.before);
    }

    // Add opening marker
    this.result.push(`\\${marker}`);

    // Add caller if present
    if (node.caller) {
      this.result.push(` ${node.caller}`);
    }

    // Apply whitespace after marker
    if (!this.options.preserveWhitespace) {
      this.result.push(formatting.after);
    } else {
      this.result.push(' ');
    }

    // Visit child nodes
    node.content.forEach((child) => child.accept(this));

    // Add closing marker
    this.result.push(`\\${marker}*`);

    this.previousNode = node;
    return this.result.join('');
  }

  /**
   * Visits a milestone node and converts it to USFM format.
   * Applies formatting rules for milestone markers.
   *
   * @example
   * \qt-s |sid="qt_123"\*
   *
   * @param node The milestone node to visit
   */
  visitMilestone(node: MilestoneUSFMNode): string {
    const marker = node.marker;
    const markerType: MarkerType = 'milestone';

    // Get formatting rules
    const formatting = this.formatter.formatMarker(
      marker,
      markerType,
      undefined,
      undefined,
      this.isDocumentStart
    );

    // Apply whitespace before marker
    if (!this.options.preserveWhitespace) {
      this.result.push(formatting.before);
    }

    // Add marker
    this.result.push(`\\${marker}`);

    // Add attributes if present
    if (node.attributes) {
      const attributes = Object.entries(node.attributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      this.result.push(` |${attributes}`);
    }

    // Add closing
    this.result.push('\\*');

    this.previousNode = node;
    return this.result.join('');
  }

  /**
   * Visits a text node and converts it to USFM format.
   * Text nodes represent plain text content.
   *
   * @param node The text node to visit
   */
  visitText(node: TextUSFMNode): string {
    let content = node.content;

    // Apply content formatting rules if not preserving whitespace
    if (!this.options.preserveWhitespace) {
      // Normalize internal whitespace
      content = content.replace(/\s+/g, ' ');
      // Trim leading/trailing whitespace if appropriate
      if (this.shouldTrimText(node)) {
        content = content.trim();
      }
    }

    this.result.push(content);
    this.previousNode = node;
    return this.result.join('');
  }

  /**
   * Returns the complete USFM string after visiting all nodes.
   * Applies final normalization if requested.
   */
  getResult(): string {
    let result = this.result.join('');

    // Apply final normalization
    if (this.options.normalizeLineEndings) {
      result = result.replace(/\r\n|\r/g, '\n');
    }

    // Comprehensive whitespace cleanup
    result = result
      // Remove trailing whitespace before newlines
      .replace(/[ \t]+\n/g, '\n')
      // Remove double spaces (but preserve intentional multiple spaces in text content)
      .replace(/([^\n]) {2,}/g, '$1 ')
      // Remove spaces at the end of lines (before newlines)
      .replace(/ +$/gm, '')
      // Remove spaces at the beginning of lines (after newlines), except for intentional indentation
      .replace(/\n +/g, '\n')
      // Collapse multiple newlines to maximum of 2
      .replace(/\n{3,}/g, '\n\n')
      // Remove any trailing whitespace from the document
      .trimEnd();

    // Ensure document doesn't start with whitespace
    result = result.trimStart();

    return result;
  }

  /**
   * Resets the visitor state for reuse
   */
  reset(): void {
    this.result = [];
    this.isDocumentStart = this.options.isDocumentStart ?? true;
    this.previousNode = null;
  }

  // Helper methods

  private peekNextNode(currentNode: any): any {
    const parent = currentNode.getParent();
    if (!parent) return null;

    const siblings = parent.content || [];
    const currentIndex = siblings.indexOf(currentNode);
    return currentIndex >= 0 && currentIndex < siblings.length - 1
      ? siblings[currentIndex + 1]
      : null;
  }

  private determineContext(node: any, nextNode: any): ExceptionContext | undefined {
    if (this.isDocumentStart) return 'document-start';
    if (this.previousNode?.type === 'paragraph') return 'after-paragraph-text';
    if (nextNode?.marker === 'v') return 'paragraph-with-verse';
    return undefined;
  }

  private determineCharacterContext(node: CharacterUSFMNode): ExceptionContext | undefined {
    const parent = node.getParent();
    if (parent?.type === 'note') return 'within-note';
    if (this.previousNode?.type === 'text') return 'after-paragraph-text';
    return undefined;
  }

  private getMarkerType(node: any): MarkerType | undefined {
    if (!node) return undefined;

    switch (node.type) {
      case 'paragraph':
        return 'paragraph';
      case 'character':
        return 'character';
      case 'note':
        return 'note';
      case 'milestone':
        return 'milestone';
      default:
        return undefined;
    }
  }

  private shouldTrimText(node: TextUSFMNode): boolean {
    const parent = node.getParent();
    // Don't trim text in character markers or notes
    return parent?.type === 'paragraph';
  }
}
