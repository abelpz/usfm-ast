/**
 * ProseMirror commands for USFM-style editing.
 */

import { splitBlock } from 'prosemirror-commands';
import { Fragment } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';

import { getStructuralInsertions } from './marker-context';

/**
 * Paragraph markers that should NOT be continued on Enter — instead a plain `\p` is created.
 * Structural / heading markers that only make sense as one-liners.
 */
const TERMINAL_PARA_MARKERS = new Set([
  's', 's1', 's2', 's3', 's4',
  'ms', 'ms1', 'ms2', 'ms3', 'mr',
  'r', 'sp', 'd', 'cl', 'cp', 'b',
]);

/**
 * Node types that must never be duplicated by Enter — pressing Enter inside them
 * inserts a fresh `\p` paragraph after the block instead of splitting it.
 */
const SINGLETON_BLOCK_TYPES = new Set([
  'book',
  'header',
  'book_titles',
  'raw_block',
  'block_milestone',
]);

/**
 * Smart Enter for USFM paragraphs.
 * - `book` (`\id`), `header`, `book_titles`, `raw_block`, `block_milestone` → insert a fresh `\p` after the block.
 * - Heading / structural paragraph markers (`\s1`, `\r`, `\sp`, …) → fresh `\p` on split.
 * - All other paragraph markers (`\p`, `\q1`, `\m`, …) → `splitBlock` (preserves the marker).
 * - Outside a known block → `splitBlock` fallback.
 */
export function splitParagraphSmart(): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const pType = state.schema.nodes.paragraph;

    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);

      // Singleton blocks must not be duplicated — insert \p after the block.
      if (SINGLETON_BLOCK_TYPES.has(node.type.name)) {
        if (!pType) return false;
        const blockEnd = $from.after(d);
        const newP = pType.create({ marker: 'p', sid: null });
        const tr = state.tr.insert(blockEnd, newP);
        const cursorPos = blockEnd + 1;
        if (dispatch) dispatch(tr.setSelection(TextSelection.create(tr.doc, cursorPos)).scrollIntoView());
        return true;
      }

      if (node.type.name === 'paragraph') {
        const marker = String(node.attrs.marker ?? 'p');
        if (!TERMINAL_PARA_MARKERS.has(marker)) break; // let splitBlock continue same marker

        // Terminal marker: move trailing content to a new \p.
        if (!pType) return false;
        const cutPos = $from.pos;
        const paraEnd = $from.after(d);
        const afterFrag = state.doc.slice(cutPos, paraEnd - 1).content;
        const newP = pType.create({ marker: 'p', sid: null }, afterFrag);

        let tr = state.tr;
        if (cutPos < paraEnd - 1) tr = tr.delete(cutPos, paraEnd - 1);
        const insertPos = tr.mapping.map(paraEnd);
        tr = tr.insert(insertPos, newP);
        const cursorPos = insertPos + 1;
        if (dispatch) dispatch(tr.setSelection(TextSelection.create(tr.doc, cursorPos)).scrollIntoView());
        return true;
      }
    }
    return splitBlock(state, dispatch);
  };
}

import { nextChapterNumberForSelection } from './chapter-number';
import { nextVerseNumberForSelection } from './verse-number';

function findParentParagraph(state: import('prosemirror-state').EditorState): {
  pos: number;
  depth: number;
} | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'paragraph') return { pos: $from.before(d), depth: d };
  }
  return null;
}

