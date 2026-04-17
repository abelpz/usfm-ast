import { alignmentWordSurfacesEqual, type WordToken } from '@usfm-tools/editor-core';
import type { AlignedWord } from '@usfm-tools/types';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { GripVertical, Plus, X } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { AlignmentBoxModel } from '@/hooks/useAlignmentBoxModel';

import {
  boxDropId,
  type DetachRefDragData,
  type MergeBoxDragData,
  type UnalignDragData,
} from './alignment-dnd-ids';

type Props = {
  box: AlignmentBoxModel;
  trTok: WordToken[];
  selected: boolean;
  groupClass: (paletteSlot: number | null) => string;
  colorSlot: number | null;
  /** When multiple boxes are selected, all participant ids for a combined merge drag. */
  mergeDragBoxIds?: string[];
  disabled?: boolean;
  selectedDetachRef: { boxId: string; refIndex: number } | null;
  /** Stable callback: receives boxId internally from the box itself. */
  onSelectDetachRef: (boxId: string, refIndex: number) => void;
  /** Stable callback: box calls it with its own id. */
  onSelectBox: (boxId: string, e: MouseEvent) => void;
  /** Stable callback: box calls it with its own id. */
  onRemoveAlignedSource: (boxId: string, transIndex: number) => void;
  /** Translation indices selected in this box (for multi-move / visual). */
  selectedAlignedIndices: readonly number[];
  /** Stable callback: box calls it with its own id. */
  onToggleAlignedSelect: (boxId: string, transIndex: number, shiftKey: boolean) => void;
  /**
   * Pre-computed by AlignmentBoxGrid from useDndContext().
   * True when a detach-ref drag originated from this box (disables its droppable).
   */
  detachDragFromThisBox: boolean;
  /**
   * Pre-computed by AlignmentBoxGrid from useDndContext().
   * True when this box is part of an active merge drag (applies ghost opacity).
   */
  inMergeDragTogether: boolean;
  /**
   * Pre-computed by AlignmentBoxGrid: set of translation indices in the current unalign drag.
   * Used to apply multi-unalign ghost opacity to aligned-word chips.
   */
  activeUnalignTransIndices: ReadonlySet<number> | null;
};

function alignedWordToTransIndex(trTok: WordToken[], aw: AlignedWord): number | null {
  for (let i = 0; i < trTok.length; i++) {
    const w = trTok[i]!;
    if (alignmentWordSurfacesEqual(w.surface, aw.word) && w.occurrence === aw.occurrence) return i;
  }
  return null;
}

function MergeDragHandle({
  boxId,
  mergeDragBoxIds,
  disabled,
}: {
  boxId: string;
  mergeDragBoxIds?: string[];
  disabled?: boolean;
}) {
  const payload: MergeBoxDragData =
    mergeDragBoxIds && mergeDragBoxIds.length > 1
      ? { type: 'merge-box', boxId, boxIds: mergeDragBoxIds }
      : { type: 'merge-box', boxId };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `merge-${boxId}`,
    data: payload,
    disabled: Boolean(disabled),
  });
  return (
    <button
      type="button"
      data-no-box-select
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-label="Join this box with another"
      className={cn(
        'text-muted-foreground hover:text-foreground shrink-0 cursor-grab rounded px-0.5 touch-none active:cursor-grabbing',
        isDragging && 'opacity-60',
      )}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
}

/** Greek reference word in a merged box: drag grip to the row slot; click text to select for toolbar. */
function MergedRefChip({
  boxId,
  refIndex,
  disabled,
  onSelectWord,
  children,
}: {
  boxId: string;
  refIndex: number;
  disabled?: boolean;
  onSelectWord: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `detach-${boxId}-${refIndex}`,
    data: { type: 'detach-ref', boxId, refIndex } satisfies DetachRefDragData,
    disabled: Boolean(disabled),
  });
  return (
    <div className="flex min-w-0 flex-row items-start gap-0.5">
      <button
        type="button"
        data-no-box-select
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        aria-label="Move reference word to the empty slot in the row"
        className={cn(
          'text-muted-foreground hover:text-foreground shrink-0 cursor-grab rounded p-0.5 touch-none active:cursor-grabbing',
          isDragging && 'opacity-40',
        )}
      >
        <GripVertical className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        data-no-box-select
        data-detach-ref-select
        className="min-w-0 flex-1 touch-none text-left text-sm leading-tight"
        onClick={(e) => {
          e.stopPropagation();
          onSelectWord();
        }}
      >
        {children}
      </button>
    </div>
  );
}

