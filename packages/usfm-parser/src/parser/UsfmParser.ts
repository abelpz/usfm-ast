import {
  ClosingCondition,
  MarkerSyntaxDefinition,
  PatternElement,
  USFMMarkerInfo,
  USFMMarkerRegistry,
} from '../constants';
import { BaseParser, ParseResult, ParseOptions } from './BaseParser';
import { UsjDocument, UsjStructuralNode, UsjInlineNode } from '@usfm-tools/types';

type USJNode = {
  type: string;
  content?: (USJNode | string)[];
  [key: string]: any;
};

/**
 * USFM Parser
 *
 * A parser for USFM (Unified Standard Format Markers) that converts
 * USFM text to USJ (Unified Scripture JSON) format.
 */

export interface UsfmParseOptions extends ParseOptions {
  includeOriginalText?: boolean;
  validateMarkers?: boolean;
  customMarkers?: Record<string, USFMMarkerInfo>;
}

export class UsfmParser extends BaseParser {
  private readonly markersRegistry: USFMMarkerRegistry;

  constructor(input?: string, options: UsfmParseOptions = {}) {
    // Merge ignored characters instead of overriding
    const mergedIgnoredChars = [...(options.ignoredChars || []), '\n', '\r'];
    super(input, {
      ...options,
      ignoredChars: [...new Set(mergedIgnoredChars)], // Remove duplicates
    });
    this.markersRegistry = USFMMarkerRegistry.getInstance(options?.customMarkers);
  }

  /**
   * Parse USFM input and return USJ document
   * @param input Optional USFM input to parse. If not provided, uses input from constructor.
   */
  parse(input?: string): ParseResult<UsjDocument> {
    try {
      // If input is provided, update the parser's input
      if (input !== undefined) {
        this.setInput(input);
      }

      // Check if we have any input to parse
      if (!this.cursor.getRemainingInput()) {
        return this.createErrorResult('No input provided for parsing');
      }

      const document = this.parseDocument() as unknown as UsjDocument;

      if (this.hasErrors()) {
        return this.createErrorResult('Parsing failed with errors');
      }

      return this.createSuccessResult(document);
    } catch (error) {
      return this.createErrorResult(`Unexpected error: ${error}`);
    }
  }

  /**
   * Parse the entire USFM document
   */
  private parseDocument(): UsjDocument {
    return this.parseElement(
      {
        type: 'USJ',
        version: '3.1',
      },
      {
        pattern: ['content'],
        closedBy: [],
      }
    ) as UsjDocument;
  }

  /**
   * Parse a USFM opening marker and its contents (starts with backslash)
   */
  private parseMarker(): USJNode | null {
    if (!this.cursor.consume('\\')) {
      this.addError('Expected backslash for marker');
      return null;
    }

    const marker = this.parseMarkerName();

    if (!marker) {
      this.addError('Invalid marker name');
      return null;
    }

    const markerInfo = this.markersRegistry.getMarkerInfo(marker.name);
    const syntax = this.markersRegistry.getMarkerSyntax(marker.name);

    if (!markerInfo) {
      this.addError(`Unknown marker: ${marker.name}`);
    }

    if (!syntax) {
      this.addError(`No syntax definition found for marker: ${marker.name}`);
    }

    // Use the systematic parseElement method
    const element = this.parseElement(
      {
        type: markerInfo?.styleType || 'para',
        marker: marker.name,
      },
      syntax || { pattern: ['content'], closedBy: [] },
      marker.name
    );

    return element;
  }

