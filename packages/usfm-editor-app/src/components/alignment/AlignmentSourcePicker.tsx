import type { UsjDocument } from '@usfm-tools/editor-core';
import type { SourceTextSession } from '@usfm-tools/editor';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { parseUsfmToUsj } from '@/alignment-panel';

type Props = {
  sourceTextSession: SourceTextSession | null;
  referenceLabel: (usj: UsjDocument) => string;
  onConfirm: (usj: UsjDocument) => void;
};

export function AlignmentSourcePicker({ sourceTextSession, referenceLabel, onConfirm }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    void f.text().then((text) => {
      try {
        const usj = parseUsfmToUsj(text);
        onConfirm(usj as UsjDocument);
      } catch {
        /* ignore */
      }
      ev.target.value = '';
    });
  }

  const refLoaded = Boolean(sourceTextSession?.isLoaded());
  const refUsj = refLoaded ? (sourceTextSession!.store.getFullUSJ() as UsjDocument) : null;

  return (
    <div className="border-border bg-card mx-auto max-w-lg space-y-4 rounded-xl border p-6 shadow-sm">
      <h2 className="text-foreground text-lg font-semibold">Choose alignment source</h2>
      <p className="text-muted-foreground text-sm">
        Pick the text you are aligning <strong>to</strong> (e.g. Greek UGNT). By default this is the
        same as your reference column if you loaded one.
      </p>

      {refUsj ? (
        <div className="bg-muted/40 space-y-2 rounded-lg border p-4">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Reference column (default)
          </p>
          <p className="text-foreground font-mono text-sm">{referenceLabel(refUsj)}</p>
          <Button type="button" className="w-full" onClick={() => onConfirm(refUsj)}>
            Use reference text as alignment source
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No reference text loaded. Open the reference panel and load a file, or choose a USFM file
          below.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".usfm,.sfm,.txt,.usj,.json"
          className="hidden"
          onChange={onFile}
        />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          Choose a different USFM file…
        </Button>
      </div>
    </div>
  );
}
