/**
 * High-level document API: USFM/USJ, chapter slices, editable + alignment views.
 */

import { convertUSJDocumentToUSFM } from '@usfm-tools/adapters';
import { USFMParser } from '@usfm-tools/parser';
import type { AlignmentMap, EditableUSJ } from '@usfm-tools/types';
import { stripAlignments } from './alignment-layer';
import { applyOperations as applyContentOpsToNodes } from './operation-engine';
import type { Operation } from './operations';
import { rebuildAlignedUsj } from './rebuild-aligned';
import { splitUsjByChapter, type ChapterSlice } from './chapter-chunker';
import type { USFMRef } from './types';
import { findVerseInlineNodes, usfmRefToVerseSid } from './verse-ref';
import { diffUsjDocuments } from './document-diff';

export type UsjDocument = { type: 'USJ'; version: string; content: unknown[] };

export type DocumentChangeListener = (ops: Operation[], chapter: number | undefined) => void;

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function chapterFromContentOp(op: Operation): number {
  if (op.type === 'moveNode') return op.from.chapter;
  if (
    op.type === 'insertNode' ||
    op.type === 'removeNode' ||
    op.type === 'replaceNode' ||
    op.type === 'setText' ||
    op.type === 'setAttr'
  ) {
    return op.path.chapter;
  }
  throw new Error(`chapterFromContentOp: not a content operation (${(op as Operation).type})`);
}

export class DocumentStore {
  private usj: UsjDocument;
  private readonly parser: USFMParser;
  private readonly changeListeners: DocumentChangeListener[] = [];

  constructor(options?: { silentConsole?: boolean }) {
    this.usj = { type: 'USJ', version: '3.1', content: [] };
    this.parser = new USFMParser({ silentConsole: options?.silentConsole ?? true });
  }

  /** Subscribe to mutations after successful updates. */
  onChange(listener: DocumentChangeListener): () => void {
    this.changeListeners.push(listener);
    return () => {
      const i = this.changeListeners.indexOf(listener);
      if (i >= 0) this.changeListeners.splice(i, 1);
    };
  }

  private emitChange(ops: Operation[], chapter: number | undefined): void {
    for (const l of this.changeListeners) {
      l(ops, chapter);
    }
  }

  loadUSFM(usfm: string): void {
    this.parser.parse(usfm);
    this.usj = this.parser.toJSON() as UsjDocument;
  }

  loadUSJ(usj: UsjDocument): void {
    this.usj = deepClone(usj);
  }

  getBookCode(): string {
    const book = this.usj.content.find(
      (n) => n && typeof n === 'object' && (n as { type?: string }).type === 'book'
    ) as { code?: string } | undefined;
    return (book?.code ?? 'UNK').toString().toUpperCase();
  }

  getVersion(): string {
    return this.usj.version ?? '3.1';
  }

  getChapterCount(): number {
    return splitUsjByChapter(this.usj).filter((s) => s.chapter > 0).length;
  }

  /**
   * Largest `\\c` chapter number present (e.g. a lone chapter `\\c 21` yields 21).
   * Use this for navigation / windowing bounds — not {@link getChapterCount}, which is how many
   * chapter slices exist (often much smaller than the highest number).
   */
  getMaxChapterNumber(): number {
    let max = 0;
    for (const s of splitUsjByChapter(this.usj)) {
      if (s.chapter > 0 && s.chapter > max) max = s.chapter;
    }
    return max;
  }

  /** First positive `\\c` chapter in document order, or `1` if none. */
  getFirstChapterNumber(): number {
    for (const s of splitUsjByChapter(this.usj)) {
      if (s.chapter > 0) return s.chapter;
    }
    return 1;
  }

  getChapter(chapter: number): ChapterSlice | undefined {
    return splitUsjByChapter(this.usj).find((s) => s.chapter === chapter);
  }

  getFullUSJ(): UsjDocument {
    return deepClone(this.usj);
  }

  /**
   * Inline USJ fragments for one verse (`sid` from `ref`), walking nested paragraph content.
   */
  getVerse(ref: USFMRef): unknown[] {
    const book = 'book' in ref ? ref.book : this.getBookCode();
    const sid = usfmRefToVerseSid(book, ref);
    if (!sid) return [];
    return findVerseInlineNodes(this.usj.content, sid);
  }

  getEditableChapter(chapter: number): { editable: EditableUSJ; alignments: AlignmentMap } {
    const slice = splitUsjByChapter(this.usj).find((s) => s.chapter === chapter);
    if (!slice) {
      return {
        editable: { type: 'EditableUSJ', version: this.getVersion(), content: [] },
        alignments: {},
      };
    }
    const doc = { type: 'USJ' as const, version: this.usj.version, content: slice.nodes };
    return stripAlignments(doc);
  }

