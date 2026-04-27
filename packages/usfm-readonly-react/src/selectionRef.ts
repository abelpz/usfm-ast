/**
 * Selection → structured reference: verses from **previous `\v` markers** in DOM order,
 * plain text with **verse numbers** (`.usfm-verse-num`) excluded, selection **snapped** to
 * full `.usfm-tok` words, and ordered **wordTokens** with per-verse occurrence metadata.
 */

import { normalizeWordIdentity } from './wordTokens.js';

export type ScriptureSelectionWordToken = {
  surface: string;
  word: string;
  verseNum: string;
  wordIndexInVerse: number;
  occurrenceInVerse: number;
};

export type ScriptureSelectionRef = {
  bookCode: string;
  chapter: number;
  text: string;
  verseStart: string;
  verseEnd: string;
  /** `.usfm-tok[data-verse]` spans intersecting the snapped range, in document order. */
  wordTokens: ScriptureSelectionWordToken[];
};

export type ScriptureSelectionFromDomOptions = {
  /**
   * When true (default), applies the snapped range to `document.getSelection()` so the blue
   * highlight updates. When false, uses the snapped range only to compute the payload (DOM
   * selection is left unchanged).
   */
  commitExpandedSelection?: boolean;
};

function compareVerse(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(na) === a.trim() && String(nb) === b.trim()) {
    return na - nb;
  }
  return a.localeCompare(b, undefined, { numeric: true });
}

function orderedVerses(a: string, b: string): { verseStart: string; verseEnd: string } {
  if (!a && !b) return { verseStart: '', verseEnd: '' };
  if (!a) return { verseStart: b, verseEnd: b };
  if (!b) return { verseStart: a, verseEnd: a };
  return compareVerse(a, b) <= 0 ? { verseStart: a, verseEnd: b } : { verseStart: b, verseEnd: a };
}

function rangesEqual(a: Range, b: Range): boolean {
  return (
    a.startContainer === b.startContainer &&
    a.startOffset === b.startOffset &&
    a.endContainer === b.endContainer &&
    a.endOffset === b.endOffset
  );
}

/** Nearest `.usfm-tok[data-verse]` ancestor of the boundary (or `null` if in gap / verse number only). */
function wordTokenAncestor(root: HTMLElement, node: Node): HTMLElement | null {
  let el: HTMLElement | null =
    node.nodeType === Node.TEXT_NODE ? (node.parentElement as HTMLElement | null) : (node as HTMLElement);
  while (el && root.contains(el)) {
    if (el.classList.contains('usfm-tok') && el.getAttribute('data-verse')) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * Grows the range so each boundary that lies inside a word token moves to that token’s
 * full extent (start of first touched token … end of last touched token).
 */
export function expandRangeToWordTokenBoundaries(root: HTMLElement, range: Range): Range {
  const out = range.cloneRange();
  const st = wordTokenAncestor(root, range.startContainer);
  const et = wordTokenAncestor(root, range.endContainer);
  if (st) {
    out.setStart(st, 0);
  }
  if (et) {
    out.setEnd(et, et.childNodes.length);
  }
  return out;
}

/** Applies snapped range to `sel` when it differs from the current range (updates blue highlight). */
export function commitExpandedWordTokenSelection(root: HTMLElement, sel: Selection): void {
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const cur = sel.getRangeAt(0);
  if (!root.contains(cur.commonAncestorContainer)) return;
  const expanded = expandRangeToWordTokenBoundaries(root, cur);
  if (rangesEqual(cur, expanded)) return;
  sel.removeAllRanges();
  sel.addRange(expanded);
}

/** Last `data-verse` on `.usfm-verse` whose **start** is not strictly after the collapsed point. */
function verseAtOrBeforePoint(root: HTMLElement, container: Node, offset: number): string | null {
  const doc = root.ownerDocument ?? document;
  const pt = doc.createRange();
  try {
    pt.setStart(container, offset);
    pt.collapse(true);
  } catch {
    return null;
  }

  let last: string | null = null;
  for (const el of root.querySelectorAll<HTMLElement>('.usfm-verse[data-verse]')) {
    try {
      const c = pt.comparePoint(el, 0);
      if (c === 1) break;
      const v = el.getAttribute('data-verse');
      if (v) last = v;
    } catch {
      continue;
    }
  }
  return last;
}

function isVerseNumberText(t: Text): boolean {
  return !!t.parentElement?.classList.contains('usfm-verse-num');
}

/** Slice of `t` covered by `range`, using `Range.comparePoint` (handles mixed boundary nodes). */
function sliceTextInRange(range: Range, t: Text): string {
  try {
    if (!range.intersectsNode(t)) return '';
  } catch {
    return '';
  }
  if (isVerseNumberText(t)) return '';

  const len = t.length;
  let lo = 0;
  while (lo < len) {
    try {
      if (range.comparePoint(t, lo) !== -1) break;
    } catch {
      return '';
    }
    lo++;
  }
  let hi = len;
  while (hi > lo) {
    try {
      if (range.comparePoint(t, hi) !== 1) break;
    } catch {
      return '';
    }
    hi--;
  }
  if (lo >= hi) return '';
  return t.data.slice(lo, hi);
}

/** Plain text for the range, excluding characters under `.usfm-verse-num`. */
export function selectedPlainTextExcludingVerseNumbers(root: HTMLElement, range: Range): string {
  const doc = root.ownerDocument ?? document;
  const parts: string[] = [];
  const w = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = w.nextNode())) {
    if (n.nodeType !== Node.TEXT_NODE) continue;
    const t = n as Text;
    const s = sliceTextInRange(range, t);
    if (s) parts.push(s);
  }
  return parts.join('');
}

