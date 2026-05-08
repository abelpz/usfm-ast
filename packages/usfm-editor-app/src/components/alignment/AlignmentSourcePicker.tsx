import type { UsjDocument } from '@usfm-tools/editor-core';
import type { AlignmentDocument } from '@usfm-tools/types';
import { BadgeCheck, ChevronDown, ChevronRight, Globe, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlignmentLanguageQuickPick } from '@/components/alignment/AlignmentLanguageQuickPick';
import { parseUsfmToUsj } from '@/alignment-panel';
import type { Door43LanguageOption } from '@/dcs-client';
import { cn } from '@/lib/utils';
import {
  matchLayerKey,
  sourceKeyFromUsj,
  type SourceSlotSnapshot,
} from '@/components/alignment/alignment-source-matching';

export type { SourceSlotSnapshot } from '@/components/alignment/alignment-source-matching';

type Props = {
  /** All loaded reference slots from ReferenceColumn. */
  sourceSlots: ReadonlyArray<SourceSlotSnapshot>;
  /** AlignmentDocument entries already loaded in the session. */
  existingLayers: AlignmentDocument[];
  /** Active layer key so we can pre-highlight the matching slot. */
  activeLayerKey: string | null;
  /** What the translation's \rem alignment-source says (for "best match" badge). */
  expectedAlignmentKey: string | null;
  /** DCS auth for the language quick-pick. */
  dcsAuth: { host: string; token?: string } | null;
  /** Returns a short identity string from the USJ \id line (book + resource code, no date). Null means omit the subtitle. */
  referenceLabel: (usj: UsjDocument) => string | null;
  /** Picked source matches an existing layer → load reference + set active. */
  onUseExistingLayer: (layerKey: string, sourceUsj: UsjDocument) => void;
  /** Picked source doesn't match any layer → start a new empty layer against it. */
  onStartNewLayer: (sourceUsj: UsjDocument) => void;
  /** Trigger language load in ReferenceColumn (imperative). */
  onRequestAddDcsLanguage: (lang: Door43LanguageOption) => void;
  /** `card` = legacy centered chooser; `inline` = strip at top of alignment shell. */
  variant?: 'card' | 'inline';
};

function isBestMatch(
  srcKey: string,
  expectedAlignmentKey: string | null,
): boolean {
  if (expectedAlignmentKey === null) return false;
  return (
    srcKey.toLowerCase().includes(expectedAlignmentKey.toLowerCase()) ||
    expectedAlignmentKey.toLowerCase().includes(srcKey.toLowerCase())
  );
}

