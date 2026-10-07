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
  /**
   * Open alignment groups, outermost first. Milestones opened one right after another are the
   * sources of ONE group (N:1). A milestone opened after the group above it already has words is
   * a different group that interrupts it (non-contiguous pattern: the outer group goes on after
   * the inner one closes), so its words belong to the inner group only.
   */
  type Frame = { sources: OriginalWord[]; targets: AlignedWord[]; depth: number; verseRef: string };
  const stack: Frame[] = [];
  /** Groups in the order they were opened, so nesting does not change the order of a verse. */
  const opened: Frame[] = [];

  /**
   * The parser drops the white space that follows a milestone, so nothing is left between a group that closes and
   * what comes after it. A group never ends in the middle of a word: after one, another group, a `\\w` or text that
   * begins a word is a new token, whatever punctuation is next to it. Left to the spacing of
   * {@link appendGatewayText} alone, «ocultos—» + «banquetean» and «dijo:» + «¡Que» came back as one word that no
   * aligned word matched any more: the verse lost a space, and its whole alignment with the next save.
   */
  let closed = false;
  let reopened = false;

  /** Text that begins a word or opens a quotation, not what is still part of the word before it. */
  const beginsToken = (chunk: string) => /^(?:[\p{L}\p{N}([{«„“‘¡¿]|[—–-]+[\p{L}\p{N}])/u.test(chunk);

  const pushGatewayFragment = (chunk: string, isWord = false) => {
    if (!chunk) return;
    const last = out[out.length - 1];
    const apart = closed && (reopened || isWord || beginsToken(chunk));
    closed = false;
    reopened = false;
    if (typeof last === 'string') {
      out[out.length - 1] =
        apart && !/\s$/u.test(last) && !/^\s/u.test(chunk) ? `${last} ${chunk}` : appendGatewayText(last, chunk);
    } else {
      out.push(chunk);
    }
  };

  /** Once nothing is open, what was read goes to the map, in opening order. */
  const flushOpened = () => {
    for (const frame of opened) {
      if (!frame.verseRef || frame.sources.length === 0 || frame.targets.length === 0) continue;
      if (!alignments[frame.verseRef]) alignments[frame.verseRef] = [];
      alignments[frame.verseRef].push({ sources: frame.sources, targets: frame.targets });
    }
    opened.length = 0;
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
      const top = stack[stack.length - 1];
      if (top && top.targets.length === 0) {
        top.sources.push(milestoneToOriginal(o));
        top.depth++;
      } else {
        const frame: Frame = { sources: [milestoneToOriginal(o)], targets: [], depth: 1, verseRef: ctx.verseRef };
        stack.push(frame);
        opened.push(frame);
      }
      if (closed) reopened = true;
      continue;
    }

    if (t === 'ms' && o.marker === 'zaln-e') {
      const top = stack[stack.length - 1];
      if (top) {
        top.depth--;
        if (top.depth <= 0) stack.pop();
      }
      if (stack.length === 0) flushOpened();
      closed = true;
      reopened = false;
      continue;
    }

    if (t === 'char' && o.marker === 'w') {
      const text = extractText(o.content);
      const top = stack[stack.length - 1];
      if (top) top.targets.push(charToAlignedWord(o, text));
      pushGatewayFragment(text, true);
      continue;
    }

    out.push(transformSubtree(o, ctx, alignments));
  }

  flushOpened();
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
