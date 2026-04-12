import type { Modifier } from '@dnd-kit/core';
import type { MutableRefObject } from 'react';

type Point = { left: number; top: number };

/**
 * Keeps the drag preview pinned to the pointer: the point that was under the cursor at pointer-down
 * (within the grip) stays under the cursor even when the underlying draggable moves in the layout
 * (e.g. split placeholder inserts).
 *
 * `DragOverlay` uses `position: fixed` with `left/top` from the first measured
 * `activeNodeRect` and adds `transform` as pointer delta. When the grip jumps from A→B after layout,
 * that base rect can be B while the user grabbed at A — we add (A - B) to `transform` so the net
 * position stays cursor-anchored.
 */
export function createCursorAnchoredDragOverlay(
  gripRectAtStartRef: MutableRefObject<DOMRect | null>,
  overlayBaseRef: MutableRefObject<Point | null>,
): Modifier {
  return ({ transform, activeNodeRect }) => {
    const grip = gripRectAtStartRef.current;
    if (!grip) return transform;

    if (overlayBaseRef.current === null && activeNodeRect) {
      overlayBaseRef.current = { left: activeNodeRect.left, top: activeNodeRect.top };
    }
    const base = overlayBaseRef.current;
    if (!base) return transform;

    return {
      x: transform.x + grip.left - base.left,
      y: transform.y + grip.top - base.top,
      scaleX: 1,
      scaleY: 1,
    };
  };
}
