import type { FileConflict } from '@usfm-tools/types';

export type SyncConflictDialogProps = {
  open: boolean;
  conflicts: FileConflict[];
  onClose: () => void;
  /** Apply chosen side and persist to project storage. */
  onResolve: (path: string, choice: 'ours' | 'theirs') => void;
};

/**
 * Minimal v1 conflict UI: three panes (base / ours / theirs) and two resolution buttons.
 */
export function SyncConflictDialog({
  open,
  conflicts,
  onClose,
  onResolve,
}: SyncConflictDialogProps) {
  if (!open || conflicts.length === 0) return null;

  return (
    <div className="usfm-sync-conflict-overlay" role="dialog" aria-modal="true">
      <div className="usfm-sync-conflict-modal">
        <h2>Merge conflicts</h2>
        <p className="usfm-sync-conflict-lead">
          {conflicts.length} file(s) need your choice. Pick which version to keep for each.
        </p>
        <ul className="usfm-sync-conflict-list">
          {conflicts.map((c) => (
            <li key={c.conflictId}>
              <div className="usfm-sync-conflict-path">{c.path}</div>
              {c.chapterIndices.length > 0 && (
                <div className="usfm-sync-conflict-chapters">
                  Chapters: {c.chapterIndices.join(', ')}
                </div>
              )}
              <div className="usfm-sync-conflict-panes">
                <div>
                  <div className="usfm-sync-conflict-label">Base</div>
                  <pre dir="auto" className="usfm-sync-conflict-pre">
                    {truncate(c.baseText, 4000)}
                  </pre>
                </div>
                <div>
                  <div className="usfm-sync-conflict-label">Yours (local)</div>
                  <pre dir="auto" className="usfm-sync-conflict-pre">
                    {truncate(c.oursText, 4000)}
                  </pre>
                </div>
                <div>
                  <div className="usfm-sync-conflict-label">Theirs (Door43)</div>
                  <pre dir="auto" className="usfm-sync-conflict-pre">
                    {truncate(c.theirsText, 4000)}
                  </pre>
                </div>
              </div>
              <div className="usfm-sync-conflict-actions">
                <button type="button" onClick={() => onResolve(c.path, 'ours')}>
                  Keep mine
                </button>
                <button type="button" onClick={() => onResolve(c.path, 'theirs')}>
                  Keep theirs
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="usfm-sync-conflict-dismiss" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…`;
}