function MergedTargetColumn({
  boxId,
  refIdx,
  inner,
  chipSelected,
  disabled,
  onSelectWord,
}: {
  boxId: string;
  refIdx: number;
  inner: ReactNode;
  chipSelected: boolean;
  disabled?: boolean;
  onSelectWord: () => void;
}) {
  return (
    <div className="flex w-fit max-w-full min-w-[5rem] shrink-0 flex-col text-sm">
      <div
        className={cn(
          'rounded-md border border-border bg-background px-2 py-1',
          chipSelected && 'ring-ring ring-2 ring-offset-2 ring-offset-background',
        )}
      >
        <MergedRefChip
          boxId={boxId}
          refIndex={refIdx}
          disabled={disabled}
          onSelectWord={onSelectWord}
        >
          <div className="max-w-[min(12rem,100%)] min-w-0">{inner}</div>
        </MergedRefChip>
      </div>
    </div>
  );
}

function unalDragIndices(transIndex: number, chipSelected: boolean, selectedInBox: readonly number[]): number[] {
  if (chipSelected && selectedInBox.length > 1 && selectedInBox.includes(transIndex)) {
    return [...selectedInBox].sort((a, b) => a - b);
  }
  return [transIndex];
}

const AlignedWordChip = memo(function AlignedWordChip({
  dragId,
  transIndex,
  wordLabel,
  occurrenceSup,
  disabled,
  chipSelected,
  selectedInBox,
  inSameMultiUnalign,
  onToggleSelect,
  onRemove,
}: {
  dragId: string;
  transIndex: number;
  wordLabel: string;
  occurrenceSup: ReactNode;
  disabled?: boolean;
  chipSelected: boolean;
  selectedInBox: readonly number[];
  inSameMultiUnalign: boolean;
  onToggleSelect: (shiftKey: boolean) => void;
  onRemove: () => void;
}) {
  const transIndices = unalDragIndices(transIndex, chipSelected, selectedInBox);
  const payload: UnalignDragData =
    transIndices.length > 1
      ? { type: 'unalign', transIndex, transIndices }
      : { type: 'unalign', transIndex };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: payload,
    disabled: Boolean(disabled),
  });

  return (
    <div
      className={cn(
        'bg-background flex max-w-full items-center gap-0.5 rounded border px-1 py-0.5 text-sm transition-colors',
        chipSelected && 'ring-ring ring-2 ring-offset-2 ring-offset-background',
        (isDragging || inSameMultiUnalign) && !disabled && 'opacity-60',
      )}
    >
      <button
        type="button"
        data-no-box-select
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        aria-label={`Move "${wordLabel}"`}
        className={cn(
          'text-muted-foreground hover:text-foreground shrink-0 cursor-grab rounded p-0.5 touch-none active:cursor-grabbing',
          isDragging && 'opacity-60',
        )}
      >
        <GripVertical className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        data-no-box-select
        className="min-w-0 max-w-[6.5rem] truncate text-left leading-tight"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(e.shiftKey);
        }}
      >
        <span className="font-medium">{wordLabel}</span>
        {occurrenceSup}
      </button>
      <button
        type="button"
        data-no-box-select
        className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5"
        aria-label={`Remove "${wordLabel}" from this box`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
});

