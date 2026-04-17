/**
 * Types for the enhanced DCS project layout (alignments/, checking/, resources/).
 * @see docs/30-project-format.md
 */

import type { AlignmentDocument } from '@usfm-tools/types';

/** Root `alignments/manifest.json` */
export type AlignmentManifestJson = {
  version: string;
  sources: AlignmentManifestSource[];
};

export type AlignmentManifestSource = {
  /** Canonical id (matches directory name and app keys) */
  id: string;
  language?: string;
  identifier?: string;
  version?: string;
  /** Subdirectory under `alignments/` */
  directory: string;
};

/** Root `checking/manifest.json` */
export type CheckingRootManifestJson = {
  version: string;
  schemaVersion: string;
  title?: string;
};

/** Per-book `checking/{BOOK}.checking.json` */
export type CheckingBookMeta = {
  book: string;
  schemaVersion: string;
};

export type CheckingEntryBase = {
  id: string;
  ref: string;
  author: string;
  /** ISO 8601 */
  timestamp: string;
  /** Id of entry this one supersedes (append-only “edit”) */
  supersedes: string | null;
};

export type CheckingCommentEntry = CheckingEntryBase & {
  type: 'comment';
  body: string;
  resolved: boolean;
};

export type CheckingDecisionEntry = CheckingEntryBase & {
  type: 'decision';
  status: string;
  note?: string;
};

export type CheckingEntry = CheckingCommentEntry | CheckingDecisionEntry;

export type CheckingBookFile = {
  meta: CheckingBookMeta;
  entries: CheckingEntry[];
};

/** Discriminant for launcher / recent projects (plan §Phase 2). */
export type EditorProjectFormatKind =
  | 'scripture-burrito'
  | 'resource-container'
  | 'raw-usfm'
  /** SB or RC repo that includes `alignments/manifest.json` + `checking/manifest.json` */
  | 'enhanced';

/**
 * When {@link EditorProjectFormatKind} is `enhanced`, USFM paths follow this base layout.
 */
export type RepoLayoutKind = 'scripture-burrito' | 'resource-container';

export type EnhancedProjectDescriptor = {
  projectFormat: 'enhanced';
  repoLayout: RepoLayoutKind;
};

/** Re-export alignment document type used for `*.alignment.json` files. */
export type ExternalAlignmentDocument = AlignmentDocument;
