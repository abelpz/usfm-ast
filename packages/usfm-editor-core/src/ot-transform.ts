/**
 * Operation transformation for concurrent same-chapter edits (chapter-scoped index shifting +
 * same-path conflicts).
 */

import { invertOperation } from './operation-engine';
import type { NodePath } from './types';
import type { Operation } from './operations';

/** Append two operation sequences (left then right). */
export function composeOps(a: Operation[], b: Operation[]): Operation[] {
  return [...a, ...b];
}

/** Invert a list of operations (reverse order; drop non-invertible ops). */
export function invertOps(ops: Operation[]): Operation[] {
  const out: Operation[] = [];
  for (let i = ops.length - 1; i >= 0; i--) {
    const inv = invertOperation(ops[i]!);
    if (inv) out.push(inv);
  }
  return out;
}

function cloneOp(op: Operation): Operation {
  return JSON.parse(JSON.stringify(op)) as Operation;
}

function isAlignmentOp(op: Operation): boolean {
  return op.type === 'alignWord' || op.type === 'unalignWord' || op.type === 'updateGroup';
}

function sameParentPath(a: number[], b: number[]): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  for (let i = 0; i < a.length - 1; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function pathsEqual(a: NodePath, b: NodePath): boolean {
  if (a.chapter !== b.chapter || a.indices.length !== b.indices.length) return false;
  return a.indices.every((v, i) => v === b.indices[i]);
}

/** True if `path` is the same as `base` or a strict descendant (deeper indices with matching prefix). */
function pathIsUnderOrEqual(path: NodePath, base: NodePath): boolean {
  if (path.chapter !== base.chapter) return false;
  if (path.indices.length < base.indices.length) return false;
  for (let i = 0; i < base.indices.length; i++) {
    if (path.indices[i] !== base.indices[i]) return false;
  }
  return true;
}

function lastIdx(path: number[]): number {
  return path[path.length - 1]!;
}

function withLast(path: number[], newLast: number): number[] {
  return [...path.slice(0, -1), newLast];
}

/** Transform indices for insert/remove at `prior.path` (same chapter, same parent as op path). */
function applyInsertRemoveToIndices(
  prior: Extract<Operation, { type: 'insertNode' | 'removeNode' }>,
  chapter: number,
  indices: number[]
): number[] {
  if (prior.path.chapter !== chapter) return indices;
  const pIdx = prior.path.indices;
  if (!sameParentPath(pIdx, indices)) return indices;
  const pi = lastIdx(pIdx);
  const oi = lastIdx(indices);
  if (prior.type === 'insertNode') {
    return oi >= pi ? withLast(indices, oi + 1) : indices;
  }
  if (oi > pi) return withLast(indices, oi - 1);
  return indices;
}

/**
 * Transform `op` against `prior` when `prior` is applied to the document first.
 * Returns `null` when the op is dropped (remote wins / no-op).
 */
export function transformAgainstPrior(prior: Operation, op: Operation): Operation | null {
  if (isAlignmentOp(prior) || isAlignmentOp(op)) return op;

  if (prior.type === 'moveNode') {
    const rm: Operation = { type: 'removeNode', path: prior.from };
    const o = transformAgainstPrior(rm, op);
    if (o === null) return null;
    const ins: Operation = { type: 'insertNode', path: prior.to, node: {} };
    return transformAgainstPrior(ins, o);
  }

  if (prior.type === 'insertNode' || prior.type === 'removeNode') {
    if (op.type === 'insertNode' || op.type === 'removeNode' || op.type === 'replaceNode') {
      const ch = op.path.chapter;
      const n = applyInsertRemoveToIndices(prior, ch, op.path.indices);
      return { ...op, path: { ...op.path, indices: n } };
    }
    if (op.type === 'setText' || op.type === 'setAttr') {
      const ch = op.path.chapter;
      const n = applyInsertRemoveToIndices(prior, ch, op.path.indices);
      return { ...op, path: { ...op.path, indices: n } };
    }
    if (op.type === 'moveNode') {
      const chFrom = op.from.chapter;
      const chTo = op.to.chapter;
      const nf = applyInsertRemoveToIndices(prior, chFrom, op.from.indices);
      const nt = applyInsertRemoveToIndices(prior, chTo, op.to.indices);
      return { ...op, from: { ...op.from, indices: nf }, to: { ...op.to, indices: nt } };
    }
    return op;
  }

  if (prior.type === 'setText' && op.type === 'setText' && pathsEqual(prior.path, op.path)) {
    return { ...op, oldText: prior.text };
  }

  if (prior.type === 'replaceNode' && op.type === 'replaceNode' && pathsEqual(prior.path, op.path)) {
    return null;
  }

  if (
    prior.type === 'setAttr' &&
    op.type === 'setAttr' &&
    pathsEqual(prior.path, op.path) &&
    prior.key === op.key
  ) {
    return null;
  }

  if (prior.type === 'replaceNode') {
    const p = prior.path;
    if (
      (op.type === 'insertNode' ||
        op.type === 'removeNode' ||
        op.type === 'replaceNode' ||
        op.type === 'setText' ||
        op.type === 'setAttr') &&
      pathIsUnderOrEqual(op.path, p)
    ) {
      return null;
    }
    if (op.type === 'moveNode') {
      if (pathIsUnderOrEqual(op.from, p) || pathIsUnderOrEqual(op.to, p)) return null;
    }
  }

  return op;
}

/**
 * Chapter-scoped OT: transform client vs server op lists. Client ops are transformed against each
 * server op (server applied first); server ops against each client op symmetrically.
 * Dropped ops are omitted from the result lists.
 */
export function transformOpLists(
  clientOps: Operation[],
  serverOps: Operation[]
): { clientPrime: Operation[]; serverPrime: Operation[] } {
  let cp = clientOps.map(cloneOp);
  for (const s of serverOps) {
    cp = cp.flatMap((c) => {
      const t = transformAgainstPrior(s, c);
      return t === null ? [] : [t];
    });
  }
  let sp = serverOps.map(cloneOp);
  for (const c of clientOps) {
    sp = sp.flatMap((s) => {
      const t = transformAgainstPrior(c, s);
      return t === null ? [] : [t];
    });
  }
  return { clientPrime: cp, serverPrime: sp };
}
