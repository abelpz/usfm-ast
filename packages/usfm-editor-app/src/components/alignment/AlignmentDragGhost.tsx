import type { Active } from '@dnd-kit/core';
import type { OriginalWordToken, WordToken } from '@usfm-tools/editor-core';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';

import type { AlignmentBoxModel } from '@/hooks/useAlignmentBoxModel';
import { cn } from '@/lib/utils';

import type {
  DetachRefDragData,
  MergeBoxDragData,
  SourceWordDragData,
  UnalignDragData,
} from './alignment-dnd-ids';

type Props = {
  active: Active | null;
  trTok: WordToken[];
  refTok: OriginalWordToken[];
  boxes: AlignmentBoxModel[];
};

export function AlignmentDragGhost({ active, trTok, refTok, boxes }: Props) {
  if (!active?.data?.current) return null;

  const d = active.data.current as
    | SourceWordDragData
    | MergeBoxDragData
    | UnalignDragData
    | DetachRefDragData;

  const shell = (inner: ReactNode, wide?: boolean) => (
    <div
      className={cn(
        'bg-background/95 text-foreground pointer-events-none flex w-max max-w-[min(22rem,92vw)] flex-nowrap items-center gap-2 rounded-md border-2 border-primary px-2 py-2 text-sm shadow-lg ring-2 ring-primary/25',
        wide && 'min-w-[min(18rem,92vw)]',
      )}
      style={{ cursor: 'grabbing' }}
    >
      {inner}
    </div>
  );

  if (d.type === 'source-word') {
    const indices = d.transIndices?.length ? d.transIndices : [d.transIndex];
    const pairs = indices
      .map((i) => ({ i, t: trTok[i] }))
      .filter((p): p is { i: number; t: WordToken } => p.t != null);
    if (pairs.length === 0) return null;
    return shell(
      <>
        <GripVertical className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        <span className="flex min-w-0 max-w-[min(20rem,88vw)] flex-wrap items-baseline gap-x-1.5 font-medium leading-tight">
          {pairs.map(({ i, t }, j) => (
            <span key={i} className="inline-flex items-baseline gap-0">
              {j > 0 ? <span className="text-muted-foreground">·</span> : null}
              <span className="truncate">{t.surface}</span>
              {t.occurrences > 1 ? (
                <sup className="text-muted-foreground ml-0.5 text-[10px]">{t.occurrence}</sup>
              ) : null}
            </span>
          ))}
        </span>
      </>,
      pairs.length > 1,
    );
  }

  if (d.type === 'unalign') {
    const indices = d.transIndices?.length ? d.transIndices : [d.transIndex];
    const pairs = indices
      .map((i) => ({ i, t: trTok[i] }))
      .filter((p): p is { i: number; t: WordToken } => p.t != null);
    if (pairs.length === 0) return null;
    return shell(
      <>
        <GripVertical className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        <span className="flex min-w-0 max-w-[min(20rem,88vw)] flex-wrap items-baseline gap-x-1.5 font-medium leading-tight">
          {pairs.map(({ i, t }, j) => (
            <span key={i} className="inline-flex items-baseline gap-0">
              {j > 0 ? <span className="text-muted-foreground">·</span> : null}
              <span className="truncate">{t.surface}</span>
              {t.occurrences > 1 ? (
                <sup className="text-muted-foreground ml-0.5 text-[10px]">{t.occurrence}</sup>
              ) : null}
            </span>
          ))}
        </span>
      </>,
      pairs.length > 1,
    );
  }

  if (d.type === 'merge-box') {
    const ids = d.boxIds?.length ? d.boxIds : [d.boxId];
    const previews = ids
      .map((id) => boxes.find((b) => b.id === id))
      .filter(Boolean)
      .map((b) => b!.targetTokens.map((x) => x.surface).join(' · '));
    const preview = previews.length > 0 ? previews.join(' · ') : '·';
    return shell(
      <>
        <GripVertical className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <div className="min-w-0 max-w-[min(20rem,88vw)] truncate text-sm font-medium">{preview}</div>
      </>,
      true,
    );
  }

  if (d.type === 'detach-ref') {
    const tok = refTok[d.refIndex];
    if (!tok) return null;
    return shell(
      <>
        <GripVertical className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        <span className="font-medium">{tok.surface}</span>
      </>,
      true,
    );
  }

  return null;
}
