import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

/**
 * Describes where the selection sits in the USFM ProseMirror tree so callers can
 * show or hide inline toolbar actions (e.g. no `\\v` inside a footnote `note`).
 */
export interface WysiwygBubbleContext {
  /** Node type names from doc root toward the selection (`depth` 1 … `$from.depth`). */
  readonly ancestorTypes: readonly string[];
  /** Caret/selection is inside an inline `note` (footnote / cross-ref). */
  readonly inNote: boolean;
  /** `note` node `marker` attr when `inNote` (e.g. `f`, `x`). */
  readonly noteMarker: string | null;
  /** Nearest enclosing `paragraph`’s USFM marker, if any. */
  readonly paragraphMarker: string | null;
  readonly inHeader: boolean;
  readonly inBookTitles: boolean;
  readonly inBookIntroduction: boolean;
  readonly inChapter: boolean;
  /** `book` line (`\\id` row), not only “inside a chapter”. */
  readonly inBookLine: boolean;
}

/** Standard toolbar glyphs for docs-like Basic / Medium bubble controls. */
export type WysiwygToolbarIcon = 'bold' | 'italic' | 'verse' | 'chapter';

export interface WysiwygBubbleAction {
  id: string;
  label: string;
  title?: string;
  /** When set, the bubble renders a compact icon instead of {@link label} text. */
  toolbarIcon?: WysiwygToolbarIcon;
  /**
   * If provided, return false to omit this control for the current context.
   * Selection emptiness: use `view.state.selection`.
   */
  visible?: (ctx: WysiwygBubbleContext, view: EditorView) => boolean;
  run: (view: EditorView) => void;
}

export type ResolveWysiwygBubbleActions = (
  ctx: WysiwygBubbleContext,
  view: EditorView,
  defaults: readonly WysiwygBubbleAction[]
) => WysiwygBubbleAction[];

/**
 * Build context for the current selection, or `null` when the floating bar
 * should not appear (same rules as before: caret must be in `paragraph` or `book`).
 */
export function buildWysiwygBubbleContext(view: EditorView): WysiwygBubbleContext | null {
  const { selection } = view.state;

  // Atom nodes (verse, figure, milestone_inline, …) are opaque — no inline actions apply to them.
  if (selection instanceof NodeSelection && selection.node.isAtom && selection.node.isInline) {
    return null;
  }

  const { $from } = selection;
  let inEditable = false;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d).type.name;
    if (n === 'paragraph' || n === 'book') {
      inEditable = true;
      break;
    }
  }
  if (!inEditable) return null;

  const ancestorTypes: string[] = [];
  let inNote = false;
  let noteMarker: string | null = null;
  for (let d = 1; d <= $from.depth; d++) {
    const n = $from.node(d);
    ancestorTypes.push(n.type.name);
    if (n.type.name === 'note') {
      inNote = true;
      noteMarker = String(n.attrs.marker ?? 'f');
    }
  }

  let paragraphMarker: string | null = null;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (n.type.name === 'paragraph') {
      paragraphMarker = String(n.attrs.marker ?? 'p');
      break;
    }
  }

  const set = new Set(ancestorTypes);
  return {
    ancestorTypes,
    inNote,
    noteMarker,
    paragraphMarker,
    inHeader: set.has('header'),
    inBookTitles: set.has('book_titles'),
    inBookIntroduction: set.has('book_introduction'),
    inChapter: set.has('chapter'),
    inBookLine: set.has('book'),
  };
}
