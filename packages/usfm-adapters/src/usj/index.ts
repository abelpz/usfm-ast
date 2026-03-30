import {
  ParagraphUSFMNode,
  CharacterUSFMNode,
  NoteUSFMNode,
  TextUSFMNode,
  MilestoneUSFMNode,
} from '@usfm-tools/parser';
import { BaseUSFMVisitor } from '@usfm-tools/types';

interface USJNode {
  type: string;
  marker?: string;
  content?: (USJNode | string)[] | string;
  [key: string]: any;
}

export class USJVisitor implements BaseUSFMVisitor<USJNode> {
  /** Top-level USJ `content` may mix objects and bare text strings (parser `toJSON`). */
  private result: (USJNode | string)[] = [];
  private currentNode: USJNode | null = null;
  private pendingTableRows: USJNode[] = [];
  private inTable: boolean = false;

  visitBook(node: ParagraphUSFMNode): USJNode {
    const raw = node as any;
    const bookNode: USJNode = {
      type: 'book',
      marker: 'id',
      code: typeof raw.code === 'string' ? raw.code : '',
      content: Array.isArray(raw.content) ? [...raw.content] : [],
    };
    this.result.push(bookNode);
    return bookNode;
  }

  visitChapter(node: ParagraphUSFMNode): USJNode {
    const raw = node as any;
    const chapterNode: USJNode = {
      type: 'chapter',
      marker: 'c',
      number: typeof raw.number === 'string' ? raw.number : '',
    };
    if (raw.sid) chapterNode.sid = raw.sid;
    if (raw.altnumber) chapterNode.altnumber = raw.altnumber;
    if (raw.pubnumber) chapterNode.pubnumber = raw.pubnumber;
    this.result.push(chapterNode);
    return chapterNode;
  }

  visitVerse(node: CharacterUSFMNode): USJNode {
    const raw = node as any;
    const verseNode: USJNode = {
      type: 'verse',
      marker: 'v',
      number: typeof raw.number === 'string' ? raw.number : '',
    };
    if (raw.sid) verseNode.sid = raw.sid;
    if (raw.altnumber) verseNode.altnumber = raw.altnumber;
    if (raw.pubnumber) verseNode.pubnumber = raw.pubnumber;
    if (this.currentNode && Array.isArray(this.currentNode.content)) {
      this.currentNode.content.push(verseNode);
    } else {
      this.result.push(verseNode);
    }
    return verseNode;
  }

  visitParagraph(node: ParagraphUSFMNode): USJNode {
    // Handle table rows
    if (node.marker === 'tr') {
      const tableRowNode: USJNode = {
        type: 'table:row',
        marker: 'tr',
        content: [],
      };

      const prevNode = this.currentNode;
      this.currentNode = tableRowNode;

      if (node.content) {
        node.content.forEach((child) => child.accept(this));
      }

      this.currentNode = prevNode;

      // Add to pending table rows
      this.pendingTableRows.push(tableRowNode);
      this.inTable = true;

      return tableRowNode;
    }

    // If we were in a table and this is not a table row, finalize the table
    if (this.inTable && node.marker !== 'tr') {
      this.finalizeTable();
    }

    // Handle special paragraph types
    if (node.marker === 'id') {
      const content = this.extractTextContent(node);
      const parts = content.split(' ');
      const code = parts[0];
      const restContent = parts.slice(1).join(' ');

      const bookNode: USJNode = {
        type: 'book',
        marker: 'id',
        code,
        content: restContent ? [restContent] : [],
      };

      this.result.push(bookNode);
      return bookNode;
    }

    if (node.marker === 'c') {
      const number = this.extractTextContent(node);
      const chapterNode: USJNode = {
        type: 'chapter',
        marker: 'c',
        number,
        sid: `${this.getCurrentBookCode()} ${number}`,
      };

      this.result.push(chapterNode);
      return chapterNode;
    }

    // Regular paragraph
    const paraNode: USJNode = {
      type: 'para',
      marker: node.marker,
      content: [],
    };

    const prevNode = this.currentNode;
    this.currentNode = paraNode;

    if (node.content) {
      node.content.forEach((child) => child.accept(this));
    }

    this.currentNode = prevNode;

    this.result.push(paraNode);
    return paraNode;
  }

