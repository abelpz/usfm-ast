/**
 * Segment collection for read-only USJ → flat display segments.
 * Adapted from usfm-editor-app `usfm-diff-logic.ts` (collectSegments + marker sets).
 *
 * SPDX-License-Identifier: MIT
 * Source project: https://github.com/abelpz/usfm-ast
 */

export type SegmentKind =
  | 'verse'
  | 'word'
  | 'heading-text'
  | 'intro-heading'
  | 'para-break'
  | 'text'
  | 'footnote';

export interface RenderSegment {
  kind: SegmentKind;
  text: string;
  marker?: string;
  /** Set on `verse` segments (the visible verse number). */
  verseNum?: string;
  /**
   * Last opened `\\v` for this segment (for `text`, `word`, headings inside a verse, etc.).
   * Omitted in chapter front matter before the first verse.
   */
  enclosingVerse?: string;
}

export const PARAGRAPH_MARKERS = new Set([
  'p',
  'q',
  'q1',
  'q2',
  'q3',
  'b',
  'm',
  'pi',
  'pi1',
  'pi2',
  'li',
  'li1',
  'li2',
  'nb',
  'pc',
  'qr',
  'qc',
  'pr',
  'cls',
  'pmo',
  'pm',
  'pmc',
  'pmr',
]);

export const HEADING_MARKERS = new Set([
  's',
  's1',
  's2',
  's3',
  'r',
  'ms',
  'ms1',
  'mr',
  'd',
  'sp',
  'sr',
]);

export const INTRO_HEADING_MARKERS = new Set([
  'mt',
  'mt1',
  'mt2',
  'mt3',
  'mt4',
  'mte',
  'mte1',
  'imt',
  'imt1',
  'imt2',
  'is',
  'is1',
  'is2',
  'iot',
  'io',
  'io1',
  'io2',
  'ip',
  'ipi',
  'im',
  'imi',
  'ipq',
  'imq',
  'ipr',
  'iex',
]);

export const FOOTNOTE_MARKERS = new Set(['f', 'fe', 'x']);
export const SKIP_MARKERS = new Set(['id', 'h', 'toc1', 'toc2', 'toc3', 'ide', 'sts', 'rem', 'usfm']);

type UsjNode = {
  type?: string;
  marker?: string;
  content?: unknown[];
  text?: string;
  number?: string | number;
};

function isUsjNode(v: unknown): v is UsjNode {
  return typeof v === 'object' && v !== null;
}

type VerseCtx = { current: string };

function pushText(segments: RenderSegment[], text: string, ctx: VerseCtx) {
  if (!text) return;
  segments.push({
    kind: 'text',
    text,
    enclosingVerse: ctx.current || undefined,
  });
}

export function collectSegments(
  nodes: unknown[],
  segments: RenderSegment[] = [],
  ctx: VerseCtx = { current: '' },
): RenderSegment[] {
  for (const raw of nodes) {
    if (typeof raw === 'string') {
      pushText(segments, raw, ctx);
      continue;
    }
    if (!isUsjNode(raw)) continue;

    const marker = (raw.marker ?? raw.type ?? '') as string;

    if (raw.type === 'chapter') continue;

    if (raw.type === 'verse') {
      const verseNum = String(raw.number ?? '');
      segments.push({
        kind: 'verse',
        text: '',
        marker: 'v',
        verseNum,
        enclosingVerse: verseNum,
      });
      const prev = ctx.current;
      ctx.current = verseNum;
      if (raw.content) collectSegments(raw.content, segments, ctx);
      ctx.current = prev;
      continue;
    }

    if (SKIP_MARKERS.has(marker)) continue;

    if (raw.type === 'char' && marker === 'w') {
      const wordText = Array.isArray(raw.content)
        ? raw.content.filter((c) => typeof c === 'string').join('')
        : '';
      if (wordText) {
        segments.push({
          kind: 'word',
          text: wordText,
          marker: 'w',
          enclosingVerse: ctx.current || undefined,
        });
      }
      continue;
    }

    if (FOOTNOTE_MARKERS.has(marker)) {
      const inner: RenderSegment[] = [];
      if (raw.content) collectSegments(raw.content, inner, ctx);
      const ft = inner.map((s) => s.text).join('');
      segments.push({
        kind: 'footnote',
        text: ft,
        marker,
        enclosingVerse: ctx.current || undefined,
      });
      continue;
    }

    if (INTRO_HEADING_MARKERS.has(marker)) {
      segments.push({ kind: 'para-break', text: '', marker });
      const childSegs: RenderSegment[] = [];
      if (raw.content) collectSegments(raw.content, childSegs, ctx);
      for (const s of childSegs) {
        if (s.kind === 'text') (s as RenderSegment).kind = 'intro-heading';
      }
      segments.push(...childSegs);
      continue;
    }

    if (HEADING_MARKERS.has(marker)) {
      segments.push({ kind: 'para-break', text: '', marker });
      const childSegs: RenderSegment[] = [];
      if (raw.content) collectSegments(raw.content, childSegs, ctx);
      for (const s of childSegs) {
        if (s.kind === 'text') (s as RenderSegment).kind = 'heading-text';
      }
      segments.push(...childSegs);
      continue;
    }

    if (PARAGRAPH_MARKERS.has(marker) || raw.type === 'para') {
      segments.push({ kind: 'para-break', text: '', marker: marker || 'p' });
      if (raw.content) collectSegments(raw.content, segments, ctx);
      continue;
    }

    if (raw.content) collectSegments(raw.content, segments, ctx);
  }
  return segments;
}
