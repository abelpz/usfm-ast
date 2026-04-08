import {
  changeParagraphMarker,
  canInsertChapterMarkerInSection,
  canInsertVerseInSection,
  getEditorSectionAtPos,
  getMarkerChoicesForMode,
  getStructuralInsertions,
  insertBookTitlesSection,
  insertNextChapter,
  insertNextVerse,
  insertParagraph,
  insertTranslatorSection,
  insertParagraphAfterBlock,
  toggleCharMarker,
  type EditorMode,
  type EditorSection,
  type MarkerChoice,
} from '@usfm-tools/editor';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  buildWysiwygBubbleContext,
  type ResolveWysiwygBubbleActions,
  type WysiwygBubbleAction,
  type WysiwygBubbleContext,
} from './wysiwyg-bubble-context';
import { positionFixedLayer, virtualRefFromRect } from './floating-position';
import {
  bubbleToolbarIconSvg,
  changeBlockMenuTitle,
  docsIconForParagraphMarker,
  gutterBlockOptionsIconSvg,
  gutterMarkerLabel,
  isDocsLikeMode,
  menuIconSvg,
  paletteAriaLabel,
  palettePlaceholder,
  presentStructuralMenuRow,
  presentMenuCategory,
  type DocsMenuIconKey,
} from './docs-like-ui';

export type {
  WysiwygBubbleAction,
  WysiwygBubbleContext,
  ResolveWysiwygBubbleActions,
  WysiwygToolbarIcon,
} from './wysiwyg-bubble-context';
export { buildWysiwygBubbleContext } from './wysiwyg-bubble-context';

const BLOCK_SELECTOR = 'p.usfm-para, div.usfm-book';

/** Clicks here are inside `view.dom` but are not the main text surface (caret does not go here). */
const PM_NON_EDIT_CHROME = '.usfm-chapter-label';

function findBlockStart(view: EditorView, el: HTMLElement | null): number | null {
  if (!el) return null;
  let cur: HTMLElement | null = el;
  while (cur && cur !== view.dom) {
    if (cur.matches?.(BLOCK_SELECTOR)) {
      const pos = view.posAtDOM(cur, 0);
      const $p = view.state.doc.resolve(pos);
      for (let d = $p.depth; d > 0; d--) {
        const n = $p.node(d);
        if (n.type.name === 'paragraph' || n.type.name === 'book') {
          return $p.before(d);
        }
      }
    }
    cur = cur.parentElement;
  }
  return null;
}

const SPECIAL_MARKER = {
  VERSE: '__verse__',
  CHAPTER: '__chapter__',
  SPLIT: '__split__',
  BOOK_TITLES: '__book_titles__',
  TS_SECTION: '__ts_section__',
} as const;

const LS_EDITOR_MODE = 'usfm-editor-mode';
/** Legacy boolean; migrated once to {@link LS_EDITOR_MODE}. */
const LS_LEGACY_ADVANCED_MODE = 'usfm-editor-advanced-mode';

let didMigrateLegacyEditorMode = false;

/**
 * Current marker UI tier: **basic** (minimal), **medium** (friendly labels), **advanced** (full list).
 * Persisted under {@link LS_EDITOR_MODE}.
 */
export function readEditorMode(): EditorMode {
  try {
    if (typeof localStorage === 'undefined') return 'medium';
    if (!didMigrateLegacyEditorMode) {
      didMigrateLegacyEditorMode = true;
      const legacy = localStorage.getItem(LS_LEGACY_ADVANCED_MODE);
      const next = localStorage.getItem(LS_EDITOR_MODE);
      if (!next && legacy === 'true') {
        localStorage.setItem(LS_EDITOR_MODE, 'advanced');
        localStorage.removeItem(LS_LEGACY_ADVANCED_MODE);
      }
    }
    const raw = localStorage.getItem(LS_EDITOR_MODE);
    if (raw === 'basic' || raw === 'medium' || raw === 'advanced') return raw;
    return 'medium';
  } catch {
    return 'medium';
  }
}

export function writeEditorMode(mode: EditorMode): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_EDITOR_MODE, mode);
      localStorage.removeItem(LS_LEGACY_ADVANCED_MODE);
    }
  } catch {
    /* ignore */
  }
}

/** Paragraph markers for gutter (+) and floating `\\` palette (driven by {@link readEditorMode}). */
function getParagraphMenuChoices(section: EditorSection): MarkerChoice[] {
  return getMarkerChoicesForMode(section, readEditorMode());
}

type ParaCursorMode = 'empty' | 'end' | 'mid' | 'none';

function getParagraphCursorInfo(state: EditorState): {
  mode: ParaCursorMode;
  blockStart: number | null;
  inParagraph: boolean;
} {
  const $from = state.selection.$from;
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth).type.name !== 'paragraph') depth--;
  if (depth === 0) return { mode: 'none', blockStart: null, inParagraph: false };
  const para = $from.node(depth);
  const blockStart = $from.before(depth);
  const paraEndContent = $from.after(depth) - 1;
  const cursorPos = $from.pos;
  const text = para.textContent;
  if (!text.trim()) return { mode: 'empty', blockStart, inParagraph: true };
  if (cursorPos >= paraEndContent) return { mode: 'end', blockStart, inParagraph: true };
  return { mode: 'mid', blockStart, inParagraph: true };
}

function selectionBlockStartMatches(state: EditorState, blockStart: number): boolean {
  const $from = state.selection.$from;
  let depth = $from.depth;
  while (
    depth > 0 &&
    $from.node(depth).type.name !== 'paragraph' &&
    $from.node(depth).type.name !== 'book'
  ) {
    depth--;
  }
  if (depth === 0) return false;
  return $from.before(depth) === blockStart;
}