  visitCharacter(node: CharacterUSFMNode): USJNode {
    if (node.marker === 'v') {
      const number = this.extractTextContent(node);
      const verseNode: USJNode = {
        type: 'verse',
        marker: 'v',
        number,
        sid: `${this.getCurrentBookCode()} ${this.getCurrentChapterNumber()}:${number}`,
      };

      if (this.currentNode && Array.isArray(this.currentNode.content)) {
        this.currentNode.content.push(verseNode);
      } else {
        this.result.push(verseNode);
      }

      return verseNode;
    }

    // Handle table cell markers
    if (this.isTableCellMarker(node.marker)) {
      return this.createTableCell(node);
    }

    // Regular character marker
    const charNode: USJNode = {
      type: 'char',
      marker: node.marker,
      content: [],
    };

    this.copyCharacterAttributes(node, charNode);

    const prevNode = this.currentNode;
    this.currentNode = charNode;

    if (node.content) {
      node.content.forEach((child) => child.accept(this));
    }

    this.currentNode = prevNode;

    // If content is just a single text string, flatten it
    if (
      Array.isArray(charNode.content) &&
      charNode.content.length === 1 &&
      typeof charNode.content[0] === 'string'
    ) {
      charNode.content = charNode.content[0];
    }

    if (this.currentNode && Array.isArray(this.currentNode.content)) {
      this.currentNode.content.push(charNode);
    } else {
      this.result.push(charNode);
    }

    return charNode;
  }

  visitNote(node: NoteUSFMNode): USJNode {
    const noteNode: USJNode = {
      type: 'note',
      marker: node.marker,
      content: [],
    };

    if (node.caller) {
      noteNode.caller = node.caller;
    }

    const prevNode = this.currentNode;
    this.currentNode = noteNode;

    if (node.content) {
      node.content.forEach((child) => child.accept(this));
    }

    this.currentNode = prevNode;

    if (this.currentNode && Array.isArray(this.currentNode.content)) {
      this.currentNode.content.push(noteNode);
    } else {
      this.result.push(noteNode);
    }

    return noteNode;
  }

  visitText(node: TextUSFMNode): USJNode {
    const textContent = node.content as string;

    if (this.currentNode && Array.isArray(this.currentNode.content)) {
      this.currentNode.content.push(textContent);
    } else {
      // Root-level or other non-container siblings (matches parser `toJSON` / plain USJ)
      this.result.push(textContent);
    }

    return { type: 'text', content: textContent };
  }

  visitOptbreak(_node: unknown): USJNode {
    const n: USJNode = { type: 'optbreak' };
    if (this.currentNode && Array.isArray(this.currentNode.content)) {
      this.currentNode.content.push(n);
    } else {
      this.result.push(n);
    }
    return n;
  }

  visitRef(node: { loc?: string; content?: unknown[]; gen?: boolean }): USJNode {
    const raw = node as { loc?: string; content?: unknown[]; gen?: boolean };
    const refNode: USJNode = {
      type: 'ref',
      loc: typeof raw.loc === 'string' ? raw.loc : '',
      content: [],
    };
    if (raw.gen !== undefined) refNode.gen = raw.gen;

    const prev = this.currentNode;
    this.currentNode = refNode;
    if (Array.isArray(raw.content)) {
      raw.content.forEach((child: any) => {
        if (child && typeof child.accept === 'function') child.accept(this);
      });
    }
    this.currentNode = prev;

    if (
      Array.isArray(refNode.content) &&
      refNode.content.length === 1 &&
      typeof refNode.content[0] === 'string'
    ) {
      refNode.content = refNode.content[0];
    }

    if (this.currentNode && Array.isArray(this.currentNode.content)) {
      this.currentNode.content.push(refNode);
    } else {
      this.result.push(refNode);
    }
    return refNode;
  }

