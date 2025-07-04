/**
 * USJ-Enhanced AST Nodes
 *
 * These nodes are USJ-compatible at the structural level but include
 * our enhanced navigation and visitor methods.
 */

import {
  UsjBook,
  UsjChapter,
  UsjPara,
  UsjChar,
  UsjVerse,
  UsjNote,
  UsjMilestone,
  UsjNode,
} from '../usj';
import { MilestoneAttributes } from '../shared';

// Enhanced methods interface
export interface EnhancedNodeMethods {
  getParent(): EnhancedUSJNode | undefined;
  getNextSibling(): EnhancedUSJNode | string | undefined;
  getPreviousSibling(): EnhancedUSJNode | string | undefined;
  getChildren(): EnhancedUSJNode[] | string;
  accept<R>(visitor: any): R;
  acceptWithContext<R, C>(visitor: any, context: C): R;
}

// Union type for all enhanced nodes
export type EnhancedUSJNode =
  | EnhancedBookNode
  | EnhancedChapterNode
  | EnhancedParagraphNode
  | EnhancedCharacterNode
  | EnhancedVerseNode
  | EnhancedNoteNode
  | EnhancedMilestoneNode
  | EnhancedTextNode
  | EnhancedSidebarNode
  | EnhancedRefNode
  | EnhancedTableNode
  | EnhancedTableRowNode
  | EnhancedTableCellNode;

// Root node for the document
export interface EnhancedRootNode {
  type: 'root';
  content: EnhancedUSJNode[];
  getChildren(): EnhancedUSJNode[];
}

// Book node (USJ-compatible + enhanced)
export interface EnhancedBookNode extends UsjBook, EnhancedNodeMethods {
  type: 'book';
  marker: 'id';
  code: string;
  content?: string[];
}

// Chapter node (USJ-compatible + enhanced)
export interface EnhancedChapterNode extends UsjChapter, EnhancedNodeMethods {
  type: 'chapter';
  marker: 'c';
  number: string;
  sid?: string;
  altnumber?: string;
  pubnumber?: string;
}

// Paragraph node (USJ-compatible + enhanced)
export interface EnhancedParagraphNode extends Omit<UsjPara, 'content'>, EnhancedNodeMethods {
  type: 'para';
  marker: string;
  content?: EnhancedUSJNode[];
  sid?: string;
}

// Character node (USJ-compatible + enhanced)
export interface EnhancedCharacterNode extends Omit<UsjChar, 'content'>, EnhancedNodeMethods {
  type: 'char';
  marker: string;
  content?: EnhancedUSJNode[];
  'link-id'?: string;
  'link-href'?: string;
  // Support for custom attributes
  [key: `x-${string}`]: string;
}

// Verse node (USJ-compatible + enhanced)
export interface EnhancedVerseNode extends UsjVerse, EnhancedNodeMethods {
  type: 'verse';
  marker: string;
  number: string;
  sid?: string;
  altnumber?: string;
  pubnumber?: string;
}

// Note node (USJ-compatible + enhanced)
export interface EnhancedNoteNode extends Omit<UsjNote, 'content' | 'caller'>, EnhancedNodeMethods {
  type: 'note';
  marker: string;
  content?: EnhancedUSJNode[];
  caller?: string;
}

// Milestone node (USJ-compatible + enhanced)
export interface EnhancedMilestoneNode extends UsjMilestone, EnhancedNodeMethods {
  type: 'ms';
  marker: string;
  sid?: string;
  eid?: string;
  who?: string;
  // Support for custom attributes
  [key: `x-${string}`]: string;
}

// Text node (enhanced only - USJ uses strings directly)
export interface EnhancedTextNode extends EnhancedNodeMethods {
  type: 'text';
  content: string;
}

// Sidebar node (USJ-compatible + enhanced)
export interface EnhancedSidebarNode extends EnhancedNodeMethods {
  type: 'sidebar';
  marker: 'esb';
  content?: EnhancedUSJNode[];
  category?: string;
}

// Ref node (enhanced only - like \w but for references)
export interface EnhancedRefNode extends EnhancedNodeMethods {
  type: 'ref';
  loc: string;
  content?: EnhancedUSJNode[];
  gen?: boolean;
}

// Table node (USJ-compatible + enhanced)
export interface EnhancedTableNode extends EnhancedNodeMethods {
  type: 'table';
  content?: EnhancedTableRowNode[];
}

// Table row node (USJ-compatible + enhanced)
export interface EnhancedTableRowNode extends EnhancedNodeMethods {
  type: 'table:row';
  marker: 'tr';
  content?: EnhancedTableCellNode[];
}

// Table cell node (USJ-compatible + enhanced)
export interface EnhancedTableCellNode extends EnhancedNodeMethods {
  type: 'table:cell';
  marker: string;
  align: 'start' | 'center' | 'end';
  content?: EnhancedUSJNode[];
  colspan?: string;
}

// Legacy compatibility - map old types to new types
export type USFMNodeType =
  | 'book'
  | 'chapter'
  | 'para'
  | 'char'
  | 'verse'
  | 'note'
  | 'ms'
  | 'text'
  | 'root';

// Type guards for enhanced nodes
export function isEnhancedBookNode(node: any): node is EnhancedBookNode {
  return node?.type === 'book';
}

export function isEnhancedChapterNode(node: any): node is EnhancedChapterNode {
  return node?.type === 'chapter';
}

export function isEnhancedParagraphNode(node: any): node is EnhancedParagraphNode {
  return node?.type === 'para';
}

export function isEnhancedCharacterNode(node: any): node is EnhancedCharacterNode {
  return node?.type === 'char';
}

export function isEnhancedVerseNode(node: any): node is EnhancedVerseNode {
  return node?.type === 'verse';
}

export function isEnhancedNoteNode(node: any): node is EnhancedNoteNode {
  return node?.type === 'note';
}

export function isEnhancedMilestoneNode(node: any): node is EnhancedMilestoneNode {
  return node?.type === 'ms';
}

export function isEnhancedTextNode(node: any): node is EnhancedTextNode {
  return node?.type === 'text';
}

export function isEnhancedRefNode(node: any): node is EnhancedRefNode {
  return node?.type === 'ref';
}

export function isEnhancedTableNode(node: any): node is EnhancedTableNode {
  return node?.type === 'table';
}

export function isEnhancedTableRowNode(node: any): node is EnhancedTableRowNode {
  return node?.type === 'table:row';
}

export function isEnhancedTableCellNode(node: any): node is EnhancedTableCellNode {
  return node?.type === 'table:cell';
}

// Helper to check if a node has enhanced methods
export function hasEnhancedMethods(node: any): node is EnhancedUSJNode {
  return node && typeof node.getParent === 'function' && typeof node.accept === 'function';
}

// Helper to convert enhanced nodes to plain USJ
export function toPlainUSJ(node: EnhancedUSJNode): UsjNode | string {
  // Handle text nodes specially since they become strings in USJ
  if ('type' in node && node.type === 'text') {
    return (node as EnhancedTextNode).content;
  }

  // Simple JSON round-trip to clean enhanced properties
  // This works because enhanced properties should be non-enumerable
  return JSON.parse(JSON.stringify(node));
}

// Helper to get USJ document from enhanced nodes
export function toUSJDocument(nodes: EnhancedUSJNode[], version: string = '3.1'): any {
  return {
    type: 'USJ',
    version,
    content: nodes.map((node) => toPlainUSJ(node)),
  };
}
