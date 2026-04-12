/**
 * Strip unfoldingWord-style alignments (`zaln-s` / `zaln-e`, `\\w`) into a separate map
 * and plain gateway-language text for content editing.
 */

import type { AlignedWord, AlignmentMap, EditableUSJ, OriginalWord } from '@usfm-tools/types';

import { appendGatewayText } from './gateway-text-spacing';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function milestoneToOriginal(node: Record<string, unknown>): OriginalWord {
  return {
    strong: String(node['x-strong'] ?? ''),
    lemma: String(node['x-lemma'] ?? ''),
    morph: node['x-morph'] !== undefined ? String(node['x-morph']) : undefined,
    content: String(node['x-content'] ?? ''),
    occurrence: parseInt(String(node['x-occurrence'] ?? '1'), 10) || 1,
    occurrences: parseInt(String(node['x-occurrences'] ?? '1'), 10) || 1,
  };
}

function charToAlignedWord(node: Record<string, unknown>, text: string): AlignedWord {
  return {
    word: text,
    occurrence: parseInt(String(node['x-occurrence'] ?? '1'), 10) || 1,
    occurrences: parseInt(String(node['x-occurrences'] ?? '1'), 10) || 1,
  };
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  let s = '';
  for (const c of content) {
    if (typeof c === 'string') s += c;
    else if (isRecord(c) && c.type === 'text' && typeof (c as { content?: unknown }).content === 'string') {
      s += (c as { content: string }).content;
    }
  }
  return s;
}

function transformSubtree(node: unknown, ctx: { verseRef: string }, alignments: AlignmentMap): unknown {
  if (!isRecord(node)) return node;
  const o = node as Record<string, unknown>;
  if (o.type === 'verse' && typeof o.sid === 'string') {
    ctx.verseRef = o.sid;
  }
  if (Array.isArray(o.content)) {
    return { ...o, content: stripArray(o.content as unknown[], ctx, alignments) };
  }
  return { ...o };
}

/**
 * Remove alignment milestones and unwrap `\\w` inside one content array.
 */
export function stripArray(
  nodes: unknown[],
  ctx: { verseRef: string },
  alignments: AlignmentMap
): unknown[] {
  const out: unknown[] = [];
  let openZaln = 0;
  const sources: OriginalWord[] = [];
  const targets: AlignedWord[] = [];

  const pushGatewayFragment = (chunk: string) => {
    if (!chunk) return;
    const last = out[out.length - 1];
    if (typeof last === 'string') {
      out[out.length - 1] = appendGatewayText(last, chunk);
    } else {
      out.push(chunk);
    }
  };

  const flushGroup = () => {
    if (!ctx.verseRef) {
      sources.length = 0;
      targets.length = 0;
      return;
    }
    if (sources.length === 0 || targets.length === 0) {
      sources.length = 0;
      targets.length = 0;
      return;
    }
    if (!alignments[ctx.verseRef]) alignments[ctx.verseRef] = [];
    alignments[ctx.verseRef].push({ sources: [...sources], targets: [...targets] });
    sources.length = 0;
    targets.length = 0;
  };

  for (const item of nodes) {
    if (typeof item === 'string') {
      pushGatewayFragment(item);
      continue;
    }
    if (!isRecord(item)) {
      out.push(item);
      continue;
    }

    const o = item;
    const t = o.type;

    if (t === 'verse' && typeof o.sid === 'string') {
      ctx.verseRef = o.sid;
      out.push(transformSubtree(o, ctx, alignments));
      continue;
    }

    if (t === 'ms' && o.marker === 'zaln-s') {
      openZaln++;
      sources.push(milestoneToOriginal(o));
      continue;
    }

    if (t === 'ms' && o.marker === 'zaln-e') {
      openZaln = Math.max(0, openZaln - 1);
      if (openZaln === 0) {
        flushGroup();
      }
      continue;
    }

    if (t === 'char' && o.marker === 'w') {
      const text = extractText(o.content);
      if (openZaln > 0) {
        targets.push(charToAlignedWord(o, text));
      }
      pushGatewayFragment(text);
      continue;
    }

    out.push(transformSubtree(o, ctx, alignments));
  }

  return out;
}

/**
 * Produce editable USJ plus an alignment map keyed by verse `sid` (e.g. `TIT 3:1`).
 */
export function stripAlignments(doc: {
  type?: string;
  version?: string;
  content?: unknown[];
}): {
  editable: EditableUSJ;
  alignments: AlignmentMap;
} {
  const alignments: AlignmentMap = {};
  const ctx = { verseRef: '' };
  const content = stripArray(doc.content ?? [], ctx, alignments);
  return {
    editable: {
      type: 'EditableUSJ',
      version: typeof doc.version === 'string' ? doc.version : '3.1',
      content: content as EditableUSJ['content'],
    },
    alignments,
  };
}