function applyMarkerFromPalette(view: EditorView, id: string): void {
  const state = view.state;
  if (id === SPECIAL_MARKER.VERSE) {
    insertNextVerse()(state, view.dispatch);
    return;
  }
  if (id === SPECIAL_MARKER.CHAPTER) {
    insertNextChapter()(state, view.dispatch);
    return;
  }
  if (id === SPECIAL_MARKER.SPLIT) {
    insertParagraph('p')(state, view.dispatch);
    return;
  }
  if (id === SPECIAL_MARKER.BOOK_TITLES) {
    insertBookTitlesSection()(state, view.dispatch);
    return;
  }
  if (id === SPECIAL_MARKER.TS_SECTION) {
    insertTranslatorSection()(state, view.dispatch);
    return;
  }

  const info = getParagraphCursorInfo(state);
  if (info.inParagraph) {
    if (info.mode === 'empty') {
      changeParagraphMarker(id)(state, view.dispatch);
      return;
    }
    if (info.mode === 'mid') {
      insertParagraph(id)(state, view.dispatch);
      return;
    }
    if (info.mode === 'end' && info.blockStart !== null) {
      insertParagraphAfterBlock(info.blockStart, id)(state, view.dispatch);
      return;
    }
  }

  const $from = state.selection.$from;
  let depth = $from.depth;
  while (
    depth > 0 &&
    $from.node(depth).type.name !== 'paragraph' &&
    $from.node(depth).type.name !== 'book'
  ) {
    depth--;
  }
  if (depth > 0) {
    const bs = $from.before(depth);
    insertParagraphAfterBlock(bs, id)(state, view.dispatch);
  }
}

function applyParagraphMarkerFromAddMenu(view: EditorView, marker: string, pendingBlockStart: number): void {
  const state = view.state;
  const sameBlock = selectionBlockStartMatches(state, pendingBlockStart);
  const info = getParagraphCursorInfo(state);

  if (!sameBlock || !info.inParagraph) {
    insertParagraphAfterBlock(pendingBlockStart, marker)(state, view.dispatch);
    return;
  }
  if (info.mode === 'empty') {
    changeParagraphMarker(marker)(state, view.dispatch);
    return;
  }
  if (info.mode === 'mid') {
    insertParagraph(marker)(state, view.dispatch);
    return;
  }
  insertParagraphAfterBlock(pendingBlockStart, marker)(state, view.dispatch);
}

interface BlockMenuEntry {
  id: string;
  label: string;
  category?: string;
  iconKey?: DocsMenuIconKey;
  ariaLabel?: string;
}

function finalizeBlockMenuEntries(entries: BlockMenuEntry[], mode: EditorMode): BlockMenuEntry[] {
  if (mode === 'advanced') return entries;
  return entries.map((ent) => {
    const structural = presentStructuralMenuRow(ent.id);
    if (structural) {
      return {
        ...ent,
        label: structural.label,
        category: presentMenuCategory(ent.category, mode),
        iconKey: structural.iconKey,
        ariaLabel: structural.ariaLabel,
      };
    }
    return {
      ...ent,
      category: presentMenuCategory(ent.category, mode),
      iconKey: docsIconForParagraphMarker(ent.id),
    };
  });
}

function buildAddMenuEntries(
  state: EditorState,
  pos: number,
  section: ReturnType<typeof getEditorSectionAtPos>
): BlockMenuEntry[] {
  const out: BlockMenuEntry[] = [];
  const struct = getStructuralInsertions(state, pos);
  const mode = readEditorMode();
  if (struct.canInsertBookTitles) {
    out.push({
      id: SPECIAL_MARKER.BOOK_TITLES,
      label: 'Book titles section',
      category: 'Structure',
    });
  }
  if (canInsertVerseInSection(section)) {
    out.push({
      id: SPECIAL_MARKER.VERSE,
      label: 'Next verse (\\v)',
      category: 'Structure',
    });
    if (mode !== 'basic') {
      out.push({
        id: SPECIAL_MARKER.TS_SECTION,
        label: 'Translator section (\\ts)',
        category: 'Structure',
      });
    }
  }
  if (canInsertChapterMarkerInSection(section)) {
    out.push({
      id: SPECIAL_MARKER.CHAPTER,
      label: 'Next chapter (\\c)',
      category: 'Structure',
    });
  }
  out.push({
    id: SPECIAL_MARKER.SPLIT,
    label: 'Split paragraph (\\p at caret)',
    category: 'Structure',
  });
  for (const ch of getParagraphMenuChoices(section)) {
    out.push({ id: ch.marker, label: ch.label, category: ch.category });
  }
  return finalizeBlockMenuEntries(out, mode);
}

function fillMenuRowButton(
  b: HTMLButtonElement,
  label: string,
  iconKey: DocsMenuIconKey | undefined,
  docsUi: boolean,
  ariaLabel: string
): void {
  b.setAttribute('aria-label', ariaLabel);
  if (docsUi && iconKey) {
    b.classList.add('usfm-wysiwyg-menu-item--with-icon');
    b.replaceChildren();
    const icon = document.createElement('span');
    icon.className = 'usfm-wysiwyg-menu-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = menuIconSvg(iconKey);
    const lab = document.createElement('span');
    lab.className = 'usfm-wysiwyg-menu-label';
    lab.textContent = label;
    b.append(icon, lab);
  } else {
    b.classList.remove('usfm-wysiwyg-menu-item--with-icon');
    b.textContent = label;
  }
}

function inChromeUi(el: HTMLElement | null): boolean {
  return !!el?.closest?.(
    '.usfm-wysiwyg-gutter, .usfm-wysiwyg-block-menu, .usfm-wysiwyg-change-menu, .usfm-wysiwyg-bubble, .usfm-wysiwyg-palette'
  );
}

/**
 * True when focus is in the ProseMirror surface (`view.dom` subtree).
 * Note: during `focusout`, `document.activeElement` is often still the old node; use
 * `focusin` / `queueMicrotask` / `pointerdown` capture to detect real blur.
 */
function focusInsideEditor(view: EditorView): boolean {
  const ae = document.activeElement;
  return ae !== null && view.dom.contains(ae);
}

function hideBubbleIfEditorBlurred(view: EditorView, bubble: HTMLElement) {
  const ae = document.activeElement;
  if (!ae || !view.dom.contains(ae)) {
    bubble.hidden = true;
    bubble.style.display = 'none';
  }
}

