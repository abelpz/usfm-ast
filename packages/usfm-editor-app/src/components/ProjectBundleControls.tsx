import { Tip } from '@/components/Tip';
import { Button } from '@/components/ui/button';
import {
  bibleProjectZipDownloadBasename,
  exportProjectBundle,
  importProjectBundle,
} from '@/lib/project-bundle';
import { getProjectStorage } from '@/lib/project-storage';
import { cn } from '@/lib/utils';
import { Download, Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

export type ProjectBundleControlsProps = {
  projectId: string;
  onImported?: () => void;
  /** Align action buttons for use in a horizontal toolbar (default: stacked on narrow screens). */
  className?: string;
  /** `end` = right-aligned (Books tab toolbar); `start` = left-aligned (Settings card). */
  actionsAlign?: 'start' | 'end';
  /**
   * `header` — page header: feedback floats below the buttons so the bar stays one row tall.
   * `card` — default; feedback stacks under the buttons.
   */
  variant?: 'card' | 'header';
};

export function ProjectBundleControls({
  projectId,
  onImported,
  className,
  actionsAlign = 'end',
  variant = 'card',
}: ProjectBundleControlsProps) {
  const headerToolbar = variant === 'header';
  const storage = getProjectStorage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onExport = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const blob = await exportProjectBundle({ storage, projectId });
      const meta = await storage.getProject(projectId);
      const displayName = meta?.name?.trim() || projectId;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = bibleProjectZipDownloadBasename(displayName, projectId);
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
        if (conflicts.length > 0) {
          await storage.updateProject(projectId, { pendingConflicts: conflicts });
          setMsg(
            `Imported ${importedPaths.length} file(s). ${conflicts.length} conflict(s) need your choice — open books or use the chapter bar in the editor.`,
          );
        } else {
          setMsg(`Imported ${importedPaths.length} file(s).`);
        }
        onImported?.();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [onImported, projectId, storage],
  );

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2',
        variant === 'header' && 'relative',
        variant === 'card' && actionsAlign === 'end' && 'sm:max-w-md sm:items-end',
        variant === 'card' && actionsAlign === 'start' && 'w-full sm:items-start',
        className,
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-center',
          headerToolbar ? 'gap-1' : 'gap-2',
          actionsAlign === 'end' ? 'justify-end' : 'justify-start',
        )}
      >
        <Tip label="Export bundle">
          <Button
            type="button"
            variant={headerToolbar ? 'ghost' : 'secondary'}
            size="icon"
            className={cn(headerToolbar ? 'relative size-8' : 'shadow-sm')}
            disabled={busy}
            onClick={onExport}
            aria-label="Export bundle"
          >
            <Upload
              className={cn('size-4', headerToolbar && 'text-blue-700 dark:text-blue-300')}
              aria-hidden
            />
          </Button>
        </Tip>
        <Tip label="Import bundle">
          <Button
            type="button"
            variant={headerToolbar ? 'ghost' : 'default'}
            size="icon"
            className={cn(headerToolbar ? 'relative size-8' : 'shadow-sm')}
            disabled={busy}
            onClick={onPickFile}
            aria-label="Import bundle"
          >
            <Download
              className={cn('size-4', headerToolbar && 'text-emerald-700 dark:text-emerald-300')}
              aria-hidden
            />
          </Button>
        </Tip>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          onChange={onFile}
        />
      </div>
      {msg ? (
        <p
          className={cn(
            'rounded-lg border px-3 py-2 text-xs leading-relaxed',
            variant === 'card' &&
              cn(
                'text-muted-foreground border-border w-full bg-muted/40',
                actionsAlign === 'end' && 'sm:text-right',
              ),
            variant === 'header' &&
              cn(
                'absolute top-full right-0 z-50 mt-1.5 w-[min(calc(100vw-2rem),18rem)] shadow-md',
                msg.includes('conflict')
                  ? 'border-amber-200/80 bg-amber-50/80 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100'
                  : 'border-border bg-popover text-popover-foreground',
              ),
            variant === 'card' && msg.includes('conflict') && 'border-amber-200/80 bg-amber-50/80 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100',
          )}
        >
          {msg}
        </p>
      ) : null}
    </div>
  );
}
