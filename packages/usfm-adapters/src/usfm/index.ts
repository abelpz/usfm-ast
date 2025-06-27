import {
  noteContentMarkers,
  USFMMarkerRegistry,
  CharacterUSFMNode,
  MilestoneUSFMNode,
  ParagraphUSFMNode,
  TextUSFMNode,
} from '@usfm-tools/parser';
import {
  USFMFormattingRule,
  ExceptionContext,
  FormattingFunction,
  FormatResult,
  MarkerType,
  MarkerTypeEnum,
} from '@usfm-tools/types';
import {
  BaseUSFMVisitor,
  ParagraphUSFMNode as ParagraphUSFMNodeInterface,
  CharacterUSFMNode as CharacterUSFMNodeInterface,
  NoteUSFMNode as NoteUSFMNodeInterface,
  TextUSFMNode as TextUSFMNodeInterface,
  MilestoneUSFMNode as MilestoneUSFMNodeInterface,
} from '@usfm-tools/types';
import { USFMParser } from '@usfm-tools/parser';
import { USFMFormatter, USFMFormatterOptions } from '@usfm-tools/formatter';

// Re-export for convenience
export type { FormatResult, FormattingFunction } from '@usfm-tools/types';

export interface USFMVisitorOptions {
  /** Custom formatting function to apply during conversion */
  formatter?: FormattingFunction;
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
  /** Formatter function for applying rules */
  private formatter: FormattingFunction;
  /** Marker registry for getting marker information */
  private markerRegistry: USFMMarkerRegistry;
  /** Visitor options */
  private options: USFMVisitorOptions;
  /** Track if we're at document start */
  private isDocumentStart: boolean = true;
  /** Track if we're at content start */
  private isContentStart: boolean = true;
  /** Track previous node for context */
  private previousNode: any = null;

  // Index signature to satisfy BaseUSFMVisitor<string>
  [key: string]: any;

  constructor(options: USFMVisitorOptions = {}) {
    this.options = {
      isDocumentStart: true,
      normalizeLineEndings: true,
      preserveWhitespace: false,
      ...options,
    };

    // Use provided formatter or create a default simple one
    this.formatter = options.formatter || this.createDefaultFormatter();
    this.markerRegistry = USFMMarkerRegistry.getInstance();
    this.isDocumentStart = this.options.isDocumentStart ?? true;
  }

