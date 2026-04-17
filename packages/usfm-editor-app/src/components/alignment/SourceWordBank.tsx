import type { WordToken } from '@usfm-tools/editor-core';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';

import type { SourceWordDragData } from './alignment-dnd-ids';
import { WORD_BANK_DROP_ID } from './alignment-dnd-ids';
import { DraggableSourceWord } from './DraggableSourceWord';

/** Stable empty array used so memoized children don't get a new reference when unselected. */
const EMPTY_DRAG_INDICES: readonly number[] = [];

type Props = {
  tokens: WordToken[];
  /** Parallel to tokens: true if this translation word is already in an alignment group. */
  sourceAligned: boolean[];
  selected: number[];
  /** Pre-computed color palette slot per token index (avoids O(N*G) work during render). */
  colorSlots: readonly (number | null)[];
  groupClass: (paletteSlot: number | null) => string;
  onToggle: (index: number, shiftKey: boolean) => void;
  disabled?: boolean;
};

/**
 * Left sidebar: translation (source) words stacked vertically; draggable into alignment boxes.
 *
 * Performance notes:
 * - Subscribes to useDndContext() once (instead of once-per-word-chip) so pointer-move events
 *   only re-render this container, not every DraggableSourceWord.
 * - DraggableSourceWord is React.memo'd; props are stable during pointer moves.
 * - selectedUnaligned and selectedSet are memoized to avoid re-creating them on every render.
 */
export const SourceWordBank = memo(function SourceWordBank({
  tokens,
  sourceAligned,
  selected,
  colorSlots,
  groupClass,
  onToggle,
  disabled,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: WORD_BANK_DROP_ID,
    data: { kind: 'word-bank' },
    disabled: Boolean(disabled),
  });

  // Single subscription to DnD context instead of one per word chip.
  const { active } = useDndContext();
  const activeSource = active?.data?.current as SourceWordDragData | undefined;

  /**
   * Set of translation indices participating in the current active multi-drag.
   * Recomputes only when active drag changes (start/end), not during pointer moves
   * because `active` is the same object reference throughout a single drag.
   */
  const activeDragSet = useMemo<ReadonlySet<number> | null>(() => {
    if (!active || activeSource?.type !== 'source-word') return null;
    return new Set<number>(activeSource.transIndices ?? [activeSource.transIndex]);
  }, [active, activeSource]);

  /** O(1) selected lookup; reconstructed only when the selection array changes. */
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  /**
   * The set of unaligned selected indices — shared across all selected words as their
   * multi-drag payload. Memoized so the same array reference is passed to each chip
   * (prevents spurious re-renders of non-selected chips when selection grows).
   */
  const selectedUnaligned = useMemo(
    () => selected.filter((i) => !sourceAligned[i]).sort((a, b) => a - b),
    [selected, sourceAligned],
  );

  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-label="Translation words"
      className={cn(
        'border-border bg-muted/20 flex h-full min-h-0 w-[min(100%,12rem)] shrink-0 flex-col overflow-hidden rounded-lg border p-2',
        isOver && !disabled && 'ring-ring/40 bg-muted/40 ring-2',
      )}
    >
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
        role="list"
      >
        <div className="flex flex-col gap-1.5">
        {tokens.map((t, i) => {
          const aligned = sourceAligned[i] === true;
          const gi = colorSlots[i] ?? null;
          const isSelected = selectedSet.has(i);
          const inActiveDrag = (activeDragSet?.has(i) ?? false) && Boolean(active);
          // Only selected words with multi-select get a shared dragTransIndices payload.
          const dragTransIndices =
            isSelected && selectedUnaligned.length > 1 && selectedUnaligned.includes(i)
              ? selectedUnaligned
              : EMPTY_DRAG_INDICES;
          return (
            <DraggableSourceWord
              key={`${t.verseSid}-${i}-${t.surface}`}
              verseSid={t.verseSid}
              token={t}
              transIndex={i}
              aligned={aligned}
              groupClass={groupClass(gi)}
              isSelected={isSelected}
              dragTransIndices={dragTransIndices}
              inActiveDrag={inActiveDrag}
              disabled={disabled}
              onToggle={onToggle}
            />
          );
        })}
        </div>
      </div>
    </div>
  );
});
