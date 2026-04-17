import type { ScriptureSession } from '@usfm-tools/editor';
import { alignmentWordSurfacesEqual } from '@usfm-tools/editor-core';
import type { Door43LanguageOption } from '@/dcs-client';
import type { SourceSlotSnapshot } from './AlignmentSourcePicker';
import type { AlignmentGroup } from '@usfm-tools/types';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  addSourcesToBox,
  deriveAlignmentBoxes,
  detachTargetRefFromGroup,
  mergeAlignmentBoxes,
  orderedAlignedTransIndices,
  removeSourceFromBox,
  removeSourcesFromBox,
  splitAlignmentGroupPure,
  transIndexForAlignedWord,
  unlinkBox,
  useAlignmentBoxModel,
  type AlignmentBoxModel,
} from '@/hooks/useAlignmentBoxModel';
import { useAlignmentDocuments } from '@/hooks/useAlignmentDocuments';
import { useAlignmentState } from '@/hooks/useAlignmentState';
import { cn } from '@/lib/utils';

import {
  WORD_BANK_DROP_ID,
  parseBoxDropId,
  parseDetachSlotDropId,
  type DetachRefDragData,
  type MergeBoxDragData,
  type SourceWordDragData,
  type UnalignDragData,
} from './alignment-dnd-ids';
import { alignmentPointerCollisionDetection } from './alignment-collision-detection';
import { createCursorAnchoredDragOverlay } from './alignment-drag-modifiers';
import { AlignmentDragGhost } from './AlignmentDragGhost';
import { AlignmentBoxGrid } from './AlignmentBoxGrid';
import { AlignmentSourcePicker } from './AlignmentSourcePicker';
import { AlignmentToolbar } from './AlignmentToolbar';
import { SourceWordBank } from './SourceWordBank';

const GROUP_STYLES = [
  'border-blue-500/50 bg-blue-500/10',
  'border-emerald-500/50 bg-emerald-500/10',
  'border-amber-500/50 bg-amber-500/10',
  'border-pink-500/50 bg-pink-500/10',
  'border-violet-500/50 bg-violet-500/10',
  'border-teal-500/50 bg-teal-500/10',
];

/** Palette slot when the box has at least one linked translation word; otherwise neutral. */
function alignmentColorSlotFromBox(box: AlignmentBoxModel): number | null {
  if (box.alignedSourceWords.length === 0 || box.targetTokenIndices.length === 0) return null;
  return Math.min(...box.targetTokenIndices) % GROUP_STYLES.length;
}

function transIndexToGroup(groups: AlignmentGroup[], trTok: { surface: string; occurrence: number }[], transIndex: number): number | null {
  const w = trTok[transIndex];
  if (!w) return null;
  for (let gi = 0; gi < groups.length; gi++) {
    for (const tw of groups[gi]!.targets) {
      if (alignmentWordSurfacesEqual(tw.word, w.surface) && tw.occurrence === w.occurrence) return gi;
    }
  }
  return null;
}

function canSplitBox(groups: AlignmentGroup[], box: { groupIndex: number | null }): boolean {
  if (box.groupIndex === null) return false;
  const g = groups[box.groupIndex];
  if (!g) return false;
  return g.sources.length > 1 || g.targets.length > 1;
}

type Props = {
  session: ScriptureSession;
  /** All source slots from ReferenceColumn — passed to the alignment source picker. */
  sourceSlots: ReadonlyArray<SourceSlotSnapshot>;
  overlayOpen: boolean;
  dcsAuth: { host: string; token?: string } | null;
  onRequestAddDcsLanguage: (lang: Door43LanguageOption) => void;
};

