import { closestCenter, pointerWithin, type CollisionDetection } from '@dnd-kit/core';

/**
 * Use the droppable under the **cursor**, not the center of the drag overlay (which
 * {@link closestCenter} uses). Falls back to closest-center when the pointer is not
 * inside any target (e.g. transient gaps).
 */
export const alignmentPointerCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }
  return closestCenter(args);
};
