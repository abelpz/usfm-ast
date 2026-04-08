/**
 * Serialize a ProseMirror document back to USJ-shaped JSON.
 */

import type { Mark, Node as PMNode, Schema } from 'prosemirror-model';
import type { UsjDocument } from '@usfm-tools/types';

function mergeCharExtra(char: Record<string, unknown>, extraJson: string): void {
  if (!extraJson || extraJson === '{}') return;
  try {
    const o = JSON.parse(extraJson) as Record<string, string>;
    for (const k of Object.keys(o)) {
      if (k.startsWith('x-')) char[k] = o[k];
    }
  } catch {
    /* ignore */
  }
}

function wrapText(text: string, marks: readonly Mark[]): unknown {
  if (!text) return null;
  let inner: unknown = text;
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i]!;
    if (m.type.name === 'char') {
      const ch: Record<string, unknown> = {
        type: 'char',
        marker: m.attrs.marker,
        content: Array.isArray(inner) ? inner : [inner],
      };
      mergeCharExtra(ch, String(m.attrs.extra ?? '{}'));
      inner = ch;
    } else if (m.type.name === 'milestone') {
      const ms: Record<string, unknown> = {
        type: 'ms',
        marker: m.attrs.marker,
        content: Array.isArray(inner) ? inner : [inner],
      };
      mergeCharExtra(ms, String(m.attrs.extra ?? '{}'));
      inner = ms;
    }
  }
  return inner;
}

function fragmentToInline(fragment: import('prosemirror-model').Fragment): unknown[] {
  const out: unknown[] = [];
  fragment.forEach((node) => {
    if (node.isText) {
      const w = wrapText(node.text ?? '', node.marks);
      if (w !== null) out.push(w);
      return;
    }
    const name = node.type.name;
    if (name === 'verse') {
      out.push({
        type: 'verse',
        marker: 'v',
        number: node.attrs.number,
        ...(node.attrs.sid ? { sid: node.attrs.sid } : {}),
        ...(node.attrs.altnumber ? { altnumber: node.attrs.altnumber } : {}),
        ...(node.attrs.pubnumber ? { pubnumber: node.attrs.pubnumber } : {}),
      });
      return;
    }
    if (name === 'note') {
      const inner = fragmentToInline(node.content);
      out.push({
        type: 'note',
        marker: node.attrs.marker,
        caller: node.attrs.caller,
        content: inner,
      });
      return;
    }
    if (name === 'figure') {
      out.push({
        type: 'figure',
        marker: node.attrs.marker,
        ...(node.attrs.file ? { file: node.attrs.file } : {}),
        ...(node.attrs.size ? { size: node.attrs.size } : {}),
        ...(node.attrs.ref ? { ref: node.attrs.ref } : {}),
      });
      return;
    }
    if (name === 'milestone_inline') {
      const ms: Record<string, unknown> = {
        type: 'ms',
        marker: node.attrs.marker,
      };
      if (node.attrs.sid) ms.sid = node.attrs.sid;
      if (node.attrs.eid) ms.eid = node.attrs.eid;
      mergeCharExtra(ms, String(node.attrs.extra ?? '{}'));
      out.push(ms);
      return;
    }
    if (name === 'raw_inline') {
      try {
        out.push(JSON.parse(String(node.attrs.json ?? '{}')));
      } catch {
        out.push({ type: 'unknown', raw: node.attrs.json });
      }
      return;
    }
    if (name === 'hard_break') {
      out.push('\n');
      return;
    }
  });
  return out;
}

