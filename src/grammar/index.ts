// Types for USFM AST nodes
import {
  USFMNode,
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
  RootNode,
  HydratedUSFMNode,
} from './interfaces/USFMNodes';
import { BaseUSFMVisitor, USFMVisitorWithContext } from './interfaces/USFMNodes';
import {
  CharacterUSFMNode,
  MilestoneUSFMNode,
  NodeInstanceType,
  NoteUSFMNode,
  ParagraphUSFMNode,
  PeripheralUSFMNode,
  TextUSFMNode,
} from './nodes';
import { USFMMarkerRegistry } from './constants/USMMarkersRegistry';
import { USFMMarkerInfo } from './constants/types';

enum MarkerTypeEnum {
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

export type USFMNodeUnion = CharacterUSFMNode | NoteUSFMNode | MilestoneUSFMNode | PeripheralUSFMNode | TextUSFMNode | ParagraphUSFMNode

export interface CustomMarkerRule {
  type: MarkerType;
  requiresClosing?: boolean;
  isMilestone?: boolean;
}

export interface USFMParserOptions {
  customMarkers?: Record<string, USFMMarkerInfo>;
  positionTracking?: boolean;
}

export class USFMParser {
  private pos: number = 0;
  private input: string = '';
  private nodes: HydratedUSFMNode[] = [];
  private logs: Array<{ type: 'warn' | 'error'; message: string }> = [];
  private positionVisits: Map<number, number> = new Map();
  private readonly MAX_VISITS = 1000;
  private currentMethod: string = '';
  private readonly trackPositions: boolean;
  private readonly markerRegistry: USFMMarkerRegistry;

  constructor(options?: USFMParserOptions) {
    this.trackPositions = options?.positionTracking ?? process.env.NODE_ENV !== 'production';
    this.markerRegistry = USFMMarkerRegistry.getInstance(
      options?.customMarkers
    );
  }

  // Add method to get logs
  getLogs(): Array<{ type: 'warn' | 'error'; message: string }> {
    return this.logs;
  }

  // Add method to clear logs
  clearLogs(): void {
    this.logs = [];
  }

  private logWarning(message: string): void {
    this.logs.push({ type: 'warn', message });
    console.warn(message);
  }

  private logError(message: string): void {
    this.logs.push({ type: 'error', message });
    console.error(message);
  }

  load(input: string): USFMParser {
    this.input = input;
    return this;
  }

  normalize(): USFMParser {
    this.input = this.normalizeWhitespace(this.input);
    return this;
  }

  parse(): USFMParser {
    this.setPosition(0);
    if (this.trackPositions) {
      this.positionVisits.clear();
    }
    this.currentMethod = 'parse';
    this.nodes = this.parseNodes(false);
    return this;
  }

  getNodes(): HydratedUSFMNode[] {
    return this.nodes;
  }

