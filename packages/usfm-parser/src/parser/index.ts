// Types for USFM AST nodes
import {
  USFMNode,
  HydratedUSFMNode,
  RootNode,
  ParagraphNode,
  CharacterNode,
  NoteNode,
  TextNode,
  MilestoneNode,
  MilestoneAttributes,
  isParagraphNode,
  isCharacterNode,
  isTextNode,
  isNoteNode,
  isMilestoneNode,
  USFMNodeType,
  BaseUSFMVisitor,
  USFMVisitorWithContext,
  EnhancedUSJNode,
} from '@usfm-tools/types';
import {
  CharacterUSFMNode,
  MilestoneUSFMNode,
  NodeInstanceType,
  NoteUSFMNode,
  ParagraphUSFMNode,
  TextUSFMNode,
  USFMNodeUnion,
} from '../nodes';
import { USFMMarkerRegistry, USFMMarkerInfo, USFMParserOptions } from '../constants';
import { MarkerType, MarkerTypeEnum } from '@usfm-tools/types';

import {
  ParsedRootNode,
  ParsedBookNode,
  ParsedChapterNode,
  ParsedParagraphNode,
  ParsedCharacterNode,
  ParsedVerseNode,
  ParsedNoteNode,
  ParsedMilestoneNode,
  ParsedTextNode,
  ParsedUSJNode,
  createParsedBook,
  createParsedChapter,
  createParsedParagraph,
  createParsedCharacter,
  createParsedVerse,
  createParsedNote,
  createParsedMilestone,
  createParsedText,
  createParsedSidebar,
  ParsedSidebarNode,
  ParsedRefNode,
  createParsedRef,
  ParsedTableNode,
  ParsedTableRowNode,
  ParsedTableCellNode,
  createParsedTable,
  createParsedTableRow,
  createParsedTableCell,
} from '../nodes/enhanced-usj-nodes';

/**
 * A parser for USFM (Unified Standard Format Markers) text.
 * This class provides functionality to parse USFM text into an AST (Abstract Syntax Tree).
 */
export class USFMParser {
  private pos: number = 0;
  private input: string = '';
  private rootNode: ParsedRootNode | null = null;
  private logs: Array<{ type: 'warn' | 'error'; message: string }> = [];
  private positionVisits: Map<number, number> = new Map();
  private readonly MAX_VISITS = 1000;
  private currentMethod: string = '';
  private readonly trackPositions: boolean;
  private readonly markerRegistry: USFMMarkerRegistry;
  private inferredMarkers: Record<string, USFMMarkerInfo> = {};

  // USJ version we support for version comparison
  private static readonly SUPPORTED_USJ_VERSION = '3.1';

  // Context tracking for sid generation
  private currentBookCode: string = '';
  private currentChapter: string = '';
  private currentVerse: string = '';

  /**
   * Creates a new instance of the USFMParser.
   * @param {USFMParserOptions} [options] - Configuration options for the parser
   * @param {Record<string, USFMMarkerInfo>} [options.customMarkers] - Custom USFM markers to be recognized by the parser
   * @param {boolean} [options.positionTracking] - Whether to track positions for infinite loop detection
   */
  constructor(options?: USFMParserOptions) {
    this.trackPositions = options?.positionTracking ?? process.env.NODE_ENV !== 'production';
    this.markerRegistry = USFMMarkerRegistry.getInstance(options?.customMarkers);
  }

  /**
   * Get all markers that were inferred during parsing
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
   * Check if any markers were inferred during parsing
   */
  hasInferredMarkers(): boolean {
    return Object.keys(this.inferredMarkers).length > 0;
  }

  /**
   * Parses the loaded USFM text into an AST.
   * @returns {USFMParser} The parser instance for method chaining
   */
  parse(input?: string): USFMParser {
    if (typeof input === 'string') {
      this.load(input);
    }
    this.setPosition(0);
    if (this.trackPositions) {
      this.positionVisits.clear();
    }

    // Reset context tracking for sid generation
    this.currentBookCode = '';
    this.currentChapter = '';
    this.currentVerse = '';

    this.currentMethod = 'parse';
    this.rootNode = this.parseNodes();
    return this;
  }

  /**
   * Loads USFM text into the parser.
   * @param {string} input - The USFM text to be parsed
   * @returns {USFMParser} The parser instance for method chaining
   */
  load(input: string): USFMParser {
    this.input = input;
    return this;
  }

  /**
   * Returns the parsed AST nodes.
   * @returns {EnhancedUSJNode[]} Array of parsed USFM nodes
   */
  getNodes(): EnhancedUSJNode[] {
    return this.rootNode?.content || [];
  }

  /**
   * Returns the root node containing all parsed content.
   * @returns {ParsedRootNode | null} The root node or null if not parsed
   */
  getRootNode(): ParsedRootNode | null {
    return this.rootNode;
  }

  /**
   * Exports the parsed content as plain USJ format.
   * @returns {any} Plain USJ object suitable for JSON serialization
   */
  toJSON(): any {
    return this.rootNode?.toJSON() || { type: 'USJ', version: '3.1', content: [] };
  }

  /**
   * Returns the current usfm input text.
   * @returns {string} The current USFM input text
   */
  getInput(): string {
    return this.input;
  }

  /**
   * Normalizes whitespace in the input text according to USFM rules.
   * @returns {USFMParser} The parser instance for method chaining
   */
  normalize(): USFMParser {
    this.input = this.normalizeWhitespace(this.input);
    return this;
  }

  /**
   * Returns the parser's warning and error logs.
   * @returns {Array<{type: 'warn' | 'error', message: string}>} Array of log entries
   */
  getLogs(): Array<{ type: 'warn' | 'error'; message: string }> {
    return this.logs;
  }

  /**
   * Clears all warning and error logs.
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Gets the styleType for a marker, with caching for performance
   * @private
   */
  private getMarkerStyleType(markerInfo: USFMMarkerInfo | undefined): string | undefined {
    return markerInfo?.styleType;
  }

  /**
   * Parses USFM nodes from the loaded usfm text.
   * @returns {ParsedRootNode} The root node containing all parsed content
   * @private
   */
  private parseNodes(): ParsedRootNode {
    const rootNode = new ParsedRootNode([]);

    while (this.pos < this.input.length) {
      this.movePosition(0, true, 'parseNodes'); // Check for infinite loop without moving
      const char = this.getCurrentCharacter();

      if (char === '\\') {
        const { marker, isNested, markerInfo } = this.parseMarker();

        // Skip empty markers (like milestone closing markers)
        if (!marker) {
          continue;
        }

        // Handle \usfm marker specially - extract version and compare with USJ version
        if (marker === 'usfm') {
          const versionContent = this.parseSpecialContent().trim();
          if (versionContent !== USFMParser.SUPPORTED_USJ_VERSION) {
            this.logWarning(
              `USFM version mismatch: found version ${versionContent}, but USJ output supports version ${USFMParser.SUPPORTED_USJ_VERSION}. ` +
                `This may cause compatibility issues.`
            );
          }
          // Skip creating a node for \usfm marker
          continue;
        }

        // Get styleType for efficient dispatch
        const styleType = this.getMarkerStyleType(markerInfo);

        switch (markerInfo?.type) {
          case MarkerTypeEnum.PARAGRAPH:
            // Use styleType-based dispatch instead of hardcoded marker comparisons
            if (styleType === 'book') {
              rootNode.content.push(this.parseBook(marker, rootNode.content.length));
            } else if (styleType === 'chapter') {
              const chapterNode = this.parseChapter(marker, rootNode.content.length);
              rootNode.content.push(chapterNode);
            } else if (styleType === 'table:row') {
              // Handle table parsing - parse consecutive \tr markers as a table
              rootNode.content.push(this.parseTable(rootNode.content.length));
            } else if (markerInfo.sectionContainer) {
              // Handle section containers like \esb
              rootNode.content.push(this.parseSection(marker, rootNode.content.length));
            } else if (markerInfo.closes) {
              // This is a closing marker like \esbe - skip it as it's handled by parseSection
              continue;
            } else if (markerInfo.role === 'break') {
              // Handle break markers that don't have content
              rootNode.content.push(this.parseBreakParagraph(marker, rootNode.content.length));
            } else {
              rootNode.content.push(this.parseEnhancedParagraph(marker, rootNode.content.length));
            }
            break;
          case MarkerTypeEnum.CHARACTER:
            if (styleType === 'verse') {
              rootNode.content.push(this.parseVerse(marker, rootNode.content.length));
            } else {
              rootNode.content.push(
                this.parseEnhancedCharacter(marker, isNested, rootNode.content.length)
              );
            }
            break;
          case MarkerTypeEnum.NOTE:
            rootNode.content.push(this.parseNote(marker, rootNode.content.length));
            break;
          case MarkerTypeEnum.MILESTONE:
            rootNode.content.push(this.parseEnhancedMilestone(marker, rootNode.content.length));
            break;
        }
      } else if (this.isWhitespace(char)) {
        this.advance(false);
      } else {
        const { context, pointer } = this.getContextAndPointer(this.pos);
        this.logWarning(
          `Unexpected character outside a paragraph: '${char}'\n` +
            `Context: ${context}\n` +
            `         ${pointer}`
        );
        rootNode.content.push(this.parseEnhancedText(false, rootNode.content.length));
      }
    }

    return rootNode;
  }

