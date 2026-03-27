import {
  USFMMarkerRegistry,
  CharacterUSFMNode,
  MilestoneUSFMNode,
  ParagraphUSFMNode,
  TextUSFMNode,
} from '@usfm-tools/parser';
import {
  BaseUSFMVisitor,
  ParagraphUSFMNode as ParagraphUSFMNodeInterface,
  CharacterUSFMNode as CharacterUSFMNodeInterface,
  NoteUSFMNode as NoteUSFMNodeInterface,
  TextUSFMNode as TextUSFMNodeInterface,
  MilestoneUSFMNode as MilestoneUSFMNodeInterface,
} from '@usfm-tools/types';
import { USFMFormatter, USFMFormatterOptions } from '@usfm-tools/formatter';

/**
 * Whitespace handling strategies for text content
 */
export type WhitespaceHandling =
  | 'preserve' // Keep all whitespace as-is (multiple spaces + edges)
  | 'normalize' // Multiple spaces → single spaces, keep edges
  | 'trim-edges' // Keep multiple spaces, trim paragraph edges
  | 'normalize-and-trim'; // Multiple spaces → single + trim edges

/**
 * Options for configuring the USFM visitor behavior
 */
export interface USFMVisitorOptions {
  /** Formatter options to pass to USFMFormatter */
  formatterOptions?: USFMFormatterOptions;

  /** How to handle whitespace in text content (default: 'normalize-and-trim') */
  whitespaceHandling?: WhitespaceHandling;

  /** Whether to normalize line endings to \n (default: false) */
  normalizeLineEndings?: boolean;

  /** @deprecated Use whitespaceHandling instead */
  preserveWhitespace?: boolean;

  /** @deprecated Use whitespaceHandling instead */
  trimParagraphEdges?: boolean;
}

/** Matches parser note-content detection: markers with `context` including NoteContent. */
function isNoteContentMarkerName(marker: string): boolean {
  const info = USFMMarkerRegistry.getInstance().getMarkerInfo(marker);
  return Boolean(info?.context?.includes('NoteContent'));
}

function isInternalASTKey(key: string): boolean {
  return new Set([
    'type',
    'marker',
    'content',
    'index',
    'attributes',
    'constructor',
    'accept',
    'acceptWithContext',
    'getChildren',
    'getParent',
    'getNextSibling',
    'getPreviousSibling',
    'toJSON',
    'number',
    'caller',
    'category',
    'code',
  ]).has(key);
}

/** Paragraph nodes from legacy class AST or enhanced parser (`ParsedParagraphNode`, type `para`). */
function isParagraphASTNode(parent: unknown): parent is { content: unknown[] } {
  if (!parent || typeof parent !== 'object') return false;
  const p = parent as { type?: string; constructor?: { name?: string }; content?: unknown };
  if (p.type === 'para' || p.type === 'paragraph') return true;
  const name = p.constructor?.name;
  return name === 'ParagraphUSFMNode' || name === 'ParsedParagraphNode';
}

/**
 * Clean, simplified USFM visitor that uses the new USFMFormatter API
 */
// Export Universal Visitor System
export * from './universal-usfm-visitor';

export class USFMVisitor implements BaseUSFMVisitor {
  private result: string = '';
  private options: Required<
    Omit<USFMVisitorOptions, 'preserveWhitespace' | 'trimParagraphEdges'>
  > & {
    preserveWhitespace?: boolean;
    trimParagraphEdges?: boolean;
  };
  private formatter: USFMFormatter;
  private contextStack: string[] = []; // Track marker context for nested markers
  private currentParent: any = null;
  private currentChildIndex: number = -1;

  constructor(options: USFMVisitorOptions = {}) {
    // Handle backward compatibility
    let whitespaceHandling: WhitespaceHandling = 'normalize-and-trim';

    if (options.whitespaceHandling) {
      whitespaceHandling = options.whitespaceHandling;
    } else if (
      options.preserveWhitespace !== undefined ||
      options.trimParagraphEdges !== undefined
    ) {
      // Legacy behavior mapping
      const preserveSpaces = options.preserveWhitespace || false;
      const trimEdges = options.trimParagraphEdges || false;

      if (preserveSpaces && trimEdges) {
        whitespaceHandling = 'trim-edges';
      } else if (preserveSpaces && !trimEdges) {
        whitespaceHandling = 'preserve';
      } else if (!preserveSpaces && trimEdges) {
        whitespaceHandling = 'normalize-and-trim';
      } else {
        whitespaceHandling = 'normalize';
      }
    }

    this.options = {
      formatterOptions: options.formatterOptions || {},
      whitespaceHandling,
      normalizeLineEndings: options.normalizeLineEndings || false,
      preserveWhitespace: options.preserveWhitespace,
      trimParagraphEdges: options.trimParagraphEdges,
    };

    this.formatter = new USFMFormatter(this.options.formatterOptions);
  }

