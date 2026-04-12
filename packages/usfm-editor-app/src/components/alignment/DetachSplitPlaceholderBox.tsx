import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';

import { detachSlotDropId } from './alignment-dnd-ids';
import { cn } from '@/lib/utils';

type Props = {
  sourceBoxId: string;
  refIndex: number;
  /** Ungrouped / neutral styling (same idea as a singleton alignment box). */
  groupClass: string;
  disabled?: boolean;
};

/**
 * Full-size alignment box shell in the grid: drop a detached Greek word here to split it out.
 * Visually matches {@link AlignmentBox} (target row + source row).
 */
export function DetachSplitPlaceholderBox({ sourceBoxId, refIndex, groupClass, disabled }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: detachSlotDropId(sourceBoxId, refIndex),
    data: { kind: 'detach-slot', boxId: sourceBoxId, refIndex },
    disabled: Boolean(disabled),
  });

  return (
    <div
      ref={setNodeRef}
      data-no-box-select
      className={cn(
        'flex min-w-[6.5rem] max-w-[14rem] flex-col rounded-lg border transition-shadow',
        groupClass,
        isOver && !disabled && 'ring-ring/50 ring-2',
      )}
      aria-label="Slot for separated reference word"
    >
      <div className="border-border/80 w-full min-w-0 border-b p-2">
        <div
          className={cn(
            'flex min-h-[2.75rem] w-full min-w-0 items-center justify-center rounded-md border-2 border-dashed transition-colors',
            isOver && !disabled
              ? 'border-muted-foreground/50 bg-muted/35'
              : 'border-muted-foreground/30 bg-muted/20',
          )}
        />
      </div>
      <div className="bg-muted/30 flex min-h-[3rem] flex-wrap gap-1 p-2">
        <div
          className="flex min-h-[2.25rem] w-full items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/20 bg-muted/15"
          aria-hidden
        >
          <Plus className="text-muted-foreground/35 size-4" strokeWidth={1.5} aria-hidden />
        </div>
      </div>
    </div>
  );
}
