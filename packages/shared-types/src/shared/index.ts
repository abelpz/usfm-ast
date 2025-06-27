/**
 * Common types and interfaces shared across USFM and USJ systems
 */

// Common string types
export type BookCode = string;
export type ChapterNumber = string;
export type VerseNumber = string;
export type MarkerString = string;
export type Sid = string;
export type NonWhitespaceString = string;
export type SingleCharString = string;

// Common alignment types
export type Alignment = 'start' | 'center' | 'end';

// Common attributes
export interface MilestoneAttributes {
  sid?: string;
  eid?: string;
  who?: string;
  level?: string;
  [key: string]: string | undefined;
}

export interface LinkAttributes {
  href?: string;
  title?: string;
  id?: string;
  [key: string]: string | undefined;
}

// Base visitor interface
export interface BaseVisitor<T = void> {
  [key: string]: (...args: any[]) => T;
}

// Context-aware visitor interface
export interface VisitorWithContext<T = void, C = any> {
  [key: string]: (...args: any[]) => T;
}
