/**
 * Chapter-scoped structural diff between two USJ documents (produces {@link Operation} lists).
 */

import type { Operation } from './operations';
import { splitUsjByChapter } from './chapter-chunker';

type UsjDoc = { type: 'USJ'; version: string; content: unknown[] };

function jsonKey(x: unknown): string {
  return JSON.stringify(x);
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function diffNodeValue(chapter: number, path: number[], a: unknown, b: unknown): Operation[] {
  if (jsonKey(a) === jsonKey(b)) return [];
  if (typeof a === 'string' && typeof b === 'string') {
    return [{ type: 'setText', path: { chapter, indices: path }, text: b }];
  }
  const oa = a as Record<string, unknown> | null;
  const ob = b as Record<string, unknown> | null;
  if (
    oa &&
    ob &&
    typeof oa.type === 'string' &&
    oa.type === ob.type &&
    Array.isArray(oa.content) &&
    Array.isArray(ob.content)
  ) {
    return diffNodeArrays(chapter, path, oa.content as unknown[], ob.content as unknown[]);
  }
  return [{ type: 'replaceNode', path: { chapter, indices: path }, node: deepClone(b) }];
}

function diffNodeArrays(chapter: number, basePath: number[], a: unknown[], b: unknown[]): Operation[] {
  const ops: Operation[] = [];
  const min = Math.min(a.length, b.length);
  for (let i = 0; i < min; i++) {
    ops.push(...diffNodeValue(chapter, [...basePath, i], a[i], b[i]));
  }
  if (b.length > a.length) {
    for (let i = a.length; i < b.length; i++) {
      ops.push({
        type: 'insertNode',
        path: { chapter, indices: [...basePath, i] },
        node: deepClone(b[i]),
      });
    }
  } else if (a.length > b.length) {
    for (let i = a.length - 1; i >= b.length; i--) {
      ops.push({ type: 'removeNode', path: { chapter, indices: [...basePath, i] } });
    }
  }
  return ops;
}

/** Produce content operations that transform `a` into `b` (same book / chapter layout). */
export function diffUsjDocuments(a: UsjDoc, b: UsjDoc): Operation[] {
  const sa = splitUsjByChapter(a);
  const sb = splitUsjByChapter(b);
  const mapB = new Map(sb.map((s) => [s.chapter, s]));
  const ops: Operation[] = [];
  for (const sliceA of sa) {
    const sliceB = mapB.get(sliceA.chapter);
    if (!sliceB) continue;
    if (jsonKey(sliceA.nodes) === jsonKey(sliceB.nodes)) continue;
    ops.push(...diffNodeArrays(sliceA.chapter, [], sliceA.nodes, sliceB.nodes));
  }
  return ops;
}
