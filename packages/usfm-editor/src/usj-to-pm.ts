/**
 * Convert USJ (`UsjDocument` shape) into a ProseMirror document.
 */

import type { Mark, Node as PMNode, Schema } from 'prosemirror-model';
import { Fragment } from 'prosemirror-model';
import type { DocumentStore } from '@usfm-tools/editor-core';
import {
  isBookTitleParaMarker,
  isIntroductionParaMarker,
} from './book-title-markers';
import { usfmSchema } from './schema';

/** Mutable state for sequential translator-section numbers (1, 2, …) during USJ→PM. */
export type TsState = { section: number; openSection: number | null };

/**
 * Assign the next translator-section index for `\\ts` / `\\ts-s` / `\\ts-e` in document order.
 * A standalone `\\ts` or a `\\ts-s`…`\\ts-e` pair consumes one section number; end reuses the start’s number.
 */
export function nextTsSection(marker: string, state: TsState): number {
  const m = String(marker);
  if (m === 'ts-e' || m.endsWith('-e')) {
    const n = state.openSection ?? state.section;
    state.openSection = null;
    return n;
  }
  const n = state.section++;
  if (m === 'ts-s' || m.endsWith('-s')) state.openSection = n;
  return n;
}

function isTranslatorTsMarker(marker: string): boolean {
  return marker === 'ts' || marker.startsWith('ts-');
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function xAttrsJson(o: Record<string, unknown>): string {
  const x: Record<string, string> = {};
  for (const k of Object.keys(o)) {
    if (k.startsWith('x-') && o[k] !== undefined) x[k] = String(o[k]);
  }
  return Object.keys(x).length ? JSON.stringify(x) : '{}';
}

/** Empty `ms` with no paragraph context — still block-level in USJ. */
function isStandaloneTsMs(n: unknown): boolean {
  if (!isRecord(n) || n.type !== 'ms') return false;
  const inner = Array.isArray(n.content) ? n.content : [];
  if (inner.length > 0) return false;
  const m = n.marker;
  if (typeof m !== 'string') return false;
  return m === 'ts' || m.startsWith('ts-');
}

function isParaNode(n: unknown): boolean {
  return isRecord(n) && n.type === 'para';
}

/**
 * USFM often places `\\ts\\*` on its own line; the parser may emit a **block**-level `ms` node
 * even when the next line continues the same paragraph. Hoist those into the nearest `para` so
 * the editor shows a single paragraph with an inline milestone (not a visual split).
 */
export function normalizeStandaloneTranslatorMilestones(body: unknown[]): unknown[] {
  const out: unknown[] = [];
  let i = 0;
  while (i < body.length) {
    const n = body[i];
    if (!isStandaloneTsMs(n)) {
      out.push(n);
      i++;
      continue;
    }
    const run: Record<string, unknown>[] = [];
    while (i < body.length && isStandaloneTsMs(body[i])) {
      run.push({ ...(body[i] as Record<string, unknown>) });
      i++;
    }
    let merged = false;
    for (let j = i; j < body.length; j++) {
      if (isParaNode(body[j])) {
        const para = body[j] as Record<string, unknown>;
        const c = Array.isArray(para.content) ? [...para.content] : [];
        para.content = [...run, ...c];
        merged = true;
        break;
      }
    }
    if (merged) continue;
    for (let j = out.length - 1; j >= 0; j--) {
      if (isParaNode(out[j])) {
        const para = out[j] as Record<string, unknown>;
        const c = Array.isArray(para.content) ? [...para.content] : [];
        para.content = [...c, ...run];
        merged = true;
        break;
      }
    }
    if (!merged) {
      for (const r of run) out.push(r);
    }
  }
  return out;
}

export function partitionContent(content: unknown[]): {
  header: unknown[];
  chapters: { chapter: Record<string, unknown>; body: unknown[] }[];
} {
  const header: unknown[] = [];
  let i = 0;
  while (i < content.length) {
    const n = content[i];
    if (isRecord(n) && n.type === 'chapter') break;
    header.push(n);
    i++;
  }
  const chapters: { chapter: Record<string, unknown>; body: unknown[] }[] = [];
  while (i < content.length) {
    const n = content[i];
    if (!isRecord(n) || n.type !== 'chapter') {
      if (chapters.length === 0) header.push(n);
      else chapters[chapters.length - 1]!.body.push(n);
      i++;
      continue;
    }
    const ch = n as Record<string, unknown>;
    i++;
    const body: unknown[] = [];
    while (i < content.length) {
      const m = content[i];
      if (isRecord(m) && m.type === 'chapter') break;
      body.push(m);
      i++;
    }
    chapters.push({ chapter: ch, body });
  }
  return { header, chapters };
}

/** Split pre-chapter nodes into identification, book titles, and book introduction. */
export function classifyPreChapterNodes(nodes: unknown[]): {
  identification: unknown[];
  bookTitles: unknown[];
  introduction: unknown[];
} {
  const identification: unknown[] = [];
  const bookTitles: unknown[] = [];
  const introduction: unknown[] = [];
  for (const n of nodes) {
    if (isRecord(n) && n.type === 'para' && typeof n.marker === 'string') {
      const marker = n.marker;
      if (isBookTitleParaMarker(marker)) {
        bookTitles.push(n);
      } else if (isIntroductionParaMarker(marker)) {
        introduction.push(n);
      } else {
        identification.push(n);
      }
    } else {
      identification.push(n);
    }
  }
  return { identification, bookTitles, introduction };
}

/** Advance {@link TsState} over USJ blocks in the same order as {@link normalizeStandaloneTranslatorMilestones} + {@link blockToPm}. */
function advanceTsStateForNormalizedBlocks(state: TsState, nodes: unknown[]): void {
  for (const n of normalizeStandaloneTranslatorMilestones(nodes)) {
    advanceTsStateForBlockNode(state, n);
  }
}

function advanceTsStateForBlockNode(state: TsState, node: unknown): void {
  if (!isRecord(node)) return;
  const t = node.type;
  if (t === 'book') {
    advanceTsStateForInlines(state, Array.isArray(node.content) ? node.content : []);
    return;
  }
  if (t === 'para') {
    advanceTsStateForInlines(state, Array.isArray(node.content) ? node.content : []);
    return;
  }
  if (t === 'ms') {
    const inner = Array.isArray(node.content) ? node.content : [];
    if (inner.length === 0) {
      const marker = typeof node.marker === 'string' ? node.marker : 'ts';
      if (isTranslatorTsMarker(marker)) nextTsSection(marker, state);
    }
    return;
  }
}

function advanceTsStateForInlines(state: TsState, items: unknown[]): void {
  for (const item of items) {
    if (typeof item === 'string') continue;
    if (!isRecord(item)) continue;
    const o = item;
    const t = o.type;

    if (t === 'note') {
      advanceTsStateForInlines(state, Array.isArray(o.content) ? o.content : []);
      continue;
    }

    if (t === 'ms') {
      const inner = Array.isArray(o.content) ? o.content : [];
      if (inner.length === 0) {
        const marker = typeof o.marker === 'string' ? o.marker : '';
        if (isTranslatorTsMarker(marker)) nextTsSection(marker, state);
      } else {
        advanceTsStateForInlines(state, inner);
      }
      continue;
    }

    if (t === 'char') {
      advanceTsStateForInlines(state, Array.isArray(o.content) ? o.content : []);
      continue;
    }
  }
}

/** Advance {@link TsState} over chapter bodies omitted from a windowed PM doc (chapters before the first expanded). */
function advanceTsStateForSkippedChapterBodies(
  state: TsState,
  chapters: { chapter: Record<string, unknown>; body: unknown[] }[],
  firstExpandedChapter: number
): void {
  for (const c of chapters) {
    const num = parseInt(String(c.chapter.number ?? '1'), 10);
    if (Number.isFinite(num) && num > 0 && num < firstExpandedChapter) {
      advanceTsStateForNormalizedBlocks(state, c.body);
    }
  }
}

function blockToPm(schema: Schema, node: unknown, state: TsState): PMNode | null {
  if (!isRecord(node)) return null;
  const t = node.type;
  if (t === 'book') {
    const code = typeof node.code === 'string' ? node.code : 'UNK';
    const inner = inlineArrayToFragment(
      schema,
      Array.isArray(node.content) ? node.content : [],
      state
    );
    return schema.nodes.book!.create({ code }, inner);
  }
  if (t === 'para') {
    const marker = typeof node.marker === 'string' ? node.marker : 'p';
    const sid = typeof node.sid === 'string' ? node.sid : null;
    const inner = inlineArrayToFragment(
      schema,
      Array.isArray(node.content) ? node.content : [],
      state
    );
    return schema.nodes.paragraph!.create({ marker, sid }, inner);
  }
  if (t === 'ms') {
    const inner = Array.isArray(node.content) ? node.content : [];
    if (inner.length > 0) {
      return schema.nodes.raw_block!.create({ json: JSON.stringify(node) });
    }
    const marker = typeof node.marker === 'string' ? node.marker : 'ts';
    const tsSection = isTranslatorTsMarker(marker) ? nextTsSection(marker, state) : null;
    return schema.nodes.block_milestone!.create({
      marker,
      sid: typeof node.sid === 'string' ? node.sid : null,
      eid: typeof node.eid === 'string' ? node.eid : null,
      tsSection,
      extra: xAttrsJson(node),
    });
  }
  return schema.nodes.raw_block!.create({ json: JSON.stringify(node) });
}

function inlineArrayToFragment(schema: Schema, items: unknown[], state: TsState): Fragment {
  const nodes = inlineItemsToPm(schema, items, [], state);
  return Fragment.from(nodes);
}

function inlineItemsToPm(
  schema: Schema,
  items: unknown[],
  activeMarks: readonly Mark[],
  state: TsState
): PMNode[] {
  const out: PMNode[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      if (item.length === 0) continue;
      const textNode = schema.text(item, activeMarks);
      out.push(textNode);
      continue;
    }
    if (!isRecord(item)) continue;
    const o = item;
    const t = o.type;

    if (t === 'verse') {
      out.push(
        schema.nodes.verse!.create(
          {
            number: String(o.number ?? '1'),
            sid: typeof o.sid === 'string' ? o.sid : null,
            altnumber: o.altnumber !== undefined ? String(o.altnumber) : null,
            pubnumber: o.pubnumber !== undefined ? String(o.pubnumber) : null,
          },
          undefined,
          activeMarks
        )
      );
      continue;
    }

    if (t === 'note') {
      const marker = typeof o.marker === 'string' ? o.marker : 'f';
      const caller = typeof o.caller === 'string' ? o.caller : '+';
      const inner = inlineItemsToPm(
        schema,
        Array.isArray(o.content) ? o.content : [],
        activeMarks,
        state
      );
      out.push(schema.nodes.note!.create({ marker, caller }, Fragment.from(inner), activeMarks));
      continue;
    }

    if (t === 'figure') {
      out.push(
        schema.nodes.figure!.create(
          {
            marker: typeof o.marker === 'string' ? o.marker : 'fig',
            file: typeof o.file === 'string' ? o.file : null,
            size: o.size !== undefined ? String(o.size) : null,
            ref: typeof o.ref === 'string' ? o.ref : null,
          },
          undefined,
          activeMarks
        )
      );
      continue;
    }

    if (t === 'ms') {
      const inner = Array.isArray(o.content) ? o.content : [];
      if (inner.length > 0) {
        const extra = xAttrsJson(o);
        const mark = schema.marks.milestone!.create({
          marker: typeof o.marker === 'string' ? o.marker : '',
          extra,
        });
        const nextMarks = activeMarks.concat(mark);
        out.push(...inlineItemsToPm(schema, inner, nextMarks, state));
      } else {
        const extra = xAttrsJson(o);
        const marker = typeof o.marker === 'string' ? o.marker : '';
        const tsSection = isTranslatorTsMarker(marker) ? nextTsSection(marker, state) : null;
        out.push(
          schema.nodes.milestone_inline!.create(
            {
              marker,
              sid: typeof o.sid === 'string' ? o.sid : null,
              eid: typeof o.eid === 'string' ? o.eid : null,
              tsSection,
              extra,
            },
            undefined,
            activeMarks
          )
        );
      }
      continue;
    }

    if (t === 'char') {
      const marker = typeof o.marker === 'string' ? o.marker : 'bd';
      const extra = xAttrsJson(o);
      const mark = schema.marks.char!.create({ marker, extra });
      const nextMarks = activeMarks.concat(mark);
      const inner = Array.isArray(o.content) ? o.content : [];
      out.push(...inlineItemsToPm(schema, inner, nextMarks, state));
      continue;
    }

    if (t === 'ref') {
      out.push(schema.nodes.raw_inline!.create({ json: JSON.stringify(o) }));
      continue;
    }

    // Nested unknown — preserve as raw_inline
    out.push(schema.nodes.raw_inline!.create({ json: JSON.stringify(o) }));
  }
  return out;
}

