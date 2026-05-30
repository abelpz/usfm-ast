import { USFM_BOOK_CODES } from '@usfm-tools/editor';
import type { FileConflict, ProjectStorage } from '@usfm-tools/types';
import { deleteFileWithCrdt, writeFileWithCrdt } from './crdt-storage';

/** Book code from a USFM path like `65-3JN.usfm`, or null for non-USFM paths. */
export function inferBookCodeFromPath(path: string): string | null {
  const p = path.replace(/\\/g, '/').toUpperCase();
  const m = p.match(/(?:^|\/)(?:\d{2}-)?([1-3]?[A-Z]{2,3})\.(?:USFM|SFM)$/);
  if (!m) return null;
  const code = m[1];
  return USFM_BOOK_CODES.some(([c]) => c === code) ? code : null;
}

export function conflictsForBook(conflicts: FileConflict[], bookCode: string): FileConflict[] {
  const upper = bookCode.toUpperCase();
  return conflicts.filter((c) => inferBookCodeFromPath(c.path) === upper);
}

export function hasNonUsfmPendingConflicts(conflicts: FileConflict[]): boolean {
  return conflicts.some((c) => !inferBookCodeFromPath(c.path));
}

/** Chapter numbers with at least one pending conflict for this book's USFM file(s). */
export function conflictChaptersForBook(conflicts: FileConflict[], bookCode: string): Set<number> {
  const set = new Set<number>();
  for (const c of conflictsForBook(conflicts, bookCode)) {
    for (const ch of c.chapterIndices) {
      if (Number.isInteger(ch) && ch > 0) set.add(ch);
    }
  }
  return set;
}

export async function applySingleFileConflictResolution(
  storage: ProjectStorage,
  projectId: string,
  c: FileConflict,
  choice: 'ours' | 'theirs' | 'merged',
  mergedText?: string,
): Promise<void> {
  const text =
    choice === 'merged' && mergedText !== undefined
      ? mergedText
      : choice === 'theirs'
        ? c.theirsText
        : c.oursText;
  if (text === '') await deleteFileWithCrdt(storage, projectId, c.path);
  else await writeFileWithCrdt(storage, projectId, c.path, text);
}

/** Apply ours/theirs for every pending conflict whose path maps to `bookCode`. Returns the new pending list. */
export async function resolveAllConflictsForBook(
  storage: ProjectStorage,
  projectId: string,
  conflicts: FileConflict[],
  bookCode: string,
  side: 'ours' | 'theirs',
): Promise<FileConflict[]> {
  const toResolve = conflictsForBook(conflicts, bookCode);
  const resolvedPaths = new Set(toResolve.map((c) => c.path));
  for (const c of toResolve) {
    await applySingleFileConflictResolution(storage, projectId, c, side);
  }
  const next = conflicts.filter((c) => !resolvedPaths.has(c.path));
  await storage.updateProject(projectId, {
    pendingConflicts: next.length > 0 ? next : undefined,
  });
  return next;
}

/** Apply `side` for every pending conflict file, then clear pending conflicts. */
export async function resolveAllPendingConflicts(
  storage: ProjectStorage,
  projectId: string,
  side: 'ours' | 'theirs',
): Promise<void> {
  const meta = await storage.getProject(projectId);
  const conflicts = meta?.pendingConflicts ?? [];
  for (const c of conflicts) {
    await applySingleFileConflictResolution(storage, projectId, c, side);
  }
  await storage.updateProject(projectId, {
    pendingConflicts: undefined,
  });
}
