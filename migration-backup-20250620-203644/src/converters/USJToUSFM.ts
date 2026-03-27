/**
 * USJ to USFM Converter
 *
 * Converts USJ (Unified Scripture JSON) format back to USFM (Unified Standard Format Markers).
 * This enables round-trip conversion: USFM → USJ → USFM
 * Includes rule-based normalization for consistent USFM output.
 */

export interface USJNode {
  type: string;
  marker?: string;
  content?: (USJNode | string)[] | string;
  number?: string;
  code?: string;
  sid?: string;
  eid?: string;
  caller?: string;
  align?: 'start' | 'center' | 'end';
  colspan?: string;
  [key: string]: any;
}

export interface USJToUSFMOptions {
  preserveWhitespace?: boolean;
  normalizeLineEndings?: boolean;
  tableSpacing?: 'compact' | 'spaced';
  normalize?: boolean;
  normalizationRules?: {
    paragraphSpacing?: 'single' | 'double';
    verseSpacing?: 'inline' | 'newline';
    characterMarkerSpacing?: 'minimal' | 'spaced';
    preserveOriginalLineBreaks?: boolean;
    consistentIndentation?: boolean;
  };
}

export class USJToUSFMConverter {
  private options: Required<USJToUSFMOptions>;
  private result: string[] = [];
  private needsNewline: boolean = false;
  private inTableRow: boolean = false;
  private currentParagraphMarker: string | null = null;
  private lastOutputType: 'paragraph' | 'verse' | 'chapter' | 'book' | 'text' | null = null;

  constructor(options: USJToUSFMOptions = {}) {
    this.options = {
      preserveWhitespace: options.preserveWhitespace ?? true,
      normalizeLineEndings: options.normalizeLineEndings ?? true,
      tableSpacing: options.tableSpacing ?? 'spaced',
      normalize: options.normalize ?? false,
      normalizationRules: {
        paragraphSpacing: 'single',
        verseSpacing: 'inline',
        characterMarkerSpacing: 'minimal',
        preserveOriginalLineBreaks: false,
        consistentIndentation: true,
        ...options.normalizationRules,
      },
      ...options,
    };
  }

  /**
   * Convert a USJ document to USFM text
   */
  convert(usj: USJNode): string {
    this.result = [];
    this.needsNewline = false;
    this.inTableRow = false;
    this.currentParagraphMarker = null;
    this.lastOutputType = null;

    this.processNode(usj);

    let output = this.result.join('');

    if (this.options.normalizeLineEndings) {
      output = output.replace(/\r\n|\r/g, '\n');
    }

    if (this.options.normalize) {
      output = this.applyNormalizationRules(output);
    }

    return output.trim();
  }

  private processNode(node: USJNode | string): void {
    if (typeof node === 'string') {
      this.result.push(node);
      return;
    }

    switch (node.type) {
      case 'USJ':
      case 'usfm':
        this.processContent(node.content);
        break;

      case 'book':
        this.processBook(node);
        break;

      case 'chapter':
        this.processChapter(node);
        break;

      case 'verse':
        this.processVerse(node);
        break;

      case 'para':
        this.processParagraph(node);
        break;

      case 'char':
        this.processCharacter(node);
        break;

      case 'note':
        this.processNote(node);
        break;

      case 'table':
        this.processTable(node);
        break;

      case 'table:row':
        this.processTableRow(node);
        break;

      case 'table:cell':
        this.processTableCell(node);
        break;

      case 'ms':
        this.processMilestone(node);
        break;

      default:
        // Handle unknown node types by processing their content
        this.processContent(node.content);
        break;
    }
  }

  private processContent(content: (USJNode | string)[] | string | undefined): void {
    if (!content) return;

    if (typeof content === 'string') {
      this.result.push(content);
      return;
    }

    if (Array.isArray(content)) {
      // Handle nested table cells by flattening them
      const flattenedContent = this.flattenTableCells(content);

      for (let i = 0; i < flattenedContent.length; i++) {
        const child = flattenedContent[i];
        const nextChild = flattenedContent[i + 1];

        this.processNode(child);

        // Add space between consecutive text strings to preserve line breaks
        if (
          typeof child === 'string' &&
          typeof nextChild === 'string' &&
          child.trim() !== '' &&
          nextChild.trim() !== ''
        ) {
          this.result.push(' ');
        }
      }
    }
  }

