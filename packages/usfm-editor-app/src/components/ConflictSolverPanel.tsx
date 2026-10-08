import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FileConflict } from '@usfm-tools/types';
import { Check, CheckCircle2, Circle, Laptop, CloudDownload, Columns2, PenLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConflictRenderer } from '@/components/conflict-renderers/renderer-dispatcher';
import type { Picks, HunkRequirements } from '@/components/conflict-renderers/usfm-stitch';
import { isMergedReady, stitchUsfm } from '@/components/conflict-renderers/usfm-stitch';
import { ThreePaneConflictView } from '@/components/conflict-renderers/ThreePaneConflictView';
import { USFMParser } from '@usfm-tools/parser';
import type { UsjDocument } from '@usfm-tools/editor-core';

export type ConflictResolution = 'ours' | 'theirs' | 'merged' | 'skip';

/** Internal UI mode — 'custom' is a free-form editable resolution that maps to 'merged' on apply. */
type FileMode = ConflictResolution | 'custom';

export type ConflictSolverPanelProps = {
  conflicts: FileConflict[];
  onClose: () => void;
  onResolve: (
    path: string,
    choice: 'ours' | 'theirs' | 'merged',
    mergedText?: string,
  ) => void;
  defaultOursLabel?: string;
  defaultTheirsLabel?: string;
  title?: string;
  showCancelButton?: boolean;
  /** When false, the per-file tab row is hidden (use when showing a single-book editor overlay). Default: true. */
  showFilePicker?: boolean;
  /** When false, the title/instruction header block is hidden. Default: true. */
  showHeader?: boolean;
  className?: string;
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
  activeUsfmChapter?: number | null;
  onActiveUsfmChapterChange?: (chapter: number | null) => void;
};

function fileBaseName(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() ?? path;
}

function statusIcon(resolution: FileMode | undefined): string {
  if (resolution === 'ours' || resolution === 'theirs' || resolution === 'merged' || resolution === 'custom') return '✓';
  if (resolution === 'skip') return '–';
  return '●';
}

function statusClass(resolution: FileMode | undefined): string {
  if (resolution === 'ours' || resolution === 'theirs' || resolution === 'merged' || resolution === 'custom') return 'resolved';
  if (resolution === 'skip') return 'skipped';
  return 'pending';
}

function conflictSummary(c: FileConflict): string {
  if (c.chapterIndices.length > 0) {
    return `${c.chapterIndices.length} chapter${c.chapterIndices.length > 1 ? 's' : ''} affected`;
  }
  const l = c.path.toLowerCase();
  if (l.endsWith('manifest.yaml') || l.endsWith('manifest.yml')) return 'YAML keys differ';
  return 'Content differs';
}

function isUsfmPath(p: string): boolean {
  const l = p.toLowerCase();
  return l.endsWith('.usfm') || l.endsWith('.sfm');
}

function parseUsjSafe(text: string): UsjDocument | null {
  try {
    const p = new USFMParser({ silentConsole: true });
    p.parse(text || '\\id XXX\n');
    return p.toJSON() as UsjDocument;
  } catch {
    return null;
  }
}

function emptyPicks(): Picks {
  return { chapter: new Map(), paragraph: new Map(), verse: new Map() };
}

interface FileState {
  mode: FileMode | undefined;
  picks: Picks;
  alignmentGroupPicks: Map<string, 'ours' | 'theirs'>;
  requirements: HunkRequirements[];
  /** Free-form text for the 'custom' mode; pre-populated from auto-stitch or oursText. */
  customText?: string;
}

function initialFileState(): FileState {
  return { mode: undefined, picks: emptyPicks(), alignmentGroupPicks: new Map(), requirements: [] };
}

function isFileReady(fs: FileState): boolean {
  if (fs.mode === 'ours' || fs.mode === 'theirs' || fs.mode === 'skip') return true;
  if (fs.mode === 'merged') return isMergedReady(fs.requirements, fs.picks);
  if (fs.mode === 'custom') return fs.customText !== undefined;
  return false;
}