function readWordTokenFromDom(el: HTMLElement): ScriptureSelectionWordToken | null {
  const verseNum = el.getAttribute('data-verse')?.trim() ?? '';
  const surf = el.textContent ?? '';
  const wi = parseInt(el.getAttribute('data-word-index') ?? '', 10);
  const occ = parseInt(el.getAttribute('data-occurrence') ?? '', 10);
  const id = el.getAttribute('data-word-identity')?.trim();
  if (!verseNum || !Number.isFinite(wi) || !Number.isFinite(occ)) return null;
  return {
    surface: surf,
    word: id && id.length > 0 ? id : normalizeWordIdentity(surf),
    verseNum,
    wordIndexInVerse: wi,
    occurrenceInVerse: occ,
  };
}

/** Ordered word tokens under `root` that intersect `range` (document order). */
export function wordTokensIntersectingRange(root: HTMLElement, range: Range): ScriptureSelectionWordToken[] {
  const out: ScriptureSelectionWordToken[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('.usfm-tok[data-verse]')) {
    try {
      if (!range.intersectsNode(el)) continue;
    } catch {
      continue;
    }
    const row = readWordTokenFromDom(el);
    if (row) out.push(row);
  }
  return out;
}

/**
 * When the user selects text inside `root`, returns structured reference + text.
 * Snapping uses full `.usfm-tok` boundaries when a boundary sits inside a token.
 * `verseStart` / `verseEnd` use the **snapped** range; `text` excludes verse numbers.
 *
 * Call with `{ commitExpandedSelection: true }` (default) only after the gesture ends
 * (e.g. `mouseup` / `keyup`), so the highlight is not adjusted while the user is still dragging.
 */
export function scriptureSelectionFromDom(
  root: HTMLElement,
  bookCode: string,
  chapter: number,
  options?: ScriptureSelectionFromDomOptions,
): ScriptureSelectionRef | null {
  const commit = options?.commitExpandedSelection !== false;
  const sel = root.ownerDocument.getSelection?.() ?? window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

  const raw = sel.getRangeAt(0);
  if (!root.contains(raw.commonAncestorContainer)) return null;

  if (commit) {
    commitExpandedWordTokenSelection(root, sel);
  }
  const range = commit ? sel.getRangeAt(0) : expandRangeToWordTokenBoundaries(root, raw);
  const text = selectedPlainTextExcludingVerseNumbers(root, range).trim();
  if (!text) return null;

  const vs = verseAtOrBeforePoint(root, range.startContainer, range.startOffset);
  const ve = verseAtOrBeforePoint(root, range.endContainer, range.endOffset);
  if (!vs || !ve) return null;

  const { verseStart, verseEnd } = orderedVerses(vs, ve);
  const wordTokens = wordTokensIntersectingRange(root, range);

  return {
    bookCode,
    chapter,
    text,
    verseStart,
    verseEnd,
    wordTokens,
  };
}
