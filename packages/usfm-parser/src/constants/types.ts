/**
 * USFM Marker Type Definitions
 */

import { MarkerType, MarkerTypeEnum } from '@usfm-tools/types';

export type UsfmStyleType = 'paragraph' | 'character' | 'milestone' | 'note';

export type UsfmRole =
  | 'identification'
  | 'introduction'
  | 'title'
  | 'section'
  | 'body'
  | 'poetry'
  | 'list'
  | 'table'
  | 'formatting'
  | 'break'
  | 'note'
  | 'mark'
  | 'sidebar'
  | 'versification'
  | 'peripheral';

export type UsfmContextType =
  | 'ScriptureContent'
  | 'PeripheralContent'
  | 'IntroductionContent'
  | 'ChapterContent'
  | 'VerseContent'
  | 'ParagraphContent'
  | 'PoetryContent'
  | 'TableContent'
  | 'NoteContent'
  | 'ListContent'
  | 'SidebarContent';

export interface USFMAttributeInfo {
  description: string;
  required?: boolean;
  values?: string[];
  type?: 'string' | 'number' | 'boolean';
  defaultValue?: string | number | boolean;
}

export interface USFMMarkerBaseInfo {
  type: UsfmStyleType;
  role?: UsfmRole;
  context?: UsfmContextType[];
  displayName?: string;
  contentType?: 'text' | 'mixed' | 'none';
  label?: string;
  tags?: string[];
}

export interface USFMMarkerWithoutAttributes extends USFMMarkerBaseInfo {
  allowsAttributes?: false;
  defaultAttribute?: never;
  attributes?: never;
}

export interface USFMMarkerWithAttributes extends USFMMarkerBaseInfo {
  allowsAttributes: true;
  defaultAttribute?: string;
  attributes?: Record<string, USFMAttributeInfo>;
}

export type USFMMarkerInfo = USFMMarkerWithoutAttributes | USFMMarkerWithAttributes;

// Import shared marker types

export interface CustomMarkerRule {
  type: MarkerType;
  requiresClosing?: boolean;
  isMilestone?: boolean;
}

export interface USFMParserOptions {
  customMarkers?: Record<string, USFMMarkerInfo>;
  positionTracking?: boolean;
}
