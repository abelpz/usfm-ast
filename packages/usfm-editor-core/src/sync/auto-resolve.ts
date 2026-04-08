/**
 * Heuristics to auto-resolve non-overlapping chapter / paragraph conflicts.
 */

import type { Operation } from '../operations';
import type { ChapterConflict } from './types';

function opRoughChapter(op: Operation): number {
  if (op.type === 'moveNode') return op.from.chapter;
  if (
    op.type === 'insertNode' ||
    op.type === 'removeNode' ||
    op.type === 'replaceNode' ||
    op.type === 'setText' ||
    op.type === 'setAttr'
  ) {
    return op.path.chapter;
  }
  return 0;
}

/** Paths overlap if they share the same first two indices (chapter slice + paragraph-ish). */
function pathsOverlap(a: number[], b: number[]): boolean {
  if (a.length < 2 || b.length < 2) return true;
  return a[0] === b[0] && a[1] === b[1];
}

function opsOverlap(a: Operation[], b: Operation[]): boolean {
  const pa = a.filter((o) => o.type !== 'alignWord') as Operation[];
  const pb = b.filter((o) => o.type !== 'alignWord') as Operation[];
  for (const x of pa) {
    for (const y of pb) {
      if (opRoughChapter(x) !== opRoughChapter(y)) continue;
      const ix = 'path' in x ? x.path.indices : [];
      const iy = 'path' in y ? y.path.indices : [];
      if (pathsOverlap(ix, iy)) return true;
    }
  }
  return false;
}

/**
 * Filter conflicts that can be auto-merged (non-overlapping op ranges); returns conflicts that still need UI.
 */
export function filterResolvableConflicts(conflicts: ChapterConflict[]): ChapterConflict[] {
  return conflicts.filter((c) => opsOverlap(c.localOps, c.remoteOps));
}
