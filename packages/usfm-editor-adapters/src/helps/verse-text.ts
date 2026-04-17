import { appendGatewayText } from '@usfm-tools/editor-core';
import type { DocumentStore } from '@usfm-tools/editor-core';

/**
 * Collect visible verse text from USJ fragments returned by {@link DocumentStore.getVerse}.
 * Skips note-like subtrees so quote matching targets running text.
 *
 * Uses appendGatewayText to insert spaces between adjacent word-character fragments that
 * lack an explicit space node — e.g. consecutive \\w nodes in aligned USFM that the
 * parser does not separate with a literal string node.
 */
export function collectTextFromVerseFragments(nodes: unknown[]): string {
  let result = '';
  for (const n of nodes) {
    const t = textFromUsjNode(n);
    if (!t) continue;
    result = result.length === 0 ? t : appendGatewayText(result, t);
  }
  return result;
}

function textFromUsjNode(n: unknown): string {
  if (n == null) return '';
  if (typeof n === 'string') return n;
  if (typeof n !== 'object') return '';
  const o = n as Record<string, unknown>;
  const ty = o.type;
  if (ty === 'note' || ty === 'figure') return '';
  if (typeof o.text === 'string') return o.text;
  if (Array.isArray(o.content)) {
    return o.content.map((c) => textFromUsjNode(c)).join('');
  }
  return '';
}

/**
 * Normalize text for token matching:
 * - Strips Hebrew cantillation marks (taamim, U+0591–U+05AF and U+05BD meteg)
 * - Strips zero-width / invisible joiners (U+200B, U+200C, U+200D, U+2060, FEFF)
 * - Strips leading/trailing punctuation so gateway tokens like "Amitai," or "ella."
 *   match the clean \w word forms in alignment data ("Amitai", "ella").
 * - NFC, collapse whitespace, trim
 *
 * Safe on both Hebrew and Latin/Greek text.
 */
export function normalizeHelpsText(s: string): string {
  return s
    .normalize('NFD')
    // Hebrew cantillation / accent marks (taamim): U+0591-U+05AF and U+05BD (meteg)
    // Vowel points (nikud, U+05B0-U+05BC and U+05C1-U+05C7) are kept for disambiguation.
    .replace(/[\u0591-\u05AF\u05BD]/g, '')
    // Hebrew maqef (U+05BE) — phonological connector between two separate lexical words.
    // Replace with a space so "דְּבַר\u05BEיְהוָה" becomes "דְּבַר יְהוָה" (two tokens) to
    // match how alignment sources list them as separate AlignedWord entries.
    .replace(/\u05BE/g, ' ')
    // Zero-width chars: ZWSP, ZWNJ, ZWJ, Word-Joiner, BOM/ZWNBSP
    // These appear as intra-word prefix markers (e.g. conjunction ו + root) — just delete.
    .replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/g, '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    // Strip leading/trailing non-letter/non-digit/non-mark characters.
    // Gateway tokens from plain-text splitting include attached punctuation (e.g. "Amitai,"
    // or "ella.") while alignment \w word forms do not. Stripping normalizes both sides so
    // mapTargetToTokenIndex can find the match. Safe for Hebrew (letters and nikud are \p{L}/\p{M}).
    .replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, '')
    .trim();
}

/**
 * Split verse plain text into whitespace-separated tokens (original language words / punct tokens).
 */
export function tokenizeVersePlainText(plain: string): string[] {
  const t = plain.trim();
  if (!t) return [];
  return t.split(/\s+/).filter(Boolean);
}

/**
 * Character ranges `[start, end)` in `plain.trim()` for each whitespace-delimited token,
 * in the same order as {@link tokenizeVersePlainText} (not the space-joined normalized string).
 */
export function tokenCharRangesInPlainText(plain: string): Array<{ start: number; end: number }> {
  const t = plain.trim();
  if (!t.length) return [];
  const ranges: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < t.length) {
    while (i < t.length && /\s/.test(t[i]!)) i++;
    if (i >= t.length) break;
    const start = i;
    while (i < t.length && !/\s/.test(t[i]!)) i++;
    ranges.push({ start, end: i });
  }
  return ranges;
}

/**
 * Plain text for one verse from a loaded {@link DocumentStore} (reference or target).
 * Uses the book code embedded in the document (`\\id`).
 */
export function versePlainTextFromStore(store: DocumentStore, chapter: number, verse: number): string {
  const bits = store.getVerse({ book: store.getBookCode(), chapter, verse });
  return collectTextFromVerseFragments(bits);
}
