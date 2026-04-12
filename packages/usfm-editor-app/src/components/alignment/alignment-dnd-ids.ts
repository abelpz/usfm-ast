/** @dnd-kit unique ids and payload shapes for the alignment editor. */

export type SourceWordDragData = {
  type: 'source-word';
  transIndex: number;
  /** All translation indices moved together when multiple bank words are selected. */
  transIndices?: number[];
};
export type MergeBoxDragData = {
  type: 'merge-box';
  boxId: string;
  /** When multiple alignment boxes are selected, all of these merge into the drop target. */
  boxIds?: string[];
};
/** Aligned source chip: drag handle moves to another box (drop on box) or unalign (drop on word bank). */
export type UnalignDragData = {
  type: 'unalign';
  transIndex: number;
  /** When multiple aligned words are selected in the same box, all move together. */
  transIndices?: number[];
};
export type DetachRefDragData = { type: 'detach-ref'; boxId: string; refIndex: number };

export function boxDropId(boxId: string): string {
  return `box-${boxId}`;
}

export function parseBoxDropId(id: string | number | undefined): string | null {
  const s = String(id ?? '');
  if (!s.startsWith('box-')) return null;
  return s.slice(4);
}

export const WORD_BANK_DROP_ID = 'word-bank';
/** @deprecated Inline {@link detachSlotDropId} is used instead; kept for any external parsers. */
export const DETACH_STRIP_DROP_ID = 'detach-strip';

export function detachSlotDropId(boxId: string, refIndex: number): string {
  return `detach-slot-${boxId}-${refIndex}`;
}

/** Parses ids from {@link detachSlotDropId} — box ids are `gN` or `uN`. */
export function parseDetachSlotDropId(id: string | number | undefined): { boxId: string; refIndex: number } | null {
  const m = String(id ?? '').match(/^detach-slot-((?:g|u)\d+)-(\d+)$/);
  if (!m) return null;
  return { boxId: m[1]!, refIndex: Number(m[2]) };
}
