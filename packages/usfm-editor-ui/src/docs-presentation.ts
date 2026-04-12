import type { EditorMode, EditorSection, MarkerRegistry } from '@usfm-tools/editor';

import type { WysiwygToolbarIcon } from './bubble-context';
import type { DocsMenuIconKey } from './docs-ui-types';
import {
  bubbleIconBold,
  bubbleIconItalic,
  gutterBlockOptionsIcon,
  menuIconNode,
} from './icons/lucide-map';
import { boldLetterSvg, lucideIconToSvg } from './icons/lucide-render';
import type { PresentationLayer, ResolvedPresentationLayer } from './presentation';

const MENU_ICON_PX = 16;
const BUBBLE_ICON_PX = 18;
const GUTTER_HANDLE_ICON_PX = 14;

const STRUCT = {
  verse: '__verse__',
  chapter: '__chapter__',
  split: '__split__',
  bookTitles: '__book_titles__',
  ts: '__ts_section__',
} as const;

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

export function docsIconKeyForParagraphMarker(marker: string): DocsMenuIconKey {
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

export function menuIconSvg(key: DocsMenuIconKey): string {
  if (key === 'insert_verse') return boldLetterSvg('V', MENU_ICON_PX);
  if (key === 'insert_chapter') return boldLetterSvg('C', MENU_ICON_PX);
  return lucideIconToSvg(menuIconNode(key), MENU_ICON_PX);
}

/** Built-in docs-style presentation; uses {@link MarkerRegistry} for marker labels. */
export function createDocsPresentationLayer(registry: MarkerRegistry): ResolvedPresentationLayer {
  return {
    markerLabel(marker, section, mode) {
      if (mode === 'advanced') return `\\${marker}`;
      if (marker === 'id') return 'Book';
      const choices = registry.getChoicesForMode(section, mode);
      const hit = choices.find((c) => c.marker === marker);
      if (hit) return hit.label;
      return marker;
    },
    menuCategory(category, mode) {
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
    },
    markerIcon(marker) {
      void marker;
      return null;
    },
    bubbleIcon(icon) {
      const ic = icon as WysiwygToolbarIcon;
      switch (ic) {
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
    },
    structuralRow(id) {
      switch (id) {
        case STRUCT.bookTitles:
          return {
            label: 'Title page',
            icon: menuIconSvg('insert_book'),
            ariaLabel: 'Insert title page',
          };
        case STRUCT.verse:
          return {
            label: 'Verse',
            icon: menuIconSvg('insert_verse'),
            ariaLabel: 'Insert next verse',
          };
        case STRUCT.ts:
          return {
            label: 'Translator notes',
            icon: menuIconSvg('translator'),
            ariaLabel: 'Insert translator notes section',
          };
        case STRUCT.chapter:
          return {
            label: 'Chapter',
            icon: menuIconSvg('insert_chapter'),
            ariaLabel: 'Insert next chapter',
          };
        case STRUCT.split:
          return {
            label: 'New paragraph',
            icon: menuIconSvg('split_block'),
            ariaLabel: 'Start a new paragraph at the cursor',
          };
        default:
          return null;
      }
    },
    isSimplifiedMode(mode) {
      return mode === 'basic' || mode === 'medium';
    },
    paletteAriaLabel(mode) {
      return mode === 'basic' || mode === 'medium' ? 'Search formats and inserts' : 'Filter markers';
    },
    palettePlaceholder(mode, triggerKey) {
      if (mode === 'basic' || mode === 'medium') return 'Search formats…';
      return triggerKey === '\\' ? '\\' : '';
    },
    blockMenuTitle(mode) {
      return mode === 'advanced' ? 'Turn into' : 'Paragraph style';
    },
    gutterBlockOptionsIconSvg() {
      return lucideIconToSvg(gutterBlockOptionsIcon, GUTTER_HANDLE_ICON_PX);
    },
  };
}

export function mergePresentationLayer(
  base: ResolvedPresentationLayer,
  overlay?: PresentationLayer
): ResolvedPresentationLayer {
  if (!overlay) return base;
  return {
    markerLabel: (m, s, mode) => overlay.markerLabel?.(m, s, mode) ?? base.markerLabel(m, s, mode),
    menuCategory: (c, mode) => overlay.menuCategory?.(c, mode) ?? base.menuCategory(c, mode),
    markerIcon: (m) => overlay.markerIcon?.(m) ?? base.markerIcon(m),
    bubbleIcon: (ic) => overlay.bubbleIcon?.(ic) ?? base.bubbleIcon(ic),
    structuralRow: (id) => overlay.structuralRow?.(id) ?? base.structuralRow(id),
    isSimplifiedMode: (mode) => overlay.isSimplifiedMode?.(mode) ?? base.isSimplifiedMode(mode),
    paletteAriaLabel: (mode) => overlay.paletteAriaLabel?.(mode) ?? base.paletteAriaLabel(mode),
    palettePlaceholder: (mode, t) =>
      overlay.palettePlaceholder?.(mode, t) ?? base.palettePlaceholder(mode, t),
    blockMenuTitle: (mode) => overlay.blockMenuTitle?.(mode) ?? base.blockMenuTitle(mode),
    gutterBlockOptionsIconSvg: () =>
      overlay.gutterBlockOptionsIconSvg?.() ?? base.gutterBlockOptionsIconSvg(),
  };
}
