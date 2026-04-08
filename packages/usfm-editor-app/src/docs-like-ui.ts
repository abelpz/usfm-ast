/**
 * Word-processor–style presentation for Basic / Medium marker modes.
 * Advanced mode keeps USFM-oriented labels and no toolbar icons.
 */

import type { EditorMode, EditorSection } from '@usfm-tools/editor';
import { getMarkerChoicesForMode } from '@usfm-tools/editor';

import {
  bubbleIconBold,
  bubbleIconItalic,
  gutterBlockOptionsIcon,
  menuIconNode,
} from './docs-lucide-map';
import type { DocsMenuIconKey } from './docs-ui-types';
import { boldLetterSvg, lucideIconToSvg } from './lucide-render';
import type { WysiwygToolbarIcon } from './wysiwyg-bubble-context';

export type { DocsMenuIconKey } from './docs-ui-types';

const MENU_ICON_PX = 16;
const BUBBLE_ICON_PX = 18;
const GUTTER_HANDLE_ICON_PX = 14;

/** Vertical ⋮ handle for gutter “paragraph style” in Basic / Medium. */
export function gutterBlockOptionsIconSvg(): string {
  return lucideIconToSvg(gutterBlockOptionsIcon, GUTTER_HANDLE_ICON_PX);
}

/** Must stay aligned with structural `id` values in wysiwyg-ui (`SPECIAL_MARKER`). */
const STRUCT = {
  verse: '__verse__',
  chapter: '__chapter__',
  split: '__split__',
  bookTitles: '__book_titles__',
  ts: '__ts_section__',
} as const;

export function isDocsLikeMode(mode: EditorMode): boolean {
  return mode === 'basic' || mode === 'medium';
}

export function presentMenuCategory(category: string | undefined, mode: EditorMode): string | undefined {
  if (!category || mode === 'advanced') return category;
  switch (category) {
    case 'Structure':
      return 'Insert';
    case 'Common':
    case 'Basic':
      return 'Paragraph styles';
    default:
      return category;
  }
}

export function presentStructuralMenuRow(
  id: string
): { label: string; iconKey: DocsMenuIconKey; ariaLabel: string } | null {
  switch (id) {
    case STRUCT.bookTitles:
      return {
        label: 'Title page',
        iconKey: 'insert_book',
        ariaLabel: 'Insert title page',
      };
    case STRUCT.verse:
      return {
        label: 'Verse',
        iconKey: 'insert_verse',
        ariaLabel: 'Insert next verse',
      };
    case STRUCT.ts:
      return {
        label: 'Translator notes',
        iconKey: 'translator',
        ariaLabel: 'Insert translator notes section',
      };
    case STRUCT.chapter:
      return {
        label: 'Chapter',
        iconKey: 'insert_chapter',
        ariaLabel: 'Insert next chapter',
      };
    case STRUCT.split:
      return {
        label: 'New paragraph',
        iconKey: 'split_block',
        ariaLabel: 'Start a new paragraph at the cursor',
      };
    default:
      return null;
  }
}

const META = new Set([
  'ide',
  'h',
  'toc1',
  'toc2',
  'toc3',
  'toca1',
  'toca2',
  'toca3',
  'rem',
  'sts',
]);

/** Main / intro title lines (display like document headings). */
const TITLE_LINES = new Set([
  'mt',
  'mt1',
  'mt2',
  'mt3',
  'imt',
  'imt1',
  'imt2',
  'imte',
  'imte1',
  'imte2',
]);

const HEADING = new Set([
  's',
  's1',
  's2',
  's3',
  'ms',
  'ms1',
  'ms2',
  'is',
  'is1',
  'is2',
  'cl',
  'cd',
  'sp',
  'sd',
  'sd1',
  'sd2',
  'mr',
  'sr',
  'r',
  'mte',
  'mte1',
  'mte2',
]);

const POETRY = new Set([
  'q',
  'q1',
  'q2',
  'q3',
  'qr',
  'qc',
  'qd',
  'qa',
  'qm',
  'qm1',
  'qm2',
  'iq',
  'iq1',
  'iq2',
]);

const LIST = new Set([
  'li',
  'li1',
  'li2',
  'lh',
  'lf',
  'lim',
  'lim1',
  'lim2',
  'ili',
  'ili1',
  'ili2',
]);

const BLANK = new Set(['b', 'ib']);

const INDENT = new Set([
  'pi',
  'pi1',
  'pi2',
  'mi',
  'mi1',
  'mi2',
  'ph',
  'ipi',
  'ipq',
  'ipr',
  'pm',
  'pmc',
  'pmo',
  'pmr',
  'imi',
]);

export function docsIconForParagraphMarker(marker: string): DocsMenuIconKey {
  if (marker === 'id') return 'book';
  if (META.has(marker)) return 'meta';
  if (TITLE_LINES.has(marker)) return 'heading';
  if (HEADING.has(marker)) return 'heading';
  if (POETRY.has(marker)) return 'poetry';
  if (LIST.has(marker)) return 'list';
  if (BLANK.has(marker)) return 'blank';
  if (INDENT.has(marker)) return 'indent';
  return 'paragraph';
}

export function gutterMarkerLabel(marker: string, section: EditorSection, mode: EditorMode): string {
  if (mode === 'advanced') return `\\${marker}`;
  if (marker === 'id') return 'Book';
  const choices = getMarkerChoicesForMode(section, mode);
  const hit = choices.find((c) => c.marker === marker);
  if (hit) return hit.label;
  return marker;
}

export function paletteAriaLabel(mode: EditorMode): string {
  return isDocsLikeMode(mode) ? 'Search formats and inserts' : 'Filter markers';
}

export function palettePlaceholder(mode: EditorMode, triggerKey: string): string {
  if (isDocsLikeMode(mode)) return 'Search formats…';
  return triggerKey === '\\' ? '\\' : '';
}

export function changeBlockMenuTitle(mode: EditorMode): string {
  return mode === 'advanced' ? 'Turn into' : 'Paragraph style';
}

/** Row / palette icons (Lucide + **V** / **C** for verse & chapter inserts). */
export function menuIconSvg(key: DocsMenuIconKey): string {
  if (key === 'insert_verse') return boldLetterSvg('V', MENU_ICON_PX);
  if (key === 'insert_chapter') return boldLetterSvg('C', MENU_ICON_PX);
  return lucideIconToSvg(menuIconNode(key), MENU_ICON_PX);
}

/** Compact floating toolbar (bold / italic from Lucide; verse / chapter as **V** / **C**). */
export function bubbleToolbarIconSvg(icon: WysiwygToolbarIcon): string {
  switch (icon) {
    case 'bold':
      return lucideIconToSvg(bubbleIconBold, BUBBLE_ICON_PX);
    case 'italic':
      return lucideIconToSvg(bubbleIconItalic, BUBBLE_ICON_PX);
    case 'verse':
      return boldLetterSvg('V', BUBBLE_ICON_PX);
    case 'chapter':
      return boldLetterSvg('C', BUBBLE_ICON_PX);
    default:
      return lucideIconToSvg(bubbleIconBold, BUBBLE_ICON_PX);
  }
}
