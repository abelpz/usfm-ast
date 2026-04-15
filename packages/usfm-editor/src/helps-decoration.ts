/**
 * ProseMirror inline decorations for TWL/TN helps on the reference (source) text view.
 */

import {
  annotateTokensByAlignment,
  filterHelpsForVerse,
  normalizeHelpsText,
  tokenCharRangesInPlainText,
  tokenizeVersePlainText,
  versePlainTextFromStore,
} from '@usfm-tools/editor-adapters';
import { type DocumentStore, needsSpaceBetween, usfmRefToVerseSid } from '@usfm-tools/editor-core';
import type { HelpEntry } from '@usfm-tools/types';
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';

import { buildChapterPositionMap } from './chapter-position-map';
import { parseVerseNumberAttr } from './verse-number';

export const helpsDecorationPluginKey = new PluginKey<DecorationSet>('usfmHelpsDecorations');

const META_SET_HELPS_DECOS = 'usfmSetHelpsDecorations';

function normalizePlain(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * A character-level position map for a verse's assembled text.
 *
 * `text` is the assembled plain text (with spaces added at paragraph boundaries
 * via the same `needsSpaceBetween` logic used by `versePlainTextFromStore`).
 * `docPos[i]` is the absolute ProseMirror document position for `text[i]`,
 * or `null` for synthetic boundary spaces that have no real document position.
 */
type VersePosMap = { text: string; docPos: Array<number | null> };

/**
 * Collect inline text from a chapter node grouped by verse, building a
 * character-level document-position map. Synthetic spaces are inserted at
 * paragraph boundaries using the same heuristic as `appendGatewayText` /
 * `needsSpaceBetween`, so the assembled text matches `versePlainTextFromStore`.
 *
 * This ensures poetry lines (`q`, `q1`, `q2`, `nb`, etc.) get decorated
 * correctly even though their text nodes are in separate paragraph nodes.
 */
function collectVersePosMap(chapterNode: PMNode, chapterPos: number): Map<number, VersePosMap> {
  const byVerse = new Map<number, VersePosMap>();
  // 0 = before first \v: heading text must NOT be assigned to verse 1.
  let currentVerse = 0;

  chapterNode.nodesBetween(0, chapterNode.content.size, (node, pos) => {
    if (node.type.name === 'chapter_label' || node.type.name === 'note' || node.type.name === 'figure') {
      return false;
    }
    if (node.type.name === 'verse') {
      const n = parseVerseNumberAttr(node.attrs.number);
      if (n != null) currentVerse = n;
      return;
    }
    if (!node.isText || !node.text) return;
    if (currentVerse === 0) return; // pre-verse heading text — skip

    const absFrom = chapterPos + pos;
    let map = byVerse.get(currentVerse);
    if (!map) {
      map = { text: '', docPos: [] };
      byVerse.set(currentVerse, map);
    }

    // Insert a synthetic space when the assembled text so far and the incoming
    // fragment need a separator (same rule as appendGatewayText).
    if (map.text.length > 0 && needsSpaceBetween(map.text, node.text)) {
      map.text += ' ';
      map.docPos.push(null); // synthetic — no real document character
    }

    for (let i = 0; i < node.text.length; i++) {
      map.text += node.text[i];
      map.docPos.push(absFrom + i);
    }
  });

  return byVerse;
}

/**
 * Map a character range `[charStart, charEnd)` in the position-map text to
 * absolute ProseMirror positions. Skips synthetic (null) positions at the edges.
 */
function posMapRangeToDocRange(
  map: VersePosMap,
  charStart: number,
  charEnd: number,
): { from: number; to: number } | null {
  let from: number | null = null;
  for (let i = charStart; i < charEnd && i < map.docPos.length; i++) {
    if (map.docPos[i] !== null) { from = map.docPos[i] as number; break; }
  }
  let to: number | null = null;
  for (let i = Math.min(charEnd, map.docPos.length) - 1; i >= charStart; i--) {
    if (map.docPos[i] !== null) { to = (map.docPos[i] as number) + 1; break; }
  }
  if (from == null || to == null || from > to) return null;
  return { from, to };
}

function helpClasses(entries: HelpEntry[]): string {
  // 'words-links' is the resourceType set by parseTwlTsv; also accept any 'twl*' string for
  // programmatic callers that abbreviate the type.
  const twl = entries.some((e) => e.resourceType === 'words-links' || /twl/i.test(e.resourceType));
  // 'notes' is the resourceType set by parseTnTsv; also accept 'tn' abbreviation.
  const tn = entries.some((e) => e.resourceType === 'notes' || /^tn$/i.test(e.resourceType));
  const parts = ['usfm-helps-deco'];
  if (twl) parts.push('usfm-helps-twl');
  if (tn) parts.push('usfm-helps-tn');
  return parts.join(' ');
}

export function buildHelpsDecorationSet(doc: PMNode, store: DocumentStore, twl: HelpEntry[], tn: HelpEntry[]): DecorationSet {
  const book = store.getBookCode();
  const decos: Decoration[] = [];
  const sections = buildChapterPositionMap(doc);

  for (const sec of sections) {
    if (sec.kind !== 'chapter') continue;
    const chapterNum = sec.chapter;
    let chapterNode: PMNode | null = null;
    doc.forEach((node, offset) => {
      const from = offset + 1;
      if (from === sec.from && node.type.name === 'chapter') chapterNode = node;
    });
    if (!chapterNode) continue;
    const chapterPos = sec.from;
    const posMapByVerse = collectVersePosMap(chapterNode, chapterPos);
    const alignmentMap = store.getAlignments(chapterNum);

    for (const [verseNum, posMap] of posMapByVerse) {
      const storePlain = versePlainTextFromStore(store, chapterNum, verseNum);
      if (normalizePlain(posMap.text) !== normalizePlain(storePlain)) {
        continue;
      }

      const tokens = tokenizeVersePlainText(storePlain);
      if (tokens.length === 0) continue;

      const posMapTokens = tokenizeVersePlainText(posMap.text);
      if (posMapTokens.length !== tokens.length) continue;
      let tokenMismatch = false;
      for (let ti = 0; ti < tokens.length; ti++) {
        if (normalizeHelpsText(posMapTokens[ti]!) !== normalizeHelpsText(tokens[ti]!)) {
          tokenMismatch = true;
          break;
        }
      }
      if (tokenMismatch) continue;

      const helpsForVerse = [...filterHelpsForVerse(twl, chapterNum, verseNum), ...filterHelpsForVerse(tn, chapterNum, verseNum)];
      if (helpsForVerse.length === 0) continue;

      const verseSid = usfmRefToVerseSid(book, { book, chapter: chapterNum, verse: verseNum }) ?? `${book.trim().toUpperCase()} ${chapterNum}:${verseNum}`;
      const annotations = annotateTokensByAlignment(tokens, helpsForVerse, alignmentMap, verseSid);
      const charRanges = tokenCharRangesInPlainText(posMap.text);
      if (charRanges.length !== tokens.length) continue;

      for (const ann of annotations) {
        const cr = charRanges[ann.tokenIndex];
        if (!cr) continue;
        const range = posMapRangeToDocRange(posMap, cr.start, cr.end);
        if (!range) continue;
        const ids = ann.entries.map((e) => e.id).join(',');
        decos.push(
          Decoration.inline(range.from, range.to, {
            class: helpClasses(ann.entries),
            'data-help-ids': ids,
          }),
        );
      }
    }
  }

  return DecorationSet.create(doc, decos);
}

export type HelpsTokenClickHandler = (entries: HelpEntry[]) => void;

export function createHelpsDecorationPlugin(
  getStore: () => DocumentStore | null,
  getHelps: () => { twl: HelpEntry[]; tn: HelpEntry[] },
  getClickHandler: () => HelpsTokenClickHandler | null | undefined,
): Plugin {
  return new Plugin({
    key: helpsDecorationPluginKey,
    state: {
      init(_, state) {
        const store = getStore();
        if (!store) return DecorationSet.empty;
        const { twl, tn } = getHelps();
        return buildHelpsDecorationSet(state.doc, store, twl, tn);
      },
      apply(tr, set) {
        const next = tr.getMeta(META_SET_HELPS_DECOS);
        if (next !== undefined) return next as DecorationSet;
        return set.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return helpsDecorationPluginKey.getState(state) ?? DecorationSet.empty;
      },
      handleDOMEvents: {
        click(_view: EditorView, event: Event) {
          const el = (event.target as HTMLElement | null)?.closest?.('[data-help-ids]') as HTMLElement | null;
          if (!el) return false;
          const raw = el.getAttribute('data-help-ids');
          if (!raw) return false;
          const ids = raw.split(',').filter(Boolean);
          const { twl, tn } = getHelps();
          const byId = new Map<string, HelpEntry>();
          for (const e of twl) byId.set(e.id, e);
          for (const e of tn) byId.set(e.id, e);
          const entries = ids.map((id) => byId.get(id)).filter(Boolean) as HelpEntry[];
          if (entries.length === 0) return false;
          getClickHandler()?.(entries);
          return true;
        },
      },
    },
  });
}

export { META_SET_HELPS_DECOS };
