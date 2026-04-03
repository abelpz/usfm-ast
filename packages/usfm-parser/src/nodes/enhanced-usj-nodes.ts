/**
 * Enhanced USJ Node Implementations for Parser
 *
 * These nodes are USJ-compatible at the structural level but include
 * enhanced navigation and visitor methods for the parser.
 */

import {
  EnhancedUSJNode,
  EnhancedBookNode,
  EnhancedChapterNode,
  EnhancedParagraphNode,
  EnhancedCharacterNode,
  EnhancedVerseNode,
  EnhancedNoteNode,
  EnhancedMilestoneNode,
  EnhancedTextNode,
  EnhancedRootNode,
  UniversalUSFMVisitor,
  toPlainUSJ,
} from '@usfm-tools/types';
import { USFMMarkerRegistry } from '../constants';

// Base implementation with common enhanced methods for parser nodes
export abstract class BaseEnhancedUSJNode {
  private _index!: number;
  private _parent?: BaseEnhancedUSJNode;

  constructor(index: number, parent?: BaseEnhancedUSJNode) {
    // Store enhanced properties as non-enumerable
    Object.defineProperty(this, '_index', {
      value: index,
      writable: true,
      enumerable: false,
      configurable: true,
    });

    Object.defineProperty(this, '_parent', {
      value: parent,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }

  getParent(): EnhancedUSJNode | undefined {
    return this._parent as any;
  }

  getNextSibling(): EnhancedUSJNode | string | undefined {
    const parent = this.getParent();
    if (!parent) return undefined;

    const siblings = parent.getChildren();
    if (Array.isArray(siblings)) {
      return siblings[this._index + 1];
    }
    return undefined;
  }

  getPreviousSibling(): EnhancedUSJNode | string | undefined {
    const parent = this.getParent();
    if (!parent) return undefined;

    const siblings = parent.getChildren();
    if (Array.isArray(siblings)) {
      return siblings[this._index - 1];
    }
    return undefined;
  }

  abstract getChildren(): EnhancedUSJNode[] | string;
  abstract accept<R>(visitor: any): R;
  abstract acceptWithContext<R, C>(visitor: any, context: C): R;
}

// Root node implementation for parser
export class ParsedRootNode implements EnhancedRootNode {
  readonly type = 'root' as const;

  constructor(public content: EnhancedUSJNode[]) {}

  getChildren(): EnhancedUSJNode[] {
    return this.content;
  }

  // Add toJSON method for plain USJ export
  toJSON(): any {
    return {
      type: 'USJ',
      version: '3.1',
      content: this.content.map((node) => toPlainUSJ(node)),
    };
  }
}

// Book node implementation (handles \id markers)
export class ParsedBookNode extends BaseEnhancedUSJNode implements EnhancedBookNode {
  readonly type = 'book' as const;
  readonly marker = 'id' as const;

  constructor(
    public code: string,
    public content: string[] = [],
    index: number = 0,
    parent?: BaseEnhancedUSJNode
  ) {
    super(index, parent);
  }

  getChildren(): string {
    return this.content.join(' ');
  }

  accept<R>(visitor: any): R {
    if (visitor.visitBook) {
      return visitor.visitBook(this);
    }
    return visitor.visitParagraph(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    if (visitor.visitBook) {
      return visitor.visitBook(this, context);
    }
    return visitor.visitParagraph(this, context);
  }
}

// Chapter node implementation (handles \c markers)
export class ParsedChapterNode extends BaseEnhancedUSJNode implements EnhancedChapterNode {
  readonly type = 'chapter' as const;
  readonly marker = 'c' as const;

  constructor(
    public number: string,
    sid?: string,
    altnumber?: string,
    pubnumber?: string,
    index: number = 0,
    parent?: BaseEnhancedUSJNode
  ) {
    super(index, parent);

    // Only add optional properties if they have values, and make them enumerable
    if (sid) this.sid = sid;
    if (altnumber) this.altnumber = altnumber;
    if (pubnumber) this.pubnumber = pubnumber;
  }

  // Declare optional properties
  sid?: string;
  altnumber?: string;
  pubnumber?: string;

  getChildren(): EnhancedUSJNode[] {
    return []; // Chapters typically don't have children
  }

  accept<R>(visitor: any): R {
    if (visitor.visitChapter) {
      return visitor.visitChapter(this);
    }
    return visitor.visitParagraph(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    if (visitor.visitChapter) {
      return visitor.visitChapter(this, context);
    }
    return visitor.visitParagraph(this, context);
  }
}

// Paragraph node implementation
export class ParsedParagraphNode extends BaseEnhancedUSJNode implements EnhancedParagraphNode {
  readonly type = 'para' as const;

  constructor(
    public marker: string,
    public content: EnhancedUSJNode[] = [],
    sid?: string,
    index: number = 0,
    parent?: BaseEnhancedUSJNode
  ) {
    super(index, parent);

    // Only add sid if it has a value
    if (sid) this.sid = sid;
  }

  // Declare optional property
  sid?: string;

  getChildren(): EnhancedUSJNode[] {
    return this.content || [];
  }

  accept<R>(visitor: any): R {
    return visitor.visitParagraph(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    return visitor.visitParagraph(this, context);
  }

  toJSON(): any {
    const result: any = {
      type: this.type,
      marker: this.marker,
    };

    // Check if this is a break paragraph by looking at the marker registry
    const markerRegistry = USFMMarkerRegistry.getInstance();
    const markerInfo = markerRegistry.getMarkerInfo(this.marker);

    // Only add content for non-break paragraphs
    if (markerInfo?.role !== 'break') {
      result.content = this.content.map((child) =>
        (child as any).toJSON ? (child as any).toJSON() : child
      );
    }

    // Add optional properties if they exist
    if (this.sid) {
      result.sid = this.sid;
    }

    return result;
  }
}

// Character node implementation
export class ParsedCharacterNode extends BaseEnhancedUSJNode implements EnhancedCharacterNode {
  readonly type = 'char' as const;

  [key: `x-${string}`]: string;

  constructor(
    public marker: string,
    public content: EnhancedUSJNode[] = [],
    attributes: Record<string, string> = {},
    index: number = 0,
    parent?: BaseEnhancedUSJNode
  ) {
    super(index, parent);

    // Set attributes
    Object.entries(attributes).forEach(([key, value]) => {
      (this as any)[key] = value;
    });
  }

  getChildren(): EnhancedUSJNode[] {
    return this.content || [];
  }

  accept<R>(visitor: any): R {
    return visitor.visitCharacter(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    return visitor.visitCharacter(this, context);
  }
}

// Verse node implementation (handles \v markers)
export class ParsedVerseNode extends BaseEnhancedUSJNode implements EnhancedVerseNode {
  readonly type = 'verse' as const;

  constructor(
    public marker: string,
    public number: string,
    sid?: string,
    altnumber?: string,
    pubnumber?: string,
    index: number = 0,
    parent?: BaseEnhancedUSJNode
  ) {
    super(index, parent);

    // Only add optional properties if they have values, and make them enumerable
    if (sid) this.sid = sid;
    if (altnumber) this.altnumber = altnumber;
    if (pubnumber) this.pubnumber = pubnumber;
  }

  // Declare optional properties
  sid?: string;
  altnumber?: string;
  pubnumber?: string;

  getChildren(): EnhancedUSJNode[] {
    return []; // Verses typically don't have children
  }

  accept<R>(visitor: any): R {
    if (visitor.visitVerse) {
      return visitor.visitVerse(this);
    }
    return visitor.visitCharacter(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    if (visitor.visitVerse) {
      return visitor.visitVerse(this, context);
    }
    return visitor.visitCharacter(this, context);
  }
}

// Note node implementation
export class ParsedNoteNode extends BaseEnhancedUSJNode implements EnhancedNoteNode {
  readonly type = 'note' as const;

  constructor(
    public marker: string,
    public content: EnhancedUSJNode[] = [],
    public caller?: string,
    public category?: string,
    index: number = 0,
    parent?: BaseEnhancedUSJNode
  ) {
    super(index, parent);
  }

  getChildren(): EnhancedUSJNode[] {
    return this.content || [];
  }

  accept<R>(visitor: any): R {
    return visitor.visitNote(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    return visitor.visitNote(this, context);
  }

  toJSON(): any {
    const result: any = {
      type: this.type,
      marker: this.marker,
      content: this.content.map((child) =>
        (child as any).toJSON ? (child as any).toJSON() : child
      ),
    };

    if (this.caller) {
      result.caller = this.caller;
    }

    if (this.category) {
      result.category = this.category;
    }

    return result;
  }
}

// Milestone node implementation
export class ParsedMilestoneNode extends BaseEnhancedUSJNode implements EnhancedMilestoneNode {
  readonly type = 'ms' as const;

  [key: `x-${string}`]: string;

  constructor(
    public marker: string,
    attributes: Record<string, string> = {},
    sid?: string,
    eid?: string,
    who?: string,
    index: number = 0,
    parent?: BaseEnhancedUSJNode
  ) {
    super(index, parent);

    // Only add optional properties if they have values
    if (sid) this.sid = sid;
    if (eid) this.eid = eid;
    if (who) this.who = who;

    // Set attributes
    Object.entries(attributes).forEach(([key, value]) => {
      (this as any)[key] = value;
    });
  }

  // Declare optional properties
  sid?: string;
  eid?: string;
  who?: string;

  getChildren(): EnhancedUSJNode[] {
    return []; // Milestones don't have children
  }

  accept<R>(visitor: any): R {
    return visitor.visitMilestone(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    return visitor.visitMilestone(this, context);
  }
}

// Text node implementation
export class ParsedTextNode extends BaseEnhancedUSJNode implements EnhancedTextNode {
  readonly type = 'text' as const;

  constructor(
    public content: string,
    index: number = 0,
    parent?: BaseEnhancedUSJNode
  ) {
    super(index, parent);
  }

  getChildren(): string {
    return this.content;
  }

  accept<R>(visitor: any): R {
    return visitor.visitText(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    return visitor.visitText(this, context);
  }

  toJSON(): any {
    return this.content; // Text nodes are represented as strings in USJ
  }
}

// Sidebar node implementation
export class ParsedSidebarNode extends BaseEnhancedUSJNode {
  readonly type = 'sidebar' as const;
  readonly marker = 'esb' as const;

  constructor(
    public content: EnhancedUSJNode[] = [],
    public category?: string,
    index: number = 0,
    parent?: BaseEnhancedUSJNode
  ) {
    super(index, parent);
  }

  getChildren(): EnhancedUSJNode[] {
    return this.content;
  }

  accept<R>(visitor: any): R {
    return visitor.visitSidebar ? visitor.visitSidebar(this) : visitor.visitParagraph(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    return visitor.visitSidebar
      ? visitor.visitSidebar(this, context)
      : visitor.visitParagraph(this, context);
  }

  toJSON(): any {
    const result: any = {
      type: this.type,
      marker: this.marker,
      content: this.content.map((child) =>
        (child as any).toJSON ? (child as any).toJSON() : child
      ),
    };

    if (this.category) {
      result.category = this.category;
    }

    return result;
  }
}

// Optbreak node implementation (handles // markers)
export class ParsedOptbreakNode extends BaseEnhancedUSJNode {
  readonly type = 'optbreak' as const;

  constructor(index: number = 0, parent?: BaseEnhancedUSJNode) {
    super(index, parent);
  }

  getChildren(): EnhancedUSJNode[] {
    return []; // Optbreak nodes don't have children
  }

  accept<R>(visitor: any): R {
    if (visitor.visitOptbreak) {
      return visitor.visitOptbreak(this);
    }
    // Fallback to character if no specific optbreak visitor
    return visitor.visitCharacter(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    if (visitor.visitOptbreak) {
      return visitor.visitOptbreak(this, context);
    }
    // Fallback to character if no specific optbreak visitor
    return visitor.visitCharacter(this, context);
  }

  toJSON(): any {
    return {
      type: 'optbreak',
    };
  }
}

// Ref node implementation (handles \ref markers - like \w but for references)
export class ParsedRefNode extends BaseEnhancedUSJNode {
  readonly type = 'ref' as const;

  constructor(
    public loc: string,
    public content: EnhancedUSJNode[] = [],
    public gen?: boolean,
    index: number = 0,
    parent?: BaseEnhancedUSJNode
  ) {
    super(index, parent);

    // Only add gen if it has a value
    if (gen !== undefined) this.gen = gen;
  }

  getChildren(): EnhancedUSJNode[] {
    return this.content || [];
  }

  accept<R>(visitor: any): R {
    if (visitor.visitRef) {
      return visitor.visitRef(this);
    }
    // Fallback to character visitor if ref-specific visitor not available
    return visitor.visitCharacter(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    if (visitor.visitRef) {
      return visitor.visitRef(this, context);
    }
    // Fallback to character visitor if ref-specific visitor not available
    return visitor.visitCharacter(this, context);
  }

  toJSON(): any {
    const result: any = {
      type: this.type,
      loc: this.loc,
      content: this.content ? this.content.map((child) => toPlainUSJ(child)) : [],
    };

    if (this.gen !== undefined) {
      result.gen = this.gen;
    }

    return result;
  }
}

// Table node implementation
export class ParsedTableNode extends BaseEnhancedUSJNode {
  readonly type = 'table' as const;

  constructor(
    public content: ParsedTableRowNode[] = [],
    index: number = 0,
    parent?: BaseEnhancedUSJNode
  ) {
    super(index, parent);
  }

  getChildren(): ParsedTableRowNode[] {
    return this.content || [];
  }

  accept<R>(visitor: any): R {
    if (visitor.visitTable) {
      return visitor.visitTable(this);
    }
    // Fallback to a generic visitor if table-specific visitor not available
    return visitor.visitParagraph(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    if (visitor.visitTable) {
      return visitor.visitTable(this, context);
    }
    // Fallback to a generic visitor if table-specific visitor not available
    return visitor.visitParagraph(this, context);
  }

  toJSON(): any {
    return {
      type: this.type,
      content: this.content ? this.content.map((child) => toPlainUSJ(child)) : [],
    };
  }
}

// Table row node implementation
export class ParsedTableRowNode extends BaseEnhancedUSJNode {
  readonly type = 'table:row' as const;
  readonly marker = 'tr' as const;

  constructor(
    public content: ParsedTableCellNode[] = [],
    index: number = 0,
    parent?: BaseEnhancedUSJNode
  ) {
    super(index, parent);
  }

  getChildren(): ParsedTableCellNode[] {
    return this.content || [];
  }

  accept<R>(visitor: any): R {
    if (visitor.visitTableRow) {
      return visitor.visitTableRow(this);
    }
    // Fallback to paragraph visitor if table row specific visitor not available
    return visitor.visitParagraph(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    if (visitor.visitTableRow) {
      return visitor.visitTableRow(this, context);
    }
    // Fallback to paragraph visitor if table row specific visitor not available
    return visitor.visitParagraph(this, context);
  }

  toJSON(): any {
    return {
      type: this.type,
      marker: this.marker,
      content: this.content ? this.content.map((child) => toPlainUSJ(child)) : [],
    };
  }
}

// Table cell node implementation
export class ParsedTableCellNode extends BaseEnhancedUSJNode {
  readonly type = 'table:cell' as const;

  constructor(
    public marker: string,
    public align: 'start' | 'center' | 'end',
    public content: EnhancedUSJNode[] = [],
    public colspan?: string,
    index: number = 0,
    parent?: BaseEnhancedUSJNode
  ) {
    super(index, parent);

    // Only add colspan if it has a value
    if (colspan) this.colspan = colspan;
  }

  getChildren(): EnhancedUSJNode[] {
    return this.content || [];
  }

  accept<R>(visitor: any): R {
    if (visitor.visitTableCell) {
      return visitor.visitTableCell(this);
    }
    // Fallback to character visitor if table cell specific visitor not available
    return visitor.visitCharacter(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    if (visitor.visitTableCell) {
      return visitor.visitTableCell(this, context);
    }
    // Fallback to character visitor if table cell specific visitor not available
    return visitor.visitCharacter(this, context);
  }

  toJSON(): any {
    const result: any = {
      type: this.type,
      marker: this.marker,
      align: this.align,
      content: this.content ? this.content.map((child) => toPlainUSJ(child)) : [],
    };

    if (this.colspan) {
      result.colspan = this.colspan;
    }

    return result;
  }
}

// Type union for all parsed nodes
export type ParsedUSJNode =
  | ParsedBookNode
  | ParsedChapterNode
  | ParsedParagraphNode
  | ParsedCharacterNode
  | ParsedVerseNode
  | ParsedNoteNode
  | ParsedMilestoneNode
  | ParsedTextNode
  | ParsedSidebarNode
  | ParsedOptbreakNode
  | ParsedRefNode
  | ParsedTableNode
  | ParsedTableRowNode
  | ParsedTableCellNode;

// Factory functions for creating parsed nodes
export function createParsedBook(
  code: string,
  content: string[] = [],
  index: number = 0,
  parent?: BaseEnhancedUSJNode
): ParsedBookNode {
  return new ParsedBookNode(code, content, index, parent);
}

export function createParsedChapter(
  number: string,
  options: {
    sid?: string;
    altnumber?: string;
    pubnumber?: string;
    index?: number;
    parent?: BaseEnhancedUSJNode;
  } = {}
): ParsedChapterNode {
  return new ParsedChapterNode(
    number,
    options.sid,
    options.altnumber,
    options.pubnumber,
    options.index || 0,
    options.parent
  );
}

export function createParsedParagraph(
  marker: string,
  content: EnhancedUSJNode[] = [],
  options: {
    sid?: string;
    index?: number;
    parent?: BaseEnhancedUSJNode;
  } = {}
): ParsedParagraphNode {
  return new ParsedParagraphNode(marker, content, options.sid, options.index || 0, options.parent);
}

export function createParsedCharacter(
  marker: string,
  content: EnhancedUSJNode[] = [],
  attributes: Record<string, string> = {},
  index: number = 0,
  parent?: BaseEnhancedUSJNode
): ParsedCharacterNode {
  return new ParsedCharacterNode(marker, content, attributes, index, parent);
}

export function createParsedVerse(
  marker: string,
  number: string,
  options: {
    sid?: string;
    altnumber?: string;
    pubnumber?: string;
    index?: number;
    parent?: BaseEnhancedUSJNode;
  } = {}
): ParsedVerseNode {
  return new ParsedVerseNode(
    marker,
    number,
    options.sid,
    options.altnumber,
    options.pubnumber,
    options.index || 0,
    options.parent
  );
}

export function createParsedNote(
  marker: string,
  content: EnhancedUSJNode[] = [],
  caller?: string,
  category?: string,
  index: number = 0,
  parent?: BaseEnhancedUSJNode
): ParsedNoteNode {
  return new ParsedNoteNode(marker, content, caller, category, index, parent);
}

export function createParsedMilestone(
  marker: string,
  attributes: Record<string, string> = {},
  options: {
    sid?: string;
    eid?: string;
    who?: string;
    index?: number;
    parent?: BaseEnhancedUSJNode;
  } = {}
): ParsedMilestoneNode {
  return new ParsedMilestoneNode(
    marker,
    attributes,
    options.sid,
    options.eid,
    options.who,
    options.index || 0,
    options.parent
  );
}

export function createParsedText(
  content: string,
  index: number = 0,
  parent?: BaseEnhancedUSJNode
): ParsedTextNode {
  return new ParsedTextNode(content, index, parent);
}

export function createParsedSidebar(
  content: EnhancedUSJNode[] = [],
  category?: string,
  index: number = 0,
  parent?: BaseEnhancedUSJNode
): ParsedSidebarNode {
  return new ParsedSidebarNode(content, category, index, parent);
}

export function createParsedOptbreak(
  index: number = 0,
  parent?: BaseEnhancedUSJNode
): ParsedOptbreakNode {
  return new ParsedOptbreakNode(index, parent);
}

export function createParsedRef(
  loc: string,
  content: EnhancedUSJNode[] = [],
  gen?: boolean,
  index: number = 0,
  parent?: BaseEnhancedUSJNode
): ParsedRefNode {
  return new ParsedRefNode(loc, content, gen, index, parent);
}

export function createParsedTable(
  content: ParsedTableRowNode[] = [],
  index: number = 0,
  parent?: BaseEnhancedUSJNode
): ParsedTableNode {
  return new ParsedTableNode(content, index, parent);
}

export function createParsedTableRow(
  content: ParsedTableCellNode[] = [],
  index: number = 0,
  parent?: BaseEnhancedUSJNode
): ParsedTableRowNode {
  return new ParsedTableRowNode(content, index, parent);
}

export function createParsedTableCell(
  marker: string,
  align: 'start' | 'center' | 'end',
  content: EnhancedUSJNode[] = [],
  colspan?: string,
  index: number = 0,
  parent?: BaseEnhancedUSJNode
): ParsedTableCellNode {
  return new ParsedTableCellNode(marker, align, content, colspan, index, parent);
}