  private logWarning(message: string): void {
    this.logs.push({ type: 'warn', message });
    console.warn(message);
  }

  private logError(message: string): void {
    this.logs.push({ type: 'error', message });
    console.error(message);
  }

  private isLineBreakingWhitespace(char: string): boolean {
    return (
      char === '\n' || // Line Feed (LF)
      char === '\r' || // Carriage Return (CR)
      char === '\f' // Form Feed (page break)
    );
  }

  private isNonLineBreakingWhitespace(char: string): boolean {
    return (
      char === ' ' || // Space
      char === '\t' || // Tab
      char === '\v' || // Vertical Tab
      char === '\u00A0' // Non-breaking space
    );
  }

  private isWhitespace(char: string): boolean {
    return this.isLineBreakingWhitespace(char) || this.isNonLineBreakingWhitespace(char);
  }

  private isNewline(char: string): boolean {
    return this.isLineBreakingWhitespace(char);
  }

  /**
   * Intelligently handles newline normalization to avoid double spaces.
   * Normalizes content and skips whitespace after newlines to ensure exactly one space.
   * @param content - Current text content
   * @param currentPos - Current position in input
   * @param isInsideParagraph - Whether we're inside a paragraph context
   * @returns Object with normalized content and positions to skip
   */
  private normalizeNewlineToSpace(
    content: string,
    currentPos: number,
    isInsideParagraph: boolean = true
  ): { normalizedContent: string; skipToPos: number } {
    // Normalize any trailing whitespace in content to single space or remove it
    const trimmedContent = content.trimEnd();
    const hadTrailingWhitespace = content.length !== trimmedContent.length;

    // Skip over all whitespace characters after the newline
    let nextPos = currentPos + 1; // Start after the newline
    const hasWhitespaceAfter =
      nextPos < this.input.length && this.isNonLineBreakingWhitespace(this.input[nextPos]);

    while (nextPos < this.input.length && this.isNonLineBreakingWhitespace(this.input[nextPos])) {
      nextPos++;
    }

    // Check what comes after the whitespace
    const nextChar = nextPos < this.input.length ? this.input[nextPos] : '';
    const isFollowedByMarker = nextChar === '\\';
    const isFollowedByLineBreak = this.isLineBreakingWhitespace(nextChar);

    // Check if the next marker is a milestone
    let isFollowedByMilestone = false;
    if (isFollowedByMarker) {
      const nextMarker = this.peekNextMarker(this.input, nextPos + 1);
      if (nextMarker) {
        const nextMarkerInfo = this.markerRegistry.getMarkerInfo(nextMarker);
        isFollowedByMilestone = nextMarkerInfo?.type === MarkerTypeEnum.MILESTONE;
      }
    }

    // Determine the normalized content:
    // - Preserve space if there was explicit whitespace in the original input
    // - Add space for content separation unless followed by end of input
    let normalizedContent;
    if (trimmedContent.length === 0) {
      // Empty content - only add space if we're inside a paragraph and not followed by marker
      if (!isInsideParagraph || isFollowedByMarker) {
        normalizedContent = '';
      } else {
        normalizedContent = '';
      }
    } else if (nextChar === '') {
      // Text ends at end of input - preserve original trailing whitespace
      normalizedContent = hadTrailingWhitespace ? trimmedContent + ' ' : trimmedContent;
    } else if (isFollowedByMilestone && !isInsideParagraph) {
      // Don't add space before milestone markers at root level
      normalizedContent = trimmedContent;
    } else if (hadTrailingWhitespace || hasWhitespaceAfter) {
      // There was whitespace and we're followed by content (text or marker)
      normalizedContent = trimmedContent + ' ';
    } else if (isFollowedByLineBreak) {
      // Newline followed by another line break - no space needed
      normalizedContent = trimmedContent;
    } else {
      // Newline between content (including markers) with no explicit whitespace - add space
      normalizedContent = trimmedContent + ' ';
    }

    return {
      normalizedContent,
      skipToPos: nextPos, // Position after all whitespace
    };
  }

  private normalizeWhitespace(input: string): string {
    // First, normalize all line endings to LF
    const normalized = input.replace(/\r\n|\r|\n\n/g, `\n`).replace(/\s+/g, ' ');

    let result = '';
    let i = 0;
    let inWhitespace = false;
    let lastWasNewline = false;

    while (i < normalized.length) {
      const char = normalized[i];

      // Handle backslash markers
      if (char === '\\') {
        const marker = this.peekNextMarker(normalized, i + 1);

        // Skip empty markers to avoid registry errors
        if (!marker) {
          result += char;
          i++;
          lastWasNewline = false;
          inWhitespace = false;
          continue;
        }

        const markerType = this.markerRegistry.getMarkerType(marker);
        const markerInfo = this.markerRegistry.getMarkerInfo(marker);
        const styleType = this.getMarkerStyleType(markerInfo);

        // Handle whitespace before markers based on their structural role using styleType
        if (markerType === MarkerTypeEnum.PARAGRAPH) {
          // Paragraph markers should be preceded by a newline (unless at start)
          if (!lastWasNewline && result.length > 0) {
            result = result.trimEnd() + '\n';
          }

          // NEW RULE: Handle what comes after paragraph markers
          const nextMarkerInfo = this.peekNextMarkerAfterCurrent(normalized, i, marker);

          // If paragraph is followed by verse/chapter marker OR text content,
          // they should be on the same line with space separator
          if (
            nextMarkerInfo.hasContent &&
            (nextMarkerInfo.isText ||
              (nextMarkerInfo.marker &&
                nextMarkerInfo.markerType !== MarkerTypeEnum.PARAGRAPH &&
                nextMarkerInfo.marker !== 'v' &&
                nextMarkerInfo.marker !== 'c'))
          ) {
            // Will add space after marker below
          } else {
            // Otherwise, add newline after paragraph marker for structural separation
            // This handles cases like paragraph followed by another paragraph marker
          }
        } else if (styleType === 'verse') {
          // NEW RULE: Verse markers should be preceded by a newline unless prev char is already newline
          if (!lastWasNewline && result.length > 0) {
            result = result.trimEnd() + '\n';
          }
        } else if (styleType === 'chapter') {
          // Chapter markers should be preceded by a newline
          if (!lastWasNewline && result.length > 0) {
            result = result.trimEnd() + '\n';
          }
        } else if (markerType === MarkerTypeEnum.CHARACTER || markerType === MarkerTypeEnum.NOTE) {
          // Character and note markers should be preceded by a space (unless at start or after newline)
          const lastNonWhitespace = result.trimEnd();
          if (lastNonWhitespace.length > 0 && !lastWasNewline) {
            result = lastNonWhitespace + ' ';
          }
        }

        result += char;
        i++;
        lastWasNewline = false;
        inWhitespace = false;
        continue;
      }

      // Handle whitespace
      if (this.isWhitespace(char)) {
        if (this.isNewline(char)) {
          // Only add newline if we haven't already added one
          if (!lastWasNewline) {
            result += '\n';
          }
          lastWasNewline = true;
        } else if (!inWhitespace) {
          // Multiple non-newline whitespace normalized to single space
          result += ' ';
          lastWasNewline = false;
        }
        inWhitespace = true;
      } else {
        result += char;
        inWhitespace = false;
        lastWasNewline = false;
      }
      i++;
    }

    return result;
  }