function headerToPm(schema: Schema, nodes: unknown[], state: TsState): PMNode {
  const blocks: PMNode[] = [];
  for (const n of normalizeStandaloneTranslatorMilestones(nodes)) {
    const pm = blockToPm(schema, n, state);
    if (pm) blocks.push(pm);
  }
  return schema.nodes.header!.create({}, Fragment.from(blocks));
}

function bookTitlesToPm(schema: Schema, nodes: unknown[], state: TsState): PMNode {
  const blocks: PMNode[] = [];
  for (const n of normalizeStandaloneTranslatorMilestones(nodes)) {
    const pm = blockToPm(schema, n, state);
    if (pm) blocks.push(pm);
  }
  return schema.nodes.book_titles!.create({}, Fragment.from(blocks));
}

/** Empty introduction: section heading (`\\is1`) plus body paragraph (`\\ip`). */
function defaultEmptyBookIntroductionBlocks(schema: Schema): PMNode[] {
  return [
    schema.nodes.paragraph!.create({ marker: 'is1', sid: null }),
    schema.nodes.paragraph!.create({ marker: 'ip', sid: null }),
  ];
}

function bookIntroductionToPm(schema: Schema, nodes: unknown[], state: TsState): PMNode {
  const blocks: PMNode[] = [];
  for (const n of normalizeStandaloneTranslatorMilestones(nodes)) {
    const pm = blockToPm(schema, n, state);
    if (pm) blocks.push(pm);
  }
  const hasUsjContent = blocks.length > 0;
  if (!hasUsjContent) {
    blocks.push(...defaultEmptyBookIntroductionBlocks(schema));
  }
  return schema.nodes.book_introduction!.create(
    { collapsed: !hasUsjContent },
    Fragment.from(blocks)
  );
}

