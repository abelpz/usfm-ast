import type { WordToken } from '@usfm-tools/editor-core';
import { useDraggable, useDndContext } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

import type { SourceWordDragData } from './alignment-dnd-ids';

function sourceDragIndices(
  transIndex: number,
  isSelected: boolean,
  selectedTrans: number[],
  sourceAligned: boolean[],
): number[] {
  const selectedUnaligned = selectedTrans.filter((i) => sourceAligned[i] !== true);
  if (isSelected && selectedUnaligned.length > 1 && selectedUnaligned.includes(transIndex)) {
    return [...selectedUnaligned].sort((a, b) => a - b);
  }
  return [transIndex];
}

type Props = {
  verseSid: string;
  token: WordToken;
  transIndex: number;
  aligned: boolean;
  groupClass: string;
  isSelected: boolean;
  selectedTrans: number[];
  sourceAligned: boolean[];
  disabled?: boolean;
  onToggle: (index: number, shiftKey: boolean) => void;
};

export function DraggableSourceWord({
  verseSid,
  token,
  transIndex,
  aligned,
  groupClass,
  isSelected,
  selectedTrans,
  sourceAligned,
  disabled,
  onToggle,
}: Props) {
  const dragDisabled = Boolean(disabled || aligned);
  const transIndices = sourceDragIndices(transIndex, isSelected, selectedTrans, sourceAligned);
  const dragPayload: SourceWordDragData =
    transIndices.length > 1
      ? { type: 'source-word', transIndex, transIndices }
      : { type: 'source-word', transIndex };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `source-${verseSid}-${transIndex}`,
    data: dragPayload,
    disabled: dragDisabled,
  });

  const { active } = useDndContext();
  const activeSource = active?.data?.current as SourceWordDragData | undefined;
  const inSameMultiDrag =
    activeSource?.type === 'source-word' &&
    (activeSource.transIndices ?? [activeSource.transIndex]).includes(transIndex);

  return (
    <div
      role="listitem"
      className={cn(
        'flex w-full min-w-0 items-center gap-1 rounded-md border px-2 py-2 text-sm transition-colors',
        groupClass,
        aligned && 'opacity-40',
        isSelected && 'ring-ring ring-2 ring-offset-2 ring-offset-background',
        (isDragging || (inSameMultiDrag && active)) && !dragDisabled && 'opacity-60',
      )}
    >
      <div className="flex w-5 shrink-0 justify-center">
        {!aligned ? (
          <button
            type="button"
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            disabled={disabled}
            aria-label={`Move “${token.surface}”`}
            className={cn(
              'text-muted-foreground hover:text-foreground cursor-grab rounded p-0.5 touch-none active:cursor-grabbing',
              disabled && 'pointer-events-none opacity-50',
            )}
          >
            <GripVertical className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={(ev) => onToggle(transIndex, ev.shiftKey)}
        className="min-w-0 flex-1 touch-none text-left"
      >
        <span className="font-medium">{token.surface}</span>
        {token.occurrences > 1 ? (
          <sup className="text-muted-foreground ml-0.5 text-[10px]">{token.occurrence}</sup>
        ) : null}
      </button>
    </div>
  );
}