  /**
   * Peeks ahead to see what comes after the current marker
   * @private
   */
  private peekNextMarkerAfterCurrent(
    input: string,
    currentPos: number,
    currentMarker: string
  ): {
    marker?: string;
    markerType?: string;
    isText: boolean;
    hasContent: boolean;
  } {
    // Skip past current marker and its backslash
    let i = currentPos + 1 + currentMarker.length;

    // Skip any immediate whitespace after marker
    while (i < input.length && this.isNonLineBreakingWhitespace(input[i])) {
      i++;
    }

    // If we hit end of input or line break, no immediate content
    if (i >= input.length || this.isLineBreakingWhitespace(input[i])) {
      return { isText: false, hasContent: false };
    }

    // Check if next non-whitespace is another marker
    if (input[i] === '\\') {
      const nextMarker = this.peekNextMarker(input, i + 1);
      if (nextMarker) {
        const nextMarkerType = this.markerRegistry.getMarkerType(nextMarker);
        return {
          marker: nextMarker,
          markerType: nextMarkerType,
          isText: false,
          hasContent: true,
        };
      }
    }

    // Otherwise, it's text content
    return { isText: true, hasContent: true };
  }

  // Helper method to peek ahead for next non-whitespace character
  private peekNextNonWhitespace(input: string, start: number): string {
    let i = start;
    while (i < input.length) {
      if (!this.isWhitespace(input[i])) {
        return input[i];
      }
      i++;
    }
    return '';
  }

  private peekNextMarker(input: string, start: number): string {
    let marker = '';
    let i = start;

    while (i < input.length) {
      const char = input[i];
      if (this.isWhitespace(char) || char === '\\') {
        break;
      }
      if (char === '+' || char === '*') {
        return '';
      }
      marker += char;
      i++;
    }

    return marker;
  }

  private preserveSignificantWhitespace() {
    // Keep exactly one space after markers
    if (this.pos < this.input.length && this.input[this.pos] === ' ') {
      this.advance(false);
    }
  }

  private movePosition(delta: number, trackVisits: boolean = false, method?: string): void {
    if (method) {
      this.currentMethod = method;
    }

    if (trackVisits && this.trackPositions) {
      const visits = this.positionVisits.get(this.pos) || 0;
      this.positionVisits.set(this.pos, visits + 1);

      if (visits > this.MAX_VISITS) {
        const { context, pointer } = this.getContextAndPointer(this.pos);
        throw new Error(
          `Potential infinite loop detected in ${this.currentMethod} at position ${this.pos}.\n` +
            `Context: ${context}\n` +
            `         ${pointer}`
        );
      }
    }

    this.pos += delta;
  }

  private advance(trackVisits: boolean = false): void {
    this.movePosition(1, trackVisits);
  }

  private retreat(trackVisits: boolean = false): void {
    this.movePosition(-1, trackVisits);
  }

  private setPosition(newPos: number, trackVisits: boolean = false): void {
    const delta = newPos - this.pos;
    this.movePosition(delta, trackVisits);
  }

  private getCurrentPosition(): number {
    return this.pos;
  }

  private restorePosition(savedPos: number, trackVisits: boolean = false): void {
    this.setPosition(savedPos, trackVisits);
  }

  /**
   * Parses a marker and returns the marker, whether it's nested, and the cleaned marker
   */
  private parseMarker(): {
    marker: string;
    isNested: boolean;
    cleanMarker: string;
    isClosingMarker: boolean;
    markerInfo: USFMMarkerInfo | undefined;
  } {
    this.advance(false); // Skip backslash, no need to track simple advances

    // Check for milestone closing marker \*
    if (this.pos < this.input.length && this.input[this.pos] === '*') {
      // This is a milestone closing marker, skip it and return empty marker
      this.advance(false);
      return {
        marker: '',
        isNested: false,
        cleanMarker: '',
        markerInfo: undefined,
        isClosingMarker: false,
      };
    }

    const isNested = this.pos < this.input.length && this.input[this.pos] === '+';
    if (isNested) {
      this.advance(false);
    }

    let marker = '';
    // Collect characters until whitespace or special characters
    while (this.pos < this.input.length) {
      const char = this.input[this.pos];
      if (this.isWhitespace(char) || char === '*' || char === '\\') {
        break;
      }
      marker += char;
      this.advance(true); // Track visits here as we're in a loop
    }

    const isClosingMarker = this.pos < this.input.length && this.input[this.pos] === '*';

    // Preserve significant whitespace after marker
    this.preserveSignificantWhitespace();

    let markerInfo = this.markerRegistry.getMarkerInfo(marker);

    if (!markerInfo && marker) {
      markerInfo = this.handleCustomMarker(marker);
    }

    return {
      marker,
      isNested,
      cleanMarker: this.cleanMarkerSuffix(marker),
      markerInfo,
      isClosingMarker,
    };
  }

  private handleCustomMarker(marker: string): USFMMarkerInfo | undefined {
    const markerType = this.determineCustomMarkerType(marker);
    let markerInfo: USFMMarkerInfo | undefined;

    switch (markerType) {
      case MarkerTypeEnum.CHARACTER:
        markerInfo = { type: 'character' };
        break;
      case MarkerTypeEnum.MILESTONE:
        markerInfo = { type: 'milestone' };
        break;
      case MarkerTypeEnum.PARAGRAPH:
        markerInfo = { type: 'paragraph' };
        break;
    }

    if (markerInfo) {
      this.markerRegistry.addMarker(marker, markerInfo);
      // Track this as an inferred marker for user reference
      this.inferredMarkers[marker] = markerInfo;
      this.logWarning(
        `Unsupported marker in USFM: '\\${marker}', inferred as ${markerType}, please add it to the customMarkers option parameter in the USFMParser constructor to stop seeing this warning`
      );
    }

    return markerInfo;
  }

  private getContextAndPointer(pos: number): { context: string; pointer: string } {
    const context = this.input.slice(Math.max(0, pos - 20), Math.min(this.input.length, pos + 20));
    const pointer = ' '.repeat(Math.min(20, pos)) + '^';
    return { context, pointer };
  }

  private determineCustomMarkerType(marker: string): MarkerType {
    //check if it's a milestone marker
    if (this.isMilestoneMarker(marker)) {
      return MarkerTypeEnum.MILESTONE;
    }

    //check if there's a line break before the marker
    const hasLineBreakBefore = this.checkForPrecedingLineBreak(marker);

    //if there's no line break before the marker then it's a character marker
    if (!hasLineBreakBefore) {
      return MarkerTypeEnum.CHARACTER;
    }

    // Default to paragraph marker
    return MarkerTypeEnum.PARAGRAPH;
  }

  private checkForPrecedingLineBreak(marker: string): boolean {
    const savedPos = this.getCurrentPosition();

    // Move position back past the marker and backslash
    this.pos -= marker.length + 2;

    while (this.pos > 0) {
      const prevChar = this.input[this.pos - 1];
      if (this.isLineBreakingWhitespace(prevChar)) {
        this.restorePosition(savedPos, false);
        return true;
      }
      if (!this.isNonLineBreakingWhitespace(prevChar)) {
        break;
      }
      this.retreat(false);
    }

    this.restorePosition(savedPos, false);
    return false;
  }

  private isMilestoneMarker(marker: string): boolean {
    // First check if marker is defined in registry as milestone
    const markerInfo = this.markerRegistry.getMarkerInfo(marker);
    if (markerInfo?.type === 'milestone') {
      return true;
    }

    // Check for -s/-e suffix (milestone start/end pattern)
    if (marker.endsWith('-s') || marker.endsWith('-e')) {
      return true;
    }

    // Check for self-closing marker pattern (\marker...\*)
    const savedPos = this.getCurrentPosition();
    let isSelfClosing = false;

    // Look ahead to see if we find \* pattern
    while (this.pos < this.input.length) {
      const char = this.input[this.pos];
      if (char === '\\' && this.pos + 1 < this.input.length && this.input[this.pos + 1] === '*') {
        isSelfClosing = true;
        break;
      }
      if (char === '\\' || this.isLineBreakingWhitespace(char)) {
        // Found another marker or line break, not self-closing
        break;
      }
      this.advance(false);
    }

    this.restorePosition(savedPos, false);
    return isSelfClosing;
  }