  /** Alignment map for one chapter slice (same keys as {@link getEditableChapter}). */
  getAlignments(chapter: number): AlignmentMap {
    return this.getEditableChapter(chapter).alignments;
  }

  /**
   * Replace alignments for a chapter while keeping the current editable nodes from the store.
   * Rebuilds aligned USJ and splices the chapter slice.
   */
  updateAlignments(chapter: number, alignments: AlignmentMap): void {
    const { editable } = this.getEditableChapter(chapter);
    this.updateEditableChapter(chapter, editable, alignments);
  }

  /**
   * Plan alias: same as {@link updateEditableChapter} (editable USJ slice + alignment map).
   */
  updateEditableContent(
    chapter: number,
    editable: EditableUSJ,
    alignments: AlignmentMap
  ): void {
    this.updateEditableChapter(chapter, editable, alignments);
  }

  /**
   * Replace a chapter slice with rebuilt USJ from editable content + alignment map.
   */
  replaceChapterNodes(chapter: number, newNodes: unknown[]): void {
    const slices = splitUsjByChapter(this.usj);
    const idx = slices.findIndex((s) => s.chapter === chapter);
    if (idx < 0) return;
    const slice = slices[idx];
    const start = this.usj.content.indexOf(slice.nodes[0] as object);
    const next = slices[idx + 1];
    const end = next ? this.usj.content.indexOf(next.nodes[0] as object) : this.usj.content.length;
    if (start < 0) return;
    this.usj.content.splice(start, Math.max(0, end - start), ...newNodes);
  }

  /**
   * Replace an existing chapter slice, or insert `newNodes` in chapter order when the slice
   * is new (e.g. after inserting `\\c` in the editor).
   */
  /**
   * Remove a chapter slice and append its body (everything after the `\\c` node) to the end of
   * the previous slice (chapter 0 intro or the prior chapter). Does nothing if the chapter is
   * missing, is chapter 0, or has no previous slice.
   */
  mergeChapterIntoPrevious(chapter: number): boolean {
    if (chapter <= 0) return false;
    const slices = splitUsjByChapter(this.usj);
    const idx = slices.findIndex((s) => s.chapter === chapter);
    if (idx <= 0) return false;
    const cur = slices[idx]!;
    if (cur.chapter !== chapter) return false;
    const prev = slices[idx - 1]!;
    const body = cur.nodes.slice(1);
    const nextSlice = slices[idx + 1];
    const startCur = this.usj.content.indexOf(cur.nodes[0] as object);
    if (startCur < 0) return false;
    const endCur = nextSlice
      ? this.usj.content.indexOf(nextSlice.nodes[0] as object)
      : this.usj.content.length;
    const lastPrev = prev.nodes[prev.nodes.length - 1] as object;
    const insertBase = this.usj.content.indexOf(lastPrev);
    if (insertBase < 0) return false;
    this.usj.content.splice(startCur, Math.max(0, endCur - startCur));
    const insertAt = this.usj.content.indexOf(lastPrev) + 1;
    if (body.length > 0) {
      this.usj.content.splice(insertAt, 0, ...body);
    }
    this.emitChange([], undefined);
    return true;
  }

  /**
   * Remove a chapter slice and all its body nodes entirely (no merge into previous).
   * Returns false when the chapter is not found.
   */
  deleteChapterSlice(chapter: number): boolean {
    const slices = splitUsjByChapter(this.usj);
    const idx = slices.findIndex((s) => s.chapter === chapter);
    if (idx < 0) return false;
    const cur = slices[idx]!;
    const start = this.usj.content.indexOf(cur.nodes[0] as object);
    if (start < 0) return false;
    const next = slices[idx + 1];
    const end = next ? this.usj.content.indexOf(next.nodes[0] as object) : this.usj.content.length;
    this.usj.content.splice(start, Math.max(0, end - start));
    this.emitChange([], undefined);
    return true;
  }

