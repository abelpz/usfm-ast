/**
 * Universal Visitor System
 *
 * Supports both enhanced AST nodes (with accept methods) and plain USJ objects
 */

import { USJNode } from '../usj';
import { HydratedUSFMNode } from './index';
import { EnhancedUSJNode, hasEnhancedMethods } from './enhanced-usj-nodes';

// Universal node type - can be either enhanced USJ, legacy enhanced, plain USJ, or string
export type UniversalNode = EnhancedUSJNode | HydratedUSFMNode | USJNode | string;

// Universal visitor interface - supports both legacy and new USJ-enhanced nodes
export interface UniversalUSFMVisitor<T = void> {
  // Core visitor methods (work with any node type)
  visitParagraph(node: UniversalNode): T;
  visitCharacter(node: UniversalNode): T;
  visitNote(node: UniversalNode): T;
  visitText(node: UniversalNode): T;
  visitMilestone(node: UniversalNode): T;

  // USJ-specific methods (optional for backward compatibility)
  visitBook?(node: UniversalNode): T;
  visitChapter?(node: UniversalNode): T;
  visitVerse?(node: UniversalNode): T;
  visitRef?(node: UniversalNode): T;

  // Legacy methods (for backward compatibility)
  visitRoot?(node: UniversalNode): T;
}

// Universal visitor dispatcher
export class UniversalVisitorDispatcher {
  /**
   * Visits a node, automatically detecting if it's enhanced or plain USJ
   */
  static visit<T>(node: UniversalNode, visitor: UniversalUSFMVisitor<T>): T {
    // Handle string content
    if (typeof node === 'string') {
      return visitor.visitText(node);
    }

    // Handle enhanced nodes (have accept method) - both new USJ-enhanced and legacy
    if ('accept' in node && typeof node.accept === 'function') {
      return node.accept(visitor as any);
    }

    // Handle plain USJ objects - dispatch based on type
    return this.dispatchPlainUSJ(node as USJNode, visitor);
  }

  /**
   * Visits all children of a node
   */
  static visitChildren<T>(node: UniversalNode, visitor: UniversalUSFMVisitor<T>): T[] {
    if (typeof node === 'string') {
      return [];
    }

    const content = this.getContent(node);
    if (!Array.isArray(content)) {
      return [];
    }

    return content.map((child) => this.visit(child, visitor));
  }

  /**
   * Gets content from either enhanced or plain nodes
   */
  static getContent(node: UniversalNode): UniversalNode[] | string | undefined {
    if (typeof node === 'string') {
      return undefined;
    }

    // Enhanced nodes have getChildren method
    if ('getChildren' in node && typeof node.getChildren === 'function') {
      const children = node.getChildren();
      return Array.isArray(children) ? children : [children];
    }

    // Plain USJ objects have content property
    return (node as any).content;
  }

  /**
   * Dispatches plain USJ objects to appropriate visitor methods
   */
  private static dispatchPlainUSJ<T>(node: USJNode, visitor: UniversalUSFMVisitor<T>): T {
    const nodeType = (node as any).type;

    switch (nodeType) {
      case 'book':
        return visitor.visitBook?.(node) ?? visitor.visitParagraph(node);

      case 'chapter':
        return visitor.visitChapter?.(node) ?? visitor.visitParagraph(node);

      case 'para':
      case 'paragraph': // Legacy compatibility
        return visitor.visitParagraph(node);

      case 'char':
      case 'character': // Legacy compatibility
        return visitor.visitCharacter(node);

      case 'verse':
        return visitor.visitVerse?.(node) ?? visitor.visitCharacter(node);

      case 'note':
        return visitor.visitNote(node);

      case 'ms':
      case 'milestone': // Legacy compatibility
        return visitor.visitMilestone(node);

      case 'root':
        return visitor.visitRoot?.(node) ?? visitor.visitParagraph(node);

      case 'text':
        return visitor.visitText(node);

      case 'ref':
        return visitor.visitRef?.(node) ?? visitor.visitCharacter(node);

      default:
        // Fallback based on structure
        if ((node as any).marker) {
          // Has marker - likely paragraph or character
          const marker = (node as any).marker;
          if (this.isParagraphMarker(marker)) {
            return visitor.visitParagraph(node);
          } else {
            return visitor.visitCharacter(node);
          }
        }

        // Default to paragraph
        return visitor.visitParagraph(node);
    }
  }

  /**
   * Determines if a marker is typically a paragraph marker
   */
  private static isParagraphMarker(marker: string): boolean {
    const paragraphMarkers = [
      'p',
      'q',
      'q1',
      'q2',
      'q3',
      'm',
      'pi',
      'pi1',
      'pi2',
      's',
      's1',
      's2',
      's3',
      's4',
      'h',
      'toc1',
      'toc2',
      'toc3',
      'mt',
      'mt1',
      'mt2',
      'mt3',
      'mt4',
      'id',
      'c',
      'b',
    ];

    return paragraphMarkers.some((pm) => marker.startsWith(pm));
  }
}

// Helper function for easy usage
export function visitUniversal<T>(node: UniversalNode, visitor: UniversalUSFMVisitor<T>): T {
  return UniversalVisitorDispatcher.visit(node, visitor);
}

export function visitUniversalChildren<T>(
  node: UniversalNode,
  visitor: UniversalUSFMVisitor<T>
): T[] {
  return UniversalVisitorDispatcher.visitChildren(node, visitor);
}