  visitBook(node: ParagraphUSFMNodeInterface): string {
    const raw = node as any;
    this.contextStack.push('paragraph');
    const formatted = this.formatter.addMarker(this.result, 'id');
    this.result = formatted.normalizedOutput;
    if (raw.code) {
      const t = this.formatter.addTextContent(this.result, String(raw.code));
      this.result = t.normalizedOutput;
    }
    if (Array.isArray(raw.content) && raw.content.length > 0) {
      const contentText = raw.content.map((x: unknown) => String(x)).join(' ');
      if (contentText.trim()) {
        const t = this.formatter.addTextContent(this.result, ' ' + contentText);
        this.result = t.normalizedOutput;
      }
    }
    this.contextStack.pop();
    return this.result;
  }

  visitChapter(node: ParagraphUSFMNodeInterface): string {
    const raw = node as any;
    this.contextStack.push('paragraph');
    const formatted = this.formatter.addMarker(this.result, 'c');
    this.result = formatted.normalizedOutput;
    if (raw.number != null && String(raw.number) !== '') {
      const t = this.formatter.addTextContent(this.result, String(raw.number));
      this.result = t.normalizedOutput;
    }
    if (Array.isArray(raw.content) && raw.content.length > 0) {
      this.visitChildren(raw, raw.content);
    }
    this.contextStack.pop();
    return this.result;
  }

  visitVerse(node: CharacterUSFMNodeInterface): string {
    const raw = node as any;
    this.contextStack.push('character');
    const openingFormatted = this.formatter.addMarker(this.result, 'v');
    this.result = openingFormatted.normalizedOutput;
    if (raw.number != null && String(raw.number) !== '') {
      const t = this.formatter.addTextContent(this.result, String(raw.number) + ' ');
      this.result = t.normalizedOutput;
    }
    if (Array.isArray(raw.content) && raw.content.length > 0) {
      this.visitChildren(raw, raw.content);
    }
    this.contextStack.pop();
    return this.result;
  }