  private parseElement(
    element: USJNode,
    syntax: MarkerSyntaxDefinition,
    markerName?: string
  ): USJNode {
    const shouldCloseNode = this.createMarkerNodeClosingChecker(markerName);

    const pattern = syntax.pattern;

    if (pattern.includes('content')) {
      element.content = [];
    }

    if (pattern) {
      for (const [index, syntaxElement] of pattern.entries()) {
        let reachedClosingCondition = false;

        switch (syntaxElement) {
          case 'content': {
            const remainingPattern = pattern.slice(index + 1);

            reachedClosingCondition = this.parseContent(
              element,
              markerName,
              remainingPattern || [],
              shouldCloseNode
            );

            break;
          }
          case 'special-content':
            reachedClosingCondition = this.parseSpecialContent(
              element,
              markerName,
              shouldCloseNode
            );
            break;

          case 'attributes':
            reachedClosingCondition = this.parseAttributes(element, markerName, shouldCloseNode);
            break;

          case 'mergeable-markers':
            reachedClosingCondition = this.parseMergeableMarkers(element);
            break;

          default:
            this.addError(`Unknown syntax element: ${syntaxElement}`);
            return element;
        }

        if (reachedClosingCondition) {
          return element;
        }
      }
    }

    return element;
  }

  /**
   *
   * @param markerName
   * @returns
   */
  private createMarkerNodeClosingChecker(markerName?: string): () => boolean {
    if (!markerName) {
      return () => {
        return this.cursor.isAtEnd();
      };
    }

    const markerInfo = this.markersRegistry.getMarkerInfo(markerName);

    const markerSyntax = this.markersRegistry.getMarkerSyntax(markerName);

    if (!markerName || !markerInfo) {
      return () => {
        return this.cursor.isAtEnd();
      };
    }

    const markerType = markerInfo.type;

    // Pre-calculate strings that don't change
    const closingMarker = `\\${markerName}*`;
    const selfClosingMarker = `\\*`;
    const currentMarkerType = markerType;
    const conditions = markerSyntax?.closedBy || [];

    // Separate conditions by type for more efficient checking
    const markerConditions = conditions.filter((c) => 'marker' in c) as Array<{ marker: string }>;
    const templateConditions = conditions.filter((c) => 'template' in c) as Array<{
      template: string;
    }>;
    const typeConditions = conditions.filter((c) => 'type' in c) as Array<{ type: string }>;
    const contextConditions = conditions.filter((c) => 'context' in c);
    const matchConditions = conditions.filter((c) => 'match' in c) as Array<{
      match: string | RegExp;
    }>;

    return (): boolean => {
      if (this.cursor.isAtEnd()) {
        return true;
      }

      const currentChar = this.cursor.peek();
      const isMarker = currentChar === '\\';

      if (!isMarker) {
        // Check whitespace template condition
        if (templateConditions.some((c) => c.template === 'white-space')) {
          return !!currentChar && /\s/.test(currentChar);
        }

        if (templateConditions.some((c) => c.template === 'new-line')) {
          this.cursor.skipWhitespace();
          return currentChar === '\n' || currentChar === '\r';
        }

        // Check match conditions for non-marker patterns
        for (const condition of matchConditions) {
          if (typeof condition.match === 'string') {
            if (this.cursor.match(condition.match)) {
              return true;
            }
          } else if (condition.match instanceof RegExp) {
            const remaining = this.cursor.getRemainingInput();
            if (condition.match.test(remaining)) {
              return true;
            }
          }
        }

        return false;
      }

      // Handle marker-based conditions

      // Check specific marker conditions
      for (const condition of markerConditions) {
        const markerToMatch = `\\${condition.marker}`;
        if (this.cursor.match(markerToMatch)) {
          return true;
        }
      }

      // Check template conditions
      for (const condition of templateConditions) {
        switch (condition.template) {
          case 'same-type': {
            const nextMarkerType = this.peekMarkerType();
            if (currentMarkerType && nextMarkerType && currentMarkerType === nextMarkerType) {
              return true;
            }
            break;
          }
          case 'closing-marker':
            if (this.cursor.consume(closingMarker)) {
              return true;
            }
            break;
          case 'self-closing':
            if (this.cursor.consume(selfClosingMarker)) {
              return true;
            }
            break;
        }
      }

      // Check type conditions
      if (typeConditions.length > 0) {
        const nextMarkerType = this.peekMarkerType();
        if (nextMarkerType && typeConditions.some((c) => c.type === nextMarkerType)) {
          return true;
        }
      }

      // Check context conditions
      if (contextConditions.length > 0) {
        const nextMarkerName = this.cursor.peekMarkerName();
        if (nextMarkerName) {
          const nextMarkerInfo = this.markersRegistry.getMarkerInfo(nextMarkerName);
          if (nextMarkerInfo?.context) {
            for (const condition of contextConditions) {
              if (nextMarkerInfo.context.includes(condition.context)) {
                return true;
              }
            }
          }
        }
      }

      // Check match conditions for marker patterns
      for (const condition of matchConditions) {
        if (typeof condition.match === 'string') {
          if (this.cursor.match(condition.match)) {
            return true;
          }
        } else if (condition.match instanceof RegExp) {
          const remaining = this.cursor.getRemainingInput();
          if (condition.match.test(remaining)) {
            return true;
          }
        }
      }

      return false;
    };
  }