  /**
   * Flatten nested table cells to make them siblings
   */
  private flattenTableCells(content: (USJNode | string)[]): (USJNode | string)[] {
    const flattened: (USJNode | string)[] = [];

    for (const item of content) {
      if (typeof item === 'string') {
        flattened.push(item);
      } else if (item.type === 'table:cell') {
        // Extract nested cells first
        if (Array.isArray(item.content)) {
          const nestedCells = this.extractNestedTableCells(item.content);
          // Clean the content by removing nested cells and keeping only text
          item.content = this.cleanCellContent(item.content);
          flattened.push(item);
          flattened.push(...nestedCells);
        } else {
          flattened.push(item);
        }
      } else {
        flattened.push(item);
      }
    }

    return flattened;
  }

  private cleanCellContent(content: (USJNode | string)[]): (USJNode | string)[] {
    return content.filter((child) => {
      if (typeof child === 'string') return true;
      if (child.type === 'table:cell') return false;
      return true;
    });
  }

  private extractNestedTableCells(content: (USJNode | string)[]): USJNode[] {
    const cells: USJNode[] = [];

    for (const item of content) {
      if (typeof item !== 'string' && item.type === 'table:cell') {
        // Clean this cell's content before adding it
        if (Array.isArray(item.content)) {
          const nestedCells = this.extractNestedTableCells(item.content);
          item.content = this.cleanCellContent(item.content);
          cells.push(item);
          cells.push(...nestedCells);
        } else {
          cells.push(item);
        }
      }
    }

    return cells;
  }

  private processBook(node: USJNode): void {
    this.addStructuralSpacing('book');
    this.result.push(`\\${node.marker || 'id'}`);
    if (node.code) {
      this.result.push(` ${node.code}`);
    }
    if (node.content && Array.isArray(node.content) && node.content.length > 0) {
      // Add space before content if there's any content
      const hasContent = node.content.some((item) =>
        typeof item === 'string' ? item.trim() !== '' : true
      );
      if (hasContent) {
        this.result.push(' ');
      }
    }
    this.processContent(node.content);
    this.lastOutputType = 'book';
    this.needsNewline = true;
  }

  private processChapter(node: USJNode): void {
    this.addStructuralSpacing('chapter');
    this.result.push(`\\${node.marker || 'c'}`);
    if (node.number) {
      this.result.push(` ${node.number}`);
    }
    this.lastOutputType = 'chapter';
    this.needsNewline = true;
  }

  private processVerse(node: USJNode): void {
    this.addStructuralSpacing('verse');
    this.result.push(`\\${node.marker || 'v'}`);
    if (node.number) {
      this.result.push(` ${node.number}`);
    }
    this.result.push(' ');
    this.lastOutputType = 'verse';
  }

  private processParagraph(node: USJNode): void {
    this.addStructuralSpacing('paragraph');
    this.result.push(`\\${node.marker || 'p'}`);
    this.currentParagraphMarker = node.marker || 'p';

    if (node.content && Array.isArray(node.content) && node.content.length > 0) {
      // Don't add space for empty paragraphs
      const hasContent = node.content.some((item) =>
        typeof item === 'string' ? item.trim() !== '' : true
      );
      if (hasContent) {
        this.result.push(' ');
      }
      this.processContent(node.content);
    }
    this.lastOutputType = 'paragraph';
    this.needsNewline = true;
  }

  private processCharacter(node: USJNode): void {
    this.result.push(`\\${node.marker}`);

    const attributes = this.extractAttributes(node);
    const hasContent = this.hasContent(node.content);

    if (hasContent) {
      // Pattern: \w content|attributes\w* or \w content\w*
      this.result.push(' ');
      this.processContent(node.content);
      if (attributes.length > 0) {
        this.result.push(`|${attributes.join(' ')}`);
      }
    } else if (attributes.length > 0) {
      // Pattern: \w|attributes\w* (no content, only attributes)
      this.result.push(`|${attributes.join(' ')}`);
    }

    this.result.push(`\\${node.marker}*`);
  }

  private processNote(node: USJNode): void {
    this.result.push(`\\${node.marker || 'f'}`);

    // Add caller if present
    if (node.caller) {
      this.result.push(` ${node.caller} `);
    } else {
      this.result.push(' ');
    }

    this.processContent(node.content);
    this.result.push(`\\${node.marker || 'f'}*`);
  }

