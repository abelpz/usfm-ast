import { SyncConflictDialog } from '@/components/SyncConflictDialog';
import { Button } from '@/components/ui/button';
import { exportProjectBundle, importProjectBundle } from '@/lib/project-bundle';
import { getProjectStorage } from '@/lib/project-storage';
import type { FileConflict } from '@usfm-tools/types';
import { Download, Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

export type ProjectBundleControlsProps = {
  projectId: string;
  onImported?: () => void;
};

export function ProjectBundleControls({ projectId, onImported }: ProjectBundleControlsProps) {
  const storage = getProjectStorage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingConflicts, setPendingConflicts] = useState<FileConflict[]>([]);
  const [importedCount, setImportedCount] = useState(0);

  const onExport = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const blob = await exportProjectBundle({ storage, projectId });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectId}.usfmbundle.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg('Bundle downloaded.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [projectId, storage]);

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
        const { importedPaths, conflicts } = await importProjectBundle({
          storage,
          projectId,
          blob: file,
          enableMerge: true,
        });
        setImportedCount(importedPaths.length);
        if (conflicts.length > 0) {
          setPendingConflicts(conflicts);
          setMsg(`Imported ${importedPaths.length} file(s). ${conflicts.length} conflict(s) need your choice.`);
        } else {
          setMsg(`Imported ${importedPaths.length} file(s).`);
          onImported?.();
        }
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [onImported, projectId, storage],
  );

  const onResolveConflict = useCallback(
    async (path: string, choice: 'ours' | 'theirs') => {
      const c = pendingConflicts.find((x) => x.path === path);
      if (!c) return;
      const text = choice === 'ours' ? c.oursText : c.theirsText;
      if (text === '') {
        await storage.deleteFile(projectId, path);
      } else {
        await storage.writeFile(projectId, path, text);
      }
      const next = pendingConflicts.filter((x) => x.path !== path);
      setPendingConflicts(next);
      if (next.length === 0) {
        setMsg(`Imported ${importedCount} file(s). All conflicts resolved.`);
        onImported?.();
      }
    },
    [importedCount, onImported, pendingConflicts, projectId, storage],
  );

  const onCloseConflicts = useCallback(() => {
    setPendingConflicts([]);
  }, []);

  return (
    <div className="usfm-project-bundle-controls">
      <div className="usfm-project-bundle-actions">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onExport}>
          <Download className="usfm-icon-inline" aria-hidden />
          Export bundle
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onPickFile}>
          <Upload className="usfm-icon-inline" aria-hidden />
          Import bundle
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          onChange={onFile}
        />
      </div>
      {msg ? <p className="usfm-project-bundle-msg">{msg}</p> : null}

      <SyncConflictDialog
        open={pendingConflicts.length > 0}
        conflicts={pendingConflicts}
        onClose={onCloseConflicts}
        onResolve={(path, choice) => void onResolveConflict(path, choice)}
      />
    </div>
  );
}