  private peekMarkerType(): string | undefined {
    if (this.cursor.peek() === '\\') {
      const nextMarkerName = this.cursor.peekMarkerName();
      if (nextMarkerName) {
        const nextMarkerInfo = this.markersRegistry.getMarkerInfo(nextMarkerName);
        return nextMarkerInfo?.styleType;
      }
    }
    return undefined;
  }

  private parseContent(
    element: USJNode,
    markerName: string | undefined,
    remainingPattern: PatternElement[],
    shouldCloseMarkerNode: () => boolean
  ): boolean {
    const shouldCloseContent = this.createContentStopConditions(remainingPattern);

    // Parse content until we hit a closing condition
    while (!shouldCloseMarkerNode() && !shouldCloseContent()) {
      const char = this.cursor.peek();

      // Check if we hit a marker
      if (char === '\\') {
        const markerElement = this.parseMarker();
        if (markerElement && element.content) {
          element.content.push(markerElement);
        }

        continue;
      } else {
        const textContent = this.parseText(
          (char) => shouldCloseContent(char) || shouldCloseMarkerNode()
        );
        if (textContent && element.content) {
          element.content.push(textContent);
        }
      }
    }

    return false;
  }

  private parseSpecialContent(
    element: USJNode,
    markerName?: string,
    shouldCloseNode?: () => boolean
  ): boolean {
    if (!markerName) {
      return false;
    }

    const markerInfo = this.markersRegistry.getMarkerInfo(markerName);
    const syntax = this.markersRegistry.getMarkerSyntax(markerName);

    if (!markerInfo?.specialContent?.direct) {
      return false;
    }

    const specialContentConfig = markerInfo.specialContent.direct;
    const { attributeName, parseUntil, required, contentType } = specialContentConfig;

    let content = '';
    let found = false;

    switch (contentType) {
      case 'number':
        content = this.parseNumberContent(parseUntil);
        break;

      case 'number-reference':
        content = this.parseNumberReferenceContent(parseUntil);
        break;

      case 'word':
        content = this.parseWordContent(parseUntil);
        break;

      case 'text':
        content = this.parseTextSpecialContent(parseUntil);
        break;

      case 'char':
        content = this.parseCharContent(parseUntil);
        break;

      default:
        // Fallback to generic text parsing
        content = this.parseTextSpecialContent(parseUntil);
        break;
    }

    if (content) {
      element[attributeName] = content;
      found = true;
    } else if (required) {
      this.addError(
        `Required special content '${attributeName}' not found for marker ${markerName}`
      );
    }

    // Skip whitespace after special content
    this.cursor.skipWhitespace();

    return !!shouldCloseNode && shouldCloseNode();
  }

  /**
   * Parse number content (simple integers)
   */
  private parseNumberContent(parseUntil: string[]): string {
    const content = this.cursor.readWhile((char) => /[0-9]/.test(char));

    if (content && this.shouldStopParsing(parseUntil)) {
      this.cursor.skipWhitespace();
      return content;
    }

    return '';
  }