  /**
   * Checks if a marker is a table cell marker
   */
  private isTableCellMarker(marker: string): boolean {
    const markerInfo = this.markerRegistry.getMarkerInfo(marker);
    return this.getMarkerStyleType(markerInfo) === 'table:cell';
  }

  /**
   * Cleans the marker suffix to remove -s, -e, and trailing numbers
   */
  private cleanMarkerSuffix(marker: string): string {
    let cleanMarker = marker;

    // Handle dash-prefixed milestone markers
    if (cleanMarker.endsWith('-s') || cleanMarker.endsWith('-e')) {
      cleanMarker = cleanMarker.slice(0, -2);
    }

    if (cleanMarker.match(/\w\d$/)) {
      cleanMarker = cleanMarker.slice(0, -1);
    }

    return cleanMarker;
  }

  /**
   * Peek ahead for the next marker after current position that is only preceded by whitespace
   */
  private getFollowingMarker(): {
    marker: string;
    cleanMarker: string;
    markerInfo: USFMMarkerInfo | undefined;
  } {
    while (this.pos < this.input.length) {
      this.movePosition(0, true, 'getFollowingMarker'); // Check for infinite loop without moving
      const char = this.input[this.pos];
      if (this.isWhitespace(char)) {
        this.advance(false);
        continue;
      } else if (char === '\\') {
        //if it's a marker then return it
        const { marker, cleanMarker, markerInfo } = this.peekMarker();
        return { marker, cleanMarker, markerInfo };
      } else {
        //found regular text
        return { marker: '', cleanMarker: '', markerInfo: undefined };
      }
    }
    return { marker: '', cleanMarker: '', markerInfo: undefined };
  }

  private peekMarker(): {
    marker: string;
    cleanMarker: string;
    markerInfo: USFMMarkerInfo | undefined;
  } {
    const savedPos = this.getCurrentPosition();
    this.advance(false); // Skip backslash
    let marker = '';

    while (this.pos < this.input.length) {
      const char = this.input[this.pos];
      if (this.isWhitespace(char) || char === '*' || char === '\\') {
        break;
      }
      marker += char;
      this.advance(true); // Track visits in loop
    }

    this.restorePosition(savedPos, false);

    const markerInfo = this.markerRegistry.getMarkerInfo(marker);

    return { marker, cleanMarker: this.cleanMarkerSuffix(marker), markerInfo };
  }

  private getCurrentCharacter(): string {
    return this.input[this.pos];
  }

  private getNextCharacter(offset: number = 1): string {
    return this.input[this.pos + offset];
  }

  private getPreviousCharacter(offset: number = 1): string {
    return this.input[this.pos - offset];
  }

  private parseAttributes(currentMarker: string): Record<string, string> {
    this.advance(false); // Skip |
    const attributes: Record<string, string> = {};
    let currentAttr = '';
    let currentValue = '';
    let inValue = false;
    let inQuotes = false;

    // Skip any leading spaces
    while (this.pos < this.input.length && this.input[this.pos] === ' ') {
      this.advance(false);
    }

    // Look ahead to see if this is a default attribute case
    let isDefaultAttribute = true;
    let tempPos = this.pos;
    let hasEquals = false;
    while (tempPos < this.input.length) {
      const char = this.input[tempPos];
      if (char === '\\') break;
      if (char === '=') {
        hasEquals = true;
        isDefaultAttribute = false;
        break;
      }
      if (char === ' ' && !hasEquals) {
        // Found a space before any equals, must be default value
        break;
      }
      tempPos++;
    }

    // Handle default attribute case
    const markerInfo = this.markerRegistry.getMarkerInfo(currentMarker);
    const defaultAttr = markerInfo?.defaultAttribute;
    if (isDefaultAttribute && defaultAttr) {
      let defaultValue = '';
      while (this.pos < this.input.length) {
        const char = this.input[this.pos];
        if (char === '\\') {
          break;
        }
        defaultValue += char;
        this.advance(false);
      }

      if (defaultValue) {
        attributes[defaultAttr] = defaultValue.trim();
      }

      // Skip spaces after default value
      while (this.pos < this.input.length && this.input[this.pos] === ' ') {
        this.advance(false);
      }
    }

    // Handle explicit attributes
    while (this.pos < this.input.length) {
      this.movePosition(0, true, 'parseAttributes'); // Check for infinite loop without moving
      const char = this.input[this.pos];

      // Handle quotes
      if (char === '"') {
        inQuotes = !inQuotes;
        this.advance(false);
        continue;
      }

      // Only process special characters if we're not in quotes
      if (!inQuotes) {
        // Check for closing marker
        if (char === '\\') {
          if (currentAttr && currentValue) {
            attributes[currentAttr.trim()] = currentValue.trim().replace(/^"|"$/g, '');
          }
          break;
        }

        // Handle attribute-value separator
        if (char === '=') {
          inValue = true;
          this.advance(false);
          continue;
        }

        // Handle space between attributes
        if (char === ' ') {
          if (currentAttr && currentValue) {
            attributes[currentAttr.trim()] = currentValue.trim().replace(/^"|"$/g, '');
            currentAttr = '';
            currentValue = '';
            inValue = false;
          }
          this.advance(false);
          continue;
        }
      }

      // Add character to current attribute or value
      if (inValue) {
        // Normalize newlines to spaces in quoted attribute values
        if (inQuotes && this.isNewline(char)) {
          // Only add space if the last character isn't already a space
          if (
            currentValue.length === 0 ||
            !this.isWhitespace(currentValue[currentValue.length - 1])
          ) {
            currentValue += ' ';
          }
        } else {
          currentValue += char;
        }
      } else {
        currentAttr += char;
      }

      this.advance(false);
    }

    // Handle the last attribute-value pair
    if (currentAttr && currentValue) {
      attributes[currentAttr.trim()] = currentValue.trim().replace(/^"|"$/g, '');
    }

    return attributes;
  }

  // Add visitor methods to the parser
  visit<T>(visitor: BaseUSFMVisitor<T>): T[] {
    return this.getNodes().map((node) => node.accept(visitor));
  }

  visitWithContext<T, C>(visitor: USFMVisitorWithContext<T, C>, context: C): T[] {
    return this.getNodes().map((node) => node.acceptWithContext(visitor, context));
  }

  // Enhanced parsing methods for USJ nodes

  /**
   * Parses a book identifier marker (\id)
   */
  private parseBook(marker: string, index: number): ParsedBookNode {
    // Skip whitespace after marker
    while (this.pos < this.input.length && this.isWhitespace(this.getCurrentCharacter())) {
      this.advance(false);
    }

    // Parse book code (first word)
    let code = '';
    while (this.pos < this.input.length) {
      const char = this.getCurrentCharacter();
      if (this.isWhitespace(char)) {
        break;
      }
      code += char;
      this.advance(false);
    }

    // Update context tracking for sid generation
    this.currentBookCode = code;
    this.currentChapter = '';
    this.currentVerse = '';

    // Parse remaining content as description
    const content: string[] = [];
    let textContent = '';

    while (this.pos < this.input.length) {
      const char = this.getCurrentCharacter();
      if (char === '\\') {
        // Check if this is a new paragraph marker
        const { markerInfo } = this.peekMarker();
        if (markerInfo?.type === MarkerTypeEnum.PARAGRAPH) {
          break;
        }
      }

      if (this.isLineBreakingWhitespace(char)) {
        break;
      }

      textContent += char;
      this.advance(false);
    }

    if (textContent.trim()) {
      content.push(textContent.trim());
    }

    return createParsedBook(code, content, index);
  }