  /**
   * Change a chapter's marker number and move its slice to canonical chapter order.
   * Fails when `oldChapter` is missing, `newChapter` is not a finite integer ≥ 1, or a different
   * chapter already uses `newChapter`.
   */
  relocateChapterNumber(oldChapter: number, newChapter: number): boolean {
    if (!Number.isFinite(newChapter) || newChapter < 1 || oldChapter < 1) return false;
    if (oldChapter === newChapter) return true;
    if (!this.getChapter(oldChapter)) return false;
    if (this.getChapter(newChapter)) return false;
    const slices = splitUsjByChapter(this.usj);
    const idx = slices.findIndex((s) => s.chapter === oldChapter);
    if (idx < 0) return false;
    const cur = slices[idx]!;
    const newNodes = deepClone(cur.nodes) as unknown[];
    const first = newNodes[0];
    if (!first || typeof first !== 'object' || (first as { type?: string }).type !== 'chapter') {
      return false;
    }
    (first as { number: string | number }).number = String(newChapter);
    const nextAfterOld = slices[idx + 1];
    const startOld = this.usj.content.indexOf(cur.nodes[0] as object);
    if (startOld < 0) return false;
    const endOld = nextAfterOld
      ? this.usj.content.indexOf(nextAfterOld.nodes[0] as object)
      : this.usj.content.length;
    this.usj.content.splice(startOld, Math.max(0, endOld - startOld));
    const slicesAfter = splitUsjByChapter(this.usj);
    const insertBefore = slicesAfter.find((s) => s.chapter > newChapter);
    if (insertBefore) {
      const pos = this.usj.content.indexOf(insertBefore.nodes[0] as object);
      if (pos >= 0) {
        this.usj.content.splice(pos, 0, ...newNodes);
      } else {
        this.usj.content.push(...newNodes);
      }
    } else {
      const positive = slicesAfter.filter((s) => s.chapter > 0);
      if (positive.length === 0) {
        this.usj.content.push(...newNodes);
      } else {
        const last = positive[positive.length - 1]!;
        const lastNode = last.nodes[last.nodes.length - 1] as object;
        const posAfter = this.usj.content.indexOf(lastNode);
        if (posAfter < 0) {
          this.usj.content.push(...newNodes);
        } else {
          this.usj.content.splice(posAfter + 1, 0, ...newNodes);
        }
      }
    }
    this.emitChange([], undefined);
    return true;
  }

  upsertChapterNodes(chapter: number, newNodes: unknown[]): void {
    const slices = splitUsjByChapter(this.usj);
    if (slices.some((s) => s.chapter === chapter)) {
      this.replaceChapterNodes(chapter, newNodes);
      return;
    }
    const insertBefore = slices.find((s) => s.chapter > chapter);
    if (insertBefore) {
      const pos = this.usj.content.indexOf(insertBefore.nodes[0] as object);
      if (pos >= 0) {
        this.usj.content.splice(pos, 0, ...newNodes);
        return;
      }
    }
    const positive = slices.filter((s) => s.chapter > 0);
    if (positive.length === 0) {
      this.usj.content.push(...newNodes);
      return;
    }
    const last = positive[positive.length - 1]!;
    const lastNode = last.nodes[last.nodes.length - 1] as object;
    const posAfter = this.usj.content.indexOf(lastNode);
    if (posAfter < 0) {
      this.usj.content.push(...newNodes);
      return;
    }
    this.usj.content.splice(posAfter + 1, 0, ...newNodes);
  }

  /** Plan name for {@link replaceChapterNodes}. */
  replaceChapter(chapter: number, nodes: unknown[]): void {
    this.replaceChapterNodes(chapter, nodes);
  }

  /** Merge edited chapter + alignments back into the book USJ. */
  updateEditableChapter(chapter: number, editable: EditableUSJ, alignments: AlignmentMap): void {
    const rebuilt = rebuildAlignedUsj(editable, alignments);
    this.replaceChapterNodes(chapter, rebuilt.content);
    this.emitChange([], chapter);
  }

  /**
   * Apply content operations whose `NodePath.chapter` matches a chapter slice. Alignment ops are
   * skipped (handle via {@link updateAlignments}).
   */
  applyOperations(ops: Operation[]): void {
    const byChapter = new Map<number, Operation[]>();
    for (const op of ops) {
      if (op.type === 'alignWord' || op.type === 'unalignWord' || op.type === 'updateGroup') {
        continue;
      }
      const ch = chapterFromContentOp(op);
      const list = byChapter.get(ch);
      if (list) list.push(op);
      else byChapter.set(ch, [op]);
    }
    for (const [ch, list] of byChapter) {
      const slice = this.getChapter(ch);
      if (!slice) continue;
      const mutable = deepClone(slice.nodes);
      applyContentOpsToNodes(mutable, list);
      this.replaceChapterNodes(ch, mutable);
    }
    this.emitChange(ops, undefined);
  }

  /**
   * Serialize whole book or one chapter slice to USFM.
   * @param chapter — when set, only nodes in that chapter slice (see {@link getChapter}).
   */
  toUSFM(chapter?: number): string {
    if (chapter === undefined) {
      return convertUSJDocumentToUSFM(this.usj);
    }
    const slice = this.getChapter(chapter);
    if (!slice || slice.nodes.length === 0) {
      return '';
    }
    return convertUSJDocumentToUSFM({
      version: this.getVersion(),
      content: slice.nodes,
    });
  }

  /**
   * Structural diff between two stores: chapter-sliced comparison and recursive node ops
   * ({@link diffUsjDocuments}).
   */
  diff(other: DocumentStore): Operation[] {
    return diffUsjDocuments(this.getFullUSJ(), other.getFullUSJ());
  }
}