export function chapterToPm(
  schema: Schema,
  chapter: Record<string, unknown>,
  body: unknown[],
  options?: { readonly?: boolean },
  state?: TsState
): PMNode {
  const num = parseInt(String(chapter.number ?? '1'), 10);
  const numStr = String(Number.isFinite(num) && num > 0 ? num : 1);

  const label = schema.nodes.chapter_label!.create(
    {},
    numStr ? schema.text(numStr) : undefined
  );

  const tsState = state ?? { section: 1, openSection: null };
  const blocks: PMNode[] = [];
  for (const n of normalizeStandaloneTranslatorMilestones(body)) {
    const pm = blockToPm(schema, n, tsState);
    if (pm) blocks.push(pm);
  }
  return schema.nodes.chapter!.create(
    {
      sid: typeof chapter.sid === 'string' ? chapter.sid : null,
      altnumber: chapter.altnumber !== undefined ? String(chapter.altnumber) : null,
      pubnumber: chapter.pubnumber !== undefined ? String(chapter.pubnumber) : null,
      readonly: options?.readonly ?? false,
    },
    Fragment.from([label, ...blocks])
  );
}

/**
 * Build a ProseMirror `doc` from a USJ document object.
 */
export function usjDocumentToPm(
  doc: { type?: string; version?: string; content?: unknown[] },
  schema: Schema = usfmSchema
): PMNode {
  const content = Array.isArray(doc.content) ? doc.content : [];
  const { header, chapters } = partitionContent(content);
  const { identification, bookTitles, introduction } = classifyPreChapterNodes(header);
  const tsState: TsState = { section: 1, openSection: null };
  const parts: PMNode[] = [];
  if (identification.length > 0) parts.push(headerToPm(schema, identification, tsState));
  if (bookTitles.length > 0) parts.push(bookTitlesToPm(schema, bookTitles, tsState));
  parts.push(bookIntroductionToPm(schema, introduction, tsState));

  if (chapters.length === 0) {
    const label = schema.nodes.chapter_label!.create({}, schema.text('1'));
    const emptyPara = schema.nodes.paragraph!.create({ marker: 'p', sid: null });
    const ch = schema.nodes.chapter!.create(
      { sid: null, altnumber: null, pubnumber: null, readonly: false },
      Fragment.from([label, emptyPara])
    );
    parts.push(ch);
    return schema.nodes.doc!.create({}, Fragment.from(parts));
  }
  parts.push(...chapters.map((c) => chapterToPm(schema, c.chapter, c.body, { readonly: false }, tsState)));
  return schema.nodes.doc!.create({}, Fragment.from(parts));
}

