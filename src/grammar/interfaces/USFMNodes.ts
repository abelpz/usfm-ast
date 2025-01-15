import { CharacterUSFMNode, MilestoneUSFMNode, NoteUSFMNode, ParagraphUSFMNode, PeripheralUSFMNode, TextUSFMNode } from "../nodes";

// Node types and interfaces
export type USFMNodeType = "paragraph" | "character" | "note" | "text" | "milestone" | "peripheral";

// Visitor interfaces
export interface USFMVisitor<T = void> {
  visitParagraph(node: ParagraphUSFMNode): T;
  visitCharacter(node: CharacterUSFMNode): T;
  visitNote(node: NoteUSFMNode): T;
  visitText(node: TextUSFMNode): T;
  visitMilestone(node: MilestoneUSFMNode): T;
  visitPeripheral(node: PeripheralUSFMNode): T;
}

export interface USFMVisitorWithContext<T = void, C = any> {
  visitParagraph(node: ParagraphUSFMNode, context: C): T;
  visitCharacter(node: CharacterUSFMNode, context: C): T;
  visitNote(node: NoteUSFMNode, context: C): T;
  visitText(node: TextUSFMNode, context: C): T;
  visitMilestone(node: MilestoneUSFMNode, context: C): T;
  visitPeripheral(node: PeripheralUSFMNode, context: C): T;
}

// Node attributes
export interface MilestoneAttributes {
  sid?: string;
  eid?: string;
  who?: string;
  level?: string;
  [key: string]: string | string[] | undefined;
}

export interface LinkAttributes {
  "link-href"?: string;
  "link-title"?: string;
  "link-id"?: string;
  [key: string]: string | string[] | undefined;
}

export interface PeripheralAttributes {
  id: string;
  [key: string]: string | string[] | undefined;
}

// Base node interface
export interface USFMNode {
  type: USFMNodeType;
  marker?: string;
  content?: string | USFMNode[];
  attributes?: MilestoneAttributes;
}

export type HydratedNode = {
  getChildren(): USFMNode[] | string;
  getParent(): USFMNode | undefined;
  getNextSibling(): USFMNode | string | undefined;
  getPreviousSibling(): USFMNode | string | undefined;
  accept<R>(visitor: USFMVisitor<R>): R;
  acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R;
}

export type BaseUSFMNode = {
  type: 'paragraph' | 'character' | 'text' | 'note' | 'milestone' | 'peripheral';
} & Omit<USFMNode, 'accept' | 'acceptWithContext' | 'getChildren' | 'getParent' | 'getNextSibling' | 'getPreviousSibling'>;

export function isParagraphNode(node: BaseUSFMNode): node is ParagraphNode {
  return node.type === 'paragraph';
}

export function isCharacterNode(node: BaseUSFMNode): node is Omit<CharacterNode, 'accept' | 'acceptWithContext'> {
  return node.type === 'character';
}

export function isTextNode(node: BaseUSFMNode): node is Omit<TextNode, 'accept' | 'acceptWithContext'> {
  return node.type === 'text';
}

export function isNoteNode(node: BaseUSFMNode): node is Omit<NoteNode, 'accept' | 'acceptWithContext'> {
  return node.type === 'note';
}

export function isMilestoneNode(node: BaseUSFMNode): node is MilestoneNode {
  return node.type === 'milestone';
}

export function isPeripheralNode(node: BaseUSFMNode): node is Omit<PeripheralNode, 'accept' | 'acceptWithContext'> {
  return node.type === 'peripheral';
}



// Specific node types
export interface ParagraphNode extends USFMNode {
  type: "paragraph";
  marker: string;
  content: USFMNode[];
}

export interface CharacterNode extends USFMNode {
  type: "character";
  marker: string;
  content: USFMNode[];
  attributes?: MilestoneAttributes | LinkAttributes;
}

export interface NoteNode extends USFMNode {
  type: "note";
  marker: string;
  caller?: string;
  content: USFMNode[];
}

export interface TextNode extends USFMNode {
  type: "text";
  content: string;
}

export interface MilestoneNode extends USFMNode {
  type: "milestone";
  marker: string;
  milestoneType: "start" | "end" | "standalone";
  attributes?: MilestoneAttributes;
}

export interface PeripheralNode extends USFMNode {
  type: "peripheral";
  marker: string;
  title: string;
  attributes: PeripheralAttributes;
  content: USFMNode[];
}

export interface ListKeyNode extends CharacterNode {
  type: "character";
  marker: "lik";
}

export interface ListValueNode extends CharacterNode {
  type: "character";
  marker: string; // liv1, liv2, etc.
}

export interface AttributedNode extends USFMNode {
  attributes?: MilestoneAttributes | LinkAttributes;
} 