  visitMilestone(node: MilestoneUSFMNode): USJNode {
    const msNode: USJNode = {
      type: 'ms',
      marker: node.marker,
    };

    const raw = node as any;
    if (node.attributes) {
      Object.entries(node.attributes).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          msNode[this.normalizeAttributeName(key)] = String(value);
        }
      });
    }
    for (const key of Object.keys(raw)) {
      if (this.isInternalNodeKey(key)) continue;
      const val = raw[key];
      if (typeof val !== 'string') continue;
      if (key.startsWith('x-') || ['sid', 'eid', 'who'].includes(key)) {
        msNode[this.normalizeAttributeName(key)] = val;
      }
    }

    if (this.currentNode && Array.isArray(this.currentNode.content)) {
      this.currentNode.content.push(msNode);
    } else {
      this.result.push(msNode);
    }

    return msNode;
  }

  private extractTextContent(node: CharacterUSFMNode | NoteUSFMNode | ParagraphUSFMNode): string {
    if (!node.content) return '';

    return node.content
      .map((child) => {
        if (child.type === 'text') {
          return child.content;
        }
        return '';
      })
      .join('');
  }

  private normalizeAttributeName(key: string): string {
    // Keep attribute names in their original kebab-case format
    return key;
  }

  private isInternalNodeKey(key: string): boolean {
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
    ]).has(key);
  }

  /** Legacy nodes use `.attributes`; enhanced parser nodes store USJ fields as own string properties. */
  private copyCharacterAttributes(node: CharacterUSFMNode, charNode: USJNode): void {
    const raw = node as any;
    if (node.attributes) {
      Object.entries(node.attributes).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        const s = String(value);
        if (
          key.startsWith('x-') ||
          ['lemma', 'strong', 'occurrence', 'occurrences'].includes(key)
        ) {
          charNode[this.normalizeAttributeName(key)] = s;
        } else {
          charNode[key] = s;
        }
      });
    }
    for (const key of Object.keys(raw)) {
      if (this.isInternalNodeKey(key) || key === 'caller' || key === 'category') continue;
      const val = raw[key];
      if (typeof val !== 'string') continue;
      if (
        key.startsWith('x-') ||
        ['lemma', 'strong', 'occurrence', 'occurrences'].includes(key)
      ) {
        charNode[this.normalizeAttributeName(key)] = val;
      }
    }
  }

  private getCurrentBookCode(): string {
    // Find the most recent book node
    for (let i = this.result.length - 1; i >= 0; i--) {
      const n = this.result[i];
      if (typeof n === 'string') continue;
      if (n.type === 'book') {
        return n.code || '';
      }
    }
    return '';
  }

  private getCurrentChapterNumber(): string {
    // Find the most recent chapter node
    for (let i = this.result.length - 1; i >= 0; i--) {
      const n = this.result[i];
      if (typeof n === 'string') continue;
      if (n.type === 'chapter') {
        return n.number || '';
      }
    }
    return '1';
  }

  getResult(): USJNode {
    // Finalize any pending table before returning
    if (this.inTable) {
      this.finalizeTable();
    }

    // For single node tests, return the node directly (wrap bare text like `getDocument()`)
    if (this.result.length === 1) {
      const only = this.result[0];
      if (typeof only === 'string') {
        return { type: 'usfm', version: '3.0', content: [only] };
      }
      return only;
    }
    // For multiple nodes, return a document structure
    return {
      type: 'usfm',
      version: '3.0',
      content: this.result,
    };
  }

  getDocument(): USJNode {
    // Finalize any pending table before returning
    if (this.inTable) {
      this.finalizeTable();
    }

    return {
      type: 'USJ',
      version: '3.1',
      content: this.result,
    };
  }

  private finalizeTable(): void {
    if (this.pendingTableRows.length > 0) {
      const tableNode: USJNode = {
        type: 'table',
        content: this.pendingTableRows,
      };

      this.result.push(tableNode);
      this.pendingTableRows = [];
    }
    this.inTable = false;
  }

  private isTableCellMarker(marker: string): boolean {
    // Check if marker starts with table cell prefixes
    return /^(th|tc|thr|tcr|thc|tcc)\d+(-\d+)?$/.test(marker);
  }

  private createTableCell(node: CharacterUSFMNode): USJNode {
    const { align, colspan, normalizedMarker } = this.parseTableCellMarker(node.marker);

    const cellNode: USJNode = {
      type: 'table:cell',
      marker: normalizedMarker,
      align,
      content: [],
    };

    if (colspan) {
      cellNode.colspan = colspan;
    }

    const prevNode = this.currentNode;
    this.currentNode = cellNode;

    if (node.content) {
      node.content.forEach((child) => child.accept(this));
    }

    this.currentNode = prevNode;

    // Add this cell to the current table row
    if (this.currentNode && Array.isArray(this.currentNode.content)) {
      this.currentNode.content.push(cellNode);
    } else {
      this.result.push(cellNode);
    }

    return cellNode;
  }

  private parseTableCellMarker(marker: string): {
    align: string;
    colspan?: string;
    normalizedMarker: string;
  } {
    // Parse markers like th1, tc2, tcr3, tcr1-2, etc.
    const match = marker.match(/^(th|tc|thr|tcr|thc|tcc)(\d+)(-(\d+))?$/);
    if (!match) {
      return { align: 'start', normalizedMarker: marker };
    }

    const [, prefix, startCol, , endCol] = match;

    // Determine alignment based on the full prefix
    let align = 'start';
    if (prefix === 'thc' || prefix === 'tcc') {
      align = 'center';
    } else if (prefix === 'thr' || prefix === 'tcr') {
      align = 'end';
    }

    // Calculate colspan
    let colspan: string | undefined;
    let normalizedMarker = marker;

    if (endCol) {
      const span = parseInt(endCol) - parseInt(startCol) + 1;
      colspan = span.toString();
      // Normalize marker by removing the range part
      normalizedMarker = prefix + startCol;
    }

    return { align, colspan, normalizedMarker };
  }
}