/** Insert a `verse` atom at the cursor (or at the end of the current paragraph). */
export function insertVerse(number: string): Command {
  return (state, dispatch) => {
    const v = state.schema.nodes.verse;
    if (!v) return false;
    const node = v.create({
      number,
      sid: null,
      altnumber: null,
      pubnumber: null,
    });
    const tr = state.tr.replaceSelectionWith(node, false);
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}

/** Insert a `verse` atom using {@link nextVerseNumberForSelection} (per-chapter next number, or `1`). */
export function insertNextVerse(): Command {
  return (state, dispatch) => {
    const n = nextVerseNumberForSelection(state);
    return insertVerse(n)(state, dispatch);
  };
}

/** Change the paragraph marker for the paragraph containing the selection. */
export function changeParagraphMarker(marker: string): Command {
  return (state, dispatch) => {
    const found = findParentParagraph(state);
    if (!found) return false;
    const { depth } = found;
    const { $from } = state.selection;
    const tr = state.tr.setNodeMarkup($from.before(depth), undefined, {
      ...$from.node(depth).attrs,
      marker,
    });
    if (dispatch) dispatch(tr);
    return true;
  };
}

/** Toggle a character mark (`bd`, `it`, `nd`, …) on the selection. */
export function toggleCharMarker(marker: string): Command {
  return (state, dispatch) => {
    const markType = state.schema.marks.char;
    if (!markType) return false;
    const { from, to, empty } = state.selection;
    if (empty) return false;

    const mark = markType.create({ marker, extra: '{}' });
    let has = false;
    state.doc.nodesBetween(from, to, (node) => {
      if (node.isText && mark.isInSet(node.marks)) has = true;
    });

    let tr = state.tr;
    if (has) tr = tr.removeMark(from, to, mark);
    else tr = tr.addMark(from, to, mark);
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}

/** Insert a footnote / cross-reference note. */
export function insertNote(marker: string, caller: string): Command {
  return (state, dispatch) => {
    const noteType = state.schema.nodes.note;
    if (!noteType) return false;
    const inner = state.schema.text(' ');
    const n = noteType.create({ marker, caller }, inner);
    const tr = state.tr.replaceSelectionWith(n, false);
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}

/**
 * Insert a new `chapter` block.
 *
 * When the caret is inside a paragraph within a chapter the command **splits at the
 * cursor**: the content after the caret (and all subsequent blocks in the current
 * chapter) move into the new chapter.  Marks that span the split point are properly
 * closed in the first half and re-opened in the second.
 *
 * When the caret is in the `header` / `book_titles` / `book_introduction` the new
 * chapter is appended at the end of the document.
 */
export function insertChapter(number: string): Command {
  return (state, dispatch) => {
    const chType = state.schema.nodes.chapter;
    const pType = state.schema.nodes.paragraph;
    if (!chType || !pType) return false;

    const labelType = state.schema.nodes.chapter_label;
    if (!labelType) return false;

    const n = parseInt(String(number).trim(), 10);
    const num = Number.isFinite(n) && n > 0 ? n : 1;

    const { $from } = state.selection;

    let chapterDepth: number | null = null;
    let paraDepth: number | null = null;
    for (let d = $from.depth; d > 0; d--) {
      const name = $from.node(d).type.name;
      if (name === 'chapter' && chapterDepth === null) chapterDepth = d;
      if (name === 'paragraph' && paraDepth === null) paraDepth = d;
    }

    const label = labelType.create({}, state.schema.text(String(num)));

    if (chapterDepth !== null && paraDepth !== null && paraDepth > chapterDepth) {
      const paraNode = $from.node(paraDepth);
      const marker = String(paraNode.attrs.marker ?? 'p');
      const cursorPos = $from.pos;
      const paraEndContent = $from.after(paraDepth) - 1;
      const chapterEndContent = $from.after(chapterDepth) - 1;
      const paraAfter = $from.after(paraDepth);

      const tailContent = state.doc.slice(cursorPos, paraEndContent).content;

      const trailingBlocks =
        paraAfter < chapterEndContent
          ? state.doc.slice(paraAfter, chapterEndContent).content
          : Fragment.empty;

      const tailPara = pType.create(
        { marker, sid: null },
        tailContent.size > 0 ? tailContent : undefined
      );
      const newChapterContent = Fragment.from([label, tailPara]).append(trailingBlocks);
      const chNode = chType.create(
        { sid: null, altnumber: null, pubnumber: null },
        newChapterContent
      );

      let tr = state.tr;

      if (cursorPos < paraEndContent) {
        tr = tr.delete(cursorPos, paraEndContent);
      }

      const mappedParaAfter = tr.mapping.map(paraAfter);
      const mappedChapterEnd = tr.mapping.map(chapterEndContent);
      if (mappedParaAfter < mappedChapterEnd) {
        tr = tr.delete(mappedParaAfter, mappedChapterEnd);
      }

      const insertAt = tr.mapping.map($from.after(chapterDepth));
      tr = tr.insert(insertAt, chNode);

      const posInPara = insertAt + 1 + label.nodeSize + 1;
      if (dispatch) {
        dispatch(tr.setSelection(TextSelection.create(tr.doc, posInPara)).scrollIntoView());
      }
      return true;
    }

    const emptyPara = pType.create({ marker: 'p', sid: null });
    const chNode = chType.create(
      { sid: null, altnumber: null, pubnumber: null },
      Fragment.from([label, emptyPara])
    );

    let insertAt: number;
    if (chapterDepth !== null) {
      insertAt = $from.after(chapterDepth);
    } else {
      insertAt = state.doc.content.size;
    }

    const tr = state.tr.insert(insertAt, chNode);
    const posInside = insertAt + 1 + label.nodeSize + 1;
    if (dispatch) {
      dispatch(tr.setSelection(TextSelection.create(tr.doc, posInside)).scrollIntoView());
    }
    return true;
  };
}

/** Insert a `chapter` using {@link nextChapterNumberForSelection}. */
export function insertNextChapter(): Command {
  return (state, dispatch) => {
    const n = nextChapterNumberForSelection(state);
    return insertChapter(n)(state, dispatch);
  };
}

/**
 * Insert an inline translator-section milestone (`\\ts`, `\\ts-s`, `\\ts-e`) at the cursor
 * inside the current paragraph (does not split the paragraph visually).
 */
export function insertTranslatorSection(marker: string = 'ts'): Command {
  return (state, dispatch) => {
    const mi = state.schema.nodes.milestone_inline;
    if (!mi) return false;
    const { $from } = state.selection;
    let paraDepth: number | null = null;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'paragraph') {
        paraDepth = d;
        break;
      }
    }
    if (paraDepth === null) return false;
    const node = mi.create({
      marker,
      sid: null,
      eid: null,
      tsSection: null,
      extra: '{}',
    });
    const insertPos = $from.pos;
    const tr = state.tr.insert(insertPos, node);
    const after = insertPos + node.nodeSize;
    if (dispatch) {
      dispatch(tr.setSelection(TextSelection.create(tr.doc, after)).scrollIntoView());
    }
    return true;
  };
}

/**
 * Insert an empty `book_titles` section when allowed by {@link getStructuralInsertions}
 * (before the first chapter, and no titles block yet).
 */
export function insertBookTitlesSection(): Command {
  return (state, dispatch) => {
    const { canInsertBookTitles } = getStructuralInsertions(state, state.selection.from);
    if (!canInsertBookTitles) return false;
    const bt = state.schema.nodes.book_titles;
    if (!bt) return false;
    const node = bt.create({}, Fragment.empty);
    let insertAt = 1;
    for (let i = 0; i < state.doc.childCount; i++) {
      const ch = state.doc.child(i);
      if (ch.type.name === 'header') {
        insertAt += ch.nodeSize;
        continue;
      }
      if (ch.type.name === 'chapter') {
        break;
      }
      insertAt += ch.nodeSize;
    }
    const tr = state.tr.insert(insertAt, node);
    const posInside = insertAt + 1;
    if (dispatch) dispatch(tr.setSelection(TextSelection.create(tr.doc, posInside)).scrollIntoView());
    return true;
  };
}

/**
 * Insert a `book_introduction` section if the document does not have one yet (legacy / repair).
 * Normal loads always include this block via {@link usjDocumentToPm}.
 */
export function insertBookIntroductionSection(): Command {
  return (state, dispatch) => {
    let hasIntro = false;
    state.doc.forEach((n) => {
      if (n.type.name === 'book_introduction') hasIntro = true;
    });
    if (hasIntro) return false;
    const bi = state.schema.nodes.book_introduction;
    const p = state.schema.nodes.paragraph;
    if (!bi || !p) return false;
    const heading = p.create({ marker: 'is1', sid: null });
    const body = p.create({ marker: 'ip', sid: null });
    const node = bi.create({ collapsed: true }, Fragment.from([heading, body]));
    let insertAt = 1;
    for (let i = 0; i < state.doc.childCount; i++) {
      const ch = state.doc.child(i);
      if (ch.type.name === 'book_introduction') return false;
      if (ch.type.name === 'chapter') {
        break;
      }
      insertAt += ch.nodeSize;
    }
    const tr = state.tr.insert(insertAt, node);
    if (dispatch) {
      const $p = tr.doc.resolve(insertAt + 1);
      const posInside = $p.start($p.depth) + 1;
      dispatch(tr.setSelection(TextSelection.create(tr.doc, posInside)).scrollIntoView());
    }
    return true;
  };
}

/**
 * Insert a new paragraph immediately after the block that **starts** at `blockStartPos`
 * (the document position before that node, i.e. `$pos.before(depth)` for that block).
 * Supported block types: `paragraph`, `book`.
 */
export function insertParagraphAfterBlock(blockStartPos: number, marker = 'p'): Command {
  return (state, dispatch) => {
    const pType = state.schema.nodes.paragraph;
    if (!pType) return false;
    const $r = state.doc.resolve(blockStartPos);
    const node = $r.nodeAfter;
    if (!node) return false;
    if (node.type.name !== 'paragraph' && node.type.name !== 'book') return false;
    const insertAt = blockStartPos + node.nodeSize;
    const newP = pType.create({ marker, sid: null });
    const tr = state.tr.insert(insertAt, newP);
    const posInside = insertAt + 1;
    if (dispatch) {
      dispatch(tr.setSelection(TextSelection.create(tr.doc, posInside)).scrollIntoView());
    }
    return true;
  };
}

/**
 * Insert a new paragraph, splitting the current block at the caret when mid-text.
 *
 * Content after the cursor moves into the new paragraph (marks are re-opened).
 * When the caret is at a block boundary the behaviour is unchanged (empty new block).
 */
export function insertParagraph(marker = 'p'): Command {
  return (state, dispatch) => {
    const p = state.schema.nodes.paragraph;
    if (!p) return false;
    const { $from } = state.selection;
    let depth = $from.depth;
    while (depth > 0 && $from.node(depth).type.name !== 'paragraph') {
      depth--;
    }
    if (depth === 0) return false;

    const cursorPos = $from.pos;
    const paraEndContent = $from.after(depth) - 1;

    const tailContent = state.doc.slice(cursorPos, paraEndContent).content;
    const newP = p.create(
      { marker, sid: null },
      tailContent.size > 0 ? tailContent : undefined
    );

    let tr = state.tr;
    if (cursorPos < paraEndContent) {
      tr = tr.delete(cursorPos, paraEndContent);
    }

    const insertAt = tr.mapping.map($from.after(depth));
    tr = tr.insert(insertAt, newP);
    const posInside = insertAt + 1;
    if (dispatch) {
      dispatch(tr.setSelection(TextSelection.create(tr.doc, posInside)).scrollIntoView());
    }
    return true;
  };
}
