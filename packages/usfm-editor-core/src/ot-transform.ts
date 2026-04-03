/**
 * Operation transformation for concurrent same-chapter edits (chapter-scoped index shifting).
 */

import { invertOperation } from './operation-engine';
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

function lastIdx(path: number[]): number {
  return path[path.length - 1]!;
}

function withLast(path: number[], newLast: number): number[] {
  return [...path.slice(0, -1), newLast];
}

/** Transform `op` against `prior` when `prior` is applied to the document first. */
function transformAgainstPriorFixed(prior: Operation, op: Operation): Operation {
  if (isAlignmentOp(prior) || isAlignmentOp(op)) return op;

  if (prior.type !== 'insertNode' && prior.type !== 'removeNode') return op;

  const applyToPath = (chapter: number, indices: number[]): number[] => {
    if (prior.type !== 'insertNode' && prior.type !== 'removeNode') return indices;
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
  };

  if (op.type === 'insertNode' || op.type === 'removeNode' || op.type === 'replaceNode') {
    const ch = op.path.chapter;
    const n = applyToPath(ch, op.path.indices);
    return { ...op, path: { ...op.path, indices: n } };
  }
  if (op.type === 'setText' || op.type === 'setAttr') {
    const ch = op.path.chapter;
    const n = applyToPath(ch, op.path.indices);
    return { ...op, path: { ...op.path, indices: n } };
  }
  if (op.type === 'moveNode') {
    const chFrom = op.from.chapter;
    const chTo = op.to.chapter;
    const nf = applyToPath(chFrom, op.from.indices);
    const nt = applyToPath(chTo, op.to.indices);
    return { ...op, from: { ...op.from, indices: nf }, to: { ...op.to, indices: nt } };
  }
  return op;
}

/**
 * Chapter-scoped OT: index shifting for `insertNode` / `removeNode` when paths share the same
 * parent array. Client ops are transformed against each server op (server applied first on
 * replica), and server ops against each client op symmetrically.
 */
export function transformOpLists(
  clientOps: Operation[],
  serverOps: Operation[]
): { clientPrime: Operation[]; serverPrime: Operation[] } {
  let cp = clientOps.map(cloneOp);
  for (const s of serverOps) {
    cp = cp.map((c) => transformAgainstPriorFixed(s, c));
  }
  let sp = serverOps.map(cloneOp);
  for (const c of clientOps) {
    sp = sp.map((s) => transformAgainstPriorFixed(c, s));
  }
  return { clientPrime: cp, serverPrime: sp };
}
