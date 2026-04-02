/**
 * Universal USFM Visitor
 *
 * This visitor can convert BOTH enhanced USJ nodes AND plain USJ objects to USFM
 * using the new Universal Visitor system.
 */

import { USFMFormatter } from '@usfm-tools/formatter';
import type { USFMFormatterOptions } from '@usfm-tools/formatter';
import {
  UniversalUSFMVisitor,
  UniversalNode,
  visitUniversal,
  visitUniversalChildren,
  hasEnhancedMethods,
  toPlainUSJ,
} from '@usfm-tools/types';

export type WhitespaceHandling = 'preserve' | 'normalize' | 'trim-edges' | 'normalize-and-trim';

export interface UniversalUSFMVisitorOptions {
  /** Formatter options for structural formatting */
  formatterOptions?: USFMFormatterOptions;

  /** How to handle whitespace in text content (default: 'normalize-and-trim') */
  whitespaceHandling?: WhitespaceHandling;

  /** Whether to normalize line endings to \n */
  normalizeLineEndings?: boolean;

  // Legacy options (for backward compatibility)
  preserveWhitespace?: boolean;
  trimParagraphEdges?: boolean;
}

/**
 * Universal USFM Visitor implementation that works with both enhanced and plain USJ nodes
 */
export class UniversalUSFMVisitorImpl implements UniversalUSFMVisitor<string> {
  private result: string = '';
  private options: Required<
    Omit<UniversalUSFMVisitorOptions, 'preserveWhitespace' | 'trimParagraphEdges'>
  > & {
    preserveWhitespace?: boolean;
    trimParagraphEdges?: boolean;
  };
  private formatter: USFMFormatter;
  private contextStack: string[] = [];
  private currentParent: any = null;
  private currentChildIndex: number = -1;