  /**
   * Parses a chapter marker (\c)
   */
  private parseChapter(marker: string, index: number): ParsedChapterNode {
    // Skip whitespace after marker
    while (this.pos < this.input.length && this.isWhitespace(this.getCurrentCharacter())) {
      this.advance(false);
    }

    // Parse chapter number
    let number = '';
    while (this.pos < this.input.length) {
      const char = this.getCurrentCharacter();
      if (this.isWhitespace(char) || char === '\\') {
        break;
      }
      number += char;
      this.advance(false);
    }

    // Update context tracking for sid generation
    this.currentChapter = number;
    this.currentVerse = '';

    // Generate sid attribute: "BOOK CH" (only if we have valid book code)
    const sid =
      this.currentBookCode && this.currentBookCode.trim()
        ? `${this.currentBookCode} ${number}`
        : undefined;

    const node = createParsedChapter(number, { sid, index });

    // Handle mergeable markers like \ca and \cp inline
    while (this.pos < this.input.length) {
      this.skipWhitespace();

      if (this.pos >= this.input.length || this.getCurrentCharacter() !== '\\') {
        break;
      }

      const savedPos = this.getCurrentPosition();
      const { marker: nextMarker, markerInfo } = this.parseMarker();

      // Check if mergeable to current chapter
      if (this.canMarkerMergeInto(markerInfo, 'c') && markerInfo?.mergeAs) {
        // Handle inline: parse content based on marker type
        this.skipWhitespace();
        let content = '';

        // For character markers like \ca, parse until closing marker
        if (markerInfo.type === 'character') {
          const closingMarker = '\\' + nextMarker + '*';
          while (this.pos < this.input.length) {
            if (this.input.startsWith(closingMarker, this.pos)) {
              this.pos += closingMarker.length;
              break;
            }
            content += this.getCurrentCharacter();
            this.advance(false);
          }
        } else {
          // For paragraph markers, parse until line break or next marker
          content = this.parseSpecialContent();
        }

        (node as any)[markerInfo.mergeAs] = content.trim();
        continue; // Keep looking for more mergeable markers
      } else {
        // Not mergeable, restore position and exit
        this.restorePosition(savedPos, false);
        break;
      }
    }

    return node;
  }

  /**
   * Parses a verse marker (\v)
   */
  private parseVerse(marker: string, index: number): ParsedVerseNode {
    // Skip whitespace after marker
    while (this.pos < this.input.length && this.isWhitespace(this.getCurrentCharacter())) {
      this.advance(false);
    }

    // Parse verse number
    let number = '';
    while (this.pos < this.input.length) {
      const char = this.getCurrentCharacter();
      if (this.isWhitespace(char) || char === '\\') {
        break;
      }
      number += char;
      this.advance(false);
    }

    // Update context tracking for sid generation
    this.currentVerse = number;

    // Generate sid attribute: "BOOK CH:V" (only if we have valid book code and chapter)
    const sid =
      this.currentBookCode &&
      this.currentBookCode.trim() &&
      this.currentChapter &&
      this.currentChapter.trim()
        ? `${this.currentBookCode} ${this.currentChapter}:${number}`
        : undefined;

    // IMPORTANT: Consume the space after verse number to prevent it from
    // becoming part of the following text content
    if (this.pos < this.input.length && this.isWhitespace(this.getCurrentCharacter())) {
      this.advance(false);
    }

    const node = createParsedVerse(marker, number, { sid, index });

    // Handle mergeable markers like \va and \vp inline
    while (this.pos < this.input.length) {
      this.skipWhitespace();

      if (this.pos >= this.input.length || this.getCurrentCharacter() !== '\\') {
        break;
      }

      const savedPos = this.getCurrentPosition();
      const { marker: nextMarker, markerInfo } = this.parseMarker();

      // Check if mergeable to current verse
      if (this.canMarkerMergeInto(markerInfo, 'v') && markerInfo?.mergeAs) {
        // Handle inline: parse content based on marker type
        this.skipWhitespace();
        let content = '';

        // For character markers like \va, parse until closing marker
        if (markerInfo.type === 'character') {
          const closingMarker = '\\' + nextMarker + '*';
          while (this.pos < this.input.length) {
            if (this.input.startsWith(closingMarker, this.pos)) {
              this.pos += closingMarker.length;
              break;
            }
            content += this.getCurrentCharacter();
            this.advance(false);
          }
        } else {
          // For paragraph markers, parse until line break or next marker
          content = this.parseSpecialContent();
        }

        (node as any)[markerInfo.mergeAs] = content.trim();
        continue; // Keep looking for more mergeable markers
      } else {
        // Not mergeable, restore position and exit
        this.restorePosition(savedPos, false);
        break;
      }
    }

    return node;
  }

  /**
   * Parses a paragraph using enhanced USJ nodes
   */
  private parseEnhancedParagraph(marker: string, index: number): ParsedParagraphNode {
    const node = createParsedParagraph(marker, [], { index });
    const markerInfo = this.markerRegistry.getMarkerInfo(marker);

    // Break markers do not have any content
    if (markerInfo?.role === 'break') {
      return node;
    }

    // Skip exactly one space after marker
    if (this.pos < this.input.length && this.isWhitespace(this.getCurrentCharacter())) {
      this.advance(false);
    }

    // Parse content until next paragraph marker
    while (this.pos < this.input.length) {
      this.movePosition(0, true, 'parseEnhancedParagraph');

      const char = this.getCurrentCharacter();
      if (char === '\\') {
        const savedPos = this.getCurrentPosition();
        const { marker, isNested, markerInfo } = this.parseMarker();

        if (markerInfo?.type === MarkerTypeEnum.PARAGRAPH) {
          // Trim trailing whitespace from the last text node before ending paragraph
          if (node.content.length > 0) {
            const lastNode = node.content[node.content.length - 1];
            if (lastNode.type === 'text') {
              (lastNode as ParsedTextNode).content = (lastNode as ParsedTextNode).content.trimEnd();
            }
          }
          this.restorePosition(savedPos, false);
          break;
        }

        switch (markerInfo?.type) {
          case MarkerTypeEnum.MILESTONE:
            node.content.push(this.parseEnhancedMilestone(marker, node.content.length));
            break;
          case MarkerTypeEnum.CHARACTER:
            if (this.getMarkerStyleType(markerInfo) === 'verse') {
              node.content.push(this.parseVerse(marker, node.content.length));
            } else {
              node.content.push(this.parseEnhancedCharacter(marker, isNested, node.content.length));
            }
            break;
          case MarkerTypeEnum.NOTE:
            node.content.push(this.parseNote(marker, node.content.length));
            break;
          default:
            node.content.push(this.parseEnhancedText(true, node.content.length));
            break;
        }
      } else if (char === '/' && this.getNextCharacter() === '/') {
        // This is an optbreak marker, create an optbreak node
        this.advance(false);
        this.advance(false);
        const { createParsedOptbreak } = require('../nodes/enhanced-usj-nodes');
        node.content.push(createParsedOptbreak(node.content.length));
      } else if (this.isLineBreakingWhitespace(char)) {
        const { marker: nextMarker, markerInfo: nextMarkerInfo } = this.getFollowingMarker();

        if (!nextMarker) {
          node.content.push(this.parseEnhancedText(true, node.content.length));
          continue;
        }

        if (!nextMarkerInfo || nextMarkerInfo.type === MarkerTypeEnum.PARAGRAPH) {
          break;
        }

        if (node.content.length === 0) continue;

        // Handle line breaks within paragraphs
        const lastNode = node.content[node.content.length - 1];
        if (lastNode.type === 'text') {
          (lastNode as ParsedTextNode).content =
            (lastNode as ParsedTextNode).content.trimEnd() + ' ';
          continue;
        }

        node.content.push(createParsedText(' ', node.content.length));
        continue;
      } else {
        node.content.push(this.parseEnhancedText(true, node.content.length));
      }
    }

    return node;
  }

