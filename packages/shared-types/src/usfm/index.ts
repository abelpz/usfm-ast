/**
 * USFM (Unified Standard Format Markers) types and interfaces
 */

import { MilestoneAttributes, BaseVisitor, VisitorWithContext } from '../shared';

// Node types
export type USFMNodeType = 'paragraph' | 'character' | 'note' | 'text' | 'milestone' | 'root';

// Base node interface
export interface USFMNode {
  type: USFMNodeType;
  marker?: string;
  content?: string | HydratedUSFMNode[];
  attributes?: MilestoneAttributes;
}

// Hydrated node with methods
export type HydratedNode = {
  getChildren(): USFMNode[] | string;
  getParent(): USFMNode | undefined;
  getNextSibling(): USFMNode | string | undefined;
  getPreviousSibling(): USFMNode | string | undefined;
  accept<R>(visitor: BaseUSFMVisitor<R>): R;
  acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R;
};

export type HydratedUSFMNode = HydratedNode &
  Omit<USFMNode, 'content'> & {
    content?: Array<HydratedUSFMNode> | string;
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

// Specific node types
export interface RootNode extends USFMNode {
  type: 'root';
  content: HydratedUSFMNode[];
}

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

// Type guards
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

// Forward declare the concrete node classes that will be defined in usfm-parser
export interface ParagraphUSFMNode extends ParagraphNode {
  accept<R>(visitor: BaseUSFMVisitor<R>): R;
  acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R;
  getParent(): HydratedUSFMNode | RootNode | undefined;
  getNextSibling(): HydratedUSFMNode | string | undefined;
  getPreviousSibling(): HydratedUSFMNode | string | undefined;
  getChildren(): HydratedUSFMNode[] | string;
}

export interface CharacterUSFMNode extends CharacterNode {
  accept<R>(visitor: BaseUSFMVisitor<R>): R;
  acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R;
  getParent(): HydratedUSFMNode | RootNode | undefined;
  getNextSibling(): HydratedUSFMNode | string | undefined;
  getPreviousSibling(): HydratedUSFMNode | string | undefined;
  getChildren(): HydratedUSFMNode[] | string;
}

export interface NoteUSFMNode extends NoteNode {
  accept<R>(visitor: BaseUSFMVisitor<R>): R;
  acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R;
  getParent(): HydratedUSFMNode | RootNode | undefined;
  getNextSibling(): HydratedUSFMNode | string | undefined;
  getPreviousSibling(): HydratedUSFMNode | string | undefined;
  getChildren(): HydratedUSFMNode[] | string;
}

export interface TextUSFMNode extends TextNode {
  accept<R>(visitor: BaseUSFMVisitor<R>): R;
  acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R;
  getParent(): HydratedUSFMNode | RootNode | undefined;
  getNextSibling(): HydratedUSFMNode | string | undefined;
  getPreviousSibling(): HydratedUSFMNode | string | undefined;
  getChildren(): HydratedUSFMNode[] | string;
}

export interface MilestoneUSFMNode extends MilestoneNode {
  accept<R>(visitor: BaseUSFMVisitor<R>): R;
  acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R;
  getParent(): HydratedUSFMNode | RootNode | undefined;
  getNextSibling(): HydratedUSFMNode | string | undefined;
  getPreviousSibling(): HydratedUSFMNode | string | undefined;
  getChildren(): HydratedUSFMNode[] | string;
}

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

// USFM Formatting Types (includes MarkerTypeEnum and MarkerType)
export * from './formatting';
