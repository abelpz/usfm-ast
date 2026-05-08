import type { ChapterConflict } from '@usfm-tools/editor-core';
import type { FileConflict } from '@usfm-tools/types';

export type ConflictWorkspaceOrigin =
  | 'local-sync'
  | 'bundle-import'
  | 'editor-run-sync';

export type ConflictWorkspaceFilePayload = {
  kind: 'file';
  origin: 'local-sync' | 'bundle-import';
  projectId: string;
  conflicts: FileConflict[];
  defaultOursLabel?: string;
  defaultTheirsLabel?: string;
  /** Optional count used for user messaging after apply. */
  importedCount?: number;
  /** Optional return route; falls back to `/project/:id`. */
  returnTo?: string;
  /** Optional source-language hint used by ReferenceColumn helps discovery. */
  sourceLanguage?: string;
  /** Optional source prefill from launch/config. */
  sourceReferenceUsfm?: string;
};

export type ConflictWorkspaceChapterPayload = {
  kind: 'chapter';
  origin: 'editor-run-sync';
  projectId: string;
  conflicts: ChapterConflict[];
  /** Optional return route; defaults to `/project/:id/editor`. */
  returnTo?: string;
  sourceLanguage?: string;
  sourceReferenceUsfm?: string;
  launchBookCode?: string;
};

export type ConflictWorkspacePayload =
  | ConflictWorkspaceFilePayload
  | ConflictWorkspaceChapterPayload;

type ConflictWorkspaceRouteState = {
  __conflictWorkspace: true;
  payload: ConflictWorkspacePayload;
};

export function buildConflictWorkspaceState(payload: ConflictWorkspacePayload): ConflictWorkspaceRouteState {
  return { __conflictWorkspace: true, payload };
}

export function readConflictWorkspaceState(v: unknown): ConflictWorkspacePayload | null {
  if (!v || typeof v !== 'object') return null;
  const rec = v as Record<string, unknown>;
  if (rec.__conflictWorkspace !== true) return null;
  const payload = rec.payload;
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (p.kind !== 'file' && p.kind !== 'chapter') return null;
  if (typeof p.projectId !== 'string') return null;
  if (!Array.isArray(p.conflicts)) return null;
  return payload as ConflictWorkspacePayload;
}