export function blockToUsj(node: PMNode): unknown {
  const name = node.type.name;
  if (name === 'book') {
    const inner = fragmentToInline(node.content);
    return { type: 'book', marker: 'id', code: node.attrs.code, content: inner };
  }
  if (name === 'paragraph') {
    const inner = fragmentToInline(node.content);
    const p: Record<string, unknown> = {
      type: 'para',
      marker: node.attrs.marker,
      content: inner,
    };
    if (node.attrs.sid) p.sid = node.attrs.sid;
    return p;
  }
  if (name === 'block_milestone') {
    const ms: Record<string, unknown> = {
      type: 'ms',
      marker: node.attrs.marker,
    };
    if (node.attrs.sid) ms.sid = node.attrs.sid;
    if (node.attrs.eid) ms.eid = node.attrs.eid;
    mergeCharExtra(ms, String(node.attrs.extra ?? '{}'));
    return ms;
  }
  if (name === 'raw_block') {
    try {
      return JSON.parse(String(node.attrs.json ?? '{}'));
    } catch {
      return { type: 'unknown', raw: node.attrs.json };
    }
  }
  return null;
}

function pushBlocksToContent(container: PMNode, content: unknown[]): void {
  container.content.forEach((block) => {
    const u = blockToUsj(block);
    if (u !== null) content.push(u);
  });
}

/** True when the introduction has no text / inline content to serialize (placeholder-only). */
export function isBookIntroductionPmEmpty(node: PMNode): boolean {
  if (node.type.name !== 'book_introduction') return false;
  let has = false;
  node.content.forEach((ch) => {
    if (ch.type.name === 'paragraph' || ch.type.name === 'book') {
      if (ch.content.size > 0 || ch.textContent.trim() !== '') has = true;
    } else {
      has = true;
    }
  });
  return !has;
}

/**
 * Serialize one `chapter` PM node to USJ nodes: `[chapterMarker, ...bodyBlocks]`.
 */
export function pmChapterToUsjNodes(chapterPm: PMNode): unknown[] {
  const out: unknown[] = [];
  if (chapterPm.type.name !== 'chapter') return out;
  let number: number | string = 1;
  chapterPm.content.forEach((child) => {
    if (child.type.name === 'chapter_label') {
      const raw = child.textContent.trim();
      const parsed = parseInt(raw, 10);
      number = Number.isFinite(parsed) && parsed > 0 ? parsed : raw || 1;
    }
  });
  const ch: Record<string, unknown> = {
    type: 'chapter',
    marker: 'c',
    number,
  };
  if (chapterPm.attrs.sid) ch.sid = chapterPm.attrs.sid;
  if (chapterPm.attrs.altnumber) ch.altnumber = chapterPm.attrs.altnumber;
  if (chapterPm.attrs.pubnumber) ch.pubnumber = chapterPm.attrs.pubnumber;
  out.push(ch);
  chapterPm.content.forEach((block) => {
    if (block.type.name === 'chapter_label') return;
    const u = blockToUsj(block);
    if (u !== null) out.push(u);
  });
  return out;
}

/**
 * Serialize a PM `doc` to `UsjDocument` shape.
 */
export function pmDocumentToUsj(pm: PMNode, version = '3.1'): UsjDocument {
  const content: unknown[] = [];
  pm.content.forEach((node) => {
    if (node.type.name === 'header') {
      pushBlocksToContent(node, content);
      return;
    }
    if (node.type.name === 'book_titles') {
      pushBlocksToContent(node, content);
      return;
    }
    if (node.type.name === 'book_introduction') {
      if (!isBookIntroductionPmEmpty(node)) {
        pushBlocksToContent(node, content);
      }
      return;
    }
    if (node.type.name === 'chapter') {
      content.push(...pmChapterToUsjNodes(node));
    }
  });

  return {
    type: 'USJ',
    version,
    content: content as UsjDocument['content'],
  };
}

/** Flatten `header` / `book_titles` / `book_introduction` PM sections into USJ nodes (chapter 0 prefix). */
export function preChapterPmSectionsToUsjNodes(pm: PMNode): unknown[] {
  const out: unknown[] = [];
  pm.content.forEach((node) => {
    if (node.type.name === 'header' || node.type.name === 'book_titles') {
      pushBlocksToContent(node, out);
      return;
    }
    if (node.type.name === 'book_introduction') {
      if (!isBookIntroductionPmEmpty(node)) {
        pushBlocksToContent(node, out);
      }
    }
  });
  return out;
}
