/**
 * Split flat USJ root `content` into chapter-sized slices at each `\\c` marker.
 * Intro material before the first `\\c` is **chapter 0** (headers / identification).
 */

export interface ChapterSlice {
  /** Three-letter book code from `\\id` when present; otherwise `UNK` */
  bookCode: string;
  /** `0` = content before the first chapter marker; otherwise `\\c` number */
  chapter: number;
  /** USJ nodes belonging to this slice (includes the `chapter` node when chapter ≥ 1) */
  nodes: unknown[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getBookCode(nodes: unknown[]): string {
  for (const n of nodes) {
    if (!isRecord(n)) continue;
    if (n.type === 'book' && typeof n.code === 'string' && n.code.trim()) {
      return n.code.trim().toUpperCase();
    }
  }
  return 'UNK';
}

function isChapterNode(n: unknown): n is { type: 'chapter'; number: string | number } {
  return isRecord(n) && n.type === 'chapter' && n.number !== undefined;
}

/**
 * Split a USJ document’s `content` array into slices. Each slice starts at a `chapter` node
 * (except chapter `0`, which starts at the first node).
 */
export function splitUsjByChapter(doc: { content?: unknown[] }): ChapterSlice[] {
  const content = doc.content ?? [];
  const bookCode = getBookCode(content);
  const slices: ChapterSlice[] = [];
  let buffer: unknown[] = [];
  let sliceChapter = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    slices.push({ bookCode, chapter: sliceChapter, nodes: buffer });
    buffer = [];
  };

  for (const node of content) {
    if (isChapterNode(node)) {
      flush();
      const n = parseInt(String(node.number), 10);
      sliceChapter = Number.isFinite(n) ? n : sliceChapter;
      buffer.push(node);
    } else {
      buffer.push(node);
    }
  }
  flush();

  return slices;
}

/** Build a minimal USJ document object from one slice (for serialization helpers). */
export function chapterSliceToUsjDocument(
  slice: ChapterSlice,
  version: string
): { type: 'USJ'; version: string; content: unknown[] } {
  return { type: 'USJ', version, content: slice.nodes };
}

/** Class wrapper (plan name: `ChapterChunker`). */
export class ChapterChunker {
  split(doc: { content?: unknown[] }): ChapterSlice[] {
    return splitUsjByChapter(doc);
  }
}
