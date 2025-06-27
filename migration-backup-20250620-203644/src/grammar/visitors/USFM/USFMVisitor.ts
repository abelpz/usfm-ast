interface USJNode {
  type: string;
  marker?: string;
  content?: (USJNode | string)[] | string;
  [key: string]: any;
}

export class USFMVisitor {
  private result: string[] = [];
  private currentIndent: number = 0;
  private inTable: boolean = false;

  visit(node: USJNode): string {
    this.result = [];
    this.processNode(node);
    return this.result.join('');
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
        this.result.push(`\\${node.marker} ${node.code || ''}`);
        this.processContent(node.content);
        break;

      case 'chapter':
        this.result.push(`\n\\${node.marker} ${node.number || ''}`);
        break;

      case 'verse':
        this.result.push(`\\${node.marker} ${node.number || ''} `);
        break;

      case 'para':
        this.result.push(`\n\\${node.marker}`);
        if (node.content) {
          this.result.push(' ');
          this.processContent(node.content);
        }
        break;

      case 'char':
        this.processCharacterMarker(node);
        break;

      case 'note':
        this.processNoteMarker(node);
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
        // Handle unknown node types
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
      content.forEach((child) => this.processNode(child));
    }
  }

  private processCharacterMarker(node: USJNode): void {
    this.result.push(`\\${node.marker}`);

    // Add attributes if present
    if (this.hasAttributes(node)) {
      this.result.push('|');
      this.processAttributes(node);
    }

    this.result.push(' ');
    this.processContent(node.content);
    this.result.push(`\\${node.marker}*`);
  }

  private processNoteMarker(node: USJNode): void {
    this.result.push(`\\${node.marker}`);

    // Add caller if present
    if (node.caller) {
      this.result.push(` ${node.caller} `);
    } else {
      this.result.push(' ');
    }

    this.processContent(node.content);
    this.result.push(`\\${node.marker}*`);
  }

  private processTable(node: USJNode): void {
    this.inTable = true;
    this.processContent(node.content);
    this.inTable = false;
  }

  private processTableRow(node: USJNode): void {
    this.result.push(`\n\\${node.marker}`);
    if (node.content) {
      this.result.push(' ');
      this.processContent(node.content);
    }
  }

  private processTableCell(node: USJNode): void {
    // Reconstruct the original marker with alignment and colspan
    let marker = this.reconstructTableCellMarker(node);

    this.result.push(`\\${marker} `);
    this.processContent(node.content);
  }

  private reconstructTableCellMarker(node: USJNode): string {
    let baseMarker = node.marker || 'tc1';

    // Extract base type and number
    const match = baseMarker.match(/^(th|tc)(\d+)$/);
    if (!match) return baseMarker;

    const [, baseType, colNum] = match;

    // Add alignment suffix
    let alignedMarker = baseType;
    if (node.align === 'center') {
      alignedMarker += 'c';
    } else if (node.align === 'end') {
      alignedMarker += 'r';
    }

    alignedMarker += colNum;

    // Add colspan if present
    if (node.colspan && parseInt(node.colspan) > 1) {
      const endCol = parseInt(colNum) + parseInt(node.colspan) - 1;
      alignedMarker += `-${endCol}`;
    }

    return alignedMarker;
  }

  private processMilestone(node: USJNode): void {
    this.result.push(`\\${node.marker}`);

    // Add attributes if present
    if (this.hasAttributes(node)) {
      this.result.push('|');
      this.processAttributes(node);
    }

    this.result.push('\\*');
  }

  private hasAttributes(node: USJNode): boolean {
    // Check for any attributes beyond the standard properties
    const standardProps = ['type', 'marker', 'content', 'align', 'colspan'];
    return Object.keys(node).some((key) => !standardProps.includes(key));
  }

  private processAttributes(node: USJNode): void {
    const standardProps = ['type', 'marker', 'content', 'align', 'colspan'];
    const attributes: string[] = [];

    Object.entries(node).forEach(([key, value]) => {
      if (!standardProps.includes(key) && value !== undefined) {
        // Convert camelCase back to kebab-case for x- attributes
        const attrName = key.startsWith('x') ? key.replace(/([A-Z])/g, '-$1').toLowerCase() : key;
        attributes.push(`${attrName}="${value}"`);
      }
    });

    this.result.push(attributes.join(' '));
  }
}