  /**
   * Parses a character marker using enhanced USJ nodes
   */
  private parseEnhancedCharacter(
    marker: string,
    isNested: boolean,
    index: number
  ): ParsedCharacterNode | ParsedRefNode {
    // Get marker info for styleType-based dispatch
    const markerInfo = this.markerRegistry.getMarkerInfo(marker);
    const styleType = this.getMarkerStyleType(markerInfo);

    // Special handling for \ref markers using styleType
    if (styleType === 'ref') {
      return this.parseRefMarker(index);
    }

    const node = createParsedCharacter(marker, [], {}, index);

    // NOTE: Do NOT skip whitespace here! The space immediately after
    // a character marker is significant and should be preserved as content.
    // This is required for proper USFM whitespace handling.

    let textContent = '';
    const closingMarker = `\\${isNested ? '+' : ''}${marker}*`;

    while (this.pos < this.input.length) {
      if (this.input.startsWith(closingMarker, this.pos)) {
        if (textContent) {
          node.content.push(createParsedText(textContent, node.content.length));
          textContent = '';
        }
        this.pos += closingMarker.length;
        break;
      }

      const char = this.input[this.pos];

      if (char === '\\') {
        const { marker: nextMarker, markerInfo: nextMarkerInfo } = this.peekMarker();
        if (nextMarkerInfo?.type === MarkerTypeEnum.PARAGRAPH) {
          break;
        }

        if (textContent) {
          node.content.push(createParsedText(textContent, node.content.length));
          textContent = '';
        }

        const { marker: parsedMarker, isNested, markerInfo } = this.parseMarker();

        switch (markerInfo?.type) {
          case MarkerTypeEnum.NOTE:
            node.content.push(this.parseNote(parsedMarker, node.content.length));
            break;
          case MarkerTypeEnum.MILESTONE:
            node.content.push(this.parseEnhancedMilestone(parsedMarker, node.content.length));
            break;
          default:
            const characterNode = this.parseEnhancedCharacter(parsedMarker, isNested, 0);

            if (node.content.length > 0) {
              node.content.push(characterNode);
            } else {
              node.content.push(characterNode);
            }
            break;
        }
      } else if (char === '/' && this.getNextCharacter() === '/') {
        // This is an optbreak marker, create an optbreak node
        if (textContent) {
          node.content.push(createParsedText(textContent, node.content.length));
          textContent = '';
        }
        this.advance(false);
        this.advance(false);
        const { createParsedOptbreak } = require('../nodes/enhanced-usj-nodes');
        node.content.push(createParsedOptbreak(node.content.length));
      } else if (char === '|') {
        const attributes = this.parseAttributes(marker);
        // Set attributes on the node
        Object.entries(attributes).forEach(([key, value]) => {
          (node as any)[key] = value;
        });
      } else if (this.isLineBreakingWhitespace(char)) {
        // Normalize newlines to spaces in text content, avoiding double spaces
        const normalization = this.normalizeNewlineToSpace(textContent, this.pos, true);
        textContent = normalization.normalizedContent;
        this.pos = normalization.skipToPos; // Skip over newline and following whitespace
      } else {
        textContent += char;
        this.advance(false);
      }
    }

    if (textContent) {
      node.content.push(createParsedText(textContent, node.content.length));
    }

    return node;
  }

  /**
   * Parses a \ref marker into a ParsedRefNode
   */
  private parseRefMarker(index: number): ParsedRefNode {
    let contentText = '';
    let locationText = '';
    let inLocation = false;
    const closingMarker = '\\ref*';

    while (this.pos < this.input.length) {
      if (this.input.startsWith(closingMarker, this.pos)) {
        this.pos += closingMarker.length;
        break;
      }

      const char = this.input[this.pos];

      if (char === '|' && !inLocation) {
        inLocation = true;
        this.advance(false);
        continue;
      }

      if (inLocation) {
        locationText += char;
      } else {
        contentText += char;
      }

      this.advance(false);
    }

    // Create content nodes from the text content
    const content = contentText.trim() ? [createParsedText(contentText.trim(), 0)] : [];

    return createParsedRef(locationText.trim(), content, undefined, index);
  }

  /**
   * Parses a note using enhanced USJ nodes
   */
  private parseNote(marker: string, index: number): ParsedNoteNode {
    const noteNode = createParsedNote(marker, [], undefined, undefined, index);

    // Skip whitespace after marker
    while (this.pos < this.input.length && this.isWhitespace(this.getCurrentCharacter())) {
      this.advance(false);
    }

    const currentMarkerInfo = this.markerRegistry.getMarkerInfo(marker);

    // Parse caller for cross references and footnotes (caller is a character used to identify the note)
    if (currentMarkerInfo?.type === MarkerTypeEnum.NOTE) {
      const nextChar = this.getCurrentCharacter(); // Get the character after the note marker
      const charAfterNext = this.pos + 1 < this.input.length ? this.getNextCharacter() : '';

      const isNextCharCaller = !this.isWhitespace(nextChar) && this.isWhitespace(charAfterNext);

      if (isNextCharCaller) {
        noteNode.caller = nextChar;
        this.advance(false); // Skip the caller character

        // Skip any following whitespace
        this.skipWhitespace();
      }
    }

    // Handle mergeable markers like \cat that come after caller
    while (this.pos < this.input.length) {
      this.skipWhitespace();

      // If we're at the end of the input or the next character is not a backslash, break
      if (this.pos >= this.input.length || this.getCurrentCharacter() !== '\\') {
        break;
      }

      const savedPos = this.getCurrentPosition();
      const { marker: nextMarker, markerInfo } = this.parseMarker();

      // Check if this marker can merge into the current note
      if (this.canMarkerMergeInto(markerInfo, marker) && markerInfo?.mergeAs) {
        // Handle inline: parse content based on marker type
        this.skipWhitespace();
        let content = '';

        // For character markers, parse until closing marker
        if (markerInfo.type === 'character') {
          const closingMarker = '\\' + nextMarker + '*';
          while (this.pos < this.input.length) {
            if (this.input.startsWith(closingMarker, this.pos)) {
              this.pos += closingMarker.length;
              break;
            }
            content += this.getCurrentCharacter();
            this.advance(false);
          }
        } else {
          // For paragraph markers, parse until line break or next marker
          content = this.parseSpecialContent();
        }

        (noteNode as any)[markerInfo.mergeAs] = content.trim();
        continue; // Keep looking for more mergeable markers
      } else {
        // Not a mergeable marker, restore position and exit
        this.restorePosition(savedPos, false);
        break;
      }
    }

    //Handle Note Content

    let textContent = '';
    let unclosedNoteContentNode: ParsedCharacterNode | null = null;
    const noteClosingMarker = `\\${marker}*`; // Note closing marker (e.g. \f*, \x*)

    while (this.pos < this.input.length) {
      // Handle case: The note is closing
      if (this.input.startsWith(noteClosingMarker, this.pos)) {
        // Close any pending content
        if (textContent) {
          if (unclosedNoteContentNode) {
            unclosedNoteContentNode.content.push(
              createParsedText(
                textContent,
                unclosedNoteContentNode.content.length,
                unclosedNoteContentNode
              )
            );
          } else {
            noteNode.content.push(createParsedText(textContent, noteNode.content.length, noteNode));
          }
          textContent = '';
        }
        // Close current note content marker if any
        if (unclosedNoteContentNode) {
          noteNode.content.push(unclosedNoteContentNode);
          unclosedNoteContentNode = null;
        }
        this.pos += noteClosingMarker.length;
        break;
      }

      const char = this.getCurrentCharacter();

      if (char === '\\') {
        const {
          marker: innerMarker,
          isNested: isInnerMarkerNested,
          markerInfo: innerMarkerInfo,
          isClosingMarker: isInnerMarkerClosing,
        } = this.parseMarker();

        // Check if this is a note content marker
        const isNoteContentMarker = (innerMarkerInfo: USFMMarkerInfo) =>
          innerMarkerInfo?.context?.includes('NoteContent');

        if (
          isInnerMarkerClosing &&
          unclosedNoteContentNode &&
          unclosedNoteContentNode.marker === innerMarker
        ) {
          // This is an explicit closing for the current note content marker
          if (textContent) {
            unclosedNoteContentNode.content.push(
              createParsedText(textContent, unclosedNoteContentNode.content.length)
            );
          }
          noteNode.content.push(unclosedNoteContentNode);
          unclosedNoteContentNode = null;
          textContent = '';
          this.advance(false); // Skip the * character
          const currentChar = this.getCurrentCharacter();
          const nextChar = this.getNextCharacter();

          continue;
        }

        if (innerMarkerInfo && isNoteContentMarker(innerMarkerInfo)) {
          // Close any pending text content
          if (textContent) {
            if (unclosedNoteContentNode) {
              unclosedNoteContentNode.content.push(
                createParsedText(textContent, unclosedNoteContentNode.content.length)
              );
            } else {
              noteNode.content.push(createParsedText(textContent, noteNode.content.length));
            }
            textContent = '';
          }

          // Close current note content marker (implicit closing)
          if (unclosedNoteContentNode) {
            noteNode.content.push(unclosedNoteContentNode);
          }

          // Start new note content marker

          unclosedNoteContentNode = createParsedCharacter(innerMarker, [], {}, 0);
        } else {
          // This is a regular character marker or explicit closing marker

          // Handle explicit closing markers for note content (e.g., \dc*)
          const explicitClosingPattern = `\\${innerMarker}*`;
          if (
            unclosedNoteContentNode &&
            innerMarker === unclosedNoteContentNode.marker &&
            this.input.startsWith(explicitClosingPattern, this.pos - innerMarker.length - 1)
          ) {
            // This is an explicit closing for the current note content marker
            if (textContent) {
              unclosedNoteContentNode.content.push(
                createParsedText(textContent, unclosedNoteContentNode.content.length)
              );
              textContent = '';
            }
            noteNode.content.push(unclosedNoteContentNode);
            unclosedNoteContentNode = null;
            // Skip the * character
            if (this.pos < this.input.length && this.input[this.pos] === '*') {
              this.advance(false);
            }
          } else {
            // Regular character marker - becomes nested in current note content marker
            if (textContent) {
              if (unclosedNoteContentNode) {
                unclosedNoteContentNode.content.push(
                  createParsedText(textContent, unclosedNoteContentNode.content.length)
                );
              } else {
                noteNode.content.push(createParsedText(textContent, noteNode.content.length));
              }
              textContent = '';
            }

            if (unclosedNoteContentNode) {
              const characterNode = this.parseEnhancedCharacter(
                innerMarker,
                isInnerMarkerNested,
                unclosedNoteContentNode.content.length
              );
              unclosedNoteContentNode.content.push(characterNode);
            } else {
              const characterNode = this.parseEnhancedCharacter(
                innerMarker,
                isInnerMarkerNested,
                noteNode.content.length
              );
              noteNode.content.push(characterNode);
            }
          }
        }
      } else if (char === '/' && this.getNextCharacter() === '/') {
        // This is an optbreak marker, create an optbreak node
        if (textContent) {
          if (unclosedNoteContentNode) {
            unclosedNoteContentNode.content.push(
              createParsedText(textContent, unclosedNoteContentNode.content.length)
            );
          } else {
            noteNode.content.push(createParsedText(textContent, noteNode.content.length));
          }
          textContent = '';
        }
        this.advance(false);
        this.advance(false);
        const { createParsedOptbreak } = require('../nodes/enhanced-usj-nodes');

        if (unclosedNoteContentNode) {
          unclosedNoteContentNode.content.push(
            createParsedOptbreak(unclosedNoteContentNode.content.length)
          );
        } else {
          noteNode.content.push(createParsedOptbreak(noteNode.content.length));
        }
      } else if (this.isLineBreakingWhitespace(char)) {
        // Normalize newlines to spaces in text content, avoiding double spaces
        const normalization = this.normalizeNewlineToSpace(textContent, this.pos);
        textContent = normalization.normalizedContent;
        this.pos = normalization.skipToPos; // Skip over newline and following whitespace
      } else {
        textContent += char;
        this.advance(false);
      }
    }

    // Handle any remaining content
    if (textContent) {
      if (unclosedNoteContentNode) {
        unclosedNoteContentNode.content.push(
          createParsedText(textContent, unclosedNoteContentNode.content.length)
        );
      } else {
        noteNode.content.push(createParsedText(textContent, noteNode.content.length));
      }
    }

    // Close any remaining note content marker
    if (unclosedNoteContentNode) {
      noteNode.content.push(unclosedNoteContentNode);
    }

    return noteNode;
  }