export const AlignmentBox = memo(function AlignmentBox({
  box,
  trTok,
  selected,
  groupClass,
  colorSlot,
  mergeDragBoxIds,
  disabled,
  selectedDetachRef,
  onSelectDetachRef,
  onSelectBox,
  onRemoveAlignedSource,
  selectedAlignedIndices,
  onToggleAlignedSelect,
  detachDragFromThisBox,
  inMergeDragTogether,
  activeUnalignTransIndices,
}: Props) {
  const mergedTop = box.targetTokens.length > 1;

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: boxDropId(box.id),
    data: { boxId: box.id },
    disabled: Boolean(disabled || detachDragFromThisBox),
  });

  return (
    <div
      ref={setDropRef}
      role="group"
      aria-selected={selected}
      className={cn(
        'flex flex-col rounded-lg border transition-shadow',
        mergedTop
          ? 'w-fit min-w-[10rem] max-w-[min(100%,42rem)]'
          : 'min-w-[6.5rem] max-w-[14rem]',
        groupClass(colorSlot),
        selected && 'ring-ring ring-2 ring-offset-2 ring-offset-background',
        inMergeDragTogether && !disabled && 'opacity-60',
        isOver && !disabled && 'ring-primary/50 ring-2',
      )}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-no-box-select]')) return;
        onSelectBox(box.id, e);
      }}
    >
      <div className="border-border/80 flex min-w-0 max-w-full items-stretch gap-1 border-b p-1">
        <MergeDragHandle boxId={box.id} mergeDragBoxIds={mergeDragBoxIds} disabled={disabled} />
        <div
          className={cn(
            'flex min-w-0 gap-1',
            mergedTop ? 'max-w-full flex-wrap content-start' : 'flex-1 flex-wrap',
          )}
        >
          {box.targetTokens.map((tok, pi) => {
            const refIdx = box.targetTokenIndices[pi] ?? box.targetTokenIndices[0]!;
            const inner = (
              <>
                <span className="font-medium leading-tight break-words">{tok.surface}</span>
                {tok.strong ? (
                  <span className="text-muted-foreground shrink-0 font-mono text-[0.65rem]">{tok.strong}</span>
                ) : null}
                {tok.lemma ? (
                  <span className="text-muted-foreground line-clamp-2 text-[0.65rem]">{tok.lemma}</span>
                ) : null}
              </>
            );
            const chipSelected =
              mergedTop &&
              selectedDetachRef?.boxId === box.id &&
              selectedDetachRef.refIndex === refIdx;
            return mergedTop ? (
              <MergedTargetColumn
                key={`${box.id}-t-${refIdx}-${pi}`}
                boxId={box.id}
                refIdx={refIdx}
                chipSelected={Boolean(chipSelected)}
                disabled={disabled}
                onSelectWord={() => onSelectDetachRef(box.id, refIdx)}
                inner={inner}
              />
            ) : (
              <div
                key={`${box.id}-t-${refIdx}-${pi}`}
                className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-sm"
              >
                {inner}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-muted/30 min-h-[3rem] flex flex-wrap gap-1 p-2">
        {box.alignedSourceWords.length === 0 ? (
          <div
            className="flex min-h-[2.25rem] w-full items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/20 bg-muted/15"
            aria-hidden
          >
            <Plus className="text-muted-foreground/35 size-4" strokeWidth={1.5} aria-hidden />
          </div>
        ) : (
          box.alignedSourceWords.map((aw, j) => {
            const ti = alignedWordToTransIndex(trTok, aw);
            if (ti === null) {
              return (
                <div
                  key={`${box.id}-s-${aw.word}-${aw.occurrence}-${j}`}
                  className="bg-background rounded border px-1.5 py-0.5 text-sm opacity-80"
                >
                  {aw.word}
                </div>
              );
            }
            const chipSelected = selectedAlignedIndices.includes(ti);
            const inSameMultiUnalign = activeUnalignTransIndices?.has(ti) ?? false;
            return (
              <AlignedWordChip
                key={`${box.id}-s-${aw.word}-${aw.occurrence}-${j}`}
                dragId={`unal-${box.id}-${j}-${ti}`}
                transIndex={ti}
                wordLabel={aw.word}
                occurrenceSup={
                  aw.occurrences > 1 ? (
                    <sup className="text-muted-foreground text-[0.6rem]">{aw.occurrence}</sup>
                  ) : null
                }
                disabled={disabled}
                chipSelected={chipSelected}
                selectedInBox={selectedAlignedIndices}
                inSameMultiUnalign={inSameMultiUnalign}
                onToggleSelect={(shiftKey) => onToggleAlignedSelect(box.id, ti, shiftKey)}
                onRemove={() => onRemoveAlignedSource(box.id, ti)}
              />
            );
          })
        )}
      </div>
    </div>
  );
});