  /**
   * Parse number-reference content (numbers with ranges like "1-3")
   */
  private parseNumberReferenceContent(parseUntil: string[]): string {
    const content = this.cursor.readWhile((char) => /[0-9\-,]/.test(char));

    if (content && this.shouldStopParsing(parseUntil)) {
      // Don't consume the whitespace - it's structural and needed for next parsing step
      this.cursor.skipWhitespace();
      return content;
    }

    return '';
  }

  /**
   * Parse word content (single word tokens)
   */
  private parseWordContent(parseUntil: string[]): string {
    const content = this.cursor.readWhile((char) => /[a-zA-Z0-9]/.test(char));

    if (content && this.shouldStopParsing(parseUntil)) {
      // Don't consume the whitespace - it's structural and needed for next parsing step
      return content;
    }

    return '';
  }

  /**
   * Parse text special content with flexible end conditions
   */
  private parseTextSpecialContent(parseUntil: string[]): string {
    const stopConditions = this.createStopConditions(parseUntil);
    const content = this.cursor.readUntil(stopConditions);

    if (content) {
      // Don't consume the stopping character - it's structural and needed for next parsing step
      return content;
    }

    return '';
  }

  /**
   * Parse character content (note callers like +, -, *, a, etc.)
   */
  private parseCharContent(parseUntil: string[]): string {
    // Note callers can be single chars or short sequences
    const content = this.cursor.readWhile((char) => /[+\-*a-zA-Z0-9]/.test(char));

    if (content && this.shouldStopParsing(parseUntil)) {
      // Don't consume the whitespace - it's structural and needed for next parsing step
      return content;
    }

    return '';
  }

  /**
   * Create stop conditions for content parsing based on upcoming syntax elements
   */
  private createContentStopConditions(
    remainingPattern?: PatternElement[]
  ): (char?: string) => boolean {
    return (char?: string) => {
      if (char === '\\') return true;
      let _char = char || this.cursor.peek();

      if (!remainingPattern) return true;

      for (const element of remainingPattern) {
        switch (element) {
          case 'attributes':
            if (_char === '|') {
              return true;
            }
            break;
          // Add other syntax elements as needed
        }
      }
      return false;
    };
  }

  /**
   * Create stop condition function based on parseUntil array
   */
  private createStopConditions(parseUntil: string[]): (char: string) => boolean {
    return (char: string) => {
      for (const condition of parseUntil) {
        switch (condition) {
          case 'whitespace':
            if (/\s/.test(char)) return true;
            break;
          case 'linebreak':
            if (char === '\n' || char === '\r') return true;
            break;
          case 'nextMarker':
            if (char === '\\') return true;
            break;
          case 'attributes':
            if (char === '|') return true;
            break;
        }
      }
      return false;
    };
  }

  /**
   * Check if we should stop parsing based on current position and parseUntil conditions
   */
  private shouldStopParsing(parseUntil: string[]): boolean {
    const currentChar = this.cursor.peek();
    if (!currentChar) return true; // End of input

    const stopConditions = this.createStopConditions(parseUntil);
    return stopConditions(currentChar);
  }