  /**
   * Parses a milestone using enhanced USJ nodes
   */
  private parseEnhancedMilestone(marker: string, index: number): ParsedMilestoneNode {
    let attributes: Record<string, string> = {};

    // Check if there are attributes (indicated by |)
    if (this.pos < this.input.length && this.input[this.pos] === '|') {
      attributes = this.parseAttributes(marker);
    }

    // Skip to the closing \*
    while (this.pos < this.input.length) {
      if (
        this.input[this.pos] === '\\' &&
        this.pos + 1 < this.input.length &&
        this.input[this.pos + 1] === '*'
      ) {
        this.pos += 2; // Skip \*
        break;
      }
      this.advance(false);
    }

    // Skip any whitespace immediately following the milestone closing
    // This prevents newlines after milestones from becoming text nodes
    this.skipWhitespace();

    return createParsedMilestone(marker, attributes, { index });
  }

  /**
   * Parses text content using enhanced USJ nodes
   */
  private parseEnhancedText(isInsideParagraph: boolean, index: number): ParsedTextNode {
    let content = '';

    while (this.pos < this.input.length) {
      this.movePosition(0, true, 'parseEnhancedText');
      const char = this.input[this.pos];

      if (char === '/' && this.getNextCharacter() === '/') {
        // This is an optbreak marker, stop text parsing and let parent handle it
        break;
      }

      if (char === '\\') {
        break;
      }

      if (this.isLineBreakingWhitespace(char)) {
        // Normalize newlines to spaces in text content, avoiding double spaces
        const normalization = this.normalizeNewlineToSpace(content, this.pos, isInsideParagraph);
        content = normalization.normalizedContent;
        this.pos = normalization.skipToPos; // Skip over newline and following whitespace
      } else {
        content += char;
        this.advance(false);
      }
    }

    return createParsedText(content, index);
  }

  private parseSection(marker: string, index: number): ParsedSidebarNode {
    const markerInfo = this.markerRegistry.getMarkerInfo(marker);
    const closingMarker = markerInfo?.closedBy;

    const node = createParsedSidebar([], undefined, index);

    // Skip whitespace after marker
    this.skipWhitespace();

    // Check for contiguous markers that should be merged (e.g., \cat after \esb)
    while (this.pos < this.input.length) {
      this.skipWhitespace();

      if (this.pos >= this.input.length || this.getCurrentCharacter() !== '\\') {
        break;
      }

      const savedPos = this.getCurrentPosition();
      const { marker: nextMarker, markerInfo } = this.parseMarker();

      // Check if mergeable to current sidebar
      if (this.canMarkerMergeInto(markerInfo, 'esb') && markerInfo?.mergeAs) {
        // Handle inline: parse content based on marker type
        this.skipWhitespace();
        let content = '';

        // For character markers like \cat, parse until closing
        if (markerInfo.type === 'character') {
          const closingMarker = '\\' + nextMarker + '*';
          while (this.pos < this.input.length) {
            if (this.input.startsWith(closingMarker, this.pos)) {
              this.pos += closingMarker.length;
              break;
            }
            content += this.getCurrentCharacter();
            this.advance(false);
          }
        } else {
          // For paragraph markers, parse until line break or next marker
          content = this.parseSpecialContent();
        }

        (node as any)[markerInfo.mergeAs] = content.trim();
        continue; // Keep looking for more mergeable markers
      } else {
        // Not mergeable, restore position and exit
        this.restorePosition(savedPos, false);
        break;
      }
    }

    // Parse content until closing marker
    while (this.pos < this.input.length) {
      this.movePosition(0, true, 'parseSection');

      const char = this.getCurrentCharacter();
      if (char === '\\') {
        const savedPos = this.getCurrentPosition();
        const { marker: nextMarker } = this.parseMarker();

        // Check if this is our closing marker
        if (nextMarker === closingMarker) {
          break;
        }

        // Reset position and parse the marker as content
        this.restorePosition(savedPos, false);
        const { marker: contentMarker, markerInfo: contentMarkerInfo } = this.parseMarker();

        if (contentMarkerInfo?.type === MarkerTypeEnum.PARAGRAPH) {
          node.content.push(this.parseEnhancedParagraph(contentMarker, node.content.length));
        } else if (contentMarkerInfo?.type === MarkerTypeEnum.CHARACTER) {
          // For character markers, we need to parse them as part of paragraph content
          // Reset position and let the paragraph parser handle it
          this.restorePosition(savedPos, false);
          node.content.push(this.parseEnhancedText(false, node.content.length));
        } else {
          // Handle other marker types within section
          this.restorePosition(savedPos, false);
          node.content.push(this.parseEnhancedText(false, node.content.length));
        }
      } else if (this.isWhitespace(char)) {
        this.advance(false);
      } else {
        node.content.push(this.parseEnhancedText(false, node.content.length));
      }
    }

    return node;
  }