export function ConflictSolverPanel({
  conflicts,
  onClose,
  onResolve,
  defaultOursLabel,
  defaultTheirsLabel,
  title,
  showCancelButton = true,
  showFilePicker = true,
  showHeader = true,
  className,
  activeIndex: activeIndexProp,
  onActiveIndexChange,
  activeUsfmChapter,
  onActiveUsfmChapterChange,
}: ConflictSolverPanelProps) {
  const [internalActiveIndex, setInternalActiveIndex] = useState(0);
  const [fileStates, setFileStates] = useState<Map<string, FileState>>(new Map());
  const activeIndex = activeIndexProp ?? internalActiveIndex;

  const setActiveIndex = useCallback((index: number | ((current: number) => number)) => {
    const current = activeIndexProp ?? internalActiveIndex;
    const next = typeof index === 'function' ? index(current) : index;
    if (activeIndexProp === undefined) setInternalActiveIndex(next);
    onActiveIndexChange?.(next);
  }, [activeIndexProp, internalActiveIndex, onActiveIndexChange]);

  useEffect(() => {
    if (activeIndexProp === undefined) setInternalActiveIndex(0);
    onActiveIndexChange?.(0);
    setFileStates(new Map());
  }, [activeIndexProp, conflicts, onActiveIndexChange]);

  const resolvedCount = useMemo(
    () => [...fileStates.values()].filter((fs) =>
      fs.mode === 'ours' || fs.mode === 'theirs' || fs.mode === 'merged' || fs.mode === 'custom',
    ).length,
    [fileStates],
  );
  const decidedCount = useMemo(
    () => [...fileStates.values()].filter((fs) => fs.mode !== undefined).length,
    [fileStates],
  );
  const allReady = useMemo(
    () => conflicts.length > 0 && conflicts.every((c) => {
      const fs = fileStates.get(c.path);
      return fs !== undefined && isFileReady(fs);
    }),
    [conflicts, fileStates],
  );

  const getOrInit = useCallback((path: string, prev: Map<string, FileState>): FileState => {
    return prev.get(path) ?? initialFileState();
  }, []);

  const setFileMode = useCallback((path: string, mode: FileMode) => {
    setFileStates((prev) => {
      const next = new Map(prev);
      const current = getOrInit(path, prev);
      if (mode === 'custom' && current.customText === undefined) {
        // Pre-populate the editable pane on first activation.
        const conflict = conflicts.find((c) => c.path === path);
        let initialText = conflict?.oursText ?? '';
        if (conflict && isUsfmPath(path) && current.requirements.length > 0) {
          const oursDoc = parseUsjSafe(conflict.oursText);
          const theirsDoc = parseUsjSafe(conflict.theirsText);
          if (oursDoc && theirsDoc) {
            try {
              initialText = stitchUsfm({
                oursDoc,
                theirsDoc,
                picks: current.picks,
                alignmentGroupPicks: current.alignmentGroupPicks,
              });
            } catch { /* fall back to oursText */ }
          }
        }
        next.set(path, { ...current, mode: 'custom', customText: initialText });
      } else {
        next.set(path, { ...current, mode });
      }
      return next;
    });
    if (mode !== 'skip') {
      setActiveIndex((cur) => {
        const nextIdx = conflicts.findIndex((c, i) => {
          if (i <= cur) return false;
          const fs = fileStates.get(c.path);
          return fs === undefined || fs.mode === undefined;
        });
        return nextIdx !== -1 ? nextIdx : cur;
      });
    }
  }, [conflicts, fileStates, getOrInit]);

  const handleChapterPick = useCallback((path: string, chapter: number, side: 'ours' | 'theirs' | null) => {
    setFileStates((prev) => {
      const next = new Map(prev);
      const fs = getOrInit(path, prev);
      const picks: Picks = {
        chapter: new Map(fs.picks.chapter),
        paragraph: new Map(fs.picks.paragraph),
        verse: new Map(fs.picks.verse),
      };
      if (side === null) picks.chapter.delete(chapter);
      else picks.chapter.set(chapter, side);
      next.set(path, { ...fs, mode: 'merged', picks });
      return next;
    });
  }, [getOrInit]);

  const handleParagraphPick = useCallback((path: string, hunkId: string, side: 'ours' | 'theirs' | null) => {
    setFileStates((prev) => {
      const next = new Map(prev);
      const fs = getOrInit(path, prev);
      const picks: Picks = {
        chapter: new Map(fs.picks.chapter),
        paragraph: new Map(fs.picks.paragraph),
        verse: new Map(fs.picks.verse),
      };
      if (side === null) picks.paragraph.delete(hunkId);
      else picks.paragraph.set(hunkId, side);
      next.set(path, { ...fs, mode: 'merged', picks });
      return next;
    });
  }, [getOrInit]);

  const handleVersePick = useCallback((path: string, hunkId: string, side: 'ours' | 'theirs' | null) => {
    setFileStates((prev) => {
      const next = new Map(prev);
      const fs = getOrInit(path, prev);
      const picks: Picks = {
        chapter: new Map(fs.picks.chapter),
        paragraph: new Map(fs.picks.paragraph),
        verse: new Map(fs.picks.verse),
      };
      if (side === null) picks.verse.delete(hunkId);
      else picks.verse.set(hunkId, side);
      next.set(path, { ...fs, mode: 'merged', picks });
      return next;
    });
  }, [getOrInit]);

  const handleHunksDiscovered = useCallback((path: string, info: HunkRequirements) => {
    setFileStates((prev) => {
      const fs = getOrInit(path, prev);
      const existingReqs = fs.requirements.filter((r) => r.chapter !== info.chapter);
      const newReqs = info.paragraphHunks.length > 0
        ? [...existingReqs, info]
        : existingReqs;
      if (
        newReqs.length === existingReqs.length &&
        JSON.stringify(newReqs) === JSON.stringify(fs.requirements)
      ) {
        return prev;
      }
      const next = new Map(prev);
      next.set(path, { ...fs, requirements: newReqs });
      return next;
    });
  }, [getOrInit]);

  const handleAlignmentGroupPick = useCallback((
    path: string,
    verseHunkId: string,
    groupId: string,
    side: 'ours' | 'theirs' | null,
  ) => {
    setFileStates((prev) => {
      const next = new Map(prev);
      const fs = getOrInit(path, prev);
      const key = `${verseHunkId}::${groupId}`;
      const alignmentGroupPicks = new Map(fs.alignmentGroupPicks);
      if (side === null) alignmentGroupPicks.delete(key);
      else alignmentGroupPicks.set(key, side);
      next.set(path, { ...fs, mode: 'merged', alignmentGroupPicks });
      return next;
    });
  }, [getOrInit]);

  const setCustomText = useCallback((path: string, text: string) => {
    setFileStates((prev) => {
      const next = new Map(prev);
      next.set(path, { ...getOrInit(path, prev), mode: 'custom', customText: text });
      return next;
    });
  }, [getOrInit]);

  const applyAll = useCallback(() => {
    for (const c of conflicts) {
      const fs = fileStates.get(c.path);
      if (!fs || fs.mode === 'skip') continue;
      if (fs.mode === 'ours') { onResolve(c.path, 'ours'); continue; }
      if (fs.mode === 'theirs') { onResolve(c.path, 'theirs'); continue; }
      if (fs.mode === 'custom') {
        onResolve(c.path, 'merged', fs.customText ?? c.oursText);
        continue;
      }
      if (fs.mode === 'merged' && isUsfmPath(c.path)) {
        const oursDoc = parseUsjSafe(c.oursText);
        const theirsDoc = parseUsjSafe(c.theirsText);
        if (oursDoc && theirsDoc) {
          const mergedText = stitchUsfm({
            oursDoc,
            theirsDoc,
            picks: fs.picks,
            alignmentGroupPicks: fs.alignmentGroupPicks,
          });
          onResolve(c.path, 'merged', mergedText);
        } else {
          onResolve(c.path, 'ours');
        }
      }
    }
    onClose();
  }, [conflicts, fileStates, onClose, onResolve]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        setActiveIndex((i) => Math.min(i + 1, conflicts.length - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === '1') {
        const c = conflicts[activeIndex];
        if (c) setFileMode(c.path, 'ours');
      } else if (e.key === '2') {
        const c = conflicts[activeIndex];
        if (c) setFileMode(c.path, 'theirs');
      } else if (e.key === '3') {
        const c = conflicts[activeIndex];
        if (c) setFileMode(c.path, 'custom');
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeIndex, conflicts, setFileMode]);

  if (conflicts.length === 0) return null;

  const active = conflicts[activeIndex];
  const activeFs = active ? (fileStates.get(active.path) ?? initialFileState()) : null;
  const activeMode = activeFs?.mode;
  const activePicks = activeFs?.picks ?? emptyPicks();

  const oursLabel = active?.oursLabel ?? defaultOursLabel ?? 'Yours (local)';
  const theirsLabel = active?.theirsLabel ?? defaultTheirsLabel ?? 'Theirs (Door43)';

  return (
    <div className={['usfm-conflict-panel', className].filter(Boolean).join(' ')}>
      {showHeader && title && (
        <div className="usfm-conflict-header px-6 py-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
      )}

      <div className="usfm-conflict-body flex flex-1 min-h-0 overflow-hidden">
        <div className="usfm-conflict-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {showFilePicker && conflicts.length > 1 ? (
            <div className="shrink-0 border-b px-4 pt-2 pb-2">
              <div className="flex min-h-0 shrink-0 flex-wrap items-center gap-1">
                {conflicts.map((c, i) => {
                  const fs = fileStates.get(c.path);
                  const res = fs?.mode;
                  return (
                    <Button
                      key={c.path}
                      type="button"
                      variant={i === activeIndex ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setActiveIndex(i)}
                      className="h-8 max-w-[14rem] gap-1.5 px-2 text-xs"
                      aria-current={i === activeIndex ? 'true' : undefined}
                      title={c.path}
                    >
                      <span className={`shrink-0 text-[10px] ${statusClass(res)}`}>
                        {statusIcon(res)}
                      </span>
                      <span className="truncate">{fileBaseName(c.path)}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {active && (
            <div className="usfm-conflict-actions flex flex-wrap items-center gap-1 px-4 py-2 border-b bg-muted/30 shrink-0">
              <Button
                size="icon"
                variant={activeMode === 'ours' ? 'default' : 'outline'}
                onClick={() => setFileMode(active.path, 'ours')}
                className="h-7 w-7 shrink-0"
                title={`Keep my version — ${oursLabel}`}
              >
                <Laptop className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant={activeMode === 'theirs' ? 'default' : 'outline'}
                onClick={() => setFileMode(active.path, 'theirs')}
                className="h-7 w-7 shrink-0"
                title={`Accept their version — ${theirsLabel}`}
              >
                <CloudDownload className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant={activeMode === 'skip' ? 'secondary' : 'ghost'}
                onClick={() => setFileMode(active.path, 'skip')}
                className="h-7 w-7 shrink-0 text-muted-foreground"
                title="View side by side"
              >
                <Columns2 className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant={activeMode === 'custom' ? 'default' : 'outline'}
                onClick={() => setFileMode(active.path, 'custom')}
                className="h-7 w-7 shrink-0"
                title="Edit a custom resolution (3)"
              >
                <PenLine className="size-3.5" />
              </Button>

              {(activeMode === 'merged' || activeMode === 'custom') && (
                <span className="ml-1" aria-label={isFileReady(activeFs!) ? 'Ready to apply' : 'Pending choices'}>
                  {isFileReady(activeFs!) ? (
                    <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <Circle className="size-4 text-amber-500 dark:text-amber-400" />
                  )}
                </span>
              )}
            </div>
          )}

          <div className="scrollbar-panel-y min-h-0 flex-1 overflow-y-scroll overscroll-contain p-4 pr-2">
            {active && activeMode === 'custom' ? (
              <ThreePaneConflictView
                oursText={active.oursText}
                theirsText={active.theirsText}
                value={activeFs?.customText ?? active.oursText}
                onChange={(text) => setCustomText(active.path, text)}
                oursLabel={oursLabel}
                theirsLabel={theirsLabel}
                className="h-full min-h-[32rem]"
              />
            ) : active && (
              <ConflictRenderer
                conflict={active}
                oursLabel={oursLabel}
                theirsLabel={theirsLabel}
                chapterPicks={activePicks.chapter}
                paragraphPicks={activePicks.paragraph}
                versePicks={activePicks.verse}
                activeChapter={activeUsfmChapter}
                showChapterStrip={false}
                alignmentGroupPicks={activeFs?.alignmentGroupPicks ?? new Map()}
                onChapterPick={(ch, side) => handleChapterPick(active.path, ch, side)}
                onParagraphPick={(id, side) => handleParagraphPick(active.path, id, side)}
                onVersePick={(id, side) => handleVersePick(active.path, id, side)}
                onAlignmentGroupPick={(verseId, groupId, side) => handleAlignmentGroupPick(active.path, verseId, groupId, side)}
                onActiveChapterChange={(chapter) => onActiveUsfmChapterChange?.(chapter)}
                onHunksDiscovered={(info) => handleHunksDiscovered(active.path, info)}
              />
            )}
          </div>
        </div>
      </div>

      <div className="usfm-conflict-footer px-4 py-2 border-t bg-muted/20 shrink-0 flex items-center gap-3">
        {/* Progress dots: one per conflict — green when resolved, grey otherwise */}
        <div className="flex items-center gap-1 flex-1" aria-label={`${resolvedCount} of ${conflicts.length} resolved`}>
          {conflicts.map((c) => {
            const fs = fileStates.get(c.path);
            const ready = fs !== undefined && isFileReady(fs);
            return ready
              ? <CheckCircle2 key={c.path} className="size-3.5 text-green-600 dark:text-green-400 shrink-0" aria-hidden />
              : <Circle key={c.path} className="size-3.5 text-muted-foreground/40 shrink-0" aria-hidden />;
          })}
        </div>
        {showCancelButton ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            onClick={onClose}
            title="Cancel"
          >
            <X className="size-4" />
          </Button>
        ) : null}
        <Button
          size="icon"
          className="h-7 w-7 shrink-0"
          disabled={!allReady || resolvedCount === 0}
          onClick={applyAll}
          title={!allReady ? 'Resolve all conflicts first' : 'Apply changes'}
        >
          <Check className="size-4" />
        </Button>
      </div>
    </div>
  );
}