function rectIntersects(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function isScrollable(el: HTMLElement): boolean {
  const s = getComputedStyle(el);
  const oy = s.overflowY;
  const ox = s.overflowX;
  const y =
    (oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight + 1;
  const x =
    (ox === 'auto' || ox === 'scroll' || ox === 'overlay') && el.scrollWidth > el.clientWidth + 1;
  return y || x;
}

function collectScrollContainers(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  let cur: HTMLElement | null = el;
  while (cur) {
    if (isScrollable(cur)) out.push(cur);
    cur = cur.parentElement;
  }
  return out;
}

/** Default floating-bar actions; override or wrap via {@link WysiwygChromeOptions.bubble}. */
export function defaultWysiwygBubbleActions(): WysiwygBubbleAction[] {
  return [
    {
      id: 'bd',
      label: 'B',
      title: 'Bold',
      visible: (_ctx, view) => !view.state.selection.empty,
      run: (view) => toggleCharMarker('bd')(view.state, view.dispatch),
    },
    {
      id: 'it',
      label: 'I',
      title: 'Italic',
      visible: (_ctx, view) => !view.state.selection.empty,
      run: (view) => toggleCharMarker('it')(view.state, view.dispatch),
    },
    {
      id: 'verse',
      label: 'v',
      title: 'Insert next verse',
      visible: (ctx) => !ctx.inNote && ctx.inChapter,
      run: (view) => insertNextVerse()(view.state, view.dispatch),
    },
  ];
}

/** Toolbar-style icons for Basic / Medium (Google Docs–like). */
export function docsWysiwygBubbleActions(): WysiwygBubbleAction[] {
  return [
    {
      id: 'bd',
      label: '',
      title: 'Bold',
      toolbarIcon: 'bold',
      visible: (_ctx, view) => !view.state.selection.empty,
      run: (view) => toggleCharMarker('bd')(view.state, view.dispatch),
    },
    {
      id: 'it',
      label: '',
      title: 'Italic',
      toolbarIcon: 'italic',
      visible: (_ctx, view) => !view.state.selection.empty,
      run: (view) => toggleCharMarker('it')(view.state, view.dispatch),
    },
    {
      id: 'verse',
      label: 'Verse',
      title: 'Insert next verse',
      toolbarIcon: 'verse',
      visible: (ctx) => !ctx.inNote && ctx.inChapter,
      run: (view) => insertNextVerse()(view.state, view.dispatch),
    },
  ];
}

function defaultBubbleBaseForMode(): WysiwygBubbleAction[] {
  return readEditorMode() === 'advanced' ? defaultWysiwygBubbleActions() : docsWysiwygBubbleActions();
}

export interface WysiwygChromeOptions {
  bubble?: {
    /** Full replacement for {@link defaultWysiwygBubbleActions}. */
    actions?: WysiwygBubbleAction[];
    /** Filter or append to defaults (or to `actions` when you pass a custom base via `resolveActions` only — see implementation). */
    resolveActions?: ResolveWysiwygBubbleActions;
  };
  /**
   * Align palette filter seed with the keymap trigger from `markerPaletteKeymap` (e.g. seed with `\\` only when the trigger is backslash).
   */
  markerPalette?: {
    getTriggerKey: () => string;
  };
}

/**
 * Notion-style block gutter (+) and a small selection/caret bubble for inline actions (test app only).
 */
export interface WysiwygChromeHandle {
  dispose: () => void;
  /** Open the marker palette (usually wired to `markerPaletteKeymap` from `@usfm-tools/editor`). */
  openMarkerPalette: (view: EditorView) => void;
}

export function attachWysiwygChrome(
  pmShell: HTMLElement,
  view: EditorView,
  options?: WysiwygChromeOptions
): WysiwygChromeHandle {
  function actionsForContext(ctx: WysiwygBubbleContext, v: EditorView): WysiwygBubbleAction[] {
    const base = options?.bubble?.actions ?? defaultBubbleBaseForMode();
    const list = options?.bubble?.resolveActions
      ? options.bubble.resolveActions(ctx, v, base)
      : base;
    return list.filter((a) => (a.visible ? a.visible(ctx, v) : true));
  }

  const gutter = document.createElement('div');
  gutter.className = 'usfm-wysiwyg-gutter';

  /** Single hover target: fills the gap between marker and + so the strip stays “armed” while moving between buttons. */
  const gutterStrip = document.createElement('div');
  gutterStrip.className = 'usfm-wysiwyg-gutter-strip';
  gutterStrip.setAttribute('role', 'presentation');

  const markerBtn = document.createElement('button');
  markerBtn.type = 'button';
  markerBtn.className = 'usfm-wysiwyg-marker-chip';
  markerBtn.title = 'Change block type';
  markerBtn.setAttribute('aria-label', 'Change paragraph marker');
  markerBtn.textContent = '\\p';
  gutterStrip.appendChild(markerBtn);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'usfm-wysiwyg-add';
  addBtn.title = 'Add block';
  addBtn.setAttribute('aria-label', 'Add block');
  addBtn.textContent = '+';
  gutterStrip.appendChild(addBtn);

  gutter.appendChild(gutterStrip);

  let pendingBlockStart: number | null = null;

  /** Menu for adding a new block after the current one ("+"). */
  const menu = document.createElement('div');
  menu.className = 'usfm-wysiwyg-block-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;

  /** Menu for changing the type of the current block (marker chip). */
  const changeMenu = document.createElement('div');
  changeMenu.className = 'usfm-wysiwyg-block-menu usfm-wysiwyg-change-menu';
  changeMenu.setAttribute('role', 'menu');
  changeMenu.hidden = true;

  const changeMenuHeading = document.createElement('div');
  changeMenuHeading.className = 'usfm-wysiwyg-change-menu-heading';
  changeMenuHeading.textContent = 'Turn into';
  changeMenu.appendChild(changeMenuHeading);

  const changeMenuBody = document.createElement('div');
  changeMenuBody.className = 'usfm-wysiwyg-change-menu-body';
  changeMenu.appendChild(changeMenuBody);

  function wireBlockChoiceButtons(
    choices: MarkerChoice[],
    container: HTMLElement,
    onPick: (marker: string) => void
  ) {
    const mode = readEditorMode();
    const docsUi = isDocsLikeMode(mode);
    container.replaceChildren();
    let lastCat: string | undefined;
    for (const ch of choices) {
      const cat = mode === 'advanced' ? ch.category : presentMenuCategory(ch.category, mode);
      if (cat && cat !== lastCat) {
        lastCat = cat;
        const h = document.createElement('div');
        h.className = 'usfm-wysiwyg-change-menu-heading usfm-wysiwyg-change-menu-subheading';
        h.textContent = cat;
        container.appendChild(h);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.setAttribute('tabindex', '-1');
      const iconKey = docsUi ? docsIconForParagraphMarker(ch.marker) : undefined;
      const aria = ch.label;
      fillMenuRowButton(b, ch.label, iconKey, docsUi, aria);
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onPick(ch.marker);
      });
      container.appendChild(b);
    }
  }

  function wireAddMenuEntries(entries: BlockMenuEntry[], container: HTMLElement, onPick: (id: string) => void) {
    const mode = readEditorMode();
    const docsUi = isDocsLikeMode(mode);
    container.replaceChildren();
    let lastCat: string | undefined;
    for (const ent of entries) {
      if (ent.category && ent.category !== lastCat) {
        lastCat = ent.category;
        const h = document.createElement('div');
        h.className = 'usfm-wysiwyg-change-menu-heading usfm-wysiwyg-change-menu-subheading';
        h.textContent = ent.category!;
        container.appendChild(h);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.setAttribute('tabindex', '-1');
      const aria = ent.ariaLabel ?? ent.label;
      fillMenuRowButton(b, ent.label, ent.iconKey, docsUi, aria);
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onPick(ent.id);
      });
      container.appendChild(b);
    }
  }

  function setupMenuKeyNav(container: HTMLElement, onEscape: () => void) {
    let activeIdx = 0;
    function items() {
      return Array.from(container.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
    }
    function syncHighlight() {
      const list = items();
      if (!list.length) return;
      activeIdx = Math.max(0, Math.min(activeIdx, list.length - 1));
      for (let i = 0; i < list.length; i++) {
        list[i]!.classList.toggle('usfm-wysiwyg-menu-item--active', i === activeIdx);
      }
      list[activeIdx]?.focus();
    }
    container.addEventListener('keydown', (e) => {
      if (container.hidden) return;
      const list = items();
      if (!list.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = (activeIdx + 1) % list.length;
        syncHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = (activeIdx - 1 + list.length) % list.length;
        syncHighlight();
      } else if (e.key === 'Home') {
        e.preventDefault();
        activeIdx = 0;
        syncHighlight();
      } else if (e.key === 'End') {
        e.preventDefault();
        activeIdx = list.length - 1;
        syncHighlight();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onEscape();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        list[activeIdx]?.click();
      }
    });
    return {
      resetFocus: () => {
        activeIdx = 0;
        queueMicrotask(() => syncHighlight());
      },
    };
  }

  const addMenuNav = setupMenuKeyNav(menu, () => {
    menu.hidden = true;
    view.focus();
  });
  const changeMenuNav = setupMenuKeyNav(changeMenu, () => {
    changeMenu.hidden = true;
    view.focus();
  });

  /** Searchable `\\` marker palette (app chrome). */
  const palette = document.createElement('div');
  palette.className = 'usfm-wysiwyg-palette';
  palette.hidden = true;
  const paletteInput = document.createElement('input');
  paletteInput.className = 'usfm-wysiwyg-palette-input';
  paletteInput.type = 'text';
  paletteInput.setAttribute('aria-label', 'Filter markers');
  const paletteList = document.createElement('div');
  paletteList.className = 'usfm-wysiwyg-palette-list';
  palette.appendChild(paletteInput);

  palette.appendChild(paletteList);

  let lastPaletteContext: {
    state: EditorState;
    pos: number;
    section: EditorSection;
  } | null = null;

  let paletteEntries: BlockMenuEntry[] = [];
  let paletteFiltered: BlockMenuEntry[] = [];
  let paletteActiveIdx = 0;

  function closePalette() {
    palette.hidden = true;
    paletteList.replaceChildren();
  }

  function paletteFilterQuery(): string {
    return paletteInput.value.replace(/^\\/, '').trim().toLowerCase();
  }

  function rebuildPaletteList() {
    const q = paletteFilterQuery();
    const mode = readEditorMode();
    const docsUi = isDocsLikeMode(mode);
    paletteFiltered = !q
      ? paletteEntries.slice()
      : paletteEntries.filter(
          (e) =>
            e.id.toLowerCase().includes(q) ||
            e.label.toLowerCase().includes(q) ||
            (e.category && e.category.toLowerCase().includes(q))
        );
    paletteList.replaceChildren();
    let lastCat: string | undefined;
    paletteActiveIdx = 0;
    for (const ent of paletteFiltered) {
      if (ent.category && ent.category !== lastCat) {
        lastCat = ent.category;
        const h = document.createElement('div');
        h.className = 'usfm-wysiwyg-change-menu-heading usfm-wysiwyg-change-menu-subheading';
        h.textContent = ent.category;
        paletteList.appendChild(h);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'usfm-wysiwyg-palette-item';
      b.setAttribute('role', 'option');
      b.setAttribute('tabindex', '-1');
      const aria = ent.ariaLabel ?? ent.label;
      fillMenuRowButton(b, ent.label, ent.iconKey, docsUi, aria);
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyMarkerFromPalette(view, ent.id);
        closePalette();
        view.focus();
      });
      paletteList.appendChild(b);
    }
    paletteSyncHighlight();
  }

  function paletteItems(): HTMLButtonElement[] {
    return Array.from(paletteList.querySelectorAll<HTMLButtonElement>('button.usfm-wysiwyg-palette-item'));
  }

  function paletteSyncHighlight() {
    const list = paletteItems();
    paletteActiveIdx = Math.max(0, Math.min(paletteActiveIdx, Math.max(0, list.length - 1)));
    for (let i = 0; i < list.length; i++) {
      list[i]!.classList.toggle('usfm-wysiwyg-palette-item--active', i === paletteActiveIdx);
    }
  }

  function positionPalette(v: EditorView) {
    palette.style.zIndex = '60';
    let rect: DOMRect;
    try {
      const c = v.coordsAtPos(v.state.selection.from);
      const w = Math.max(1, c.right - c.left);
      const h = Math.max(1, c.bottom - c.top);
      rect = new DOMRect(c.left, c.top, w, h);
    } catch {
      const shell = pmShell.getBoundingClientRect();
      rect = new DOMRect(shell.left + 8, shell.top + 8, 1, 1);
    }
    void positionFixedLayer(virtualRefFromRect(rect), palette, {
      placement: 'bottom-start',
      offsetPx: 6,
    });
  }

  function openMarkerPalette(v: EditorView) {
    const state = v.state;
    const pos = state.selection.from;
    const section = getEditorSectionAtPos(state, pos);
    lastPaletteContext = { state, pos, section };
    paletteEntries = buildAddMenuEntries(state, pos, section);
    const trig = options?.markerPalette?.getTriggerKey?.() ?? '\\';
    const mode = readEditorMode();
    paletteInput.value = palettePlaceholder(mode, trig);
    paletteInput.setAttribute('aria-label', paletteAriaLabel(mode));
    paletteInput.classList.toggle('usfm-wysiwyg-palette-input--docs', isDocsLikeMode(mode));
    rebuildPaletteList();
    palette.hidden = false;
    positionPalette(v);
    paletteInput.focus();
    paletteInput.select();
  }

  paletteInput.addEventListener('input', () => {
    rebuildPaletteList();
  });

  palette.addEventListener('keydown', (e) => {
    if (palette.hidden) return;
    const list = paletteItems();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (list.length) {
        paletteActiveIdx = (paletteActiveIdx + 1) % list.length;
        paletteSyncHighlight();
        list[paletteActiveIdx]?.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.length) {
        paletteActiveIdx = (paletteActiveIdx - 1 + list.length) % list.length;
        paletteSyncHighlight();
        list[paletteActiveIdx]?.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
      view.focus();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const ent = paletteFiltered[paletteActiveIdx];
      if (ent) {
        applyMarkerFromPalette(view, ent.id);
        closePalette();
        view.focus();
      }
    }
  });

  function blockMenusForBlockStart(blockStart: number | null): void {
    if (blockStart === null) return;
    const pos = Math.min(blockStart + 1, view.state.doc.content.size);
    const section = getEditorSectionAtPos(view.state, pos);
    changeMenuHeading.textContent = changeBlockMenuTitle(readEditorMode());
    const addEntries = buildAddMenuEntries(view.state, pos, section);
    wireAddMenuEntries(addEntries, menu, (id) => {
      if (pendingBlockStart === null) return;
      if (
        id === SPECIAL_MARKER.VERSE ||
        id === SPECIAL_MARKER.CHAPTER ||
        id === SPECIAL_MARKER.SPLIT ||
        id === SPECIAL_MARKER.BOOK_TITLES ||
        id === SPECIAL_MARKER.TS_SECTION
      ) {
        applyMarkerFromPalette(view, id);
      } else {
        applyParagraphMarkerFromAddMenu(view, id, pendingBlockStart);
      }
      view.focus();
      menu.hidden = true;
    });
    addMenuNav.resetFocus();

    const choices = getParagraphMenuChoices(section);
    wireBlockChoiceButtons(choices, changeMenuBody, (marker) => {
      if (pendingBlockStart === null) return;
      changeParagraphMarker(marker)(view.state, view.dispatch);
      view.focus();
      changeMenu.hidden = true;
    });
    changeMenuNav.resetFocus();
  }

  const bubble = document.createElement('div');
  bubble.className = 'usfm-wysiwyg-bubble';
  bubble.setAttribute('role', 'toolbar');

  function concealBubble() {
    bubble.hidden = true;
    bubble.style.display = 'none';
  }
  function revealBubble() {
    bubble.hidden = false;
    bubble.style.display = '';
  }
  concealBubble();

  function rebuildBubble(ctx: WysiwygBubbleContext) {
    bubble.replaceChildren();
    const actions = actionsForContext(ctx, view);
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      if (a.toolbarIcon) {
        btn.classList.add('usfm-wysiwyg-bubble-btn--icon');
        const hasLabel = Boolean(a.label?.trim());
        if (hasLabel) {
          btn.classList.add('usfm-wysiwyg-bubble-btn--with-label');
          const ic = document.createElement('span');
          ic.className = 'usfm-wysiwyg-bubble-icon';
          ic.setAttribute('aria-hidden', 'true');
          ic.innerHTML = bubbleToolbarIconSvg(a.toolbarIcon);
          const lab = document.createElement('span');
          lab.className = 'usfm-wysiwyg-bubble-label';
          lab.textContent = a.label;
          btn.append(ic, lab);
        } else {
          btn.innerHTML = bubbleToolbarIconSvg(a.toolbarIcon);
        }
        btn.setAttribute('aria-label', (a.title ?? a.label) || a.id);
      } else {
        btn.textContent = a.label;
      }
      if (a.title) btn.title = a.title;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        a.run(view);
        view.focus();
        requestAnimationFrame(() => {
          const next = buildWysiwygBubbleContext(view);
          if (next) rebuildBubble(next);
        });
      });
      bubble.appendChild(btn);
    }
  }

  pmShell.appendChild(gutter);
  pmShell.appendChild(menu);
  pmShell.appendChild(changeMenu);
  pmShell.appendChild(palette);
  pmShell.appendChild(bubble);

  let hideGutterTimer: ReturnType<typeof setTimeout> | null = null;
  let lastBlockStart: number | null = null;
  let scrolling = false;
  let scrollEndTimer: ReturnType<typeof setTimeout> | null = null;
  /** Floating bar only after a primary click inside `view.dom`; cleared on outside click, blur, or scroll. */
  let bubbleEngaged = false;

  function positionGutterForEl(
    blockEl: HTMLElement,
    currentMarker: string | undefined,
    blockStart: number | null
  ) {
    const r = blockEl.getBoundingClientRect();
    gutterStrip.style.position = 'fixed';
    gutterStrip.style.top = `${Math.round(r.top + 2)}px`;
    const mode = readEditorMode();
    markerBtn.classList.toggle('usfm-wysiwyg-marker-chip--docs', isDocsLikeMode(mode));
    if (currentMarker) {
      let label: string;
      if (blockStart !== null) {
        const pos = Math.min(blockStart + 1, view.state.doc.content.size);
        const section = getEditorSectionAtPos(view.state, pos);
        label = gutterMarkerLabel(currentMarker, section, mode);
      } else {
        label = mode === 'advanced' ? `\\${currentMarker}` : currentMarker;
      }
      if (isDocsLikeMode(mode)) {
        markerBtn.replaceChildren();
        const iconWrap = document.createElement('span');
        iconWrap.className = 'usfm-wysiwyg-marker-chip-icon';
        iconWrap.setAttribute('aria-hidden', 'true');
        iconWrap.innerHTML = gutterBlockOptionsIconSvg();
        markerBtn.appendChild(iconWrap);
        markerBtn.title = `Paragraph style: ${label}`;
        markerBtn.setAttribute('aria-label', `Change paragraph style, current: ${label}`);
      } else {
        markerBtn.replaceChildren();
        markerBtn.textContent = label;
        markerBtn.title = 'Change block type';
        markerBtn.setAttribute('aria-label', 'Change paragraph marker');
      }
    }
    // Make visible before measuring so offsetWidth reflects actual rendered width.
    gutter.style.display = 'block';
    gutter.classList.add('usfm-wysiwyg-gutter--active');
    // Accessing offsetWidth forces a synchronous reflow — strip is now measured.
    // Position it fully LEFT of the block's edge with a 4px gap so it never
    // overlaps the editable text regardless of marker label length.
    const stripW = gutterStrip.offsetWidth || 60;
    gutterStrip.style.left = `${Math.round(r.left - stripW - 4)}px`;
  }

  function isMenuOpen() {
    return !menu.hidden || !changeMenu.hidden || !palette.hidden;
  }

  function hideGutter() {
    gutter.style.display = 'none';
    gutter.classList.remove('usfm-wysiwyg-gutter--active');
    menu.hidden = true;
    changeMenu.hidden = true;
    closePalette();
    lastBlockStart = null;
  }

  function hideChromeForScroll(e?: Event) {
    if (
      e &&
      (menu.contains(e.target as Node) ||
        changeMenu.contains(e.target as Node) ||
        palette.contains(e.target as Node))
    ) {
      return;
    }
    scrolling = true;
    hideGutter();
    concealBubble();
    if (scrollEndTimer) clearTimeout(scrollEndTimer);
    scrollEndTimer = setTimeout(() => {
      scrollEndTimer = null;
      scrolling = false;
      if (bubbleEngaged) updateBubble();
    }, 150);
  }

  function updateBubble() {
    concealBubble();
    if (!bubbleEngaged) return;
    if (scrolling) return;
    if (!focusInsideEditor(view)) return;
    if (inChromeUi(document.activeElement as HTMLElement)) return;

    const ctx = buildWysiwygBubbleContext(view);
    if (!ctx) return;

    const { state } = view;
    const { from, empty } = state.selection;

    let c1: { left: number; right: number; top: number; bottom: number };
    let c2: { left: number; right: number; top: number; bottom: number } | null = null;
    try {
      c1 = view.coordsAtPos(from);
      if (!empty) c2 = view.coordsAtPos(state.selection.to);
    } catch {
      return;
    }

    const shellRect = pmShell.getBoundingClientRect();
    let probe: DOMRect;
    let midX: number;
    let barTop: number;
    if (empty || !c2) {
      probe = new DOMRect(c1.left - 1, c1.top, 2, c1.bottom - c1.top);
      midX = c1.left;
      barTop = c1.top;
    } else {
      const ul = Math.min(c1.left, c2.left);
      const ur = Math.max(c1.right, c2.right);
      const ut = Math.min(c1.top, c2.top);
      const ub = Math.max(c1.bottom, c2.bottom);
      probe = new DOMRect(ul, ut, ur - ul, ub - ut);
      midX = (ul + ur) / 2;
      barTop = ut;
    }
    if (!rectIntersects(probe, shellRect)) return;

    rebuildBubble(ctx);
    if (bubble.childElementCount === 0) return;

    revealBubble();
    void positionFixedLayer(virtualRefFromRect(probe), bubble, {
      placement: 'top',
      offsetPx: 8,
    });
  }

  function onMouseMove(e: MouseEvent) {
    if (scrolling) return;
    const t = e.target as HTMLElement;
    if (
      pmShell.contains(t) &&
      (t.closest('.usfm-wysiwyg-gutter') ||
        t.closest('.usfm-wysiwyg-block-menu') ||
        t.closest('.usfm-wysiwyg-palette'))
    ) {
      if (hideGutterTimer) {
        clearTimeout(hideGutterTimer);
        hideGutterTimer = null;
      }
      return;
    }
    if (hideGutterTimer) {
      clearTimeout(hideGutterTimer);
      hideGutterTimer = null;
    }
    let cur: HTMLElement | null = t;
    while (cur && cur !== view.dom) {
      if (cur.classList?.contains('usfm-chapter-label')) {
        if (!isMenuOpen()) hideGutter();
        return;
      }
      cur = cur.parentElement;
    }
    const bs = findBlockStart(view, t);
    if (bs === null) {
      if (!isMenuOpen()) hideGutterTimer = setTimeout(hideGutter, 200);
      return;
    }
    lastBlockStart = bs;
    pendingBlockStart = bs;
    const blockEl = t.closest(BLOCK_SELECTOR) as HTMLElement | null;
    if (blockEl) {
      // Get current marker from ProseMirror state for the hovered block.
      let currentMarker = 'p';
      try {
        const $r = view.state.doc.resolve(bs + 1);
        const node = $r.parent;
        if (node.type.name === 'paragraph') currentMarker = String(node.attrs.marker ?? 'p');
        else if (node.type.name === 'book') currentMarker = 'id';
      } catch { /* ignore */ }
      positionGutterForEl(blockEl, currentMarker, bs);
      // Show/hide marker chip and + — only for paragraphs (not book \\id line)
      const para = blockEl.matches('p.usfm-para');
      markerBtn.style.visibility = para ? 'visible' : 'hidden';
      addBtn.style.visibility = para ? 'visible' : 'hidden';
    }
  }

  function syncGutterToSelection() {
    if (scrolling) return;
    if (!focusInsideEditor(view)) return;
    if (inChromeUi(document.activeElement as HTMLElement)) return;
    const { $from } = view.state.selection;
    let depth = $from.depth;
    while (
      depth > 0 &&
      $from.node(depth).type.name !== 'paragraph' &&
      $from.node(depth).type.name !== 'book'
    ) {
      depth--;
    }
    if (depth === 0) return;
    const blockStart = $from.before(depth);
    if ($from.node(depth).type.name === 'book') {
      return;
    }
    let blockEl: HTMLElement | null = null;
    try {
      const dom = view.nodeDOM(blockStart);
      if (dom instanceof HTMLElement) {
        blockEl = dom.closest(BLOCK_SELECTOR);
      } else if (dom && (dom as Node).parentElement) {
        blockEl = (dom as Node).parentElement!.closest(BLOCK_SELECTOR);
      }
    } catch {
      return;
    }
    if (!blockEl || !view.dom.contains(blockEl)) return;
    lastBlockStart = blockStart;
    pendingBlockStart = blockStart;
    let currentMarker = 'p';
    try {
      const $r = view.state.doc.resolve(blockStart + 1);
      const node = $r.parent;
      if (node.type.name === 'paragraph') currentMarker = String(node.attrs.marker ?? 'p');
      else if (node.type.name === 'book') currentMarker = 'id';
    } catch {
      /* ignore */
    }
    positionGutterForEl(blockEl, currentMarker, blockStart);
    const para = blockEl.matches('p.usfm-para');
    markerBtn.style.visibility = para ? 'visible' : 'hidden';
    addBtn.style.visibility = para ? 'visible' : 'hidden';
    if (hideGutterTimer) {
      clearTimeout(hideGutterTimer);
      hideGutterTimer = null;
    }
  }

  function onAddClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    pendingBlockStart = lastBlockStart;
    if (pendingBlockStart === null) return;
    blockMenusForBlockStart(pendingBlockStart);
    changeMenu.hidden = true;
    menu.hidden = !menu.hidden;
    if (!menu.hidden) {
      void positionFixedLayer(addBtn, menu, { placement: 'bottom-start', offsetPx: 4 });
    }
  }

  function onMarkerChipClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    pendingBlockStart = lastBlockStart;
    if (pendingBlockStart === null) return;
    blockMenusForBlockStart(pendingBlockStart);
    menu.hidden = true;
    changeMenu.hidden = !changeMenu.hidden;
    if (!changeMenu.hidden) {
      void positionFixedLayer(markerBtn, changeMenu, { placement: 'bottom-start', offsetPx: 4 });
    }
  }

  function onDocPointerDown(e: MouseEvent) {
    const target = e.target as Node;
    if (!menu.hidden && !menu.contains(target) && e.target !== addBtn) {
      menu.hidden = true;
    }
    if (!changeMenu.hidden && !changeMenu.contains(target) && e.target !== markerBtn) {
      changeMenu.hidden = true;
    }
    if (!palette.hidden && !palette.contains(target)) {
      closePalette();
    }
  }

  function onSelectionChange() {
    requestAnimationFrame(() => {
      if (scrolling) return;
      if (focusInsideEditor(view)) {
        syncGutterToSelection();
      }
      if (!bubbleEngaged) return;
      if (scrolling) return;
      if (!focusInsideEditor(view)) {
        concealBubble();
        return;
      }
      updateBubble();
    });
  }

  function onShellMouseLeave(e: MouseEvent) {
    if (isMenuOpen()) return;
    const rel = e.relatedTarget as Node | null;
    if (rel && pmShell.contains(rel)) return;
    if (rel instanceof HTMLElement && inChromeUi(rel)) return;
    if (focusInsideEditor(view)) {
      syncGutterToSelection();
      return;
    }
    hideGutterTimer = setTimeout(hideGutter, 160);
  }

  function onGutterMouseEnter() {
    if (hideGutterTimer) {
      clearTimeout(hideGutterTimer);
      hideGutterTimer = null;
    }
  }
  function onGutterMouseLeave(e: MouseEvent) {
    if (isMenuOpen()) return;
    const rel = e.relatedTarget as Node | null;
    if (rel instanceof Node && pmShell.contains(rel)) return;
    hideGutterTimer = setTimeout(hideGutter, 160);
  }

  const scrollSeen = new Set<EventTarget>();
  const scrollTargets: (HTMLElement | Window)[] = [];
  function addScrollTarget(t: HTMLElement | Window) {
    if (scrollSeen.has(t)) return;
    scrollSeen.add(t);
    scrollTargets.push(t);
  }
  addScrollTarget(window);
  addScrollTarget(document.documentElement);
  addScrollTarget(document.body);
  addScrollTarget(pmShell);
  addScrollTarget(view.dom);
  for (const el of collectScrollContainers(pmShell)) addScrollTarget(el);

  const wheelOpts: AddEventListenerOptions = { capture: true, passive: true };
  function onWheel(e: Event) {
    hideChromeForScroll(e);
  }
  function onTouchMove(e: Event) {
    hideChromeForScroll(e);
  }
  function onVisualViewportScroll(e: Event) {
    hideChromeForScroll(e);
  }

  pmShell.addEventListener('mousemove', onMouseMove);
  pmShell.addEventListener('mouseleave', onShellMouseLeave);
  gutter.addEventListener('mouseenter', onGutterMouseEnter);
  gutter.addEventListener('mouseleave', onGutterMouseLeave);
  gutterStrip.addEventListener('mouseenter', onGutterMouseEnter);
  gutterStrip.addEventListener('mouseleave', onGutterMouseLeave);
  menu.addEventListener('mouseenter', onGutterMouseEnter);
  menu.addEventListener('mouseleave', onGutterMouseLeave);
  changeMenu.addEventListener('mouseenter', onGutterMouseEnter);
  changeMenu.addEventListener('mouseleave', onGutterMouseLeave);
  palette.addEventListener('mouseenter', onGutterMouseEnter);
  palette.addEventListener('mouseleave', onGutterMouseLeave);
  addBtn.addEventListener('click', onAddClick);
  markerBtn.addEventListener('click', onMarkerChipClick);
  document.addEventListener('pointerdown', onDocPointerDown);

  /** Primary pointer down inside the editable surface: allow the floating bar (until cleared). */
  function onEditorPointerDownCapture(e: PointerEvent) {
    if (e.button !== 0) return;
    const t = e.target;
    if (!(t instanceof Node) || !view.dom.contains(t)) return;
    const el = t instanceof Element ? t : t.parentElement;
    if (el?.closest(PM_NON_EDIT_CHROME)) {
      bubbleEngaged = false;
      concealBubble();
      return;
    }
    bubbleEngaged = true;
    requestAnimationFrame(() => updateBubble());
  }
  view.dom.addEventListener('pointerdown', onEditorPointerDownCapture, true);

  /** Toggle the add-block menu at the caret (keyboard accessibility). */
  function onEditorKeydownBlockMenu(e: KeyboardEvent) {
    if (e.key !== '/' || (!e.metaKey && !e.ctrlKey)) return;
    e.preventDefault();
    e.stopPropagation();
    bubbleEngaged = true;
    const { $from } = view.state.selection;
    let depth = $from.depth;
    while (
      depth > 0 &&
      $from.node(depth).type.name !== 'paragraph' &&
      $from.node(depth).type.name !== 'book'
    ) {
      depth--;
    }
    if (depth === 0) return;
    if ($from.node(depth).type.name === 'book') return;
    const blockStart = $from.before(depth);
    pendingBlockStart = blockStart;
    lastBlockStart = blockStart;
    blockMenusForBlockStart(blockStart);
    changeMenu.hidden = true;
    menu.hidden = false;
    let caretRect: DOMRect;
    try {
      const coords = view.coordsAtPos(view.state.selection.from);
      const w = Math.max(1, coords.right - coords.left);
      const h = Math.max(1, coords.bottom - coords.top);
      caretRect = new DOMRect(coords.left, coords.top, w, h);
    } catch {
      const shell = pmShell.getBoundingClientRect();
      caretRect = new DOMRect(shell.left + 8, shell.top + 8, 1, 1);
    }
    void positionFixedLayer(virtualRefFromRect(caretRect), menu, {
      placement: 'bottom-start',
      offsetPx: 4,
    });
    addMenuNav.resetFocus();
  }
  view.dom.addEventListener('keydown', onEditorKeydownBlockMenu, true);

  /** Outside the text surface (or on in-doc chrome like `\\c` bar): hide and disengage. */
  function onDocumentPointerDownCapture(e: PointerEvent) {
    const t = e.target;
    if (!(t instanceof Node)) return;
    const el = t instanceof Element ? t : t.parentElement;
    if (!el) return;

    if (view.dom.contains(el)) {
      if (el.closest(PM_NON_EDIT_CHROME)) {
        bubbleEngaged = false;
        concealBubble();
      }
      return;
    }
    if (el instanceof HTMLElement && inChromeUi(el)) return;
    bubbleEngaged = false;
    concealBubble();
  }
  document.addEventListener('pointerdown', onDocumentPointerDownCapture, true);

  /** After focus actually moves, `activeElement` is correct (unlike synchronous `focusout`). */
  function onDocumentFocusIn(e: FocusEvent) {
    const t = e.target;
    if (t instanceof Node && view.dom.contains(t)) return;
    if (t instanceof HTMLElement && inChromeUi(t)) return;
    bubbleEngaged = false;
    concealBubble();
    hideGutter();
  }
  document.addEventListener('focusin', onDocumentFocusIn, true);

  const NAV_KEYS = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown', 'Tab',
  ]);
  function onEditorKeyup(e: KeyboardEvent) {
    if (NAV_KEYS.has(e.key)) bubbleEngaged = true;
    if (bubbleEngaged) updateBubble();
  }
  function onEditorMouseup() {
    if (bubbleEngaged) updateBubble();
  }
  function onEditorSurfaceFocusIn(e: FocusEvent) {
    const from = e.relatedTarget;
    if (!from || (from instanceof Node && !view.dom.contains(from))) {
      bubbleEngaged = true;
    }
    if (bubbleEngaged) updateBubble();
  }
  view.dom.addEventListener('keyup', onEditorKeyup);
  view.dom.addEventListener('mouseup', onEditorMouseup);
  view.dom.addEventListener('focusin', onEditorSurfaceFocusIn);
  function onFocusOut() {
    queueMicrotask(() => {
      hideBubbleIfEditorBlurred(view, bubble);
      if (!view.dom.contains(document.activeElement as Node)) bubbleEngaged = false;
    });
  }
  view.dom.addEventListener('focusout', onFocusOut);
  document.addEventListener('selectionchange', onSelectionChange);

  for (const t of scrollTargets) {
    t.addEventListener('scroll', hideChromeForScroll, true);
  }
  document.addEventListener('scroll', hideChromeForScroll, true);
  window.addEventListener('wheel', onWheel, wheelOpts);
  window.addEventListener('touchmove', onTouchMove, wheelOpts);
  const visualViewport = window.visualViewport;
  if (visualViewport) {
    visualViewport.addEventListener('scroll', onVisualViewportScroll);
  }

  hideGutter();

  const dispose = () => {
    pmShell.removeEventListener('mousemove', onMouseMove);
    pmShell.removeEventListener('mouseleave', onShellMouseLeave);
    gutter.removeEventListener('mouseenter', onGutterMouseEnter);
    gutter.removeEventListener('mouseleave', onGutterMouseLeave);
    gutterStrip.removeEventListener('mouseenter', onGutterMouseEnter);
    gutterStrip.removeEventListener('mouseleave', onGutterMouseLeave);
    menu.removeEventListener('mouseenter', onGutterMouseEnter);
    menu.removeEventListener('mouseleave', onGutterMouseLeave);
    changeMenu.removeEventListener('mouseenter', onGutterMouseEnter);
    changeMenu.removeEventListener('mouseleave', onGutterMouseLeave);
    view.dom.removeEventListener('pointerdown', onEditorPointerDownCapture, true);
    view.dom.removeEventListener('keydown', onEditorKeydownBlockMenu, true);
    view.dom.removeEventListener('keyup', onEditorKeyup);
    view.dom.removeEventListener('mouseup', onEditorMouseup);
    view.dom.removeEventListener('focusin', onEditorSurfaceFocusIn);
    view.dom.removeEventListener('focusout', onFocusOut);
    addBtn.removeEventListener('click', onAddClick);
    markerBtn.removeEventListener('click', onMarkerChipClick);
    document.removeEventListener('pointerdown', onDocPointerDown);
    document.removeEventListener('pointerdown', onDocumentPointerDownCapture, true);
    document.removeEventListener('focusin', onDocumentFocusIn, true);
    document.removeEventListener('selectionchange', onSelectionChange);
    for (const t of scrollTargets) {
      t.removeEventListener('scroll', hideChromeForScroll, true);
    }
    document.removeEventListener('scroll', hideChromeForScroll, true);
    window.removeEventListener('wheel', onWheel, wheelOpts);
    window.removeEventListener('touchmove', onTouchMove, wheelOpts);
    if (visualViewport) {
      visualViewport.removeEventListener('scroll', onVisualViewportScroll);
    }
    if (scrollEndTimer) clearTimeout(scrollEndTimer);
    gutter.remove();
    menu.remove();
    changeMenu.remove();
    palette.remove();
    bubble.remove();
  };

  return { dispose, openMarkerPalette };
}
