/**
 * Collect verse `sid` → plain text for alignment reconciliation after content edits.
 */

import { findVerseInlineNodes } from './verse-ref';

function flattenInlineToText(nodes: unknown[]): string {
  let s = '';
  for (const n of nodes) {
    if (typeof n === 'string') s += n;
    else if (n && typeof n === 'object') {
      const o = n as Record<string, unknown>;
      const t = o.type;
      if ((t === 'char' || t === 'note') && Array.isArray(o.content)) {
        s += flattenInlineToText(o.content as unknown[]);
      }
    }
  }
  return s;
}

function listVerseSidsDeep(nodes: unknown[]): string[] {
  const out: string[] = [];
  const walk = (arr: unknown[]) => {
    for (const x of arr) {
      if (!x || typeof x !== 'object') continue;
      const o = x as Record<string, unknown>;
      if (o.type === 'verse' && typeof o.sid === 'string') out.push(o.sid);
      if (Array.isArray(o.content)) walk(o.content as unknown[]);
    }
  };
  walk(nodes);
  return out;
}

/** Map each verse `sid` in the document to flattened gateway text (for reconciliation). */
export function collectVerseTextsFromContent(content: unknown[]): Record<string, string> {
  const sids = [...new Set(listVerseSidsDeep(content))];
  const out: Record<string, string> = {};
  for (const sid of sids) {
    out[sid] = flattenInlineToText(findVerseInlineNodes(content, sid));
  }
  return out;
}
