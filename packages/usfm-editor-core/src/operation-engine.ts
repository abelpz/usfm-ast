/**
 * Apply, compose, and invert simple operations (MVP — paths address JSON by indices).
 */

import type { Operation } from './operations';

/** Block dynamic keys that would touch `Object.prototype` via assignment/delete. */
const UNSAFE_ATTR_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isObjectWithContentArray(v: unknown): v is Record<string, unknown> & {
  content: unknown[];
} {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.content);
}

/**
 * Resolve a path against a chapter slice root `content` array.
 * After the first index, each step follows either a nested **array** (legacy / test fixtures) or a
 * USJ node's `.content` array (paths from {@link document-diff}).
 */
function getAtPath(root: unknown[], path: number[]): unknown {
  if (path.length === 0) return undefined;
  let cur: unknown = root[path[0]!];
  for (let d = 1; d < path.length; d++) {
    const idx = path[d]!;
    if (Array.isArray(cur)) {
      cur = cur[idx];
      continue;
    }
    if (isObjectWithContentArray(cur)) {
      cur = cur.content[idx];
      continue;
    }
    return undefined;
  }
  return cur;
}

/** Parent array + index for setText / insert / remove / replace at `path`. */
function resolveContentSlot(root: unknown[], path: number[]): { parent: unknown[]; index: number } | null {
  if (path.length === 0) return null;
  if (path.length === 1) {
    return { parent: root, index: path[0]! };
  }
  let cur: unknown = root[path[0]!];
  for (let d = 1; d < path.length - 1; d++) {
    const idx = path[d]!;
    if (Array.isArray(cur)) {
      cur = cur[idx];
    } else if (isObjectWithContentArray(cur)) {
      cur = cur.content[idx];
    } else {
      return null;
    }
  }
  const last = path[path.length - 1]!;
  if (Array.isArray(cur)) {
    return { parent: cur, index: last };
  }
  if (isObjectWithContentArray(cur)) {
    return { parent: cur.content, index: last };
  }
  return null;
}

function setAt(root: unknown[], path: number[], value: unknown): void {
  const slot = resolveContentSlot(root, path);
  if (!slot) return;
  slot.parent[slot.index] = value;
}

function removeAt(root: unknown[], path: number[]): void {
  const slot = resolveContentSlot(root, path);
  if (!slot) return;
  slot.parent.splice(slot.index, 1);
}

function insertAt(root: unknown[], path: number[], node: unknown): void {
  const slot = resolveContentSlot(root, path);
  if (!slot) return;
  slot.parent.splice(slot.index, 0, node);
}

/**
 * Apply one operation to a **mutable** content array (chapter slice root `content`).
 * Alignment operations are application-specific; they are no-ops here.
 */
export function applyOperation(content: unknown[], op: Operation): void {
  if (op.type === 'alignWord' || op.type === 'unalignWord' || op.type === 'updateGroup') {
    return;
  }

  if (op.type === 'insertNode') {
    insertAt(content, op.path.indices, op.node);
    return;
  }
  if (op.type === 'removeNode') {
    removeAt(content, op.path.indices);
    return;
  }
  if (op.type === 'replaceNode') {
    setAt(content, op.path.indices, op.node);
    return;
  }
  if (op.type === 'setText') {
    setAt(content, op.path.indices, op.text);
    return;
  }
  if (op.type === 'setAttr') {
    if (UNSAFE_ATTR_KEYS.has(op.key)) return;
    const o = getAtPath(content, op.path.indices);
    if (o && typeof o === 'object') {
      const ob = o as Record<string, unknown>;
      if (op.value === undefined) delete ob[op.key];
      else ob[op.key] = op.value;
    }
    return;
  }
  if (op.type === 'moveNode') {
    const from = getAtPath(content, op.from.indices);
    removeAt(content, op.from.indices);
    insertAt(content, op.to.indices, from);
  }
}

export function applyOperations(content: unknown[], ops: Operation[]): void {
  for (const op of ops) {
    applyOperation(content, op);
  }
}

export function invertOperation(op: Operation): Operation | null {
  switch (op.type) {
    case 'removeNode':
      if (op.removedNode === undefined) return null;
      return { type: 'insertNode', path: op.path, node: op.removedNode };
    case 'insertNode':
      return { type: 'removeNode', path: op.path };
    case 'replaceNode':
      if (op.oldNode === undefined) return null;
      return { type: 'replaceNode', path: op.path, node: op.oldNode, oldNode: op.node };
    case 'setText':
      if (op.oldText === undefined) return null;
      return { type: 'setText', path: op.path, text: op.oldText, oldText: op.text };
    case 'setAttr':
      if (!('oldValue' in op)) return null;
      return {
        type: 'setAttr',
        path: op.path,
        key: op.key,
        value: op.oldValue,
        oldValue: op.value,
      };
    case 'moveNode':
      return { type: 'moveNode', from: op.to, to: op.from };
    case 'alignWord':
    case 'unalignWord':
    case 'updateGroup':
      return null;
    default:
      return null;
  }
}