  private parseMergeableMarkers(element: any): boolean {
    // Parse mergeable markers - look for immediate following markers that can merge
    const mergeableContent: any[] = [];

    while (!this.cursor.isAtEnd() && this.cursor.peek() === '\\') {
      // Save current position in case we need to backtrack
      const snapshot = this.cursor.createSnapshot();

      // Try to parse the next marker
      this.cursor.consume('\\');
      const nextMarker = this.parseMarkerName();

      if (!nextMarker) {
        this.cursor.restoreSnapshot(snapshot);
        break;
      }

      const nextMarkerInfo = this.markersRegistry.getMarkerInfo(nextMarker.name);
      if (!nextMarkerInfo) {
        this.cursor.restoreSnapshot(snapshot);
        break;
      }

      // Check if this marker can merge (simplified logic for now)
      // In a complete implementation, this would check the mergesInto property
      const isEndingMarker = nextMarker.name.endsWith('*');
      if (isEndingMarker) {
        // This is likely a closing marker, include it
        mergeableContent.push({
          type: 'char',
          marker: nextMarker.name,
          content: [],
        });
        break;
      } else {
        // This is a new marker, backtrack and stop parsing mergeable content
        this.cursor.restoreSnapshot(snapshot);
        break;
      }
    }

    if (mergeableContent.length > 0) {
      element.mergeableContent = mergeableContent;
      return true;
    }
    return false;
  }

  private parseAttributes(
    element: any,
    markerName?: string,
    shouldCloseNode?: () => boolean
  ): boolean {
    const attributes: Record<string, string> = {};
    let foundAttributes = false;

    const shouldCloseAttributes = () => {
      const char = this.cursor.peek();
      return this.cursor.isAtEnd() || this.cursor.peek() === '\\';
    };

    this.cursor.consume('|');

    while (!shouldCloseAttributes()) {
      if (shouldCloseNode && shouldCloseNode()) {
        return true;
      }

      let attrName = this.cursor.readUntil((char) => {
        return char === '=' || char === ' ' || char === '\n' || char === '\\';
      });

      if (!attrName.trim()) {
        break;
      }

      let attrValue = '';

      if (this.cursor.consume('=')) {
        // Parse quoted value
        if (this.cursor.consume('"')) {
          attrValue = this.cursor.readUntil((char) => char === '"');
          this.cursor.consume('"');
        } else {
          // Parse unquoted value
          attrValue = this.cursor.readUntil(
            (char) => char === ' ' || char === '\n' || char === '\\' || char === '|'
          );
        }
      } else {
        attrValue = attrName.trim();
        if (markerName) {
          const markerInfo = this.markersRegistry.getMarkerInfo(markerName);
          if (markerInfo?.defaultAttribute) {
            attrName = markerInfo.defaultAttribute;
          }
        }
        // Default attribute (no =value part)
      }

      attributes[attrName.trim()] = attrValue;
      this.cursor.skipWhitespace();
      foundAttributes = true;
    }

    if (foundAttributes) {
      for (const [key, value] of Object.entries(attributes)) {
        element[key] = value;
      }
    }

    return !!shouldCloseNode && shouldCloseNode();
  }

  /**
   * Parse marker name (letters and numbers after backslash)
   */
  private parseMarkerName(): {
    name: string;
    baseName: string;
    level?: string;
    position?: string;
    isClosing?: boolean;
  } | null {
    //steps check for letters then numbers then - followed by letters. e.g. in \qt1-s qt is the base marker, 1 is the level, s is the position (start, end)
    //if there is a - then the next character must be a letter

    const baseName = this.cursor.readWhile((char) => /[a-zA-Z]/.test(char));

    if (baseName.length === 0) {
      return null;
    }

    const level = this.cursor.readWhile((char) => /[0-9]/.test(char));

    const position = this.cursor.consume('-')
      ? this.cursor.readWhile((char) => /[a-zA-Z]/.test(char))
      : '';

    // Check for closing marker (ends with *)
    const isClosing = this.cursor.consume('*');

    const name = `${baseName}${level}${position ? `-${position}` : ''}`;

    //skip syntactic whitespace after marker name (some markers have a newline after the name)
    this.cursor.skipWhitespace(1);

    return {
      name,
      baseName,
      level,
      position,
      isClosing,
    };
  }

  /**
   * Parse plain text content
   */
  private parseText(stopConditions?: (char: string) => boolean): string {
    const text = this.cursor.readUntil((char) => {
      if (stopConditions) {
        return char === '\\' || stopConditions(char);
      }
      return char === '\\';
    });

    return text;
  }
}