  /**
   * Gets the current result string
   */
  getResult(): string {
    let result = this.result;

    // Apply line ending normalization if requested
    if (this.options.normalizeLineEndings) {
      result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    return result;
  }

  /**
   * Resets the visitor state for reuse
   */
  reset(): void {
    this.result = '';
    this.contextStack = [];
    this.currentParent = null;
    this.currentChildIndex = -1;
  }

  /**
   * Helper method to visit children with position tracking
   */
  private visitChildren(parent: any, children: any[]): void {
    const prevParent = this.currentParent;
    const prevIndex = this.currentChildIndex;

    this.currentParent = parent;

    children.forEach((child, index) => {
      this.currentChildIndex = index;

      // Handle different types of children
      if (typeof child === 'string') {
        // Handle text content directly
        this.visitText({ content: child } as TextUSFMNodeInterface);
      } else if (
        child &&
        typeof child === 'object' &&
        'accept' in child &&
        typeof child.accept === 'function'
      ) {
        // Enhanced node with accept method
        child.accept(this);
      } else if (child && typeof child === 'object') {
        // Plain object - route based on type or marker
        this.routePlainObject(child);
      }
    });

    // Restore previous context
    this.currentParent = prevParent;
    this.currentChildIndex = prevIndex;
  }

  /**
   * Routes plain objects to the appropriate visitor method
   */
  private routePlainObject(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    // Determine object type and call appropriate visitor
    if (
      obj.type === 'para' ||
      (!obj.type && obj.marker && this.getMarkerType(obj.marker) === 'paragraph')
    ) {
      this.visitParagraph(obj as ParagraphUSFMNodeInterface);
    } else if (
      obj.type === 'char' ||
      (!obj.type && obj.marker && this.getMarkerType(obj.marker) === 'character')
    ) {
      this.visitCharacter(obj as CharacterUSFMNodeInterface);
    } else if (
      obj.type === 'note' ||
      (!obj.type && obj.marker && this.getMarkerType(obj.marker) === 'note')
    ) {
      this.visitNote(obj as NoteUSFMNodeInterface);
    } else if (
      obj.type === 'ms' ||
      (!obj.type && obj.marker && this.getMarkerType(obj.marker) === 'milestone')
    ) {
      this.visitMilestone(obj as MilestoneUSFMNodeInterface);
    } else if (obj.content !== undefined && typeof obj.content === 'string') {
      // Text node
      this.visitText(obj as TextUSFMNodeInterface);
    } else if (typeof obj === 'string') {
      // Plain text
      this.visitText({ content: obj } as TextUSFMNodeInterface);
    }
  }

  /**
   * Gets marker type using the USFMMarkerRegistry
   */
  private getMarkerType(marker: string): string {
    const registry = USFMMarkerRegistry.getInstance();
    const markerType = registry.getMarkerInfo(marker, 'type');

    if (markerType) {
      return markerType;
    }

    // If not in registry, infer type based on common patterns
    if (marker.endsWith('-s') || marker.endsWith('-e')) {
      return 'milestone';
    }

    // Default to character if we can't determine
    return 'character';
  }

  /**
   * Visits a paragraph node and converts it to USFM format.
   */
  visitParagraph(node: ParagraphUSFMNodeInterface): string {
    const marker = node.marker;

    // Push paragraph context to stack
    this.contextStack.push('paragraph');

    // Add paragraph marker using formatter
    const formatted = this.formatter.addMarker(this.result, marker);
    this.result = formatted.normalizedOutput;

    // Handle special paragraph markers like ID
    if (marker === 'id') {
      // For ID markers, check for code and content properties
      if ((node as any).code) {
        const code = (node as any).code;
        const codeFormatted = this.formatter.addTextContent(this.result, code);
        this.result = codeFormatted.normalizedOutput;

        // Add content if it exists
        if (
          (node as any).content &&
          Array.isArray((node as any).content) &&
          (node as any).content.length > 0
        ) {
          const contentText = (node as any).content.join(' ');
          if (contentText.trim()) {
            const contentFormatted = this.formatter.addTextContent(this.result, ' ' + contentText);
            this.result = contentFormatted.normalizedOutput;
          }
        }
      }
    } else {
      // Visit children (content) for other paragraph types
      if (Array.isArray(node.content)) {
        this.visitChildren(node, node.content);
      }
    }

    // Pop context from stack
    this.contextStack.pop();

    return this.result;
  }

  /**
   * Visits a character node and converts it to USFM format.
   */
  visitCharacter(node: CharacterUSFMNodeInterface): string {
    const marker = node.marker;

    // Determine if this marker should be nested (+ prefix)
    // Character markers inside other character markers get + prefix
    const isNested = this.contextStack.some((context) => context === 'character');
    const effectiveMarker = isNested ? `+${marker}` : marker;

    // Push current context to stack
    this.contextStack.push('character');

    // Add opening marker using formatter
    const openingFormatted = this.formatter.addMarker(this.result, effectiveMarker);
    this.result = openingFormatted.normalizedOutput;

    // Handle special content for verses, chapters, and ID markers
    if (marker === 'v' || marker === 'c') {
      // For verses and chapters, the content might be structured
      this.handleSpecialMarkerContent(node, marker);
    } else {
      // Visit children (content) FIRST
      if (Array.isArray(node.content)) {
        this.visitChildren(node, node.content);
      }
    }

    // Add attributes AFTER content (for non-special markers)
    if (marker !== 'v' && marker !== 'c') {
      const validAttributes = this.collectCharacterAttributes(node);
      if (Object.keys(validAttributes).length > 0) {
        const attributesFormatted = this.formatter.addAttributes(this.result, validAttributes);
        this.result = attributesFormatted.normalizedOutput;
      }
    }

    // Add closing marker for character markers (not verses or note content)
    const isVerse = marker === 'v';
    const isChapter = marker === 'c';
    const isNoteContent = isNoteContentMarkerName(marker);
    const needsClosing = !isVerse && !isChapter && !isNoteContent;

    if (needsClosing) {
      // Use effectiveMarker for nested characters
      const closingFormatted = this.formatter.addMarker(this.result, effectiveMarker, true);
      this.result = closingFormatted.normalizedOutput;
    }

    // Pop context from stack
    this.contextStack.pop();

    return this.result;
  }

  /**
   * Handles special content for verse and chapter markers
   */
  private handleSpecialMarkerContent(node: CharacterUSFMNodeInterface, marker: string): void {
    if (marker === 'v') {
      // For verses, add the verse number directly
      if ((node as any).number) {
        const verseNumber = (node as any).number;
        const formatted = this.formatter.addTextContent(this.result, verseNumber + ' ');
        this.result = formatted.normalizedOutput;
      }

      // Visit children for verse content
      if (Array.isArray(node.content)) {
        this.visitChildren(node, node.content);
      }
    } else if (marker === 'c') {
      // For chapters, add the chapter number directly
      if ((node as any).number) {
        const chapterNumber = (node as any).number;
        const formatted = this.formatter.addTextContent(this.result, chapterNumber);
        this.result = formatted.normalizedOutput;
      }

      // Visit children for chapter content
      if (Array.isArray(node.content)) {
        this.visitChildren(node, node.content);
      }
    }
  }

  /**
   * Visits a text node and converts it to USFM format.
   */
  visitText(node: TextUSFMNodeInterface): string {
    // Use the correct property name - it should be 'content'
    let textContent = node.content || '';

    // Apply whitespace handling based on the strategy
    const { whitespaceHandling } = this.options;

    // Step 1: Handle space normalization
    const shouldNormalizeSpaces =
      whitespaceHandling === 'normalize' || whitespaceHandling === 'normalize-and-trim';
    if (shouldNormalizeSpaces) {
      // Only normalize multiple spaces to single spaces - preserve leading/trailing spaces as they are significant
      textContent = textContent.replace(/\s+/g, ' ');
    }

    // Step 2: Handle paragraph edge trimming
    const shouldTrimEdges =
      whitespaceHandling === 'trim-edges' || whitespaceHandling === 'normalize-and-trim';
    if (shouldTrimEdges && this.currentParent) {
      const isParagraphChild =
        isParagraphASTNode(this.currentParent) && Array.isArray(this.currentParent.content);

      if (isParagraphChild) {
        const siblings = this.currentParent.content;
        const isFirstChild = this.currentChildIndex === 0;
        const isLastChild = this.currentChildIndex === siblings.length - 1;

        // Trim leading whitespace if this is the first child of a paragraph
        if (isFirstChild) {
          textContent = textContent.trimStart();
        }

        // Trim trailing whitespace if this is the last child of a paragraph
        if (isLastChild) {
          textContent = textContent.trimEnd();
        }
      }
    }

    // Add text content using formatter
    const formatted = this.formatter.addTextContent(this.result, textContent);
    this.result = formatted.normalizedOutput;

    return this.result;
  }

  /**
   * Visits a milestone node and converts it to USFM format.
   */
  visitMilestone(node: MilestoneUSFMNodeInterface): string {
    const marker = node.marker;

    const validAttributes = this.collectMilestoneAttributes(node);
    const formatted = this.formatter.addMilestone(
      this.result,
      marker,
      Object.keys(validAttributes).length > 0 ? validAttributes : undefined
    );
    this.result = formatted.normalizedOutput;

    return this.result;
  }

  /**
   * Visits a note node and converts it to USFM format.
   */
  visitNote(node: NoteUSFMNodeInterface): string {
    const marker = node.marker;

    // Push note context to stack
    this.contextStack.push('note');

    // Add opening note marker using formatter
    const openingFormatted = this.formatter.addMarker(this.result, marker);
    this.result = openingFormatted.normalizedOutput;

    // Add note caller with proper spacing (+ for footnotes, - for cross-references, etc.)
    if (node.caller) {
      const callerFormatted = this.formatter.addTextContent(this.result, ` ${node.caller} `);
      this.result = callerFormatted.normalizedOutput;
    }

    // Visit children (note content)
    if (Array.isArray(node.content)) {
      this.visitChildren(node, node.content);
    }

    // Add closing note marker
    const closingFormatted = this.formatter.addMarker(this.result, marker, true);
    this.result = closingFormatted.normalizedOutput;

    // Pop context from stack
    this.contextStack.pop();

    return this.result;
  }

  private collectCharacterAttributes(node: CharacterUSFMNodeInterface): Record<string, string> {
    const out: Record<string, string> = {};
    const raw = node as any;
    if (node.attributes) {
      for (const [k, v] of Object.entries(node.attributes)) {
        if (v !== undefined && v !== null) out[k] = String(v);
      }
    }
    for (const key of Object.keys(raw)) {
      if (isInternalASTKey(key)) continue;
      const val = raw[key];
      if (typeof val !== 'string') continue;
      if (
        key.startsWith('x-') ||
        ['lemma', 'strong', 'occurrence', 'occurrences'].includes(key)
      ) {
        out[key] = val;
      }
    }
    return out;
  }

  private collectMilestoneAttributes(node: MilestoneUSFMNodeInterface): Record<string, string> {
    const out: Record<string, string> = {};
    const raw = node as any;
    if (node.attributes) {
      for (const [k, v] of Object.entries(node.attributes)) {
        if (v !== undefined && v !== null) out[k] = String(v);
      }
    }
    for (const key of Object.keys(raw)) {
      if (key === 'type' || key === 'marker' || key === 'content' || key === 'attributes') continue;
      const val = raw[key];
      if (typeof val !== 'string') continue;
      if (key.startsWith('x-') || ['sid', 'eid', 'who'].includes(key)) {
        out[key] = val;
      }
    }
    return out;
  }
}

// Re-export for convenience
export { USFMFormatter, USFMFormatterOptions } from '@usfm-tools/formatter';
export type { FormatResult } from '@usfm-tools/formatter';
