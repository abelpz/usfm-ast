import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import type { ScriptureSession, ToUsfmAlignmentOptions } from '@usfm-tools/editor';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { nativeSaveFile } from '@/lib/tauri-file-dialog';
import { usePlatform } from '@/platform/PlatformContext';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ScriptureSession | null;
  onExported?: () => void;
};

export function ExportUsfmDialog({ open, onOpenChange, session, onExported }: Props) {
  const { platform } = usePlatform();

  /** Whether to embed any alignment layer at all. Default OFF = plain USFM. */
  const [attachAlignments, setAttachAlignments] = useState(false);
  /** Which specific layer key to embed when attachAlignments is true. */
  const [pickedLayerKey, setPickedLayerKey] = useState<string>('');
  /** Whether to use the loaded reference for the \rem alignment-source provenance. */
  const [useLoadedSourceRem, setUseLoadedSourceRem] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeLayerKey = session?.getActiveAlignmentDocumentKey() ?? null;

  const docList = useMemo(() => {
    if (!session) return [];
    const keys = session.getAlignmentDocumentKeys();
    const docs = session.getAlignmentDocuments();
    return keys.map((key, i) => {
      const d = docs[i]!;
      const label =
        key === '__embedded__'
          ? 'Embedded (from loaded USFM)'
          : `${d.source.id}${d.source.version ? ` v${d.source.version}` : ''}`;
      const verseCount = Object.keys(d.verses).length;
      const subtitle =
        key === '__embedded__'
          ? `${verseCount} verse${verseCount !== 1 ? 's' : ''} aligned`
          : `${d.source.id}${d.source.version ? ` @ ${d.source.version}` : ''} · ${verseCount} verse${verseCount !== 1 ? 's' : ''}`;
      return { key, label, subtitle };
    });
  }, [session, open]);

  const canUseLoadedRem = Boolean(session?.getAlignmentSourceUsj());
  const compat = session?.getAlignmentSourceCompatibility();
  const suggestLoadedRem =
    compat &&
    (!compat.compatible ||
      compat.wordMatch?.confidence === 'none' ||
      compat.wordMatch?.confidence === 'partial');

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setAttachAlignments(false);
      setPickedLayerKey(activeLayerKey ?? '__embedded__');
      setUseLoadedSourceRem(false);
      setError(null);
    }
  }, [open, activeLayerKey]);

  // When toggle turns on, ensure a valid layer is selected
  useEffect(() => {
    if (attachAlignments && docList.length > 0 && !docList.find((d) => d.key === pickedLayerKey)) {
      setPickedLayerKey(docList[0]!.key);
    }
  }, [attachAlignments, docList, pickedLayerKey]);

  const doDownload = useCallback(
    async (text: string) => {
      if (platform === 'tauri') {
        const saved = await nativeSaveFile(text, {
          defaultPath: 'edited.usfm',
          filters: [{ name: 'USFM', extensions: ['usfm', 'sfm', 'txt'] }],
        });
        if (!saved) return; // user cancelled
      } else {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'edited.usfm';
        a.click();
        URL.revokeObjectURL(a.href);
      }
      onExported?.();
      onOpenChange(false);
    },
    [platform, onExported, onOpenChange],
  );

  const handleExport = useCallback(async () => {
    if (!session) return;
    setError(null);
    setExporting(true);
    try {
      const embedOpts: ToUsfmAlignmentOptions = {
        embedAlignmentProvenanceFromLoadedSource:
          useLoadedSourceRem && Boolean(session.getAlignmentSourceUsj()),
      };

      let usfm: string;
      if (!attachAlignments) {
        usfm = session.toUSFM(undefined, { ...embedOpts, embedAlignmentSourceKey: null });
      } else {
        usfm = session.toUSFM(undefined, { ...embedOpts, embedAlignmentSourceKey: pickedLayerKey });
      }
      await doDownload(usfm);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Export failed: ${msg}`);
      console.error('[ExportUsfmDialog] export failed', err);
    } finally {
      setExporting(false);
    }
  }, [session, attachAlignments, pickedLayerKey, useLoadedSourceRem, doDownload]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Export USFM</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!session ? (
            <p className="text-muted-foreground text-sm">Waiting for editor to load…</p>
          ) : null}

          {/* Attach alignments toggle */}
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="export-attach-toggle" className="flex flex-col gap-0.5">
              <span>Attach alignments</span>
              <span className="text-muted-foreground text-xs font-normal">
                Embed <code>\zaln-s</code> / <code>\w</code> milestone markers in the file
              </span>
            </Label>
            <Switch
              id="export-attach-toggle"
              checked={attachAlignments}
              onCheckedChange={setAttachAlignments}
              disabled={!session || docList.length === 0}
            />
          </div>

          {/* Layer radio list (only when toggle ON) */}
          {attachAlignments && docList.length > 0 ? (
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Alignment layer to embed
              </Label>
              <RadioGroup
                value={pickedLayerKey}
                onValueChange={setPickedLayerKey}
                className="space-y-1"
              >
                {docList.map(({ key, label, subtitle }) => (
                  <label
                    key={key}
                    htmlFor={`layer-${key}`}
                    className="hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
                  >
                    <RadioGroupItem
                      id={`layer-${key}`}
                      value={key}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{label}</span>
                        {key === (activeLayerKey ?? '__embedded__') && (
                          <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-xs font-medium">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-xs">{subtitle}</p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>
          ) : null}

          {/* Provenance checkbox — only when attaching alignments and a loaded reference exists */}
          {attachAlignments && canUseLoadedRem ? (
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="export-loaded-rem"
                checked={useLoadedSourceRem}
                onCheckedChange={(v) => setUseLoadedSourceRem(v === true)}
              />
              <div className="grid gap-1">
                <label htmlFor="export-loaded-rem" className="text-sm leading-none font-medium">
                  Use loaded alignment source for <code className="text-xs">\rem</code>
                </label>
                <p className="text-muted-foreground text-xs">
                  Sets <code className="text-xs">alignment-source:</code> from the reference you
                  picked in the alignment editor (its <code className="text-xs">\id</code> line),
                  not from the original embedded alignment document. If that reference does not
                  match the file's previous source, only verses you aligned after loading it are
                  exported with milestones; other verses are left unaligned.
                </p>
                {suggestLoadedRem ? (
                  <p className="text-amber-800 dark:text-amber-200 text-xs">
                    The loaded reference may not match the file's previous alignment source (or
                    word match is weak) — turn this on so the export documents what you actually
                    used.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="text-destructive rounded border border-current/30 p-2 text-sm">{error}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleExport} disabled={!session || exporting}>
            {exporting ? 'Exporting…' : 'Download'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
