import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ScriptureSession, ToUsfmAlignmentOptions } from '@usfm-tools/editor';
import { useEffect, useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';

type EmbedChoice = 'active' | 'none' | string;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ScriptureSession | null;
  onExported?: () => void;
};

export function ExportUsfmDialog({ open, onOpenChange, session, onExported }: Props) {
  const [choice, setChoice] = useState<EmbedChoice>('active');
  /** `\\rem alignment-source:` from the file loaded in the alignment panel (vs. original embedded doc). */
  const [useLoadedSourceRem, setUseLoadedSourceRem] = useState(false);

  useEffect(() => {
    if (open) {
      setChoice('active');
      setUseLoadedSourceRem(false);
    }
  }, [open]);

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
      return { key, label };
    });
  }, [session, open]);

  const canUseLoadedRem = Boolean(session?.getAlignmentSourceUsj());
  const compat = session?.getAlignmentSourceCompatibility();
  const suggestLoadedRem =
    compat &&
    (!compat.compatible || compat.wordMatch?.confidence === 'none' || compat.wordMatch?.confidence === 'partial');

  function download(text: string) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'edited.usfm';
    a.click();
    URL.revokeObjectURL(a.href);
    onExported?.();
    onOpenChange(false);
  }

  function handleExport() {
    if (!session) return;
    const embedOpts: ToUsfmAlignmentOptions = {
      embedAlignmentProvenanceFromLoadedSource:
        useLoadedSourceRem && Boolean(session.getAlignmentSourceUsj()),
    };
    if (choice === 'none') {
      download(session.toUSFM(undefined, { ...embedOpts, embedAlignmentSourceKey: null }));
      return;
    }
    if (choice === 'active') {
      download(session.toUSFM(undefined, embedOpts));
      return;
    }
    download(session.toUSFM(undefined, { ...embedOpts, embedAlignmentSourceKey: choice }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Export USFM</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-muted-foreground text-sm">
            Choose whether to embed word-alignment milestones (<code className="text-xs">\zaln-s</code> /{' '}
            <code className="text-xs">\w</code>) in the exported file.
          </p>
          <div className="space-y-2">
            <Label htmlFor="export-align">Alignment layer</Label>
            <Select
              value={choice}
              onValueChange={(v) => setChoice(v as EmbedChoice)}
              disabled={!session}
            >
              <SelectTrigger id="export-align" className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active layer (current editor alignment)</SelectItem>
                <SelectItem value="none">Plain USFM (no alignment milestones)</SelectItem>
                {docList.map(({ key, label }) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {choice !== 'none' && canUseLoadedRem ? (
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
                  Sets <code className="text-xs">alignment-source:</code> from the reference you picked in the
                  alignment editor (its <code className="text-xs">\id</code> line), not from the original
                  embedded alignment document. If that reference does not match the file’s previous source,
                  only verses you aligned after loading it are exported with milestones; other verses are
                  left unaligned.
                </p>
                {suggestLoadedRem ? (
                  <p className="text-amber-800 dark:text-amber-200 text-xs">
                    The loaded reference may not match the file’s previous alignment source (or word match
                    is weak) — turn this on so the export documents what you actually used. If the
                    reference identity differs from the file’s <code className="text-xs">\rem</code>, only
                    verses you aligned after loading it keep milestones.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleExport} disabled={!session}>
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
