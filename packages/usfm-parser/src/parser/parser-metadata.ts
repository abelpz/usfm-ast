/**
 * Parse-time metadata on AST nodes: stable IDs, optional source spans, parent wiring.
 * Metadata is non-enumerable so JSON.stringify / toPlainUSJ do not emit it.
 */

import type { EnhancedUSJNode } from '@usfm-tools/types';
import { BaseEnhancedUSJNode, ParsedRootNode } from '../nodes/enhanced-usj-nodes';

/** WeakMap from AST objects to USFM source spans (tree-wide when populated during parse). */
export type RootSourceSpanMap = WeakMap<object, SourceSpan>;
/** @alias {@link RootSourceSpanMap} */
export type SourceSpanMap = RootSourceSpanMap;

export interface SourceSpan {
  /** Byte offset in the original USFM string (UTF-16 code unit index, same as String indices) */
  start: number;
  end: number;
}

export interface ParserNodeMeta {
  nodeId: number;
  sourceSpan?: SourceSpan;
}

const NODE_ID = '_nodeId';
const SOURCE_SPAN = '_sourceSpan';

/**
 * Attach non-enumerable parser metadata to a node (AST or plain object).
 */
export function attachParserNodeMeta(node: object, meta: ParserNodeMeta): void {
  Object.defineProperty(node, NODE_ID, {
    value: meta.nodeId,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  if (meta.sourceSpan) {
    Object.defineProperty(node, SOURCE_SPAN, {
      value: { ...meta.sourceSpan },
      writable: false,
      enumerable: false,
      configurable: true,
    });
  }
}

/** Read stable parse id when present */
export function getParserNodeId(node: unknown): number | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const v = Object.getOwnPropertyDescriptor(node, NODE_ID)?.value;
  return typeof v === 'number' ? v : undefined;
}

/** Read source span when present */
export function getParserSourceSpan(node: unknown): SourceSpan | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const v = Object.getOwnPropertyDescriptor(node, SOURCE_SPAN)?.value;
  if (
    v &&
    typeof v === 'object' &&
    typeof (v as SourceSpan).start === 'number' &&
    typeof (v as SourceSpan).end === 'number'
  ) {
    return v as SourceSpan;
  }
  return undefined;
}

function isEnhancedChild(
  n: EnhancedUSJNode | string
): n is EnhancedUSJNode & { getChildren?: () => unknown } {
  return typeof n === 'object' && n !== null && typeof (n as { getChildren?: unknown }).getChildren === 'function';
}

/**
 * Recursively collect navigable child nodes (skips bare strings).
 */
function getNavigableChildren(node: EnhancedUSJNode): (EnhancedUSJNode | string)[] {
  const ch = node.getChildren?.();
  if (Array.isArray(ch)) return ch;
  return [];
}

/**
 * Wire `_parent` and `_index` on all BaseEnhancedUSJNode instances, assign monotonic `_nodeId`
 * in depth-first pre-order (book line → chapters → …).
 */
export function finalizeParsedTree(
  root: ParsedRootNode,
  options?: { sourceSpans?: RootSourceSpanMap; rootSourceSpans?: RootSourceSpanMap }
): void {
  const spanMap = options?.sourceSpans ?? options?.rootSourceSpans;
  let nextId = 1;

  function visit(
    children: (EnhancedUSJNode | string)[],
    structuralParent: ParsedRootNode | BaseEnhancedUSJNode
  ): void {
    const linkParent: BaseEnhancedUSJNode | undefined =
      structuralParent instanceof ParsedRootNode ? undefined : structuralParent;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (typeof child === 'string') continue;
      if (!isEnhancedChild(child)) continue;

      const asBase = child as unknown as BaseEnhancedUSJNode;
      Object.defineProperty(asBase, '_parent', {
        value: linkParent,
        writable: true,
        enumerable: false,
        configurable: true,
      });
      Object.defineProperty(asBase, '_index', {
        value: i,
        writable: true,
        enumerable: false,
        configurable: true,
      });
      const span = spanMap?.get(asBase);
      attachParserNodeMeta(asBase, { nodeId: nextId++, ...(span ? { sourceSpan: span } : {}) });

      const nested = getNavigableChildren(child);
      if (nested.length > 0) {
        visit(nested, asBase);
      }
    }
  }

  visit(root.content, root);
}

/**
 * Fill missing `_sourceSpan` on container nodes from the union of descendant spans (when
 * {@link sourcePositions} is enabled). Runs after {@link finalizeParsedTree}.
 */
export function propagateSourceSpans(root: ParsedRootNode): void {
  function visit(node: EnhancedUSJNode): SourceSpan | undefined {
    const asObj = node as unknown as BaseEnhancedUSJNode;
    const own = getParserSourceSpan(asObj);
    if (own) {
      return own;
    }
    const nested = getNavigableChildren(node);
    let u: SourceSpan | undefined;
    for (const ch of nested) {
      if (typeof ch === 'string') continue;
      const s = visit(ch as EnhancedUSJNode);
      if (s) {
        u = u ? { start: Math.min(u.start, s.start), end: Math.max(u.end, s.end) } : { ...s };
      }
    }
    if (u) {
      const id = getParserNodeId(asObj);
      if (id !== undefined) {
        attachParserNodeMeta(asObj, { nodeId: id, sourceSpan: u });
      }
      return u;
    }
    return undefined;
  }

  for (const c of root.content) {
    if (typeof c === 'string') continue;
    if (!isEnhancedChild(c)) continue;
    visit(c as EnhancedUSJNode);
  }
}
