import type { WordToken } from '@usfm-tools/editor-core';
import { useDndContext } from '@dnd-kit/core';
import type { MouseEvent } from 'react';
import { useMemo } from 'react';
import { insertDetachPlaceholderIndex, type AlignmentBoxModel } from '@/hooks/useAlignmentBoxModel';

import { AlignmentBox } from './AlignmentBox';
import type { DetachRefDragData } from './alignment-dnd-ids';
import { DetachSplitPlaceholderBox } from './DetachSplitPlaceholderBox';

type Props = {
  boxes: AlignmentBoxModel[];
  trTok: WordToken[];
  selectedBoxIds: Set<string>;
  selectedDetachRef: { boxId: string; refIndex: number } | null;
  onSelectDetachRef: (boxId: string, refIndex: number) => void;
  groupClass: (paletteSlot: number | null) => string;
  colorSlotForBox: (box: AlignmentBoxModel) => number | null;
  disabled?: boolean;
  onSelectBox: (boxId: string, e: MouseEvent) => void;
  onRemoveAlignedSource: (boxId: string, transIndex: number) => void;
  selectedAligned: { boxId: string; indices: number[] } | null;
  onToggleAlignedSelect: (boxId: string, transIndex: number, shiftKey: boolean) => void;
};

/**
 * Main area: alignment boxes in verse order, flex-wrap.
 */
export function AlignmentBoxGrid({
  boxes,
  trTok,
  selectedBoxIds,
  selectedDetachRef,
  onSelectDetachRef,
  groupClass,
  colorSlotForBox,
  disabled,
  onSelectBox,
  onRemoveAlignedSource,
  selectedAligned,
  onToggleAlignedSelect,
}: Props) {
  const { active } = useDndContext();
  const detach = active?.data?.current as DetachRefDragData | undefined;
  const showDetachPlaceholder =
    !disabled &&
    detach?.type === 'detach-ref' &&
    boxes.some((b) => b.id === detach.boxId);

  const detachInsertIndex = useMemo(() => {
    if (!showDetachPlaceholder || !detach) return -1;
    return insertDetachPlaceholderIndex(boxes, detach.boxId, detach.refIndex);
  }, [boxes, detach, showDetachPlaceholder]);

  const mergeDragParticipantIds = useMemo(() => {
    if (selectedBoxIds.size < 2) return null;
    const ordered = boxes.map((b) => b.id);
    const sel = ordered.filter((id) => selectedBoxIds.has(id));
    return sel.length >= 2 ? sel : null;
  }, [boxes, selectedBoxIds]);

  const gridItems = useMemo(() => {
    if (!showDetachPlaceholder || !detach || detachInsertIndex < 0) {
      return boxes.map((box) => ({ kind: 'box' as const, box }));
    }
    const out: Array<{ kind: 'box'; box: AlignmentBoxModel } | { kind: 'ph' }> = [];
    for (let i = 0; i <= boxes.length; i++) {
      if (i === detachInsertIndex) {
        out.push({ kind: 'ph' });
      }
      if (i < boxes.length) {
        out.push({ kind: 'box', box: boxes[i]! });
      }
    }
    return out;
  }, [boxes, detach, detachInsertIndex, showDetachPlaceholder]);

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden"
      role="region"
      aria-label="Alignments"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 [scrollbar-gutter:stable]">
        <div className="flex flex-wrap content-start gap-3">
          {gridItems.map((item) =>
            item.kind === 'ph' ? (
              <DetachSplitPlaceholderBox
                key={`detach-ph-${detach!.boxId}-${detach!.refIndex}`}
                sourceBoxId={detach!.boxId}
                refIndex={detach!.refIndex}
                groupClass={groupClass(null)}
                disabled={disabled}
              />
            ) : (
              <AlignmentBox
                key={item.box.id}
                box={item.box}
                trTok={trTok}
                selected={selectedBoxIds.has(item.box.id)}
                groupClass={groupClass}
                colorSlot={colorSlotForBox(item.box)}
                mergeDragBoxIds={
                  mergeDragParticipantIds && selectedBoxIds.has(item.box.id)
                    ? mergeDragParticipantIds
                    : undefined
                }
                disabled={disabled}
                selectedDetachRef={selectedDetachRef}
                onSelectDetachRef={onSelectDetachRef}
                onSelect={(e) => onSelectBox(item.box.id, e)}
                onRemoveAlignedSource={(ti) => onRemoveAlignedSource(item.box.id, ti)}
                selectedAlignedIndices={
                  selectedAligned?.boxId === item.box.id ? selectedAligned.indices : []
                }
                onToggleAlignedSelect={(ti, shiftKey) =>
                  onToggleAlignedSelect(item.box.id, ti, shiftKey)
                }
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
