import type { ScriptureRef } from './verse-ref';

/** CCR v2 and custom stage ids are strings; default template uses these ids. */
export type CcrV2StageId =
  | 'borrador_tpl'
  | 'borrador_tps'
  | 'ayudas'
  | 'afinacion'
  | 'armonizacion'
  | 'aprobacion'
  | 'publicacion'
  | (string & NonNullable<unknown>);

export interface ReviewStage {
  id: string;
  label: string;
  description?: string;
  order: number;
  /** Checklist template ids to instantiate when a session starts this stage */
  defaultChecklists?: string[];
}

export interface ReviewStageWorkflow {
  stages: ReviewStage[];
}

export type CheckingSessionStatus = 'draft' | 'in-progress' | 'completed' | 'archived';

export interface CheckingSessionReviewer {
  username: string;
  role?: string;
}

export interface CheckingSession {
  id: string;
  stageId: string;
  status: CheckingSessionStatus;
  created: string;
  reviewers?: CheckingSessionReviewer[];
  /** Uppercase USFM book codes in scope */
  scope: string[];
}

export type ChecklistItemType = 'scripture-range' | 'term' | 'custom';

export type ChecklistItemStatus = 'pending' | 'in-progress' | 'done' | 'flagged' | 'skipped';

export interface ChecklistTermRef {
  source: string;
  id: string;
}

export interface ChecklistTemplateItem {
  id: string;
  label: string;
  criteria?: string;
  termRef?: ChecklistTermRef;
}

export type ChecklistAutoGenerateStrategy = 'by-verse' | 'by-chapter' | 'by-range';

export interface ChecklistTemplate {
  id: string;
  label: string;
  description?: string;
  itemType: ChecklistItemType;
  templateItems?: ChecklistTemplateItem[];
  autoGenerate?: {
    strategy: ChecklistAutoGenerateStrategy;
    scope: 'session' | 'project';
  };
}

export interface ChecklistItem {
  id: string;
  label: string;
  criteria?: string;
  itemType: ChecklistItemType;
  termRef?: ChecklistTermRef;
  ref?: ScriptureRef;
  status: ChecklistItemStatus;
  assignees: string[];
  completedBy?: string;
  completedAt?: string;
  comment?: string | null;
}

export interface ChecklistInstance {
  id: string;
  sessionId: string;
  stageId: string;
  label: string;
  templateId?: string | null;
  created: string;
  items: ChecklistItem[];
}

export interface CheckingComment {
  id: string;
  author: string;
  timestamp: string;
  text: string;
  resolved: boolean;
}

export interface VerseSnapshot {
  chapter: number;
  verse: number;
  text: string;
}

export interface SelectedText {
  text: string;
  startOffset: number;
  endOffset: number;
  verseSnapshots: VerseSnapshot[];
}

export type TextReferenceStatus = 'exact' | 'relocated' | 'approximate' | 'stale';

export interface TextReferenceResult {
  status: TextReferenceStatus;
  /** Resolved highlight range within concatenated verse text (implementation-defined) */
  highlightStart?: number;
  highlightEnd?: number;
}

export interface CheckingThread {
  id: string;
  ref: ScriptureRef;
  selectedText?: SelectedText;
  sessionId: string;
  stageId: string;
  comments: CheckingComment[];
}

export interface CheckingDecision {
  ref: ScriptureRef;
  selectedText?: SelectedText;
  sessionId: string;
  stageId: string;
  status: 'approved' | 'rejected' | 'revise' | string;
  reviewer: string;
  timestamp: string;
  note?: string;
}

export interface CheckingCommentsFile {
  book: string;
  threads: CheckingThread[];
}

export interface CheckingDecisionsFile {
  book: string;
  decisions: CheckingDecision[];
}
