/**
 * Word-level identity for alignment: verse sid + surface + occurrence within verse.
 */

import { stripAlignments } from './alignment-layer';
import { collectVerseTextsFromContent } from './verse-text';
import { findVerseInlineNodes } from './verse-ref';
import { tokenizeWords } from './word-diff';

export type WordToken = {
  verseSid: string;
  surface: string;
  occurrence: number;
  occurrences: number;
  index: number;
};

export type OriginalWordToken = WordToken & {
  strong: string;
  lemma: string;
  morph?: string;
};

function occurrenceStats(words: string[], index: number): { occurrence: number; occurrences: number } {
  const w = words[index];
  const occurrences = words.filter((x) => x === w).length;
  const occurrence = words.slice(0, index + 1).filter((x) => x === w).length;
  return { occurrence, occurrences };
}

/**
 * Tokenize a gateway / translation USJ (typically stripped, plain strings in verses).
 */
export function tokenizeDocument(usj: { content?: unknown[] }): Record<string, WordToken[]> {
  const content = usj.content ?? [];
  const byVerse = collectVerseTextsFromContent(content as unknown[]);
  const out: Record<string, WordToken[]> = {};
  for (const [sid, text] of Object.entries(byVerse)) {
    const words = tokenizeWords(text);
    out[sid] = words.map((surface, index) => ({
      verseSid: sid,
      surface,
      ...occurrenceStats(words, index),
      index,
    }));
  }
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function extractCharWText(node: Record<string, unknown>): string {
  const c = node.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  let s = '';
  for (const x of c) {
    if (typeof x === 'string') s += x;
    else if (isRecord(x) && x.type === 'text' && typeof x.content === 'string') s += x.content;
    else if (isRecord(x) && Array.isArray(x.content)) s += extractCharWText(x);
  }
  return s;
}

/**
 * Collect `\w` character spans from verse inline in document order (depth-first).
 */
function collectWSpansFromInline(nodes: unknown[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const n of nodes) {
    if (typeof n === 'string') continue;
    if (!isRecord(n)) continue;
    const o = n;
    if (o.type === 'char' && o.marker === 'w') {
      out.push(o);
      continue;
    }
    if (Array.isArray(o.content)) {
      out.push(...collectWSpansFromInline(o.content as unknown[]));
    }
  }
  return out;
}

function parseOccurrence(o: Record<string, unknown>, key: string, fallback: number): number {
  const v = o[key];
  if (v === undefined || v === null) return fallback;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Tokenize an original-language (or reference) USJ, preferring `\w` spans with Strong's / lemma.
 * If no `\w` markers exist in a verse, falls back to whitespace tokenization of flattened text.
 *
 * Default `stripFirst: false` walks the raw USJ so `\w` attributes are preserved (e.g. UGNT).
 * Pass `stripFirst: true` to run {@link stripAlignments} first (removes `\zaln-*` and unwraps `\w`
 * to plain strings) when the source is an aligned gateway text and you only need clean surfaces.
 */
export function tokenizeOriginalDocument(
  usj: { content?: unknown[]; type?: string; version?: string },
  options: { stripFirst?: boolean } = {}
): Record<string, OriginalWordToken[]> {
  const stripFirst = options.stripFirst === true;
  let doc = usj;
  if (stripFirst) {
    const { editable } = stripAlignments(usj as Parameters<typeof stripAlignments>[0]);
    doc = { type: 'USJ', version: editable.version, content: editable.content as unknown[] };
  }

  const content = doc.content ?? [];
  const bySid = collectVerseTextsFromContent(content as unknown[]);
  const out: Record<string, OriginalWordToken[]> = {};

  for (const sid of Object.keys(bySid)) {
    const inline = findVerseInlineNodes(content as unknown[], sid);
    const spans = collectWSpansFromInline(inline);
    const withText = spans
      .map((w) => ({ w, surface: extractCharWText(w).trim() }))
      .filter((x) => x.surface.length > 0);
    if (withText.length > 0) {
      const surfaces = withText.map((x) => x.surface);
      out[sid] = withText.map(({ w, surface }, index) => {
        const strong = String(w['x-strong'] ?? w['strong'] ?? '');
        const lemma = String(w['x-lemma'] ?? w['lemma'] ?? '');
        const morph = w['x-morph'] !== undefined ? String(w['x-morph']) : undefined;
        const fallback = occurrenceStats(surfaces, index);
        const occurrence = parseOccurrence(w, 'x-occurrence', fallback.occurrence);
        const occurrences = parseOccurrence(w, 'x-occurrences', fallback.occurrences);
        return {
          verseSid: sid,
          surface,
          strong,
          lemma,
          morph,
          occurrence,
          occurrences,
          index,
        };
      });
    } else {
      const words = tokenizeWords(bySid[sid] ?? '');
      out[sid] = words.map((surface, index) => ({
        verseSid: sid,
        surface,
        strong: '',
        lemma: '',
        morph: undefined,
        ...occurrenceStats(words, index),
        index,
      }));
    }
  }

  return out;
}

/** Tokenize translation document; alias clarity for callers. */
export function tokenizeTranslationDocument(usj: { content?: unknown[] }): Record<string, WordToken[]> {
  return tokenizeDocument(usj);
}
