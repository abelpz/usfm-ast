// Node types and interfaces
export type USFMNodeType = "paragraph" | "character" | "note" | "text" | "milestone" | "peripheral";

// Visitor interfaces
export interface USFMVisitor<T = void> {
  visitParagraph(node: ParagraphNode): T;
  visitCharacter(node: CharacterNode): T;
  visitNote(node: NoteNode): T;
  visitText(node: TextNode): T;
  visitMilestone(node: MilestoneNode): T;
  visitPeripheral(node: PeripheralNode): T;
}

export interface USFMVisitorWithContext<T = void, C = any> {
  visitParagraph(node: ParagraphNode, context: C): T;
  visitCharacter(node: CharacterNode, context: C): T;
  visitNote(node: NoteNode, context: C): T;
  visitText(node: TextNode, context: C): T;
  visitMilestone(node: MilestoneNode, context: C): T;
  visitPeripheral(node: PeripheralNode, context: C): T;
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
  accept<T>(visitor: USFMVisitor<T>): T;
  acceptWithContext<T, C>(visitor: USFMVisitorWithContext<T, C>, context: C): T;
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