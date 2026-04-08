/**
 * Maps ProseMirror document positions to window sections (header, titles, intro, chapter N).
 */

import type { Node as PMNode } from 'prosemirror-model';

export type MappedSection =
  | { kind: 'header'; from: number; to: number }
  | { kind: 'book_titles'; from: number; to: number }
  | { kind: 'book_introduction'; from: number; to: number }
  | { kind: 'chapter'; chapter: number; readonly: boolean; from: number; to: number };

export function chapterNumberFromPmChapter(node: PMNode): number {
  let n = 1;
  node.content.forEach((ch) => {
    if (ch.type.name === 'chapter_label') {
      const raw = ch.textContent.trim();
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed > 0) n = parsed;
    }
  });
  return n;
}

/**
 * Build a list of top-level sections with `[from, to)` positions (document-relative).
 */
export function buildChapterPositionMap(doc: PMNode): MappedSection[] {
  const out: MappedSection[] = [];
  doc.forEach((node, offset) => {
    const from = offset + 1;
    const to = from + node.nodeSize;
    const name = node.type.name;
    if (name === 'header') {
      out.push({ kind: 'header', from, to });
    } else if (name === 'book_titles') {
      out.push({ kind: 'book_titles', from, to });
    } else if (name === 'book_introduction') {
      out.push({ kind: 'book_introduction', from, to });
    } else if (name === 'chapter') {
      const ch = chapterNumberFromPmChapter(node);
      const readonly = Boolean(node.attrs.readonly);
      out.push({ kind: 'chapter', chapter: ch, readonly, from, to });
    }
  });
  return out;
}

/** Return editable chapter numbers touched by `[from, to)` in `doc`. */
export function chaptersTouchedByRange(doc: PMNode, from: number, to: number): Set<number> {
  const touched = new Set<number>();
  const map = buildChapterPositionMap(doc);
  for (const sec of map) {
    if (sec.kind !== 'chapter') continue;
    if (from < sec.to && to > sec.from && !sec.readonly) {
      touched.add(sec.chapter);
    }
  }
  return touched;
}

/** Whether pre-chapter sections (header / titles / intro) or editable chapters are touched. */
export function writebackTargets(
  doc: PMNode,
  from: number,
  to: number
): { chapter0: boolean; chapters: Set<number> } {
  const chapters = new Set<number>();
  let chapter0 = false;
  const map = buildChapterPositionMap(doc);
  for (const sec of map) {
    if (from < sec.to && to > sec.from) {
      if (sec.kind === 'header' || sec.kind === 'book_titles' || sec.kind === 'book_introduction') {
        chapter0 = true;
      } else if (sec.kind === 'chapter' && !sec.readonly) {
        chapters.add(sec.chapter);
      }
    }
  }
  return { chapter0, chapters };
}