  constructor(options: UniversalUSFMVisitorOptions = {}) {
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
      visitUniversal(child, this);
    });

    // Restore previous context
    this.currentParent = prevParent;
    this.currentChildIndex = prevIndex;
  }

  /**
   * Gets the marker from any node type
   */
  private getMarker(node: UniversalNode): string | undefined {
    if (typeof node === 'string') return undefined;
    return (node as any).marker;
  }

  /**
   * Gets content from any node type
   */
  private getContent(node: UniversalNode): any[] | string | undefined {
    if (typeof node === 'string') return undefined;

    // Enhanced nodes have getChildren method
    if (hasEnhancedMethods(node)) {
      const children = node.getChildren();
      return Array.isArray(children) ? children : children;
    }

    // Plain objects have content property
    return (node as any).content;
  }

  /**
   * Gets a property from any node type
   */
  private getProperty(node: UniversalNode, prop: string): any {
    if (typeof node === 'string') return undefined;
    return (node as any)[prop];
  }

  /**
   * Visits a book node (USJ-specific)
   */
  visitBook(node: UniversalNode): string {
    if (typeof node === 'string') return '';

    const code = this.getProperty(node, 'code');
    const content = this.getProperty(node, 'content');

    this.result += `\\id ${code}`;
    if (Array.isArray(content) && content.length > 0) {
      this.result += ` ${content.join(' ')}`;
    }
    this.result += '\n';

    return this.result;
  }

  /**
   * Visits a chapter node (USJ-specific)
   */
  visitChapter(node: UniversalNode): string {
    if (typeof node === 'string') return '';

    const number = this.getProperty(node, 'number');
    this.result += `\\c ${number}\n`;

    return this.result;
  }

  /**
   * Visits a verse node (USJ-specific)
   */
  visitVerse(node: UniversalNode): string {
    if (typeof node === 'string') return '';

    const number = this.getProperty(node, 'number');
    this.result += `\\v ${number} `;

    return this.result;
  }

  /**
   * Visits a paragraph node
   */
  visitParagraph(node: UniversalNode): string {
    if (typeof node === 'string') return '';

    const marker = this.getMarker(node);
    if (!marker) return '';

    // Push paragraph context to stack
    this.contextStack.push('paragraph');

    // Add paragraph marker using formatter
    const formatted = this.formatter.addMarker(this.result, marker);
    this.result = formatted.normalizedOutput;

    // Visit children (content)
    const children = this.getContent(node);
    if (Array.isArray(children)) {
      this.visitChildren(node, children);
    }

    // Pop context from stack
    this.contextStack.pop();

    return this.result;
  }

  /**
   * Visits a character node
   */
  visitCharacter(node: UniversalNode): string {
    if (typeof node === 'string') return '';

    const marker = this.getMarker(node);
    if (!marker) return '';

    // Push character context to stack
    this.contextStack.push('character');

    // Nested spans: emit `\\marker` / `\\marker*` only (no `+` prefix; USFM 3.x explicit close).
    const actualMarker = marker;

    // Add opening character marker
    const formatted = this.formatter.addMarker(this.result, actualMarker);
    this.result = formatted.normalizedOutput;

    // Visit children (content)
    const children = this.getContent(node);
    if (Array.isArray(children)) {
      this.visitChildren(node, children);
    }

    // Add closing character marker
    const closingFormatted = this.formatter.addMarker(this.result, `${actualMarker}*`);
    this.result = closingFormatted.normalizedOutput;

    // Pop context from stack
    this.contextStack.pop();

    return this.result;
  }

  /**
   * Visits a note node
   */
  visitNote(node: UniversalNode): string {
    if (typeof node === 'string') return '';

    const marker = this.getMarker(node);
    const caller = this.getProperty(node, 'caller');

    if (!marker) return '';

    // Push note context to stack
    this.contextStack.push('note');

    // Add opening note marker with caller
    const formatted = this.formatter.addMarker(this.result, marker);
    this.result = formatted.normalizedOutput;

    if (caller !== undefined && caller !== null && String(caller) !== '') {
      const t = this.formatter.addTextContent(this.result, String(caller));
      this.result = t.normalizedOutput;
    }

    // Visit children (content)
    const children = this.getContent(node);
    if (Array.isArray(children)) {
      this.visitChildren(node, children);
    }

    // Add closing note marker
    const closingFormatted = this.formatter.addMarker(this.result, `${marker}*`);
    this.result = closingFormatted.normalizedOutput;

    // Pop context from stack
    this.contextStack.pop();

    return this.result;
  }

  /**
   * Visits a text node
   */
  visitText(node: UniversalNode): string {
    let content: string;

    if (typeof node === 'string') {
      content = node;
    } else {
      content = this.getProperty(node, 'content') || '';
    }

    // Apply whitespace handling
    content = this.applyWhitespaceHandling(content);

    // Add text content using formatter
    const formatted = this.formatter.addTextContent(this.result, content);
    this.result = formatted.normalizedOutput;

    return this.result;
  }

  /**
   * Scripture reference `\\ref …|loc\\ref*` (plain USJ `type: 'ref'`).
   */
  visitRef(node: UniversalNode): string {
    if (typeof node === 'string') return '';
    const raw = node as { loc?: string; content?: unknown[] | string };
    const loc = typeof raw.loc === 'string' ? raw.loc : '';
    let formatted = this.formatter.addTextContent(this.result, '\\ref ');
    this.result = formatted.normalizedOutput;
    if (typeof raw.content === 'string' && raw.content.length > 0) {
      formatted = this.formatter.addTextContent(this.result, raw.content);
      this.result = formatted.normalizedOutput;
    } else if (Array.isArray(raw.content)) {
      this.visitChildren(node, raw.content);
    }
    if (loc) {
      formatted = this.formatter.addTextContent(this.result, '|' + loc);
      this.result = formatted.normalizedOutput;
    }
    formatted = this.formatter.addMarker(this.result, 'ref', true);
    this.result = formatted.normalizedOutput;
    return this.result;
  }

  /**
   * Visits a milestone node
   */
  visitMilestone(node: UniversalNode): string {
    if (typeof node === 'string') return '';

    const marker = this.getMarker(node);
    if (!marker) return '';

    // Extract attributes (x-* properties, sid, eid, who)
    const attributes: Record<string, string> = {};

    if (typeof node === 'object') {
      Object.entries(node as any).forEach(([key, value]) => {
        if (key.startsWith('x-') || ['sid', 'eid', 'who'].includes(key)) {
          attributes[key] = String(value);
        }
      });
    }

    // Add milestone using formatter
    const formatted = this.formatter.addMilestone(this.result, marker, attributes);
    this.result = formatted.normalizedOutput;

    return this.result;
  }

  /**
   * Visits a root node (legacy compatibility)
   */
  visitRoot(node: UniversalNode): string {
    if (typeof node === 'string') return '';

    const children = this.getContent(node);
    if (Array.isArray(children)) {
      this.visitChildren(node, children);
    }

    return this.result;
  }

  /**
   * Applies whitespace handling based on options
   */
  private applyWhitespaceHandling(content: string): string {
    const { whitespaceHandling } = this.options;

    switch (whitespaceHandling) {
      case 'preserve':
        // Keep all whitespace as-is
        return content;

      case 'normalize':
        // Multiple spaces → single spaces, keep edges
        return content.replace(/\s+/g, ' ');

      case 'trim-edges':
        // Keep multiple spaces, trim paragraph edges
        return this.shouldTrimEdges() ? content.trim() : content;

      case 'normalize-and-trim':
        // Multiple spaces → single + trim edges
        const normalized = content.replace(/\s+/g, ' ');
        return this.shouldTrimEdges() ? normalized.trim() : normalized;

      default:
        return content;
    }
  }

  /**
   * Determines if edges should be trimmed based on position
   */
  private shouldTrimEdges(): boolean {
    if (!this.currentParent) return false;

    const children = this.getContent(this.currentParent);
    if (!Array.isArray(children)) return false;

    // Trim leading whitespace from first child
    if (this.currentChildIndex === 0) return true;

    // Trim trailing whitespace from last child
    if (this.currentChildIndex === children.length - 1) return true;

    return false;
  }

  /**
   * Gets the final result
   */
  getResult(): string {
    let result = this.result;

    if (this.options.normalizeLineEndings) {
      result = result.replace(/\r\n|\r/g, '\n');
    }

    return result;
  }
}

// Helper functions for easy usage

/**
 * Convert enhanced USJ nodes to USFM
 */
export function convertEnhancedUSJToUSFM(
  nodes: UniversalNode[],
  options?: UniversalUSFMVisitorOptions
): string {
  const visitor = new UniversalUSFMVisitorImpl(options);

  nodes.forEach((node) => {
    visitUniversal(node, visitor);
  });

  return visitor.getResult();
}

// `convertUSJDocumentToUSFM` is implemented in `./index.ts` via {@link USFMVisitor} (correct \\ref, notes, callers).

/**
 * Convert mixed format (enhanced + plain) to USFM
 */
export function convertMixedToUSFM(
  nodes: UniversalNode[],
  options?: UniversalUSFMVisitorOptions
): string {
  const visitor = new UniversalUSFMVisitorImpl(options);

  nodes.forEach((node) => {
    visitUniversal(node, visitor);
  });

  return visitor.getResult();
}
