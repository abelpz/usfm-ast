/**
 * Apply, compose, and invert simple operations (MVP — paths address JSON by indices).
 */

import type { Operation } from './operations';

/** Block dynamic keys that would touch `Object.prototype` via assignment/delete. */
const UNSAFE_ATTR_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function getAt(parent: unknown, path: number[]): unknown {
  let cur: unknown = parent;
  for (const idx of path) {
    if (!Array.isArray(cur)) return undefined;
    cur = cur[idx];
  }
  return cur;
}

function setAt(parent: unknown[], path: number[], value: unknown): void {
  if (path.length === 0) return;
  let cur: unknown = parent;
  for (let i = 0; i < path.length - 1; i++) {
    const idx = path[i];
    if (!Array.isArray(cur)) return;
    cur = (cur as unknown[])[idx];
  }
  const last = path[path.length - 1];
  if (Array.isArray(cur)) {
    (cur as unknown[])[last] = value;
  }
}

function removeAt(parent: unknown[], path: number[]): void {
  if (path.length === 0) return;
  let cur: unknown = parent;
  for (let i = 0; i < path.length - 1; i++) {
    const idx = path[i];
    if (!Array.isArray(cur)) return;
    cur = (cur as unknown[])[idx];
  }
  const last = path[path.length - 1];
  if (Array.isArray(cur)) {
    (cur as unknown[]).splice(last, 1);
  }
}

function insertAt(parent: unknown[], path: number[], node: unknown): void {
  if (path.length === 0) return;
  let cur: unknown = parent;
  for (let i = 0; i < path.length - 1; i++) {
    const idx = path[i];
    if (!Array.isArray(cur)) return;
    cur = (cur as unknown[])[idx];
  }
  const last = path[path.length - 1];
  if (Array.isArray(cur)) {
    (cur as unknown[]).splice(last, 0, node);
  }
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
    const o = getAt(content, op.path.indices);
    if (o && typeof o === 'object') {
      const ob = o as Record<string, unknown>;
      if (op.value === undefined) delete ob[op.key];
      else ob[op.key] = op.value;
    }
    return;
  }
  if (op.type === 'moveNode') {
    const from = getAt(content, op.from.indices);
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
