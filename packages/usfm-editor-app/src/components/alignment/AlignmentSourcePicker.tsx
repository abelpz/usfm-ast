import type { UsjDocument } from '@usfm-tools/editor-core';
import {
  alignmentDocumentSourceKey,
  parseDocumentIdentityFromUsj,
} from '@usfm-tools/editor-core';
import type { SourceTextSession } from '@usfm-tools/editor';
import type { AlignmentDocument } from '@usfm-tools/types';
import { BadgeCheck, ChevronDown, ChevronRight, Globe, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlignmentLanguageQuickPick } from '@/components/alignment/AlignmentLanguageQuickPick';
import { parseUsfmToUsj } from '@/alignment-panel';
import type { Door43LanguageOption } from '@/dcs-client';
import { cn } from '@/lib/utils';

export type SourceSlotSnapshot = {
  id: string;
  /** Short code identifier, e.g. "ult" or "glt" (from catalog abbreviation). */
  label: string;
  /** Human-readable title from the catalog, e.g. "unfoldingWord Literal Translation". */
  title?: string;
  session: SourceTextSession | null;
};

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
};

/** Derive the alignment doc key from a slot's loaded USJ (same logic as alignmentDocumentSourceKey). */
function sourceKeyFromUsj(usj: UsjDocument): string {
  const id = parseDocumentIdentityFromUsj(usj) ?? 'unknown';
  // alignmentDocumentSourceKey uses source.id without version by default; we mirror that.
  return id;
}

/** Find a layer whose source.id matches the given source key (prefix-match like compat check). */
function matchLayerKey(
  layers: AlignmentDocument[],
  sourceKey: string,
): string | null {
  for (const doc of layers) {
    const layerKey = alignmentDocumentSourceKey(doc);
    const srcId = doc.source.id.toLowerCase();
    const sk = sourceKey.toLowerCase();
    if (layerKey.toLowerCase() === sk || srcId === sk || sk.includes(srcId) || srcId.includes(sk)) {
      return layerKey;
    }
  }
  return null;
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
    // Loading state will clear once sourceSlots updates (via parent re-render)
    // Give it a moment then reset
    setTimeout(() => setDcsLanguageAdding(false), 3000);
  }

  const loadedSlots = sourceSlots.filter((s) => s.session?.isLoaded());

  return (
    <div className="border-border bg-card mx-auto max-w-lg space-y-4 rounded-xl border p-6 shadow-sm">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Choose alignment source</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Pick the text to align <strong>against</strong> (e.g. Greek UGNT, ULT). If this book is
          already aligned to a source, pick the same one to continue, or pick a different source to
          start a new alignment layer.
        </p>
      </div>

      {/* 1 — Loaded reference slots */}
      {loadedSlots.length > 0 ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Loaded references
          </p>
          <div className="space-y-2">
            {loadedSlots.map((slot) => {
              const usj = slot.session!.store.getFullUSJ() as UsjDocument;
              const srcKey = sourceKeyFromUsj(usj);
              const matchedLayerKey = matchLayerKey(existingLayers, srcKey);
              const isBestMatch =
                expectedAlignmentKey !== null &&
                (srcKey.toLowerCase().includes(expectedAlignmentKey.toLowerCase()) ||
                  expectedAlignmentKey.toLowerCase().includes(srcKey.toLowerCase()));
              const isActiveLayer = matchedLayerKey !== null && matchedLayerKey === activeLayerKey;
              const subtitle = referenceLabel(usj);
              const displayTitle = slot.title || slot.label;
              const codeLabel = slot.title ? slot.label : null;

              return (
                <div
                  key={slot.id}
                  className={cn(
                    'rounded-lg border p-4 space-y-2 transition-colors',
                    isBestMatch && 'border-primary/40 bg-primary/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium">{displayTitle}</span>
                        {codeLabel && (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                            {codeLabel}
                          </span>
                        )}
                        {isBestMatch && (
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-primary/15 text-primary">
                            <BadgeCheck className="size-3" aria-hidden />
                            Best match
                          </span>
                        )}
                        {isActiveLayer && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
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
          No reference text loaded in the reference panel. Add one from Door43 below, upload a file,
          or open the reference panel and load a source first.
        </p>
      )}

      {/* 2 — Add from Door43 */}
      <div className="space-y-2">
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
          {showDcsPicker ? (
            <ChevronDown className="size-3.5" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden />
          )}
        </button>
        {showDcsPicker ? (
          <div className="rounded-lg border overflow-hidden">
            <AlignmentLanguageQuickPick
              onPick={handleDcsPick}
              host={dcsAuth?.host}
            />
          </div>
        ) : null}
        {dcsLanguageAdding ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Loading sources into reference panel…
          </p>
        ) : null}
      </div>

      {/* 3 — Upload a USFM file */}
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
    </div>
  );
}
