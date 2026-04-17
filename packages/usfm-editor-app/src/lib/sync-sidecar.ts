/**
 * Read/write `.sync/<BOOK>.json` sidecars in the project virtual FS (repo-relative).
 */

import type { ProjectDocSyncSidecar } from '@usfm-tools/types';

const SYNC_DIR = '.sync';

export function syncSidecarPathForBook(bookCode: string): string {
  const b = bookCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  return `${SYNC_DIR}/${b}.json`;
}

export function parseSyncSidecarJson(raw: string): ProjectDocSyncSidecar | null {
  try {
    const j = JSON.parse(raw) as ProjectDocSyncSidecar;
    if (j && j.schema === 1 && typeof j.docId === 'string' && typeof j.savedAt === 'string') {
      return j;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function serializeSyncSidecar(sidecar: ProjectDocSyncSidecar): string {
  return `${JSON.stringify(sidecar, null, 2)}\n`;
}

export function makeSyncSidecar(partial: Partial<ProjectDocSyncSidecar> & Pick<ProjectDocSyncSidecar, 'docId'>): ProjectDocSyncSidecar {
  const now = new Date().toISOString();
  return {
    schema: 1,
    docId: partial.docId,
    baseCommit: partial.baseCommit,
    baseBlobSha: partial.baseBlobSha,
    vectorClock: partial.vectorClock,
    journalId: partial.journalId,
    savedAt: partial.savedAt ?? now,
  };
}
