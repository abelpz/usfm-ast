/**
 * PeerSyncPanel — UI for file-based device-to-device project sync (Phase 7).
 *
 * Lets two offline devices exchange project state without any server by
 * sharing a `.bible.project.zip` snapshot that includes CRDT `.ybin` companions.
 * The standard Door43 sync server is NOT required for this flow.
 */

import { Button } from '@/components/ui/button';
import { getProjectStorage } from '@/lib/project-storage';
import {
  downloadPeerSnapshot,
  exportPeerSnapshot,
  importPeerSnapshot,
} from '@/lib/peer-snapshot';
import { cn } from '@/lib/utils';
import { ArrowDownToLine, ArrowUpFromLine, Loader2, Wifi } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

export type PeerSyncPanelProps = {
  projectId: string;
  displayName: string;
  onImported?: () => void;
  className?: string;
};

/**
 * Export / import a project snapshot for sharing with another offline device.
 *
 * The exported file is a standard `.bible.project.zip` bundle that includes
 * CRDT `.ybin` companion files alongside the USFM text.  When Device B imports
 * it, `mergeProjectMaps` uses a CRDT-first 3-way merge — no server required.
 */
export function PeerSyncPanel({
  projectId,
  displayName,
  onImported,
  className,
}: PeerSyncPanelProps) {
  const storage = getProjectStorage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const onExport = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    let url: string | null = null;
    try {
      const { blob, filename } = await exportPeerSnapshot({ storage, projectId, displayName });
      url = downloadPeerSnapshot(blob, filename);
      setMsg({ kind: 'ok', text: `Snapshot downloaded: ${filename}` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 60_000);
    }
  }, [projectId, displayName, storage]);

  const onPickFile = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onFile = useCallback(
    async (ev: React.ChangeEvent<HTMLInputElement>) => {
      const file = ev.target.files?.[0];
      ev.target.value = '';
      if (!file) return;
      setBusy(true);
      setMsg(null);
      try {
        const result = await importPeerSnapshot({ storage, projectId, file });
        const { importedPaths, conflicts } = result;
        if (conflicts.length > 0) {
          await storage.updateProject(projectId, { pendingConflicts: conflicts });
          setMsg({
            kind: 'ok',
            text: `Merged ${importedPaths.length} file(s). ${conflicts.length} conflict(s) need your choice — open a book to resolve them.`,
          });
        } else {
          setMsg({ kind: 'ok', text: `Merged ${importedPaths.length} file(s) — no conflicts.` });
        }
        onImported?.();
      } catch (e) {
        setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
      } finally {
        setBusy(false);
      }
    },
    [onImported, projectId, storage],
  );

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <Wifi className="size-4 text-muted-foreground shrink-0" aria-hidden />
        <h3 className="text-sm font-semibold">Share with another device</h3>
      </div>

      <p className="text-muted-foreground text-sm leading-relaxed">
        Exchange project edits between two devices without an internet connection.
        Export a snapshot on this device, transfer the file (USB, email, etc.), then
        import it on the other device. Edits from both sides are merged automatically
        using the CRDT history — conflicts are rare and only surface when the same
        verse was changed on both devices with no shared ancestry.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-2"
          disabled={busy}
          onClick={() => void onExport()}
          aria-label="Export snapshot for sharing"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ArrowUpFromLine className="size-4" aria-hidden />
          )}
          Export snapshot
        </Button>

        <Button
          type="button"
          variant="default"
          size="sm"
          className="gap-2"
          disabled={busy}
          onClick={onPickFile}
          aria-label="Import snapshot from another device"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ArrowDownToLine className="size-4" aria-hidden />
          )}
          Import from device
        </Button>

        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          onChange={(e) => void onFile(e)}
        />
      </div>

      {msg ? (
        <p
          className={cn(
            'rounded-md border px-3 py-2 text-xs leading-relaxed',
            msg.kind === 'ok' && 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
            msg.kind === 'err' && 'border-destructive/40 bg-destructive/5 text-destructive',
          )}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