export function AlignmentEditor({ session, sourceSlots, overlayOpen, dcsAuth, onRequestAddDcsLanguage }: Props) {
  const st = useAlignmentState(session, overlayOpen);
  const {
    step,
    compat,
    verseSid,
    setVerseSid,
    verseSids,
    selectedTrans,
    setSelectedTrans,
    useExistingLayer,
    startNewLayer,
    resetToPickSource,
    referenceLabel,
    bump,
  } = st;

  const { keys: alignmentLayerKeys, activeKey, setActiveKey } = useAlignmentDocuments(session);

  const groups = useMemo(
    () => session.getAlignmentsForVerse(verseSid),
    [session, verseSid, bump, activeKey],
  );
  const refTok = useMemo(() => session.getReferenceTokens(verseSid), [session, verseSid, bump]);
  const trTok = useMemo(() => session.getTranslationTokens(verseSid), [session, verseSid, bump]);

  const alignmentSourceVerseSids = useMemo(
    () => (session.isAlignmentSourceLoaded() ? session.getAlignmentSourceVerseSids() : []),
    [session, bump],
  );

  const { boxes, sourceAligned } = useAlignmentBoxModel(refTok, trTok, groups);

  /** Matches the grid: only counts translation words linked when embedded groups map to the current reference. */
  const progress = useMemo(() => {
    const covered = new Set<number>();
    for (const box of boxes) {
      if (box.groupIndex === null) continue;
      for (const aw of box.alignedSourceWords) {
        const ti = transIndexForAlignedWord(trTok, aw);
        if (ti !== null) covered.add(ti);
      }
    }
    const totalWordCount = trTok.length;
    const alignedWordCount = covered.size;
    const percent =
      totalWordCount > 0 ? Math.min(100, Math.round((alignedWordCount / totalWordCount) * 100)) : 0;
    return { alignedWordCount, totalWordCount, percent };
  }, [boxes, trTok]);

  /**
   * Pre-computed color slot per translation token index. Recomputes only when groups/boxes/tokens
   * change, not on every selection or pointer-move render.
   */
  const colorSlots = useMemo(
    () =>
      trTok.map((_, i) => {
        const gi = transIndexToGroup(groups, trTok, i);
        if (gi === null) return null;
        const box = boxes.find((b) => b.groupIndex === gi);
        return box ? alignmentColorSlotFromBox(box) : null;
      }),
    [groups, trTok, boxes],
  );

  const showReferenceMissing =
    session.isAlignmentSourceLoaded() && trTok.length > 0 && refTok.length === 0;

  // Compat blocking (incompatible source) only applies to the __embedded__ layer because that
  // layer is tied to the translation's original alignment source. When the user picks a *new*
  // explicit layer they deliberately chose a different source, so the embedded-source mismatch
  // is expected and must not prevent editing.
  const isEmbeddedLayer = activeKey === '__embedded__';
  const compatBlocked = compat?.compatible === false && isEmbeddedLayer;

  const [selectedBoxIds, setSelectedBoxIds] = useState<Set<string>>(new Set());
  const [selectedDetachRef, setSelectedDetachRef] = useState<{ boxId: string; refIndex: number } | null>(null);
  /** Multi-select within one box's aligned translation chips (move several to bank or another box). */
  const [selectedAligned, setSelectedAligned] = useState<{ boxId: string; indices: number[] } | null>(null);
  const lastBoxAnchorRef = useRef<string | null>(null);
  /** Grip `getBoundingClientRect()` synchronously in onDragStart (before layout changes). */
  const dragGripRectAtStartRef = useRef<DOMRect | null>(null);
  /** First `activeNodeRect` seen in the cursor-anchored modifier (matches DragOverlay fixed `left/top`). */
  const dragOverlayBaseRef = useRef<{ left: number; top: number } | null>(null);
  const cursorAnchoredDragOverlay = useMemo(
    () => createCursorAnchoredDragOverlay(dragGripRectAtStartRef, dragOverlayBaseRef),
    [],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  );

  useEffect(() => {
    setSelectedBoxIds(new Set());
    setSelectedDetachRef(null);
    setSelectedAligned(null);
    lastBoxAnchorRef.current = null;
  }, [verseSid]);

  useEffect(() => {
    if (!selectedAligned) return;
    if (selectedBoxIds.size !== 1 || !selectedBoxIds.has(selectedAligned.boxId)) {
      setSelectedAligned(null);
    }
  }, [selectedBoxIds, selectedAligned]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedBoxIds(new Set());
        setSelectedDetachRef(null);
        setSelectedAligned(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const chipClass = useCallback((paletteSlot: number | null) => {
    if (paletteSlot === null) return cn('border-border bg-background');
    return cn('border', GROUP_STYLES[paletteSlot % GROUP_STYLES.length]);
  }, []);

  /**
   * Stable ref for selectedTrans — lets toggleSource avoid listing selectedTrans as a dep,
   * preventing unnecessary re-creation on every word click.
   */
  const selectedTransRef = useRef(selectedTrans);
  useLayoutEffect(() => {
    selectedTransRef.current = selectedTrans;
  }, [selectedTrans]);

  const toggleSource = useCallback(
    (i: number, shiftKey: boolean) => {
      setSelectedAligned(null);
      if (shiftKey && selectedTransRef.current.length > 0) {
        const anchor = selectedTransRef.current[selectedTransRef.current.length - 1]!;
        const lo = Math.min(anchor, i);
        const hi = Math.max(anchor, i);
        setSelectedTrans(Array.from({ length: hi - lo + 1 }, (_, k) => lo + k));
        return;
      }
      setSelectedTrans((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
    },
    [setSelectedTrans],
  );

  const onSelectDetachRef = useCallback((boxId: string, refIndex: number) => {
    setSelectedAligned(null);
    setSelectedDetachRef((prev) =>
      prev?.boxId === boxId && prev.refIndex === refIndex ? null : { boxId, refIndex },
    );
  }, []);

  const toggleAlignedSelect = useCallback(
    (boxId: string, transIndex: number, shiftKey: boolean) => {
      setSelectedDetachRef(null);
      setSelectedTrans([]);
      setSelectedBoxIds(new Set([boxId]));

      const box = boxes.find((b) => b.id === boxId);
      if (!box) return;

      setSelectedAligned((prev) => {
        if (shiftKey && prev?.boxId === boxId && prev.indices.length > 0) {
          const anchor = prev.indices[prev.indices.length - 1]!;
          const ordered = orderedAlignedTransIndices(box, trTok);
          const ia = ordered.indexOf(anchor);
          const ib = ordered.indexOf(transIndex);
          if (ia >= 0 && ib >= 0) {
            const lo = Math.min(ia, ib);
            const hi = Math.max(ia, ib);
            return { boxId, indices: ordered.slice(lo, hi + 1) };
          }
        }
        if (prev?.boxId !== boxId) {
          return { boxId, indices: [transIndex] };
        }
        const has = prev.indices.includes(transIndex);
        if (has) {
          const next = prev.indices.filter((idx) => idx !== transIndex);
          return next.length === 0 ? null : { boxId, indices: next };
        }
        return { boxId, indices: [...prev.indices, transIndex].sort((a, b) => a - b) };
      });
    },
    [boxes, trTok, setSelectedTrans],
  );

  const onSelectBox = useCallback(
    (boxId: string, e: React.MouseEvent) => {
      setSelectedDetachRef(null);
      const orderedIds = boxes.map((b) => b.id);

      if (e.shiftKey && lastBoxAnchorRef.current) {
        const a = orderedIds.indexOf(lastBoxAnchorRef.current);
        const b = orderedIds.indexOf(boxId);
        if (a >= 0 && b >= 0) {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          setSelectedBoxIds(new Set(orderedIds.slice(lo, hi + 1)));
          lastBoxAnchorRef.current = boxId;
          return;
        }
      }

      if (e.metaKey || e.ctrlKey) {
        setSelectedBoxIds((prev) => {
          const n = new Set(prev);
          if (n.has(boxId)) n.delete(boxId);
          else n.add(boxId);
          return n;
        });
        lastBoxAnchorRef.current = boxId;
        return;
      }

      setSelectedBoxIds((prev) => {
        if (prev.has(boxId) && prev.size > 1) {
          const n = new Set(prev);
          n.delete(boxId);
          return n;
        }
        if (prev.has(boxId) && prev.size === 1) {
          return new Set();
        }
        if (!prev.has(boxId) && prev.size >= 1) {
          return new Set([...prev, boxId]);
        }
        return new Set([boxId]);
      });
      lastBoxAnchorRef.current = boxId;
    },
    [boxes],
  );

  const applyGroups = useCallback(
    (next: AlignmentGroup[]) => {
      if (!verseSid) return;
      session.updateAlignment(verseSid, next);
      setSelectedBoxIds(new Set());
      setSelectedTrans([]);
      setSelectedDetachRef(null);
      setSelectedAligned(null);
    },
    [session, verseSid, setSelectedTrans],
  );

  const onDropSource = useCallback(
    (boxId: string, transIndices: number[]) => {
      if (!verseSid || transIndices.length === 0) return;
      const next = addSourcesToBox(refTok, trTok, groups, boxId, transIndices);
      applyGroups(next);
    },
    [verseSid, refTok, trTok, groups, applyGroups],
  );

  const onRemoveAlignedSource = useCallback(
    (boxId: string, transIndex: number) => {
      if (!verseSid) return;
      const next = removeSourceFromBox(refTok, trTok, groups, boxId, transIndex);
      applyGroups(next);
    },
    [verseSid, refTok, trTok, groups, applyGroups],
  );

  const onDropUnalign = useCallback(
    (transIndices: number[]) => {
      if (!verseSid || transIndices.length === 0) return;
      const uniq = [...new Set(transIndices)];
      const gi = transIndexToGroup(groups, trTok, uniq[0]!);
      if (gi === null) return;
      const box = deriveAlignmentBoxes(refTok, groups, trTok).find((b) => b.groupIndex === gi);
      if (!box) return;
      const next = removeSourcesFromBox(refTok, trTok, groups, box.id, uniq);
      applyGroups(next);
    },
    [verseSid, refTok, trTok, groups, applyGroups],
  );

  const onDropMerge = useCallback(
    (ontoBoxId: string, participantBoxIds: string[]) => {
      if (!verseSid) return;
      const unique = [...new Set(participantBoxIds)];
      if (unique.length < 2 || !unique.includes(ontoBoxId)) return;
      const next = mergeAlignmentBoxes(refTok, trTok, groups, unique, ontoBoxId);
      if (next) applyGroups(next);
    },
    [verseSid, refTok, trTok, groups, applyGroups],
  );

  const onDetachTargetRef = useCallback(
    (boxId: string, refIndex: number) => {
      if (!verseSid) return;
      const box = deriveAlignmentBoxes(refTok, groups, trTok).find((b) => b.id === boxId);
      if (!box || box.groupIndex === null) return;
      const next = detachTargetRefFromGroup(refTok, trTok, groups, box.groupIndex, refIndex);
      if (next) applyGroups(next);
    },
    [verseSid, refTok, trTok, groups, applyGroups],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || compatBlocked) return;
      const d = active.data.current as
        | SourceWordDragData
        | MergeBoxDragData
        | UnalignDragData
        | DetachRefDragData
        | undefined;
      if (!d) return;
      const overId = String(over.id);

      if (d.type === 'source-word') {
        const boxId = parseBoxDropId(overId);
        if (boxId) {
          const indices =
            d.transIndices && d.transIndices.length > 0 ? d.transIndices : [d.transIndex];
          onDropSource(boxId, indices);
        }
        return;
      }
      if (d.type === 'merge-box') {
        const onto = parseBoxDropId(overId);
        if (!onto) return;
        const participantIds = d.boxIds?.length
          ? [...new Set([...d.boxIds, onto])]
          : [d.boxId, onto];
        if (participantIds.length >= 2) onDropMerge(onto, participantIds);
        return;
      }
      if (d.type === 'unalign') {
        const indices =
          d.transIndices && d.transIndices.length > 0 ? d.transIndices : [d.transIndex];
        if (overId === WORD_BANK_DROP_ID) {
          onDropUnalign(indices);
          return;
        }
        const ontoBoxId = parseBoxDropId(overId);
        if (ontoBoxId) {
          onDropSource(ontoBoxId, indices);
        }
        return;
      }
      if (d.type === 'detach-ref') {
        const slot = parseDetachSlotDropId(overId);
        if (slot && slot.boxId === d.boxId && slot.refIndex === d.refIndex) {
          onDetachTargetRef(d.boxId, d.refIndex);
        }
        return;
      }
    },
    [compatBlocked, onDropSource, onDropMerge, onDropUnalign, onDetachTargetRef],
  );

  const onMergeToolbar = useCallback(() => {
    if (!verseSid || selectedBoxIds.size < 2) return;
    const ids = [...selectedBoxIds];
    const ordered = deriveAlignmentBoxes(refTok, groups, trTok);
    const sortedIds = [...ids].sort(
      (a, b) => {
        const ba = ordered.find((x) => x.id === a);
        const bb = ordered.find((x) => x.id === b);
        return (
          Math.min(...(ba?.targetTokenIndices ?? [0])) - Math.min(...(bb?.targetTokenIndices ?? [0]))
        );
      },
    );
    const anchor = sortedIds[0]!;
    const next = mergeAlignmentBoxes(refTok, trTok, groups, ids, anchor);
    if (next) applyGroups(next);
  }, [verseSid, selectedBoxIds, refTok, trTok, groups, applyGroups]);

  const onSplitToolbar = useCallback(() => {
    if (!verseSid || compatBlocked) return;
    if (selectedDetachRef) {
      const box = deriveAlignmentBoxes(refTok, groups, trTok).find((b) => b.id === selectedDetachRef.boxId);
      if (box && box.groupIndex !== null && box.targetTokens.length > 1) {
        onDetachTargetRef(selectedDetachRef.boxId, selectedDetachRef.refIndex);
        return;
      }
    }
    if (selectedBoxIds.size !== 1) return;
    const id = [...selectedBoxIds][0]!;
    const box = deriveAlignmentBoxes(refTok, groups, trTok).find((b) => b.id === id);
    if (!box || box.groupIndex === null) return;
    const next = splitAlignmentGroupPure(refTok, trTok, groups, box.groupIndex);
    if (next) applyGroups(next);
  }, [
    verseSid,
    compatBlocked,
    selectedDetachRef,
    selectedBoxIds,
    refTok,
    trTok,
    groups,
    applyGroups,
    onDetachTargetRef,
  ]);

  const onInsertToolbar = useCallback(() => {
    if (!verseSid || selectedBoxIds.size !== 1 || selectedTrans.length === 0) return;
    const boxId = [...selectedBoxIds][0]!;
    const next = addSourcesToBox(refTok, trTok, groups, boxId, selectedTrans);
    applyGroups(next);
  }, [verseSid, selectedBoxIds, selectedTrans, refTok, trTok, groups, applyGroups]);

  const onUnlinkToolbar = useCallback(() => {
    if (!verseSid || selectedBoxIds.size !== 1) return;
    const boxId = [...selectedBoxIds][0]!;
    const next = unlinkBox(refTok, trTok, groups, boxId);
    applyGroups(next);
  }, [verseSid, selectedBoxIds, refTok, trTok, groups, applyGroups]);

  const onClearVerse = useCallback(() => {
    if (!verseSid) return;
    session.updateAlignment(verseSid, []);
    setSelectedBoxIds(new Set());
    setSelectedTrans([]);
    setSelectedDetachRef(null);
    setSelectedAligned(null);
  }, [verseSid, session, setSelectedTrans]);

  const mergeDisabled = selectedBoxIds.size < 2 || compatBlocked;
  const selectedBoxList = useMemo(
    () => boxes.filter((b) => selectedBoxIds.has(b.id)),
    [boxes, selectedBoxIds],
  );
  const splitDisabled = useMemo(() => {
    if (compatBlocked) return true;
    if (selectedDetachRef) {
      const b = boxes.find((x) => x.id === selectedDetachRef.boxId);
      return !(b && b.groupIndex !== null && b.targetTokens.length > 1);
    }
    if (selectedBoxIds.size !== 1) return true;
    const one = selectedBoxList[0];
    return !(one && canSplitBox(groups, one));
  }, [compatBlocked, selectedDetachRef, selectedBoxIds, selectedBoxList, boxes, groups]);
  const insertDisabled =
    selectedTrans.length === 0 || selectedBoxIds.size !== 1 || compatBlocked;
  const unlinkDisabled = selectedBoxIds.size !== 1 || compatBlocked;

  const colorSlotForBox = useCallback((box: AlignmentBoxModel) => alignmentColorSlotFromBox(box), []);

  if (step === 'pick-source') {
    const existingLayersForPicker = session.getAlignmentDocuments();
    const expectedAlignmentKey = session.getExpectedAlignmentKey();
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <AlignmentSourcePicker
          sourceSlots={sourceSlots}
          existingLayers={existingLayersForPicker}
          activeLayerKey={activeKey}
          expectedAlignmentKey={expectedAlignmentKey}
          dcsAuth={dcsAuth}
          referenceLabel={referenceLabel}
          onUseExistingLayer={useExistingLayer}
          onStartNewLayer={startNewLayer}
          onRequestAddDcsLanguage={onRequestAddDcsLanguage}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground text-sm underline"
          onClick={resetToPickSource}
        >
          Change alignment source
        </button>
      </div>

      {compatBlocked ? (
        <div
          className="border-destructive/50 bg-destructive/10 text-destructive shrink-0 rounded-lg border px-3 py-2 text-sm"
          role="alert"
        >
          {compat!.reason ?? 'Source mismatch — alignment is blocked for this phase.'}
        </div>
      ) : null}

      {compat?.wordMatch && compat.wordMatch.confidence !== 'exact' ? (
        <div
          className={cn(
            'shrink-0 rounded-lg border px-3 py-2 text-sm',
            compat.wordMatch.confidence === 'partial'
              ? 'border-amber-500/50 bg-amber-500/10 text-foreground'
              : 'border-blue-500/40 bg-blue-500/5 text-foreground',
          )}
          role="status"
        >
          <p className="font-medium">
            {compat.wordMatch.confidence === 'partial'
              ? 'Source partially matches existing alignments'
              : 'High match to embedded alignment source words'}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {Math.round(compat.wordMatch.matchRatio * 100)}% of embedded source words matched the loaded
            document ({compat.wordMatch.versesMatched}/{compat.wordMatch.versesCompared} verses fully
            matched).
            {compat.wordMatch.mismatches.length > 0
              ? ' Some alignment groups may reference different source words — verify doubtful links.'
              : null}
          </p>
        </div>
      ) : null}

      {showReferenceMissing ? (
        <div
          className="border-amber-500/50 bg-amber-500/10 text-foreground shrink-0 rounded-lg border px-3 py-2 text-sm"
          role="status"
        >
          <p className="font-medium">No reference words for this verse</p>
          <p className="text-muted-foreground mt-1">
            Current verse id: <code className="bg-muted rounded px-1 py-0.5 text-xs">{verseSid || '(none)'}</code>
            . Alignment boxes need reference tokens from the loaded source for the same verse.
          </p>
          {alignmentSourceVerseSids.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-xs">
              The alignment source produced no verse keys. Ensure the file has verse milestones and text
              (or <code className="text-xs">\w</code> spans) for at least one verse.
            </p>
          ) : (
            <p className="text-muted-foreground mt-2 text-xs">
              Verse ids found in the alignment source (first 12):{' '}
              <code className="text-xs break-all">
                {alignmentSourceVerseSids.slice(0, 12).join(', ')}
                {alignmentSourceVerseSids.length > 12 ? '…' : ''}
              </code>
              . Try another verse, or align verse <code className="text-xs">sid</code> strings between
              translation and source.
            </p>
          )}
        </div>
      ) : null}

      <div className="shrink-0">
        <AlignmentToolbar
          verseSids={verseSids}
          verseSid={verseSid}
          onVerseSid={setVerseSid}
          progress={progress}
          mergeDisabled={mergeDisabled}
          splitDisabled={splitDisabled}
          insertDisabled={insertDisabled}
          unlinkDisabled={unlinkDisabled}
          onMerge={onMergeToolbar}
          onSplit={onSplitToolbar}
          onInsert={onInsertToolbar}
          onUnlink={onUnlinkToolbar}
          onClearVerse={onClearVerse}
          alignmentLayerKeys={alignmentLayerKeys}
          activeAlignmentKey={activeKey}
          onAlignmentLayerChange={(k) => setActiveKey(k)}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
      <DndContext
        sensors={sensors}
        collisionDetection={alignmentPointerCollisionDetection}
        modifiers={[cursorAnchoredDragOverlay]}
        onDragStart={(e) => {
          dragGripRectAtStartRef.current = null;
          dragOverlayBaseRef.current = null;
          const t = e.activatorEvent.target;
          if (t instanceof Element) {
            const grip = t.closest('button');
            if (grip) dragGripRectAtStartRef.current = grip.getBoundingClientRect();
          }
        }}
        onDragEnd={(e) => {
          dragGripRectAtStartRef.current = null;
          dragOverlayBaseRef.current = null;
          handleDragEnd(e);
        }}
        onDragCancel={() => {
          dragGripRectAtStartRef.current = null;
          dragOverlayBaseRef.current = null;
        }}
      >
        <div className="flex min-h-0 flex-1 items-stretch gap-3">
          <SourceWordBank
            tokens={trTok}
            sourceAligned={sourceAligned}
            selected={selectedTrans}
            colorSlots={colorSlots}
            groupClass={chipClass}
            onToggle={toggleSource}
            disabled={compatBlocked}
          />
          <AlignmentBoxGrid
            boxes={boxes}
            trTok={trTok}
            selectedBoxIds={selectedBoxIds}
            selectedDetachRef={selectedDetachRef}
            onSelectDetachRef={onSelectDetachRef}
            groupClass={chipClass}
            colorSlotForBox={colorSlotForBox}
            disabled={compatBlocked}
            onSelectBox={onSelectBox}
            onRemoveAlignedSource={onRemoveAlignedSource}
            selectedAligned={selectedAligned}
            onToggleAlignedSelect={toggleAlignedSelect}
          />
        </div>
        {/*
          Default DragOverlay sizes its wrapper to the draggable node's rect (here: the grip only).
          Override width/height so the custom ghost keeps a full chip shape.
        */}
        <DragOverlay
          zIndex={200}
          style={{
            width: 'max-content',
            height: 'max-content',
            maxWidth: 'min(22rem, 92vw)',
          }}
        >
          <AlignmentDragGhost trTok={trTok} refTok={refTok} boxes={boxes} />
        </DragOverlay>
      </DndContext>
      </div>
    </div>
  );
}