export function AlignmentSourcePicker({
  sourceSlots,
  existingLayers,
  activeLayerKey,
  expectedAlignmentKey,
  dcsAuth,
  referenceLabel,
  onUseExistingLayer,
  onStartNewLayer,
  onRequestAddDcsLanguage,
  variant = 'card',
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showDcsPicker, setShowDcsPicker] = useState(false);
  const [dcsLanguageAdding, setDcsLanguageAdding] = useState(false);

  function onFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    void f.text().then((text) => {
      try {
        const usj = parseUsfmToUsj(text);
        const srcKey = sourceKeyFromUsj(usj as UsjDocument);
        const matchedKey = matchLayerKey(existingLayers, srcKey);
        if (matchedKey) {
          onUseExistingLayer(matchedKey, usj as UsjDocument);
        } else {
          onStartNewLayer(usj as UsjDocument);
        }
      } catch {
        /* ignore parse errors */
      }
      ev.target.value = '';
    });
  }

  function handleDcsPick(lang: Door43LanguageOption) {
    setDcsLanguageAdding(true);
    setShowDcsPicker(false);
    onRequestAddDcsLanguage(lang);
    setTimeout(() => setDcsLanguageAdding(false), 3000);
  }

  const loadedSlots = sourceSlots.filter((s) => s.session?.isLoaded());
  const inline = variant === 'inline';

  const content = (
    <>
      {inline ? (
        <div>
          <h2 className="text-foreground text-base font-semibold">Alignment source</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Pick a loaded reference, add from Door43, or upload USFM. When one reference matches
            your book, it is applied automatically.
          </p>
        </div>
      ) : (
        <div>
          <h2 className="text-foreground text-lg font-semibold">Choose alignment source</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Pick the text to align <strong>against</strong> (e.g. Greek UGNT, ULT). If this book is
            already aligned to a source, pick the same one to continue, or pick a different source to
            start a new alignment layer.
          </p>
        </div>
      )}

      {loadedSlots.length > 0 ? (
        <div className="space-y-2">
          <p
            className={cn(
              'text-muted-foreground font-medium uppercase tracking-wide',
              inline ? 'text-[10px]' : 'text-xs',
            )}
          >
            Loaded references
          </p>
          <div
            className={cn(
              inline
                ? 'flex flex-col gap-2 sm:flex-row sm:flex-wrap'
                : 'space-y-2',
            )}
          >
            {loadedSlots.map((slot) => {
              const usj = slot.session!.store.getFullUSJ() as UsjDocument;
              const srcKey = sourceKeyFromUsj(usj);
              const matchedLayerKey = matchLayerKey(existingLayers, srcKey);
              const isBest = isBestMatch(srcKey, expectedAlignmentKey);
              const isActiveLayer = matchedLayerKey !== null && matchedLayerKey === activeLayerKey;
              const subtitle = referenceLabel(usj);
              const displayTitle = slot.title || slot.label;
              const codeLabel = slot.title ? slot.label : null;

              if (inline) {
                return (
                  <div
                    key={slot.id}
                    className={cn(
                      'flex min-w-0 max-w-md flex-1 flex-col gap-1.5 rounded-lg border p-2',
                      isBest && 'border-primary/40 bg-primary/5',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-foreground text-sm font-medium">{displayTitle}</span>
                        {codeLabel && (
                          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-xs">
                            {codeLabel}
                          </span>
                        )}
                        {isBest && (
                          <span className="bg-primary/15 text-primary inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium">
                            <BadgeCheck className="size-3" aria-hidden />
                            Best match
                          </span>
                        )}
                        {isActiveLayer && (
                          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                            Active layer
                          </span>
                        )}
                      </div>
                      {subtitle && (
                        <p className="text-muted-foreground truncate font-mono text-[10px]">{subtitle}</p>
                      )}
                    </div>
                    {matchedLayerKey ? (
                      <Button
                        type="button"
                        size="sm"
                        className="w-full shrink-0"
                        onClick={() => onUseExistingLayer(matchedLayerKey, usj)}
                      >
                        Continue with this reference
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full shrink-0"
                        onClick={() => onStartNewLayer(usj)}
                      >
                        New layer from this reference
                      </Button>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={slot.id}
                  className={cn(
                    'space-y-2 rounded-lg border p-4 transition-colors',
                    isBest && 'border-primary/40 bg-primary/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">{displayTitle}</span>
                        {codeLabel && (
                          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-xs">
                            {codeLabel}
                          </span>
                        )}
                        {isBest && (
                          <span className="bg-primary/15 text-primary inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium">
                            <BadgeCheck className="size-3" aria-hidden />
                            Best match
                          </span>
                        )}
                        {isActiveLayer && (
                          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                            Active layer
                          </span>
                        )}
                      </div>
                      {subtitle && (
                        <p className="text-muted-foreground mt-0.5 truncate font-mono text-xs">{subtitle}</p>
                      )}
                    </div>
                  </div>
                  {matchedLayerKey ? (
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      onClick={() => onUseExistingLayer(matchedLayerKey, usj)}
                    >
                      Continue aligning against this reference
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => onStartNewLayer(usj)}
                    >
                      Start new alignment layer against this reference
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          {inline
            ? 'No reference text in the reference panel yet. Add one from Door43 or upload a file, or open the side reference panel and load a source first.'
            : 'No reference text loaded in the reference panel. Add one from Door43 below, upload a file, or open the reference panel and load a source first.'}
        </p>
      )}

      <div className={cn('space-y-2', inline && 'pt-1')}>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide"
          onClick={() => setShowDcsPicker((v) => !v)}
          aria-expanded={showDcsPicker}
        >
          <span className="flex items-center gap-1.5">
            <Globe className="size-3.5" aria-hidden />
            Add from Door43
          </span>
          {showDcsPicker ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
        </button>
        {showDcsPicker ? (
          <div className="overflow-hidden rounded-lg border">
            <AlignmentLanguageQuickPick onPick={handleDcsPick} host={dcsAuth?.host} />
          </div>
        ) : null}
        {dcsLanguageAdding ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Loading sources into reference panel…
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".usfm,.sfm,.txt,.usj,.json"
          className="hidden"
          onChange={onFile}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-3.5" aria-hidden />
          Upload a USFM file…
        </Button>
      </div>
    </>
  );

  if (inline) {
    return (
      <div className="border-border bg-card/50 shrink-0 space-y-3 rounded-lg border p-3 shadow-sm">
        {content}
      </div>
    );
  }

  return (
    <div className="border-border bg-card mx-auto max-w-lg space-y-4 rounded-xl border p-6 shadow-sm">
      {content}
    </div>
  );
}
