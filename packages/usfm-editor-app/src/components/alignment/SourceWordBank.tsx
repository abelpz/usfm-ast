import type { WordToken } from '@usfm-tools/editor-core';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';

import { WORD_BANK_DROP_ID } from './alignment-dnd-ids';
import { DraggableSourceWord } from './DraggableSourceWord';

type Props = {
  tokens: WordToken[];
  /** Parallel to tokens: true if this translation word is already in an alignment group. */
  sourceAligned: boolean[];
  selected: number[];
  colorSlotForToken: (transIndex: number) => number | null;
  groupClass: (paletteSlot: number | null) => string;
  onToggle: (index: number, shiftKey: boolean) => void;
  disabled?: boolean;
};

/**
 * Left sidebar: translation (source) words stacked vertically; draggable into alignment boxes.
 */
export function SourceWordBank({
  tokens,
  sourceAligned,
  selected,
  colorSlotForToken,
  groupClass,
  onToggle,
  disabled,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: WORD_BANK_DROP_ID,
    data: { kind: 'word-bank' },
    disabled: Boolean(disabled),
  });

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
          const gi = colorSlotForToken(i);
          const isSel = selected.includes(i);
          return (
            <DraggableSourceWord
              key={`${t.verseSid}-${i}-${t.surface}`}
              verseSid={t.verseSid}
              token={t}
              transIndex={i}
              aligned={aligned}
              groupClass={groupClass(gi)}
              isSelected={isSel}
              selectedTrans={selected}
              sourceAligned={sourceAligned}
              disabled={disabled}
              onToggle={onToggle}
            />
          );
        })}
        </div>
      </div>
    </div>
  );
}
