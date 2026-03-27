/**
 * USJ Adapter Pattern
 *
 * Wraps plain USJ objects to make them compatible with our enhanced visitor pattern
 */

import { USJNode } from '../usj';
import { BaseUSFMVisitor, USFMVisitorWithContext, HydratedUSFMNode } from './index';

// Adapter that makes plain USJ objects look like enhanced AST nodes
export class USJNodeAdapter implements HydratedUSFMNode {
  public readonly type: any;
  public readonly marker?: string;
  public readonly content?: any;

  constructor(
    private readonly usjNode: USJNode,
    private readonly parent?: USJNodeAdapter,
    private readonly index: number = 0
  ) {
    // Map USJ types to our AST types
    this.type = this.mapUSJTypeToASTType((usjNode as any).type);
    this.marker = (usjNode as any).marker;
    this.content = this.wrapChildren((usjNode as any).content);
  }

  // Enhanced methods that work with plain USJ data
  getParent(): HydratedUSFMNode | undefined {
    return this.parent;
  }

  getNextSibling(): HydratedUSFMNode | string | undefined {
    if (!this.parent) return undefined;

    const siblings = this.parent.getChildren();
    if (Array.isArray(siblings)) {
      return siblings[this.index + 1];
    }
    return undefined;
  }

  getPreviousSibling(): HydratedUSFMNode | string | undefined {
    if (!this.parent) return undefined;

    const siblings = this.parent.getChildren();
    if (Array.isArray(siblings)) {
      return siblings[this.index - 1];
    }
    return undefined;
  }

  getChildren(): HydratedUSFMNode[] | string {
    if (typeof this.content === 'string') {
      return this.content;
    }

    if (Array.isArray(this.content)) {
      return this.content as HydratedUSFMNode[];
    }

    return [];
  }

  // Visitor pattern methods
  accept<R>(visitor: BaseUSFMVisitor<R>): R {
    switch (this.type) {
      case 'paragraph':
        return visitor.visitParagraph(this as any);
      case 'character':
        return visitor.visitCharacter(this as any);
      case 'note':
        return visitor.visitNote(this as any);
      case 'text':
        return visitor.visitText(this as any);
      case 'milestone':
        return visitor.visitMilestone(this as any);
      default:
        // Fallback to paragraph
        return visitor.visitParagraph(this as any);
    }
  }

  acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R {
    switch (this.type) {
      case 'paragraph':
        return visitor.visitParagraph(this as any, context);
      case 'character':
        return visitor.visitCharacter(this as any, context);
      case 'note':
        return visitor.visitNote(this as any, context);
      case 'text':
        return visitor.visitText(this as any, context);
      case 'milestone':
        return visitor.visitMilestone(this as any, context);
      default:
        return visitor.visitParagraph(this as any, context);
    }
  }

  // Access to original USJ properties
  getUSJProperty(key: string): any {
    return (this.usjNode as any)[key];
  }

  getOriginalUSJNode(): USJNode {
    return this.usjNode;
  }

  // Private helper methods
  private mapUSJTypeToASTType(usjType: string): string {
    switch (usjType) {
      case 'book':
      case 'chapter':
      case 'para':
        return 'paragraph';

      case 'char':
      case 'verse':
        return 'character';

      case 'note':
        return 'note';

      case 'ms':
        return 'milestone';

      default:
        return 'paragraph';
    }
  }

  private wrapChildren(content: any): (USJNodeAdapter | string)[] | string {
    if (typeof content === 'string') {
      return content;
    }

    if (!Array.isArray(content)) {
      return [];
    }

    return content.map((child, index) => {
      if (typeof child === 'string') {
        return child;
      }

      return new USJNodeAdapter(child, this, index);
    });
  }
}

// Factory function to create adapters from USJ
export function createUSJAdapter(usjNode: USJNode): USJNodeAdapter {
  return new USJNodeAdapter(usjNode);
}

// Function to adapt an entire USJ document
export function adaptUSJDocument(usjDocument: any): USJNodeAdapter[] {
  if (!usjDocument.content || !Array.isArray(usjDocument.content)) {
    return [];
  }

  return usjDocument.content.map(
    (node: any, index: number) => new USJNodeAdapter(node, undefined, index)
  );
}

// Example usage with existing visitors
export function convertUSJWithExistingVisitor<T>(
  usjDocument: any,
  visitor: BaseUSFMVisitor<T>
): T[] {
  const adaptedNodes = adaptUSJDocument(usjDocument);

  return adaptedNodes.map((node) => node.accept(visitor));
}

// Helper to check if a node is an adapter
export function isUSJAdapter(node: any): node is USJNodeAdapter {
  return node instanceof USJNodeAdapter;
}
