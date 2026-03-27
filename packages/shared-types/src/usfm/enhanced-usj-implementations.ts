/**
 * Concrete implementations of Enhanced USJ Nodes
 *
 * These classes provide the actual implementation of enhanced methods
 * while maintaining USJ compatibility.
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
} from './enhanced-usj-nodes';
import { UniversalUSFMVisitor } from './universal-visitor';

// Base implementation with common enhanced methods
abstract class BaseEnhancedNode {
  constructor(
    protected readonly index: number,
    protected readonly parent?: BaseEnhancedNode
  ) {}

  getParent(): EnhancedUSJNode | undefined {
    return this.parent as any;
  }

  getNextSibling(): EnhancedUSJNode | string | undefined {
    const parent = this.getParent();
    if (!parent) return undefined;

    const siblings = parent.getChildren();
    if (Array.isArray(siblings)) {
      return siblings[this.index + 1];
    }
    return undefined;
  }

  getPreviousSibling(): EnhancedUSJNode | string | undefined {
    const parent = this.getParent();
    if (!parent) return undefined;

    const siblings = parent.getChildren();
    if (Array.isArray(siblings)) {
      return siblings[this.index - 1];
    }
    return undefined;
  }

  abstract getChildren(): EnhancedUSJNode[] | string;
  abstract accept<R>(visitor: UniversalUSFMVisitor<R>): R;
  abstract acceptWithContext<R, C>(visitor: any, context: C): R;
}

// Root node implementation
export class EnhancedRootNodeImpl implements EnhancedRootNode {
  readonly type = 'root' as const;

  constructor(public content: EnhancedUSJNode[]) {}

  getChildren(): EnhancedUSJNode[] {
    return this.content;
  }
}

// Book node implementation
export class EnhancedBookNodeImpl extends BaseEnhancedNode implements EnhancedBookNode {
  readonly type = 'book' as const;
  readonly marker = 'id' as const;

  constructor(
    public code: string,
    public content: string[] = [],
    index: number = 0,
    parent?: BaseEnhancedNode
  ) {
    super(index, parent);
  }

  getChildren(): string {
    return this.content.join(' ');
  }

  accept<R>(visitor: UniversalUSFMVisitor<R>): R {
    return visitor.visitBook?.(this) ?? visitor.visitParagraph(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    return visitor.visitBook?.(this, context) ?? visitor.visitParagraph(this, context);
  }
}

// Chapter node implementation
export class EnhancedChapterNodeImpl extends BaseEnhancedNode implements EnhancedChapterNode {
  readonly type = 'chapter' as const;
  readonly marker = 'c' as const;

  constructor(
    public number: string,
    public sid?: string,
    public altnumber?: string,
    public pubnumber?: string,
    index: number = 0,
    parent?: BaseEnhancedNode
  ) {
    super(index, parent);
  }

  getChildren(): EnhancedUSJNode[] {
    return []; // Chapters typically don't have children
  }

  accept<R>(visitor: UniversalUSFMVisitor<R>): R {
    return visitor.visitChapter?.(this) ?? visitor.visitParagraph(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    return visitor.visitChapter?.(this, context) ?? visitor.visitParagraph(this, context);
  }
}

// Paragraph node implementation
export class EnhancedParagraphNodeImpl extends BaseEnhancedNode implements EnhancedParagraphNode {
  readonly type = 'para' as const;

  constructor(
    public marker: string,
    public content: EnhancedUSJNode[] = [],
    public sid?: string,
    index: number = 0,
    parent?: BaseEnhancedNode
  ) {
    super(index, parent);
  }

  getChildren(): EnhancedUSJNode[] {
    return this.content || [];
  }

  accept<R>(visitor: UniversalUSFMVisitor<R>): R {
    return visitor.visitParagraph(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    return visitor.visitParagraph(this, context);
  }
}

// Character node implementation
export class EnhancedCharacterNodeImpl extends BaseEnhancedNode implements EnhancedCharacterNode {
  readonly type = 'char' as const;

  [key: `x-${string}`]: string;

  constructor(
    public marker: string,
    public content: EnhancedUSJNode[] = [],
    attributes: Record<string, string> = {},
    index: number = 0,
    parent?: BaseEnhancedNode
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

  accept<R>(visitor: UniversalUSFMVisitor<R>): R {
    return visitor.visitCharacter(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    return visitor.visitCharacter(this, context);
  }
}

// Verse node implementation
export class EnhancedVerseNodeImpl extends BaseEnhancedNode implements EnhancedVerseNode {
  readonly type = 'verse' as const;

  constructor(
    public marker: string,
    public number: string,
    public sid?: string,
    public altnumber?: string,
    public pubnumber?: string,
    index: number = 0,
    parent?: BaseEnhancedNode
  ) {
    super(index, parent);
  }

  getChildren(): EnhancedUSJNode[] {
    return []; // Verses typically don't have children
  }

  accept<R>(visitor: UniversalUSFMVisitor<R>): R {
    return visitor.visitVerse?.(this) ?? visitor.visitCharacter(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    return visitor.visitVerse?.(this, context) ?? visitor.visitCharacter(this, context);
  }
}

// Note node implementation
export class EnhancedNoteNodeImpl extends BaseEnhancedNode implements EnhancedNoteNode {
  readonly type = 'note' as const;

  constructor(
    public marker: string,
    public content: EnhancedUSJNode[] = [],
    public caller?: string,
    index: number = 0,
    parent?: BaseEnhancedNode
  ) {
    super(index, parent);
  }

  getChildren(): EnhancedUSJNode[] {
    return this.content || [];
  }

  accept<R>(visitor: UniversalUSFMVisitor<R>): R {
    return visitor.visitNote(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    return visitor.visitNote(this, context);
  }
}

// Milestone node implementation
export class EnhancedMilestoneNodeImpl extends BaseEnhancedNode implements EnhancedMilestoneNode {
  readonly type = 'ms' as const;

  [key: `x-${string}`]: string;

  constructor(
    public marker: string,
    attributes: Record<string, string> = {},
    public sid?: string,
    public eid?: string,
    public who?: string,
    index: number = 0,
    parent?: BaseEnhancedNode
  ) {
    super(index, parent);

    // Set attributes
    Object.entries(attributes).forEach(([key, value]) => {
      (this as any)[key] = value;
    });
  }

  getChildren(): EnhancedUSJNode[] {
    return []; // Milestones don't have children
  }

  accept<R>(visitor: UniversalUSFMVisitor<R>): R {
    return visitor.visitMilestone(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    return visitor.visitMilestone(this, context);
  }
}

// Text node implementation
export class EnhancedTextNodeImpl extends BaseEnhancedNode implements EnhancedTextNode {
  readonly type = 'text' as const;

  constructor(
    public content: string,
    index: number = 0,
    parent?: BaseEnhancedNode
  ) {
    super(index, parent);
  }

  getChildren(): string {
    return this.content;
  }

  accept<R>(visitor: UniversalUSFMVisitor<R>): R {
    return visitor.visitText(this);
  }

  acceptWithContext<R, C>(visitor: any, context: C): R {
    return visitor.visitText(this, context);
  }
}

// Factory functions for creating enhanced nodes
export function createEnhancedBook(
  code: string,
  content: string[] = [],
  index: number = 0,
  parent?: BaseEnhancedNode
): EnhancedBookNodeImpl {
  return new EnhancedBookNodeImpl(code, content, index, parent);
}

export function createEnhancedChapter(
  number: string,
  options: {
    sid?: string;
    altnumber?: string;
    pubnumber?: string;
    index?: number;
    parent?: BaseEnhancedNode;
  } = {}
): EnhancedChapterNodeImpl {
  return new EnhancedChapterNodeImpl(
    number,
    options.sid,
    options.altnumber,
    options.pubnumber,
    options.index || 0,
    options.parent
  );
}

export function createEnhancedParagraph(
  marker: string,
  content: EnhancedUSJNode[] = [],
  options: {
    sid?: string;
    index?: number;
    parent?: BaseEnhancedNode;
  } = {}
): EnhancedParagraphNodeImpl {
  return new EnhancedParagraphNodeImpl(
    marker,
    content,
    options.sid,
    options.index || 0,
    options.parent
  );
}

export function createEnhancedCharacter(
  marker: string,
  content: EnhancedUSJNode[] = [],
  attributes: Record<string, string> = {},
  index: number = 0,
  parent?: BaseEnhancedNode
): EnhancedCharacterNodeImpl {
  return new EnhancedCharacterNodeImpl(marker, content, attributes, index, parent);
}

export function createEnhancedVerse(
  marker: string,
  number: string,
  options: {
    sid?: string;
    altnumber?: string;
    pubnumber?: string;
    index?: number;
    parent?: BaseEnhancedNode;
  } = {}
): EnhancedVerseNodeImpl {
  return new EnhancedVerseNodeImpl(
    marker,
    number,
    options.sid,
    options.altnumber,
    options.pubnumber,
    options.index || 0,
    options.parent
  );
}

export function createEnhancedNote(
  marker: string,
  content: EnhancedUSJNode[] = [],
  caller?: string,
  index: number = 0,
  parent?: BaseEnhancedNode
): EnhancedNoteNodeImpl {
  return new EnhancedNoteNodeImpl(marker, content, caller, index, parent);
}

export function createEnhancedMilestone(
  marker: string,
  attributes: Record<string, string> = {},
  options: {
    sid?: string;
    eid?: string;
    who?: string;
    index?: number;
    parent?: BaseEnhancedNode;
  } = {}
): EnhancedMilestoneNodeImpl {
  return new EnhancedMilestoneNodeImpl(
    marker,
    attributes,
    options.sid,
    options.eid,
    options.who,
    options.index || 0,
    options.parent
  );
}

export function createEnhancedText(
  content: string,
  index: number = 0,
  parent?: BaseEnhancedNode
): EnhancedTextNodeImpl {
  return new EnhancedTextNodeImpl(content, index, parent);
}
