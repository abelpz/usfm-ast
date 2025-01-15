import { USFMVisitor, USFMVisitorWithContext } from './interfaces/USFMNodes';
import type { 
  USFMNode, 
  ParagraphNode, 
  CharacterNode, 
  NoteNode, 
  TextNode, 
  MilestoneNode, 
  PeripheralNode,
  MilestoneAttributes,
  PeripheralAttributes,
  USFMNodeType,
  HydratedNode
} from './interfaces/USFMNodes';

type HydratedUSFMNode = USFMNode & HydratedNode;

abstract class BaseUSFMNode<T extends USFMNodeType = USFMNodeType> implements HydratedUSFMNode {
  abstract type: T;
  marker?: T extends 'text' ? never : string;
  content?: T extends 'text' ? string : USFMNode[];

  constructor(index: number, parent?: USFMNode) {
    const _index = index;
    const _parent = parent;

    this.getParent = () => _parent;
    this.getNextSibling = () => _parent?.content?.[_index + 1];
    this.getPreviousSibling = () => _parent?.content?.[_index - 1];
  }

  getChildren(): USFMNode[] | string {
    return this.content || [];
  }

  getParent!: () => USFMNode | undefined;
  getNextSibling!: () => USFMNode | string | undefined;
  getPreviousSibling!: () => USFMNode | string | undefined;

  abstract accept<R>(visitor: USFMVisitor<R>): R;
  abstract acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R;
}

export class ParagraphUSFMNode extends BaseUSFMNode<'paragraph'> {
  readonly type = 'paragraph' as const;
  public marker: string;
  public content: USFMNode[];

  constructor(
    props: {
      marker: string;
      content: USFMNode[];
      index: number;
      parent?: USFMNode;
    }
  ) {
    super(props.index, props.parent);
    this.marker = props.marker;
    this.content = props.content;
  }

  accept<R>(visitor: USFMVisitor<R>): R {
    return visitor.visitParagraph(this);
  }

  acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R {
    return visitor.visitParagraph(this, context);
  }
}

export class CharacterUSFMNode extends BaseUSFMNode implements CharacterNode {
  readonly type = 'character';
  public marker: string;
  public content: USFMNode[];
  public attributes?: CharacterNode['attributes']; 

  constructor(props: {
    marker: string;
    content: USFMNode[];
    attributes?: CharacterNode['attributes'];
    index: number;
    parent?: USFMNode;
  }) {
    super(props.index, props.parent);
    this.marker = props.marker;
    this.content = props.content;
    this.attributes = props.attributes;
  }

  accept<R>(visitor: USFMVisitor<R>): R {
    return visitor.visitCharacter(this);
  }

  acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R {
    return visitor.visitCharacter(this, context);
  }
}

export class TextUSFMNode extends BaseUSFMNode implements TextNode {
  readonly type = 'text';
  public content: string;

  constructor(
    props: {
      content: string;
      index: number;
      parent?: USFMNode;
    }
  ) {
    super(props.index, props.parent);
    this.content = props.content;
  }

  accept<R>(visitor: USFMVisitor<R>): R {
    return visitor.visitText(this);
  }

  acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R {
    return visitor.visitText(this, context);
  }
}

export class NoteUSFMNode extends BaseUSFMNode implements NoteNode {
  readonly type = 'note';
  public marker: string;
  public content: USFMNode[];
  public caller?: string;

  constructor(
    props: {
      marker: string;
      content: USFMNode[];
      index: number;
      caller?: string;
      parent?: USFMNode;
    }
  ) {
    super(props.index, props.parent);
    this.marker = props.marker;
    this.content = props.content;
    this.caller = props.caller;
  }

  accept<R>(visitor: USFMVisitor<R>): R {
    return visitor.visitNote(this);
  }

  acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R {
    return visitor.visitNote(this, context);
  }
}

export class MilestoneUSFMNode extends BaseUSFMNode implements MilestoneNode {
  readonly type = 'milestone';
  public marker: string;
  public milestoneType: 'start' | 'end' | 'standalone';
  public attributes?: MilestoneAttributes;

  constructor(
    props: {
      marker: string;
      milestoneType: 'start' | 'end' | 'standalone';
      attributes?: MilestoneAttributes;
      index: number;
      parent?: USFMNode;
    }
  ) {
    super(props.index, props.parent);
    this.marker = props.marker;
    this.milestoneType = props.milestoneType;
    this.attributes = props.attributes;
  }

  accept<R>(visitor: USFMVisitor<R>): R {
    return visitor.visitMilestone(this);
  }

  acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R {
    return visitor.visitMilestone(this, context);
  }
}

export class PeripheralUSFMNode extends BaseUSFMNode implements PeripheralNode {
  readonly type = 'peripheral';
  public marker: string;
  public title: string;
  public attributes: PeripheralAttributes;
  public content: USFMNode[];

  constructor(
    props: {
      marker: string;
      title: string;
      attributes: PeripheralAttributes;
      content: USFMNode[];
      index: number;
      parent?: USFMNode;
    }
  ) {
    super(props.index, props.parent);
    this.marker = props.marker;
    this.title = props.title;
    this.attributes = props.attributes;
    this.content = props.content;
  }

  accept<R>(visitor: USFMVisitor<R>): R {
    return visitor.visitPeripheral(this);
  }

  acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R {
    return visitor.visitPeripheral(this, context);
  }
} 

export type NodeInstanceType<T extends USFMNode> = 
  T extends CharacterNode ? CharacterUSFMNode :
  T extends ParagraphNode ? ParagraphUSFMNode :
  T extends TextNode ? TextUSFMNode :
  T extends NoteNode ? NoteUSFMNode :
  T extends MilestoneNode ? MilestoneUSFMNode :
  T extends PeripheralNode ? PeripheralUSFMNode :
  T;