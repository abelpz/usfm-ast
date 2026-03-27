import {
  CharacterUSFMNode,
  MilestoneUSFMNode,
  NoteUSFMNode,
  ParagraphUSFMNode,
  TextUSFMNode,
} from '../nodes';

// Node types and interfaces
export type USFMNodeType = 'paragraph' | 'character' | 'note' | 'text' | 'milestone' | 'root';

// Visitor interfaces
export interface BaseUSFMVisitor<T = void> {
  visitParagraph(node: ParagraphUSFMNode): T;
  visitCharacter(node: CharacterUSFMNode): T;
  visitNote(node: NoteUSFMNode): T;
  visitText(node: TextUSFMNode): T;
  visitMilestone(node: MilestoneUSFMNode): T;
}

export interface USFMVisitorWithContext<T = void, C = any> {
  visitParagraph(node: ParagraphUSFMNode, context: C): T;
  visitCharacter(node: CharacterUSFMNode, context: C): T;
  visitNote(node: NoteUSFMNode, context: C): T;
  visitText(node: TextUSFMNode, context: C): T;
  visitMilestone(node: MilestoneUSFMNode, context: C): T;
}

// Node attributes
export interface MilestoneAttributes {
  sid?: string;
  eid?: string;
  who?: string;
  level?: string;
  [key: string]: string | undefined;
}

// Additional attributes interface
export interface LinkAttributes {
  href?: string;
  title?: string;
  id?: string;
  [key: string]: string | undefined;
}

// Base node interface
export interface USFMNode {
  type: USFMNodeType;
  marker?: string;
  content?: string | HydratedUSFMNode[];
  attributes?: MilestoneAttributes;
}

export type HydratedUSFMNode = HydratedNode &
  Omit<USFMNode, 'content'> & {
    content?: Array<HydratedUSFMNode> | string;
  };

export type HydratedNode = {
  getChildren(): USFMNode[] | string;
  getParent(): USFMNode | undefined;
  getNextSibling(): USFMNode | string | undefined;
  getPreviousSibling(): USFMNode | string | undefined;
  accept<R>(visitor: BaseUSFMVisitor<R>): R;
  acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R;
};

export type BaseUSFMNode = {
  type: 'paragraph' | 'character' | 'text' | 'note' | 'milestone' | 'root';
} & Omit<
  USFMNode,
  | 'accept'
  | 'acceptWithContext'
  | 'getChildren'
  | 'getParent'
  | 'getNextSibling'
  | 'getPreviousSibling'
>;

export function isParagraphNode(node: BaseUSFMNode): node is ParagraphNode {
  return node.type === 'paragraph';
}

export function isCharacterNode(node: BaseUSFMNode): node is CharacterNode {
  return node.type === 'character';
}

export function isTextNode(node: BaseUSFMNode): node is TextNode {
  return node.type === 'text';
}

export function isNoteNode(node: BaseUSFMNode): node is NoteNode {
  return node.type === 'note';
}

export function isMilestoneNode(node: BaseUSFMNode): node is MilestoneNode {
  return node.type === 'milestone';
}

export interface RootNode extends USFMNode {
  type: 'root';
  content: HydratedUSFMNode[];
}

// Specific node types
export interface ParagraphNode extends USFMNode {
  type: 'paragraph';
  marker: string;
  content: HydratedUSFMNode[];
}

export interface CharacterNode extends USFMNode {
  type: 'character';
  marker: string;
  content: HydratedUSFMNode[];
  attributes?: MilestoneAttributes;
}

export interface NoteNode extends USFMNode {
  type: 'note';
  marker: string;
  caller?: string;
  content: HydratedUSFMNode[];
}

export interface TextNode extends USFMNode {
  type: 'text';
  content: string;
}

export interface MilestoneNode extends USFMNode {
  type: 'milestone';
  marker: string;
  milestoneType: 'start' | 'end' | 'standalone';
  attributes?: MilestoneAttributes;
}

export interface AttributedNode extends USFMNode {
  attributes?: MilestoneAttributes;
}
