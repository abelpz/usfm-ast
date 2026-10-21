/**
 * Strip unfoldingWord-style alignments (`zaln-s` / `zaln-e`, `\\w`) into a separate map
 * and plain gateway-language text for content editing.
 */

import type { AlignedWord, AlignmentMap, EditableUSJ, OriginalWord } from '@usfm-tools/types';

import { passVerseMark, readHeld, type VerseCursor } from './verse-reach';

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

/** Text that begins a word or opens a quotation, not what is still part of the word before it. */
const beginsToken = (chunk: string) =>
  /^(?:[\p{L}\p{N}([{«„“‘¡¿]|[—–…-]+[\p{L}\p{N}]|"+[\p{L}\p{N}([{«„“‘¡¿])/u.test(chunk);

/**
 * Whether what is written right after a group that closed is read as apart from it, the white space between the
 * two being the one thing the parser does not give back. `groupFollows`: a group or a `\\w` comes right after this
 * text, stuck to it; a straight quotation mark alone is then the one that opens what follows.
 *
 * Whoever writes aligned text asks this before leaving punctuation between two groups: what would be read stuck to
 * the group before it («amor» + «—» + «arrecifes» for «amor —arrecifes») is written inside the group it goes with.
 */
export function readsApartAfterGroup(chunk: string, groupFollows: boolean): boolean {
  return beginsToken(chunk) || (groupFollows && /^"+$/u.test(chunk));
}

/**
 * A node with what it holds stripped. Which verse its groups are of is said by {@link passVerseMark} and
 * {@link readHeld}, as for whoever writes them back: a group in a heading or in a note is of no verse. They were
 * all given to the verse read last, across headings and chapters, and the title of a psalm was read as words of
 * the last verse of the psalm before it.
 */
function transformSubtree(node: unknown, ctx: VerseCursor, alignments: AlignmentMap): unknown {
  if (!isRecord(node)) return node;
  const o = node as Record<string, unknown>;
  const mark = passVerseMark(o, ctx);
  if (Array.isArray(o.content)) {
    const held = o as Record<string, unknown> & { content: unknown[] };
    // A verse that holds its own text is read with the cursor it has just moved.
    const content = mark ? stripArray(held.content, ctx, alignments) : readHeld(held, ctx, (inner, at) => stripArray(inner, at, alignments));
    return { ...o, content };
  }
  return { ...o };
}

/**
 * Remove alignment milestones and unwrap `\\w` inside one content array.
 */
export function stripArray(
  nodes: unknown[],
  ctx: VerseCursor,
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
   * The text of a verse is what is written between its marks, as it is written. The one thing the parser does not
   * give back is the white space that follows a milestone, so nothing is left between a group that closes and what
   * comes after it; that space alone is worked out here. A group never ends in the middle of a word: after one,
   * another group, a `\\w` or text that begins a word is a new token, whatever punctuation is next to it.
   *
   * Everywhere else the pieces are joined as they are. They were all spaced again by the look of their characters
   * ({@link appendGatewayText}), which cannot tell a quotation mark that opens from one that closes: «dije: "Yo» was
   * read as «dije: " Yo» and «templo".» as «templo ".». Saving the alignment of one verse wrote those spaces into
   * every verse of the book that had such a mark, and each of them was then taken for a verse somebody had changed.
   */
  let closed = false;
  let reopened = false;
  /** The last piece read was a `\\w`, with nothing after it yet: another one right after it is another word. */
  let afterWord = false;

  /** `opensNext`: a group or a word comes right after this text, with no white space of its own between them. */
  const pushGatewayFragment = (chunk: string, isWord = false, opensNext = false) => {
    if (!chunk) return;
    const last = out[out.length - 1];
    const apart = (closed && (reopened || isWord || readsApartAfterGroup(chunk, opensNext))) || (isWord && afterWord);
    closed = false;
    reopened = false;
    afterWord = isWord;
    if (typeof last === 'string') {
      out[out.length - 1] = apart && !/\s$/u.test(last) && !/^\s/u.test(chunk) ? `${last} ${chunk}` : `${last}${chunk}`;
    } else {
      out.push(chunk);
    }
  };

  /**
   * The same original words, in the same order: one group written in more than one piece. Other writers
   * (unfoldingWord's) do not nest a group that is interrupted by another: they close it and write its original
   * words again where it goes on («May … be multiplied», both under πληθυνθείη). So does a group whose words fall
   * on two lines of a poem, since a milestone cannot stay open from one paragraph to the next.
   */
  const sameSources = (a: OriginalWord[], b: OriginalWord[]) =>
    a.length === b.length &&
    a.every((s, i) => {
      const o = b[i]!;
      return s.content === o.content && s.strong === o.strong && s.occurrence === o.occurrence && s.occurrences === o.occurrences;
    });

  /** Once nothing is open, what was read goes to the map, in opening order. */
  const flushOpened = () => {
    for (const frame of opened) {
      if (!frame.verseRef || frame.sources.length === 0 || frame.targets.length === 0) continue;
      if (!alignments[frame.verseRef]) alignments[frame.verseRef] = [];
      const groups = alignments[frame.verseRef]!;
      const begun = groups.find((group) => sameSources(group.sources, frame.sources));
      if (begun) begun.targets.push(...frame.targets);
      else groups.push({ sources: frame.sources, targets: frame.targets });
    }
    opened.length = 0;
  };

  const opensGroupOrWord = (node: unknown) =>
    isRecord(node) && ((node.type === 'ms' && node.marker === 'zaln-s') || (node.type === 'char' && node.marker === 'w'));

  for (let index = 0; index < nodes.length; index++) {
    const item = nodes[index];
    if (typeof item === 'string') {
      pushGatewayFragment(item, false, !/\s$/u.test(item) && opensGroupOrWord(nodes[index + 1]));
      continue;
    }
    if (!isRecord(item)) {
      out.push(item);
      continue;
    }

    const o = item;
    const t = o.type;

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