  private parseBreakParagraph(marker: string, index: number): ParsedParagraphNode {
    // Break paragraphs like \b don't have content
    return createParsedParagraph(marker, [], { index });
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && this.isWhitespace(this.getCurrentCharacter())) {
      this.advance(false);
    }
  }

  private parseSpecialContent(): string {
    let content = '';
    while (
      this.pos < this.input.length &&
      !this.isLineBreakingWhitespace(this.getCurrentCharacter()) &&
      this.getCurrentCharacter() !== '\\'
    ) {
      content += this.getCurrentCharacter();
      this.advance(false);
    }
    return content.trim();
  }

  /**
   * Checks if a marker can merge into a target marker based on marker name, type, or role
   */
  private canMarkerMergeInto(
    sourceMarkerInfo: USFMMarkerInfo | undefined,
    targetMarker: string
  ): boolean {
    if (!sourceMarkerInfo?.mergesInto) return false;

    // Get target marker info to check its type and role
    const targetMarkerInfo = this.markerRegistry.getMarkerInfo(targetMarker);

    return this.checkMergeSpecification(
      sourceMarkerInfo.mergesInto,
      targetMarker,
      targetMarkerInfo
    );
  }

  /**
   * Checks if a merge specification matches a target marker
   */
  private checkMergeSpecification(
    mergeSpec: any, // MergeIntoSpecification from types
    targetMarker: string,
    targetMarkerInfo: USFMMarkerInfo | undefined
  ): boolean {
    // Handle single sophisticated object
    if (mergeSpec && typeof mergeSpec === 'object' && !Array.isArray(mergeSpec)) {
      return this.checkMergeTargetObject(mergeSpec, targetMarker, targetMarkerInfo);
    }

    // Handle array of sophisticated objects
    if (Array.isArray(mergeSpec)) {
      return mergeSpec.some((target) =>
        this.checkMergeTargetObject(target, targetMarker, targetMarkerInfo)
      );
    }

    return false;
  }

  /**
   * Checks a sophisticated merge target object
   */
  private checkMergeTargetObject(
    target: any, // MarkerMergeTarget
    targetMarker: string,
    targetMarkerInfo: USFMMarkerInfo | undefined
  ): boolean {
    if (!target || typeof target !== 'object') return false;

    // Check specific marker names
    if (target.markers && Array.isArray(target.markers)) {
      if (target.markers.includes(targetMarker)) return true;
    }

    // Check marker types
    if (target.types && Array.isArray(target.types) && targetMarkerInfo?.type) {
      if (target.types.includes(targetMarkerInfo.type)) return true;
    }

    // Check marker roles
    if (target.roles && Array.isArray(target.roles) && targetMarkerInfo?.role) {
      if (target.roles.includes(targetMarkerInfo.role)) return true;
    }

    return false;
  }

  /**
   * Parses a table starting with the current \tr marker
   * Continues parsing until a non-\tr paragraph marker is encountered
   */
  private parseTable(index: number): ParsedTableNode {
    const tableRows: ParsedTableRowNode[] = [];

    // Parse the first \tr row (we're already positioned after the \tr marker)
    tableRows.push(this.parseTableRow(tableRows.length));

    // Parse consecutive \tr markers
    while (this.pos < this.input.length) {
      this.movePosition(0, true, 'parseTable');

      const char = this.getCurrentCharacter();
      if (char === '\\') {
        const savedPos = this.getCurrentPosition();
        const { marker, markerInfo } = this.parseMarker();

        if (this.getMarkerStyleType(markerInfo) === 'table:row') {
          // Parse this table row
          tableRows.push(this.parseTableRow(tableRows.length));
        } else if (markerInfo?.type === MarkerTypeEnum.PARAGRAPH) {
          // Hit a different paragraph marker, end table
          this.restorePosition(savedPos, false);
          break;
        } else {
          // Not a paragraph marker, restore position and break
          this.restorePosition(savedPos, false);
          break;
        }
      } else if (this.isWhitespace(char)) {
        this.advance(false);
      } else {
        // Regular text outside table rows - end table
        break;
      }
    }

    return createParsedTable(tableRows, index);
  }

  /**
   * Parses a single table row (\tr marker with table cell content)
   */
  private parseTableRow(index: number): ParsedTableRowNode {
    const tableCells: ParsedTableCellNode[] = [];

    // Skip whitespace after \tr marker
    this.skipWhitespace();

    // Parse table cell markers until end of row
    while (this.pos < this.input.length) {
      this.movePosition(0, true, 'parseTableRow');

      const char = this.getCurrentCharacter();
      if (char === '\\') {
        const savedPos = this.getCurrentPosition();
        const { marker, markerInfo } = this.parseMarker();

        // Check if this is a table cell marker using styleType
        if (this.getMarkerStyleType(markerInfo) === 'table:cell') {
          tableCells.push(this.parseTableCell(marker, tableCells.length));
        } else if (markerInfo?.type === MarkerTypeEnum.PARAGRAPH) {
          // Hit another paragraph marker, end this row
          this.restorePosition(savedPos, false);
          break;
        } else {
          // Other marker types - put back and break
          this.restorePosition(savedPos, false);
          break;
        }
      } else if (this.isLineBreakingWhitespace(char)) {
        // End of row
        break;
      } else if (this.isWhitespace(char)) {
        this.advance(false);
      } else {
        // Regular text outside cell markers - unexpected, but handle gracefully
        break;
      }
    }

    return createParsedTableRow(tableCells, index);
  }

  /**
   * Parses a single table cell (e.g., \tc1, \thr2, \tcr1-2)
   */
  private parseTableCell(marker: string, index: number): ParsedTableCellNode {
    const { align, colspan, baseMarker } = this.parseTableCellProperties(marker);
    const content: EnhancedUSJNode[] = [];

    // Parse content until next marker or end of row
    let textContent = '';

    while (this.pos < this.input.length) {
      this.movePosition(0, true, 'parseTableCell');

      const char = this.getCurrentCharacter();
      if (char === '\\') {
        // Check if this is another table cell marker or other marker
        const { marker: nextMarker } = this.peekMarker();

        const nextMarkerInfo = this.markerRegistry.getMarkerInfo(nextMarker);
        const nextStyleType = this.getMarkerStyleType(nextMarkerInfo);

        if (nextStyleType === 'table:cell' || nextStyleType === 'table:row') {
          // End of this cell
          break;
        }

        // Handle other markers within cell content (like character markers)
        if (textContent) {
          content.push(createParsedText(textContent, content.length));
          textContent = '';
        }

        const { marker: parsedMarker, isNested, markerInfo } = this.parseMarker();

        if (markerInfo?.type === MarkerTypeEnum.CHARACTER) {
          content.push(this.parseEnhancedCharacter(parsedMarker, isNested, content.length));
        } else {
          // Other marker types, treat as text
          textContent += '\\' + parsedMarker + ' ';
        }
      } else if (this.isLineBreakingWhitespace(char)) {
        // End of row/cell
        break;
      } else {
        textContent += char;
        this.advance(false);
      }
    }

    if (textContent) {
      content.push(createParsedText(textContent, content.length));
    }

    return createParsedTableCell(baseMarker, align, content, colspan, index);
  }

  /**
   * Determines alignment and colspan from table cell marker
   */
  private parseTableCellProperties(marker: string): {
    align: 'start' | 'center' | 'end';
    colspan?: string;
    baseMarker: string;
  } {
    // Extract alignment from marker prefix
    let align: 'start' | 'center' | 'end' = 'start';

    if (marker.startsWith('thr') || marker.startsWith('tcr')) {
      align = 'end';
    } else if (marker.startsWith('thc') || marker.startsWith('tcc')) {
      align = 'center';
    }

    // Extract colspan from marker suffix (e.g., tcr1-2 means colspan=2).
    // Parse linearly from the last '-' to avoid /(\d+)-(\d+)$/ ReDoS on long digit runs.
    let colspan: string | undefined;
    let baseMarker = marker;
    const lastDash = marker.lastIndexOf('-');
    if (lastDash > 0) {
      const right = marker.slice(lastDash + 1);
      const left = marker.slice(0, lastDash);
      let rightAllDigits = right.length > 0;
      for (let k = 0; rightAllDigits && k < right.length; k++) {
        const c = right.charCodeAt(k);
        if (c < 48 || c > 57) rightAllDigits = false;
      }
      if (rightAllDigits) {
        let i = left.length;
        while (i > 0) {
          const c = left.charCodeAt(i - 1);
          if (c < 48 || c > 57) break;
          i--;
        }
        const startStr = left.slice(i);
        if (startStr.length > 0) {
          const start = parseInt(startStr, 10);
          const end = parseInt(right, 10);
          colspan = (end - start + 1).toString();
          baseMarker = left;
        }
      }
    }

    return { align, colspan, baseMarker };
  }
}
