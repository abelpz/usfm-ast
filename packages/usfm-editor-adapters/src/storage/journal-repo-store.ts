/**
 * Repo-relative paths for optional per-book operation journals (`journal/<BOOK>.jsonl`).
 * Full wiring to {@link OperationJournal} persistence is host-specific; this module
 * only defines stable path helpers used by sync and bundles.
 */

function normBook(bookCode: string): string {
  return bookCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

export function journalRepoPathForBook(bookCode: string): string {
  return `journal/${normBook(bookCode)}.jsonl`;
}

/** Folded USJ snapshots written by {@link OperationJournal.maybeCompactAfterPush}. */
export function journalSnapshotPathForBook(bookCode: string, snapshotId: string): string {
  const b = normBook(bookCode);
  return `journal/snapshots/${b}/${snapshotId}.json`;
}