  getInput(): string {
    return this.input;
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

  private normalizeWhitespace(input: string): string {
    // First, normalize all line endings to LF
    let normalized = input.replace(/\r\n|\r/g, '\n');

    let result = '';
    let i = 0;
    let inWhitespace = false;
    let lastWasNewline = false;

    while (i < normalized.length) {
      const char = normalized[i];

      // Handle backslash markers
      if (char === '\\') {
        const marker = this.peekNextMarker(normalized, i + 1);

        const markerType = this.markerRegistry.getMarkerType(marker);
        // Rule: Multiple whitespace preceding a paragraph marker is normalized to a single newline
        if (markerType === MarkerTypeEnum.PARAGRAPH) {
          if (!lastWasNewline && result.length > 0) {
            result = result.trimEnd() + '\n';
          }
        }
        // Rule: Multiple whitespace between text and a character or note marker normalized to single space
        else if (markerType === MarkerTypeEnum.CHARACTER || markerType === MarkerTypeEnum.NOTE) {
          // Special case: Don't add space if it's at the start of text or after newline
          const lastNonWhitespace = result.trimEnd();
          if (lastNonWhitespace.length > 0 && !lastWasNewline) {
            result = lastNonWhitespace + ' ';
          }
        }
        // Special case: Verse markers
        else if (marker === 'v') {
          if (!lastWasNewline) {
            result = result.trimEnd() + '\n';
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
          // Rule: Preserve single newline before verse markers
          const nextNonWhitespace = this.peekNextNonWhitespace(normalized, i + 1);
          if (nextNonWhitespace === '\\' && this.peekNextMarker(normalized, i + 2) === 'v') {
            result += '';
          }
          // Otherwise normalize according to context
          else if (!lastWasNewline) {
            result += '\n';
          }
          lastWasNewline = true;
        } else if (!inWhitespace) {
          // Rule: Multiple whitespace between words normalized to single space
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

  private savePosition(): number {
    return this.pos;
  }

  private restorePosition(savedPos: number, trackVisits: boolean = false): void {
    this.setPosition(savedPos, trackVisits);
  }

  private handleCustomMarker(marker: string): USFMMarkerInfo | undefined {
    const markerType = this.determineCustomMarkerType(marker);
    let markerInfo: USFMMarkerInfo | undefined;

    switch (markerType) {
      case MarkerTypeEnum.CHARACTER:
        markerInfo = { type: MarkerTypeEnum.CHARACTER };
        break;
      case MarkerTypeEnum.MILESTONE:
        markerInfo = { type: MarkerTypeEnum.MILESTONE };
        break;
      case MarkerTypeEnum.PARAGRAPH:
        markerInfo = { type: MarkerTypeEnum.PARAGRAPH };
        break;
    }

    if (markerInfo) {
      this.markerRegistry.addMarker(marker, markerInfo);
      this.logWarning(
        `Unsupported marker in USFM: '\\${marker}', inferred as ${markerType}, please add it to the customMarkers option parameter in the USFMParser constructor to stop seeing this warning`
      );
    }

    return markerInfo;
  }

  /**
   * Parses a marker and returns the marker, whether it's nested, and the cleaned marker
   */
  private parseMarker(): {
    marker: string;
    isNested: boolean;
    cleanMarker: string;
    markerInfo: USFMMarkerInfo | undefined;
  } {
    this.advance(false); // Skip backslash, no need to track simple advances

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

    // Preserve significant whitespace after marker
    this.preserveSignificantWhitespace();

    let markerInfo = this.markerRegistry.getMarkerInfo(marker);

    // Handle custom z-namespace markers
    if (!markerInfo) {
      markerInfo = this.handleCustomMarker(marker);
    }

    return { marker, isNested, cleanMarker: this.cleanMarkerSuffix(marker), markerInfo };
  }

  private parseNodes(isInsideParagraph: boolean = false): HydratedUSFMNode[] {
    const rootNode = this.createNode<RootNode>({ type: 'root', content: [] }, 0);
    let lastWasLineBreak = false;

    while (this.pos < this.input.length) {
      this.movePosition(0, true, 'parseNodes'); // Check for infinite loop without moving
      const char = this.input[this.pos];

      if (char === '\\') {
        const { marker, isNested, markerInfo } = this.parseMarker();

        switch (markerInfo?.type) {
          case MarkerTypeEnum.PARAGRAPH:
            rootNode.content.push(this.parseParagraph(marker, rootNode.content.length, rootNode));
            break;
          case MarkerTypeEnum.CHARACTER:
            rootNode.content.push(
              this.parseCharacter(marker, isNested, rootNode.content.length, rootNode)
            );
            break;
          case MarkerTypeEnum.NOTE:
            rootNode.content.push(this.parseNote(marker, rootNode.content.length, rootNode));
            break;
          case MarkerTypeEnum.MILESTONE:
            rootNode.content.push(this.parseMilestone(marker, rootNode.content.length, rootNode));
            break;
          default:
            this.logWarning(
              `Unsupported marker in USFM: '\\${marker}', inferred as ${markerInfo?.type}, please add it to the customMarkerRules object in the USFMParser constructor to stop seeing this warning`
            );
            break;
        }
      } else if (this.isNonLineBreakingWhitespace(char)) {
        this.advance(false);
      } else if (this.isLineBreakingWhitespace(char)) {
        lastWasLineBreak = true;
        this.advance(false);
      } else {
        const { context, pointer } = this.getContextAndPointer(this.pos);
        this.logWarning(
          `Unexpected character outside a paragraph: '${char}'\n` +
            `Context: ${context}\n` +
            `         ${pointer}`
        );
        rootNode.content.push(this.parseText(false, rootNode.content.length, rootNode));
      }
    }

    return rootNode.content;
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
    const savedPos = this.savePosition();

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
    // Check for -s/-e suffix
    if (marker.endsWith('-s') || marker.endsWith('-e')) {
      return true;
    }

    // Check for self-closing marker
    const savedPos = this.savePosition();
    let isSelfClosing = false;

    while (this.pos < this.input.length) {
      if (this.input[this.pos] === '\\') {
        isSelfClosing = this.input[this.pos + 1] === '*';
        break;
      }
      this.advance(false);
    }

    this.restorePosition(savedPos, false);
    return isSelfClosing;
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
    const savedPos = this.savePosition();
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
        if (char === '\\' || char === ' ') {
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
        currentValue += char;
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

  private parseNoteContent(
    marker: string,
    index: number,
    parent?: USFMNodeUnion
  ): CharacterUSFMNode {
    const node = this.createNode<CharacterNode>(
      { type: 'character', marker, content: [] },
      index,
      parent
    );

    // Skip whitespace after marker
    while (this.pos < this.input.length && this.input[this.pos] === ' ') {
      this.advance(false);
    }

    let textContent = '';

    // Parse until next marker or explicit closing marker
    const closingMarker = `\\${marker}*`;
    while (this.pos < this.input.length) {
      this.movePosition(0, true, 'parseNoteContent'); // Check for infinite loop without moving

      // Check for explicit closing marker
      if (this.input.startsWith(closingMarker, this.pos)) {
        if (textContent) {
          node.content.push(
            this.createNode<TextNode>(
              { type: 'text', content: textContent },
              node.content.length,
              node
            )
          );
          textContent = '';
        }
        this.pos += closingMarker.length;
        break;
      }

      const char = this.input[this.pos];
      if (char === '\\') {
        const { cleanMarker: nextCleanMarker, markerInfo } = this.peekMarker();
        // Implicit closing: another note content marker or the note's closing marker
        if (
          markerInfo?.context?.includes('NoteContent') ||
          markerInfo?.type === MarkerTypeEnum.NOTE
        ) {
          if (textContent) {
            node.content.push(
              this.createNode<TextNode>(
                { type: 'text', content: textContent },
                node.content.length,
                node
              )
            );
            textContent = '';
          }
          break;
        }
        // Handle nested character markers
        if (textContent) {
          node.content.push(
            this.createNode<TextNode>(
              { type: 'text', content: textContent },
              node.content.length,
              node
            )
          );
          textContent = '';
        }
        const { marker: nestedMarker, isNested, markerInfo: nestedMarkerInfo } = this.parseMarker();
        if (nestedMarkerInfo?.type === MarkerTypeEnum.MILESTONE) {
          this.logWarning(`Milestone marker found within note: ${marker}`);
          if (textContent) {
            node.content.push(
              this.createNode<TextNode>(
                { type: 'text', content: textContent },
                node.content.length,
                node
              )
            );
            textContent = '';
          }
          node.content.push(this.parseMilestone(marker, node.content.length, node));
        } else {
          node.content.push(this.parseCharacter(nestedMarker, isNested, node.content.length, node));
        }
      } else if (this.isLineBreakingWhitespace(char)) {
        //ignore line breaking whitespace in note content
        this.advance(false);
      } else {
        textContent += char;
        this.advance(false);
      }
    }

    if (textContent) {
      node.content.push(
        this.createNode<TextNode>({ type: 'text', content: textContent }, node.content.length, node)
      );
    }

    return node;
  }

  private createNode<T extends USFMNode>(
    baseNode: T,
    index: number,
    parent?: USFMNodeUnion | RootNode
  ): NodeInstanceType<T> {
    if (baseNode.type === 'root') {
      return baseNode as unknown as NodeInstanceType<T>;
    }

    if (isParagraphNode(baseNode)) {
      return new ParagraphUSFMNode({
        marker: baseNode.marker,
        content: baseNode.content || [],
        index,
        parent,
      }) as NodeInstanceType<T>;
    }

    if (isCharacterNode(baseNode)) {
      return new CharacterUSFMNode({
        marker: baseNode.marker,
        content: baseNode.content || [],
        index,
        parent,
      }) as NodeInstanceType<T>;
    }

    if (isTextNode(baseNode)) {
      return new TextUSFMNode({
        content: baseNode.content as string,
        index,
        parent,
      }) as NodeInstanceType<T>;
    }

    if (isNoteNode(baseNode)) {
      return new NoteUSFMNode({
        marker: baseNode.marker,
        content: baseNode.content || [],
        index,
        parent,
      }) as NodeInstanceType<T>;
    }

    if (isMilestoneNode(baseNode)) {
      return new MilestoneUSFMNode({
        marker: baseNode.marker,
        milestoneType: baseNode.milestoneType,
        index,
        parent,
        attributes: baseNode.attributes,
      }) as NodeInstanceType<T>;
    }

    throw new Error(`Unknown node type: ${(baseNode as any).type}`);
  }

  private parseParagraph(
    marker: string,
    index: number,
    parent?: USFMNodeUnion | RootNode
  ): ParagraphUSFMNode {
    const node = this.createNode<ParagraphNode>(
      {
        type: 'paragraph' as const,
        marker,
        content: [],
      },
      index,
      parent
    );

    const initialChar = this.input[this.pos];

    // Skip exactly one space after marker
    if (this.pos < this.input.length && this.isWhitespace(initialChar)) {
      this.advance(false);
    }

    const markerInfo = this.markerRegistry.getMarkerInfo(marker);

    // Special cases
    if (markerInfo?.role === 'break') {
      return this.createNode<ParagraphNode>(node, index, parent);
    }

    let lastWasLineBreak = false;

    // Parse content until next paragraph marker
    while (this.pos < this.input.length) {
      this.movePosition(0, true, 'parseParagraph'); // Check for infinite loop without moving
      const char = this.input[this.pos];
      if (node.content.length > 0 && lastWasLineBreak) {
        const lastNode = node.content[node.content.length - 1];
        if (lastNode.type === 'text') {
          lastNode.content = (lastNode.content as string).trimEnd() + ' ';
        } else {
          node.content.push(
            this.createNode<TextNode>({ type: 'text', content: ' ' }, node.content.length, node)
          );
        }
        lastWasLineBreak = false;
      }
      if (char === '\\') {
        lastWasLineBreak = false;
        const { marker, isNested, markerInfo } = this.parseMarker();

        if (markerInfo?.type === MarkerTypeEnum.PARAGRAPH) {
          //skip the marker and slash
          this.pos -= marker.length + (isNested ? 3 : 2);
          break;
        }

        switch (markerInfo?.type) {
          case MarkerTypeEnum.MILESTONE:
            node.content.push(this.parseMilestone(marker, node.content.length, node));
            break;
          case MarkerTypeEnum.CHARACTER:
            node.content.push(this.parseCharacter(marker, isNested, node.content.length, node));
            break;
          case MarkerTypeEnum.NOTE:
            node.content.push(this.parseNote(marker, node.content.length, node));
            break;
          default:
            node.content.push(this.parseText(true, node.content.length, node));
            break;
        }
      } else if (this.isLineBreakingWhitespace(char)) {
        //peek next marker if it's a paragraph marker or unknown marker then break;
        const {
          marker: nextMarker,
          cleanMarker: nextCleanMarker,
          markerInfo: nextMarkerInfo,
        } = this.getFollowingMarker();
        if (!nextMarker) {
          node.content.push(this.parseText(true, node.content.length, node));
          continue;
        }

        if (nextMarkerInfo && nextMarkerInfo.type !== MarkerTypeEnum.PARAGRAPH) {
          // Continue parsing - these markers are allowed within paragraphs
          lastWasLineBreak = true;
          continue;
        }
        break;
      } else {
        lastWasLineBreak = false;
        node.content.push(this.parseText(true, node.content.length, node));
      }
    }

    return node;
  }

  private parseCharacter(
    marker: string,
    isNested: boolean = false,
    index: number,
    parent?: USFMNodeUnion | RootNode
  ): CharacterUSFMNode {
    const node = this.createNode<CharacterNode>(
      {
        type: 'character',
        marker,
        content: [],
      },
      index,
      parent
    );

    // Special handling for verse numbers
    if (marker === 'v') {
      // Skip any non-line-breaking whitespace before verse number
      while (
        this.pos < this.input.length &&
        this.isNonLineBreakingWhitespace(this.getCurrentCharacter())
      ) {
        this.advance(false);
      }

      let number = '';
      while (this.pos < this.input.length) {
        const char = this.getCurrentCharacter();
        if (this.isWhitespace(char)) {
          break;
        }
        number += char;
        this.advance(false);
      }
      node.content.push(
        this.createNode<TextNode>({ type: 'text', content: number }, node.content.length, node)
      );

      // Skip any whitespace after verse number
      while (this.pos < this.input.length && this.isWhitespace(this.getCurrentCharacter())) {
        this.advance(false);
      }
      return this.createNode<CharacterNode>(node, index, parent);
    }

    // Skip non-line-breaking whitespace before content
    while (
      this.pos < this.input.length &&
      this.isNonLineBreakingWhitespace(this.getCurrentCharacter())
    ) {
      this.advance(false);
    }

    let textContent = '';

    // Parse content until closing marker
    const closingMarker = `\\${isNested ? '+' : ''}${marker}*`;
    while (this.pos < this.input.length) {
      // Check for closing marker and move
      if (this.input.startsWith(closingMarker, this.pos)) {
        if (textContent) {
          node.content.push(
            this.createNode<TextNode>(
              { type: 'text', content: textContent },
              node.content.length,
              node
            )
          );
          textContent = '';
        }
        this.pos += closingMarker.length;
        break;
      }

      const char = this.input[this.pos];

      if (char === '\\') {
        const { markerInfo: nextMarkerInfo } = this.peekMarker();
        if (nextMarkerInfo?.type === MarkerTypeEnum.PARAGRAPH) {
          break;
        }

        if (textContent) {
          node.content.push(
            this.createNode<TextNode>(
              { type: 'text', content: textContent },
              node.content.length,
              node
            )
          );
          textContent = '';
        }

        const { marker, isNested, markerInfo } = this.parseMarker();

        switch (markerInfo?.type) {
          case MarkerTypeEnum.NOTE:
            node.content.push(this.parseNote(marker, node.content.length, node));
            break;
          case MarkerTypeEnum.MILESTONE:
            node.content.push(this.parseMilestone(marker, node.content.length, node));
            break;
          default:
            node.content.push(this.parseCharacter(marker, isNested, node.content.length, node));
            break;
        }
      } else if (char === '|') {
        node.attributes = this.parseAttributes(marker);
      } else if (this.isLineBreakingWhitespace(char)) {
        break;
      } else {
        textContent += char;
        this.advance(false);
      }
    }

    if (textContent) {
      node.content.push(
        this.createNode<TextNode>({ type: 'text', content: textContent }, node.content.length, node)
      );
    }

    return node;
  }

  private parseNote(
    marker: string,
    index: number,
    parent?: USFMNodeUnion | RootNode
  ): NoteUSFMNode {
    const node = this.createNode<NoteNode>(
      {
        type: 'note',
        marker,
        content: [],
      },
      index,
      parent
    );

    // Skip whitespace after marker
    while (this.pos < this.input.length && this.input[this.pos] === ' ') {
      this.advance(false);
    }

    // Parse caller for cross references
    if (marker === 'x' || marker === 'fe' || marker === 'f') {
      const nextChar = this.input[this.pos];
      const charAfterNext = this.pos + 1 < this.input.length ? this.input[this.pos + 1] : '';

      if (nextChar !== ' ' && nextChar !== '\\' && this.isWhitespace(charAfterNext)) {
        node.caller = nextChar;
        this.advance(false); // Move past the caller

        // Skip any following whitespace
        while (this.pos < this.input.length && this.isWhitespace(this.input[this.pos])) {
          this.advance(false);
        }
      }
    }

    let textContent = '';

    // Parse content until closing marker
    const closingMarker = `\\${marker}*`;
    while (this.pos < this.input.length) {
      this.movePosition(0, true, 'parseNote'); // Check for infinite loop without moving

      // Check for closing marker first
      if (this.input.startsWith(closingMarker, this.pos)) {
        if (textContent) {
          node.content.push(
            this.createNode<TextNode>(
              { type: 'text', content: textContent },
              node.content.length,
              node
            )
          );
          textContent = '';
        }
        this.setPosition(this.pos + closingMarker.length, false);
        break;
      }

      const char = this.input[this.pos];

      if (char === '\\') {
        const { markerInfo: nextMarkerInfo } = this.peekMarker();
        if (nextMarkerInfo?.type === MarkerTypeEnum.PARAGRAPH) {
          break;
        }

        if (textContent) {
          node.content.push(
            this.createNode<TextNode>(
              { type: 'text', content: textContent },
              node.content.length,
              node
            )
          );
          textContent = '';
        }

        const { marker, isNested, markerInfo } = this.parseMarker();

        if (markerInfo?.context?.includes('NoteContent')) {
          node.content.push(this.parseNoteContent(marker, node.content.length, node));
        } else {
          switch (markerInfo?.type) {
            case MarkerTypeEnum.MILESTONE:
              node.content.push(this.parseMilestone(marker, node.content.length, node));
              break;
            case MarkerTypeEnum.CHARACTER:
              node.content.push(this.parseCharacter(marker, isNested, node.content.length, node));
              break;
            default:
              node.content.push(this.parseCharacter(marker, isNested, node.content.length, node));
              break;
          }
        }
      } else if (this.isLineBreakingWhitespace(char)) {
        break;
      } else {
        textContent += char;
        this.advance(false);
      }
    }

    if (textContent) {
      node.content.push(
        this.createNode<TextNode>({ type: 'text', content: textContent }, node.content.length, node)
      );
    }

    return node;
  }

  private parseText(
    isInsideParagraph: boolean = false,
    index: number,
    parent?: USFMNodeUnion | RootNode
  ): TextUSFMNode {
    let content = '';

    while (this.pos < this.input.length) {
      this.movePosition(0, true, 'parseText'); // Check for infinite loop without moving
      const char = this.input[this.pos];
      if (char === '\\') {
        break;
      }

      if (this.isLineBreakingWhitespace(char)) {
        break;
      } else {
        content += char;
        this.advance(false);
      }
    }

    return this.createNode<TextNode>(
      {
        type: 'text' as const,
        content,
      },
      index,
      parent
    );
  }

  private parseMilestone(
    marker: string,
    index: number,
    parent?: USFMNodeUnion | RootNode
  ): MilestoneUSFMNode {
    // Determine milestone type
    let milestoneType: 'start' | 'end' | 'standalone' = 'standalone';
    let cleanMarker = marker;

    if (marker.endsWith('-s')) {
      milestoneType = 'start';
      cleanMarker = marker.slice(0, -2);
    } else if (marker.endsWith('-e')) {
      milestoneType = 'end';
      cleanMarker = marker.slice(0, -2);
    }

    // Parse attributes if present
    let attributes: MilestoneAttributes | null = null;
    if (this.pos < this.input.length && this.input[this.pos] === '|') {
      attributes = this.parseAttributes(cleanMarker);
    }

    // Skip to closing *
    while (this.pos < this.input.length && this.input[this.pos] !== '*') {
      this.advance(false);
    }
    this.advance(false); // Skip *

    return this.createNode<MilestoneNode>(
      {
        type: 'milestone' as const,
        marker,
        milestoneType,
        ...(attributes && { attributes }),
      },
      index,
      parent
    );
  }

  // Add visitor methods to the parser
  visit<T>(visitor: BaseUSFMVisitor<T>): T[] {
    return this.nodes.map((node) => node.accept(visitor));
  }

  visitWithContext<T, C>(visitor: USFMVisitorWithContext<T, C>, context: C): T[] {
    return this.nodes.map((node) => node.acceptWithContext(visitor, context));
  }
}
