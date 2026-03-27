/**
 * Example: Universal USFM Visitor
 *
 * This visitor can convert BOTH enhanced AST nodes AND plain USJ objects to USFM
 */

import {
  UniversalUSFMVisitor,
  UniversalNode,
  visitUniversal,
  visitUniversalChildren,
} from './universal-visitor';

export class UniversalUSFMConverter implements UniversalUSFMVisitor<string> {
  private result: string = '';

  visitParagraph(node: UniversalNode): string {
    if (typeof node === 'string') return '';

    const marker = this.getMarker(node);
    if (!marker) return '';

    // Add paragraph marker
    this.result += `\\${marker}`;

    // Handle special cases
    if (marker === 'id') {
      const code = this.getProperty(node, 'code');
      const content = this.getStringContent(node);
      this.result += ` ${code}${content ? ' ' + content : ''}`;
    } else if (marker === 'c') {
      const number = this.getProperty(node, 'number');
      this.result += ` ${number}`;
    } else {
      // Regular paragraph - visit children
      const children = this.getContent(node);
      if (Array.isArray(children)) {
        children.forEach((child) => {
          visitUniversal(child, this);
        });
      }
    }

    this.result += '\n';
    return this.result;
  }

  visitCharacter(node: UniversalNode): string {
    if (typeof node === 'string') return '';

    const marker = this.getMarker(node);
    if (!marker) return '';

    // Handle verse markers specially
    if (marker === 'v') {
      const number = this.getProperty(node, 'number');
      this.result += `\\v ${number} `;
      return this.result;
    }

    // Regular character marker
    this.result += `\\${marker} `;

    // Visit children
    const children = this.getContent(node);
    if (Array.isArray(children)) {
      children.forEach((child) => {
        visitUniversal(child, this);
      });
    }

    this.result += `\\${marker}* `;
    return this.result;
  }

  visitNote(node: UniversalNode): string {
    if (typeof node === 'string') return '';

    const marker = this.getMarker(node);
    const caller = this.getProperty(node, 'caller') || '+';

    this.result += `\\${marker} ${caller} `;

    // Visit children
    const children = this.getContent(node);
    if (Array.isArray(children)) {
      children.forEach((child) => {
        visitUniversal(child, this);
      });
    }

    this.result += `\\${marker}*`;
    return this.result;
  }

  visitText(node: UniversalNode): string {
    if (typeof node === 'string') {
      this.result += node;
    }
    return this.result;
  }

  visitMilestone(node: UniversalNode): string {
    if (typeof node === 'string') return '';

    const marker = this.getMarker(node);
    this.result += `\\${marker}`;

    // Add attributes if present
    const attributes = this.getAttributes(node);
    if (attributes && Object.keys(attributes).length > 0) {
      this.result += ' ';
      Object.entries(attributes).forEach(([key, value]) => {
        this.result += `${key}="${value}" `;
      });
    }

    this.result += '\\*';
    return this.result;
  }

  // Optional USJ-specific handlers
  visitBook(node: UniversalNode): string {
    return this.visitParagraph(node);
  }

  visitChapter(node: UniversalNode): string {
    return this.visitParagraph(node);
  }

  visitVerse(node: UniversalNode): string {
    return this.visitCharacter(node);
  }

  // Helper methods that work with both enhanced and plain nodes
  private getMarker(node: UniversalNode): string | undefined {
    if (typeof node === 'string') return undefined;
    return (node as any).marker;
  }

  private getProperty(node: UniversalNode, prop: string): any {
    if (typeof node === 'string') return undefined;
    return (node as any)[prop];
  }

  private getContent(node: UniversalNode): UniversalNode[] | undefined {
    if (typeof node === 'string') return undefined;

    // Enhanced nodes
    if ('getChildren' in node && typeof node.getChildren === 'function') {
      const children = node.getChildren();
      return Array.isArray(children) ? children : [children];
    }

    // Plain USJ objects
    return (node as any).content;
  }

  private getStringContent(node: UniversalNode): string {
    if (typeof node === 'string') return node;

    const content = this.getContent(node);
    if (Array.isArray(content)) {
      return content.filter((child) => typeof child === 'string').join('');
    }

    return '';
  }

  private getAttributes(node: UniversalNode): Record<string, string> | undefined {
    if (typeof node === 'string') return undefined;

    // Enhanced nodes
    if ('attributes' in node) {
      return (node as any).attributes;
    }

    // Plain USJ - extract x-* properties
    const attrs: Record<string, string> = {};
    Object.entries(node as any).forEach(([key, value]) => {
      if (key.startsWith('x-') || ['sid', 'eid', 'who'].includes(key)) {
        attrs[key] = String(value);
      }
    });

    return Object.keys(attrs).length > 0 ? attrs : undefined;
  }

  getResult(): string {
    return this.result;
  }

  reset(): void {
    this.result = '';
  }
}

// Usage examples:

// Example 1: Convert enhanced AST to USFM
export function convertEnhancedASTToUSFM(astNodes: any[]): string {
  const converter = new UniversalUSFMConverter();

  astNodes.forEach((node) => {
    visitUniversal(node, converter);
  });

  return converter.getResult();
}

// Example 2: Convert plain USJ to USFM
export function convertUSJToUSFM(usjDocument: any): string {
  const converter = new UniversalUSFMConverter();

  if (usjDocument.content && Array.isArray(usjDocument.content)) {
    usjDocument.content.forEach((node: any) => {
      visitUniversal(node, converter);
    });
  }

  return converter.getResult();
}

// Example 3: Convert mixed format (some enhanced, some plain)
export function convertMixedToUSFM(nodes: UniversalNode[]): string {
  const converter = new UniversalUSFMConverter();

  nodes.forEach((node) => {
    visitUniversal(node, converter);
  });

  return converter.getResult();
}