/** Section selection for windowed editing. */
export type WindowSectionId =
  | { type: 'introduction' }
  | { type: 'chapter'; chapter: number };

export interface ChapterSubsetToPmOptions {
  /** Editable chapter numbers (user selection). */
  visibleChapters: number[];
  /** Include `\imt`/`\ip`/… introduction blocks from chapter 0. */
  showIntroduction?: boolean;
  /** Extra chapters before/after each selected chapter (read-only context). Default 1. */
  contextChapters?: number;
}

export function expandChaptersWithContext(
  selected: number[],
  context: number,
  maxChapter: number
): { chapter: number; readonly: boolean }[] {
  if (selected.length === 0 || maxChapter < 1) return [];
  const selectedSet = new Set(selected);
  const set = new Set<number>();
  for (const c of selected) {
    for (let d = -context; d <= context; d++) {
      const nc = c + d;
      if (nc >= 1 && nc <= maxChapter) set.add(nc);
    }
  }
  return [...set]
    .sort((a, b) => a - b)
    .map((chapter) => ({
      chapter,
      readonly: !selectedSet.has(chapter),
    }));
}

/**
 * Build a windowed ProseMirror document from a {@link DocumentStore} (subset of chapters + context).
 */
export function chapterSubsetToPm(
  store: DocumentStore,
  options: ChapterSubsetToPmOptions,
  schema: Schema = usfmSchema
): PMNode {
  const maxChapter = store.getChapterCount();
  const contextN = options.contextChapters ?? 1;
  let selected = [...options.visibleChapters].filter((c) => c >= 1 && c <= maxChapter);
  if (selected.length === 0 && maxChapter >= 1) {
    selected = [1];
  }
  const expanded = expandChaptersWithContext(selected, contextN, maxChapter);

  const usj = store.getFullUSJ();
  const content = Array.isArray(usj.content) ? usj.content : [];
  const { header, chapters } = partitionContent(content);
  const { identification, bookTitles, introduction } = classifyPreChapterNodes(header);

  const tsState: TsState = { section: 1, openSection: null };

  const parts: PMNode[] = [];
  if (identification.length > 0) parts.push(headerToPm(schema, identification, tsState));
  if (bookTitles.length > 0) parts.push(bookTitlesToPm(schema, bookTitles, tsState));
  const introNodes = options.showIntroduction ? introduction : [];
  parts.push(bookIntroductionToPm(schema, introNodes, tsState));

  if (expanded.length > 0) {
    advanceTsStateForSkippedChapterBodies(tsState, chapters, expanded[0]!.chapter);
  }

  if (chapters.length === 0) {
    const label = schema.nodes.chapter_label!.create({}, schema.text('1'));
    const emptyPara = schema.nodes.paragraph!.create({ marker: 'p', sid: null });
    parts.push(
      schema.nodes.chapter!.create(
        { sid: null, altnumber: null, pubnumber: null, readonly: false },
        Fragment.from([label, emptyPara])
      )
    );
    return schema.nodes.doc!.create({}, Fragment.from(parts));
  }

  const byNum = new Map<number, { chapter: Record<string, unknown>; body: unknown[] }>();
  for (const c of chapters) {
    const num = parseInt(String(c.chapter.number ?? '1'), 10);
    if (Number.isFinite(num) && num > 0) {
      byNum.set(num, c);
    }
  }

  for (const { chapter: chNum, readonly } of expanded) {
    const pair = byNum.get(chNum);
    if (pair) {
      parts.push(chapterToPm(schema, pair.chapter, pair.body, { readonly }, tsState));
    }
  }

  if (!parts.some((p) => p.type.name === 'chapter')) {
    const label = schema.nodes.chapter_label!.create({}, schema.text('1'));
    const emptyPara = schema.nodes.paragraph!.create({ marker: 'p', sid: null });
    parts.push(
      schema.nodes.chapter!.create(
        { sid: null, altnumber: null, pubnumber: null, readonly: false },
        Fragment.from([label, emptyPara])
      )
    );
  }

  return schema.nodes.doc!.create({}, Fragment.from(parts));
}