  private processTable(node: USJNode): void {
    // Tables in USFM are just consecutive table rows, no container
    this.processContent(node.content);
  }

  private processTableRow(node: USJNode): void {
    this.addStructuralSpacing('paragraph'); // Table rows are treated like paragraph markers
    this.result.push(`\\${node.marker || 'tr'}`);
    this.inTableRow = true;

    if (node.content && Array.isArray(node.content) && node.content.length > 0) {
      this.result.push(' ');
      this.processContent(node.content);
    }

    this.inTableRow = false;
    this.lastOutputType = 'paragraph';
    this.needsNewline = true;
  }

  private processTableCell(node: USJNode): void {
    const marker = this.reconstructTableCellMarker(node);
    this.result.push(`\\${marker} `);
    this.processContent(node.content);
  }

  private reconstructTableCellMarker(node: USJNode): string {
    let baseMarker = node.marker || 'tc1';

    // Extract base type, alignment, and number from the stored marker
    // Matches: th1, thc2, thr3, tc1, tcc2, tcr3, etc.
    const match = baseMarker.match(/^(th|tc)([cr]?)(\d+)$/);
    if (!match) return baseMarker;

    const [, baseType, alignmentSuffix, colNum] = match;

    // Use the alignment from the marker, or fall back to the align property
    let reconstructed = baseType;

    if (alignmentSuffix === 'c' || node.align === 'center') {
      reconstructed += 'c';
    } else if (alignmentSuffix === 'r' || node.align === 'end') {
      reconstructed += 'r';
    }
    // 'start' alignment uses no suffix

    reconstructed += colNum;

    // Add colspan if present
    if (node.colspan && parseInt(node.colspan) > 1) {
      const startCol = parseInt(colNum);
      const endCol = startCol + parseInt(node.colspan) - 1;
      reconstructed += `-${endCol}`;
    }

    return reconstructed;
  }

  private processMilestone(node: USJNode): void {
    this.result.push(`\\${node.marker}`);

    // Add attributes if present (with space before pipe)
    const attributes = this.extractAttributes(node);
    if (attributes.length > 0) {
      this.result.push(` |${attributes.join(' ')}`);
    }

    this.result.push('\\*');
  }