  /**
   * Creates a default formatter that uses the new simplified USFM formatter
   */
  private createDefaultFormatter(): FormattingFunction {
    const formatter = new USFMFormatter();

    return {
      formatMarker: (marker, markerType, nextMarker, context, isDocumentStart) => {
        const formatResult = formatter.formatMarker(marker, markerType, {
          isDocumentStart,
          previousMarker: context as any,
          hasContent: true, // We assume markers have content unless proven otherwise
        });

        return formatResult;
      },
      formatParagraphWithContext: (marker, nextMarker, nextMarkerType, isDocumentStart) => {
        const formatResult = formatter.formatMarker(marker, 'paragraph', {
          isDocumentStart,
          hasContent: true,
        });

        return formatResult;
      },
      formatVerseWithContext: (context?: string) => {
        const formatResult = formatter.formatMarker('v', 'character', {
          hasContent: true,
        });

        return formatResult;
      },
      formatMarkerWithContext: (marker, markerType, context) => {
        const formatResult = formatter.formatMarker(marker, markerType, {
          isDocumentStart: context?.isDocumentStart,
          previousMarker: context?.previousMarker,
          hasContent: context?.hasContent,
        });

        return formatResult;
      },
    };
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
  visitParagraph(node: ParagraphUSFMNodeInterface): string {
    const marker = node.marker;
    const markerInfo = this.markerRegistry.getMarkerInfo(marker);
    const markerType: MarkerType = MarkerTypeEnum.PARAGRAPH;

    // Determine context for formatting
    const nextNode = this.peekNextNode(node);
    const context = this.determineContext(node, nextNode);

    // Capture document start state before updating it
    const isCurrentDocumentStart = this.isDocumentStart;

    // Get formatting rules for this marker
    const formatting = this.formatter.formatParagraphWithContext(
      marker,
      nextNode?.marker,
      this.getMarkerType(nextNode),
      isCurrentDocumentStart
    );

    // Apply whitespace before marker
    if (!this.options.preserveWhitespace) {
      this.addWhitespace(formatting.before);
    }

    // Add the marker
    this.addContent(`\\${marker}`);

    // Apply whitespace after marker based on formatting rules
    if (!this.options.preserveWhitespace) {
      // Only apply the formatting.after if it's explicitly defined, even if empty string
      if (formatting.after !== undefined) {
        this.addWhitespace(formatting.after);
      }
    }
    // When preserveWhitespace is true, don't add any spacing - let the text content handle its own spacing

    // Visit all child nodes
    if (Array.isArray(node.content)) {
      node.content.forEach((child) => {
        if (child && typeof child === 'object' && 'accept' in child) {
          child.accept(this);
        }
      });
    }

    // Update state: isDocumentStart becomes false after ANY first node
    this.isDocumentStart = false;

    // Determine if this is a content paragraph vs metadata/structural paragraph
    const markerRole = markerInfo?.role;
    const isStructuralMarker = markerRole === 'break' || this.isMetadataMarker(marker);

    // isContentStart becomes false only after actual content paragraphs
    // Metadata and structural markers don't affect the content start context
    if (!isStructuralMarker) {
      this.isContentStart = false;
    }

    this.previousNode = node;
    return '';
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
  visitCharacter(node: CharacterUSFMNodeInterface): string {
    const marker = node.marker;
    const isVerse = marker === 'v';
    const nestedChar = node.getParent()?.type === 'character' ? '+' : '';
    const isNoteContent = noteContentMarkers.has(marker);
    const markerType: MarkerType = MarkerTypeEnum.CHARACTER;

    // Build proper context object for formatting rules
    const context = this.buildFormattingContext(node);

    // Capture document start state before updating it
    const isCurrentDocumentStart = this.isDocumentStart;

    // Get formatting rules - use context-aware method if available, otherwise fallback to basic method
    const formatting = this.formatter.formatMarkerWithContext
      ? this.formatter.formatMarkerWithContext(marker, markerType, {
          ...context,
          isDocumentStart: isCurrentDocumentStart,
        })
      : this.formatter.formatMarker(
          marker,
          markerType,
          undefined,
          undefined, // Let the formatter determine the appropriate context
          isCurrentDocumentStart // Character markers use absolute document start
        );

    // Apply whitespace before marker only if not preserving whitespace
    if (!this.options.preserveWhitespace) {
      this.addWhitespace(formatting.before);
    }

    // Add opening marker
    this.result.push(`\\${nestedChar}${marker}`);

    // Determine if marker has actual text content
    const hasContent =
      Array.isArray(node.content) &&
      node.content.some(
        (child) =>
          child.type === 'text' &&
          typeof child.content === 'string' &&
          child.content.trim().length > 0
      );

    // Apply whitespace after marker based on formatting rules and content
    if (!this.options.preserveWhitespace) {
      // Only apply the formatting.after if it's explicitly defined AND has content, even if empty string
      if (formatting.after !== undefined && hasContent) {
        this.addWhitespace(formatting.after);
      }
    }
    // When preserveWhitespace is true, don't add any spacing - let the text content handle its own spacing

    // Apply beforeContent whitespace if specified and has content
    if (formatting.beforeContent && hasContent) {
      this.addWhitespace(formatting.beforeContent);
    }

    // Process child nodes
    if (Array.isArray(node.content)) {
      node.content.forEach((child) => {
        if (child && typeof child === 'object' && 'accept' in child) {
          child.accept(this);
        }
      });
    }

    // Apply afterContent whitespace if specified and has content
    if (formatting.afterContent && hasContent) {
      this.addWhitespace(formatting.afterContent);
    }

    // Handle attributes if present
    if (node.attributes) {
      const attributes = Object.entries(node.attributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      this.addContent(`|${attributes}`);
    }

    // Add appropriate closing based on marker type
    if (isVerse) {
      // Verse markers don't have closing tags, just extra space
      if (!this.options.preserveWhitespace) {
        this.addWhitespace(' ');
      }
    } else if (!isNoteContent) {
      this.addContent(`\\${nestedChar}${marker}*`); // Regular closing marker
    }

    // Character markers affect document start status
    this.isDocumentStart = false;
    this.previousNode = node;
    return '';
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
  visitNote(node: NoteUSFMNodeInterface): string {
    const marker = node.marker!;
    const markerType: MarkerType = MarkerTypeEnum.NOTE;

    // Capture document start state before updating it
    const isCurrentDocumentStart = this.isDocumentStart;

    // Get formatting rules - note markers use absolute document start
    const formatting = this.formatter.formatMarker(
      marker,
      markerType,
      undefined,
      undefined, // Let the formatter determine the appropriate context
      isCurrentDocumentStart // Note markers use absolute document start
    );

    // Apply whitespace before marker
    if (!this.options.preserveWhitespace) {
      this.addWhitespace(formatting.before);
    }

    // Add opening marker
    this.addContent(`\\${marker}`);

    // Add caller if present
    if (node.caller) {
      this.addContent(` ${node.caller}`);
    }

    // Apply whitespace after marker
    if (!this.options.preserveWhitespace) {
      this.addWhitespace(formatting.after);
    }
    // When preserveWhitespace is true, don't add any spacing - let the text content handle its own spacing

    // Apply beforeContent whitespace if specified
    const hasContent = Array.isArray(node.content) && node.content.length > 0;
    if (formatting.beforeContent && hasContent) {
      this.addWhitespace(formatting.beforeContent);
    }

    // Visit child nodes
    if (Array.isArray(node.content)) {
      node.content.forEach((child) => {
        if (child && typeof child === 'object' && 'accept' in child) {
          child.accept(this);
        }
      });
    }

    // Apply afterContent whitespace if specified
    if (formatting.afterContent && hasContent) {
      this.addWhitespace(formatting.afterContent);
    }

    // Add closing marker
    this.addContent(`\\${marker}*`);

    // Note markers affect document start status
    this.isDocumentStart = false;
    this.previousNode = node;
    return '';
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
  visitMilestone(node: MilestoneUSFMNodeInterface): string {
    const marker = node.marker;
    const markerType: MarkerType = MarkerTypeEnum.MILESTONE;

    // Capture document start state before updating it
    const isCurrentDocumentStart = this.isDocumentStart;

    // Get formatting rules - milestone markers use absolute document start
    const formatting = this.formatter.formatMarker(
      marker,
      markerType,
      undefined,
      undefined,
      isCurrentDocumentStart // Milestone markers use absolute document start
    );

    // Apply whitespace before marker
    if (!this.options.preserveWhitespace) {
      this.addWhitespace(formatting.before);
    }

    // Add marker
    this.addContent(`\\${marker}`);

    // Add attributes if present
    if (node.attributes) {
      const attributes = Object.entries(node.attributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      this.addContent(` |${attributes}`);
    }

    // Add closing
    this.addContent('\\*');

    // Milestone markers affect document start status
    this.isDocumentStart = false;
    this.previousNode = node;
    return '';
  }

  /**
   * Visits a text node and converts it to USFM format.
   * Text nodes represent plain text content.
   *
   * @param node The text node to visit
   */
  visitText(node: TextUSFMNodeInterface): string {
    let content = typeof node.content === 'string' ? node.content : '';

    // Apply normalization based on preserveWhitespace option
    if (!this.options.preserveWhitespace) {
      // Only normalize excessive internal whitespace (3+ consecutive spaces/tabs)
      content = content.replace(/[ \t]{3,}/g, ' ');
      // Don't trim - all whitespace in text nodes is significant
    }
    // When preserveWhitespace is true, keep content exactly as is

    this.addContent(content);
    this.previousNode = node;
    return '';
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

    // Apply whitespace cleanup based on preserveWhitespace option
    if (!this.options.preserveWhitespace) {
      // Conservative whitespace cleanup - preserve significant whitespace
      result = result
        // Remove trailing whitespace before newlines
        .replace(/[ \t]+\n/g, '\n')
        // Only remove excessive spaces (3 or more consecutive spaces)
        .replace(/([^\n]) {3,}/g, '$1 ')
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
    } else {
      // When preserving whitespace, only apply minimal cleanup
      if (this.options.normalizeLineEndings) {
        result = result.replace(/\r\n|\r/g, '\n');
      }
      // Don't trim anything when preserving whitespace - keep it exactly as is
    }

    return result;
  }

  /**
   * Resets the visitor state for reuse
   */
  reset(): void {
    this.result = [];
    this.isDocumentStart = this.options.isDocumentStart ?? true;
    this.isContentStart = true;
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
    // Use absolute document start for general context determination
    if (this.isDocumentStart) return 'document-start';
    if (this.previousNode?.type === 'paragraph') return 'after-paragraph-text';
    if (nextNode?.marker === 'v') return 'paragraph-with-verse';
    return undefined;
  }

  private determineCharacterContext(
    node: CharacterUSFMNodeInterface
  ): ExceptionContext | undefined {
    const parent = node.getParent();
    if (parent?.type === 'note') return 'within-note';
    if (this.previousNode?.type === 'text') return 'after-paragraph-text';
    return undefined;
  }

  /**
   * Builds a proper context object for formatting rules
   */
  private buildFormattingContext(node: any): any {
    const context: any = {
      isDocumentStart: this.isDocumentStart,
    };

    // For verse markers, the previousMarker should be the containing paragraph
    if (node.marker === 'v') {
      const parent = node.getParent();
      if (parent && parent.marker) {
        context.previousMarker = parent.marker;
      }
    } else {
      // For other markers, find the previous marker by traversing up the parent chain and siblings
      if (this.previousNode) {
        if (this.previousNode.marker) {
          context.previousMarker = this.previousNode.marker;
        } else if (this.previousNode.type === 'text') {
          // If the previous node was text, look for the containing paragraph
          const parent = node.getParent();
          if (parent && parent.marker) {
            context.previousMarker = parent.marker;
          }
        }
      }

      // If we don't have a previousMarker from previousNode, check the parent
      if (!context.previousMarker) {
        const parent = node.getParent();
        if (parent && parent.marker) {
          context.previousMarker = parent.marker;
        }
      }
    }

    return context;
  }

  private getMarkerType(node: any): MarkerType | undefined {
    if (!node) return undefined;

    switch (node.type) {
      case 'paragraph':
        return MarkerTypeEnum.PARAGRAPH;
      case 'character':
        return MarkerTypeEnum.CHARACTER;
      case 'note':
        return MarkerTypeEnum.NOTE;
      case 'milestone':
        return MarkerTypeEnum.MILESTONE;
      default:
        return undefined;
    }
  }

  private getMarkerTypeString(node: any): string | undefined {
    const markerType = this.getMarkerType(node);
    return this.markerTypeToString(markerType);
  }

  private markerTypeToString(markerType?: MarkerType): string {
    if (!markerType) return 'unknown';

    switch (markerType) {
      case MarkerTypeEnum.PARAGRAPH:
        return 'paragraph';
      case MarkerTypeEnum.CHARACTER:
        return 'character';
      case MarkerTypeEnum.NOTE:
        return 'note';
      case MarkerTypeEnum.MILESTONE:
        return 'milestone';
      default:
        return 'unknown';
    }
  }

  private shouldTrimText(node: TextUSFMNodeInterface): boolean {
    // Never trim text content - the AST already contains only significant whitespace
    return false;
  }

  private isNestedCharacter(node: CharacterUSFMNodeInterface): boolean {
    const parent = node.getParent();
    // Only character markers inside other character markers are considered nested
    // Character markers inside notes are NOT nested
    return parent?.type === 'character';
  }

  /**
   * Determines if a marker is a metadata/header marker that doesn't affect content flow
   */
  private isMetadataMarker(marker: string): boolean {
    // Common USFM metadata and title markers that appear before content
    const metadataMarkers = [
      'id',
      'ide',
      'rem',
      'usfm',
      'sts', // File identification and system
      'h',
      'h1',
      'h2',
      'h3', // Running headers
      'toc1',
      'toc2',
      'toc3',
      'toca1',
      'toca2',
      'toca3', // Table of contents
      'mt',
      'mt1',
      'mt2',
      'mt3',
      'mt4', // Main titles
      'mte',
      'mte1',
      'mte2', // Ending titles
      'is',
      'is1',
      'is2', // Introduction sections
      'imt',
      'imt1',
      'imt2',
      'imt3',
      'imt4', // Introduction titles
    ];
    return metadataMarkers.includes(marker);
  }
}