  private extractAttributes(node: USJNode): string[] {
    const standardProps = [
      'type',
      'marker',
      'content',
      'number',
      'code',
      'sid',
      'eid',
      'caller',
      'align',
      'colspan',
    ];

    const attributes: string[] = [];

    Object.entries(node).forEach(([key, value]) => {
      if (!standardProps.includes(key) && value !== undefined && value !== '') {
        // Attributes are already in kebab-case format
        const attrName = this.convertAttributeName(key);

        // Always quote attribute values to ensure proper parsing
        const quotedValue = String(value).replace(/"/g, '\\"'); // Escape existing quotes
        attributes.push(`${attrName}="${quotedValue}"`);
      }
    });

    return attributes;
  }

  private convertAttributeName(attributeName: string): string {
    // Attributes should always be in kebab-case format in both USFM and USJ
    return attributeName;
  }

  private hasContent(content: (USJNode | string)[] | string | undefined): boolean {
    if (!content) return false;

    if (typeof content === 'string') {
      return content.trim() !== '';
    }

    if (Array.isArray(content)) {
      return content.some((item) => {
        if (typeof item === 'string') {
          return item.trim() !== '';
        }
        return true; // Non-string nodes count as content
      });
    }

    return false;
  }

  /**
   * Add appropriate spacing based on structural context
   */
  private addStructuralSpacing(
    currentType: 'paragraph' | 'verse' | 'chapter' | 'book' | 'text'
  ): void {
    if (!this.options.normalize) return;

    const rules = this.options.normalizationRules;
    const needsSpacing = this.result.length > 0 && this.lastOutputType !== null;

    if (!needsSpacing) return;

    // Book markers always start on new line
    if (currentType === 'book') {
      if (this.lastOutputType !== null) {
        this.result.push('\n');
      }
      return;
    }

    // Chapter markers always start on new line
    if (currentType === 'chapter') {
      if (this.lastOutputType !== null) {
        this.result.push('\n');
      }
      return;
    }

    // Paragraph spacing rules
    if (currentType === 'paragraph') {
      if (this.lastOutputType === 'paragraph') {
        this.result.push(rules.paragraphSpacing === 'double' ? '\n\n' : '\n');
      } else if (this.lastOutputType !== null) {
        this.result.push('\n');
      }
      return;
    }

    // Verse spacing rules
    if (currentType === 'verse') {
      if (rules.verseSpacing === 'newline' && this.lastOutputType !== 'paragraph') {
        this.result.push('\n');
      }
      return;
    }
  }

  /**
   * Apply comprehensive normalization rules to the output
   */
  private applyNormalizationRules(input: string): string {
    let normalized = input;

    // Normalize line endings first
    normalized = normalized.replace(/\r\n|\r/g, '\n');

    // Apply spacing rules
    normalized = this.normalizeSpacing(normalized);

    // Apply paragraph flow rules
    normalized = this.normalizeParagraphFlow(normalized);

    // Apply verse boundary rules
    normalized = this.normalizeVerseBoundaries(normalized);

    // Clean up excessive whitespace
    normalized = this.cleanupWhitespace(normalized);

    return normalized;
  }

  /**
   * Normalize spacing between markers and content
   */
  private normalizeSpacing(input: string): string {
    let result = input;

    // Ensure single space after paragraph markers
    result = result.replace(
      /\\(p|q|q1|q2|q3|q4|m|mi|nb|li|li1|li2|li3|li4|ph|ph1|ph2|ph3|b|d|sp|cls|tr)\s+/g,
      '\\$1 '
    );

    // Ensure single space after verse markers
    result = result.replace(/\\v\s+(\S+)\s+/g, '\\v $1 ');

    // Ensure single space after chapter markers
    result = result.replace(/\\c\s+(\S+)\s*/g, '\\c $1\n');

    // Normalize character marker spacing based on rules
    if (this.options.normalizationRules.characterMarkerSpacing === 'minimal') {
      // Remove extra spaces around character markers
      result = result.replace(/\s+\\([a-z]+\*?)\s+/g, ' \\$1 ');
    }

    return result;
  }

  /**
   * Normalize paragraph flow and structure
   */
  private normalizeParagraphFlow(input: string): string {
    let result = input;

    // Ensure paragraph markers start on new lines
    result = result.replace(
      /([^\n])\\(p|q|q1|q2|q3|q4|m|mi|nb|li|li1|li2|li3|li4|ph|ph1|ph2|ph3|b|d|sp|cls|tr)/g,
      '$1\n\\$2'
    );

    // Handle paragraph spacing
    if (this.options.normalizationRules.paragraphSpacing === 'single') {
      // Ensure single line between paragraphs
      result = result.replace(/\n\n+(?=\\[pqmln])/g, '\n');
    } else if (this.options.normalizationRules.paragraphSpacing === 'double') {
      // Ensure double line between paragraphs
      result = result.replace(/\n+(?=\\[pqmln])/g, '\n\n');
    }

    return result;
  }

  /**
   * Normalize verse boundaries and transitions
   */
  private normalizeVerseBoundaries(input: string): string {
    let result = input;

    // Handle verse spacing
    if (this.options.normalizationRules.verseSpacing === 'newline') {
      // Put verses on new lines
      result = result.replace(/([^\n])\\v\s+/g, '$1\n\\v ');
    } else {
      // Keep verses inline
      result = result.replace(/\n\\v\s+/g, ' \\v ');
    }

    // Ensure proper spacing around verse numbers
    result = result.replace(/\\v\s+(\S+)\s*/g, '\\v $1 ');

    return result;
  }

  /**
   * Clean up excessive whitespace and normalize line endings
   */
  private cleanupWhitespace(input: string): string {
    let result = input;

    // Remove trailing spaces from lines
    result = result.replace(/[ \t]+$/gm, '');

    // Normalize multiple spaces to single space (except at line starts)
    result = result.replace(/([^\n])  +/g, '$1 ');

    // Remove excessive blank lines (more than 2 consecutive)
    result = result.replace(/\n{3,}/g, '\n\n');

    // Ensure file ends with single newline
    result = result.replace(/\n*$/, '\n');

    return result;
  }
}
