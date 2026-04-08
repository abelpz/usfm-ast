/**
 * Presentation ("chrome") for the USFM ProseMirror editor: which glyphs to show, header label,
 * and how to render `book` (`\\id`). Devs pick a **preset** and/or override fields.
 */

export type USFMHeaderTitleMode = 'none' | 'text' | 'icon';

export interface USFMEditorChrome {
  /**
   * Named baseline. Explicit fields on this object override the preset.
   * - `default` — section title, marker glyphs (`\\id`, `\\c`, …), split `\\id` fields.
   * - `minimal` — no header title row, no `\\c` chip, split `\\id` (book code vs rest); marker ids on header lines stay.
   * - `developer` — same as default (verbose).
   */
  preset?: 'default' | 'minimal' | 'developer';
  /**
   * Visual theme applied via `data-usfm-theme` on the ProseMirror element.
   * - `'document'` — light background, Word-like document appearance (default, friendly for general users).
   * - `'document-dark'` — dark background document appearance (dark mode Word-like).
   * - `'dark'` — high-contrast dark theme (developer / code-editor feel).
   *
   * Override any token with CSS custom properties (`--usfm-*`) on the `.ProseMirror` element.
   * See `chrome.css` for the full list of available variables.
   */
  theme?: 'dark' | 'document' | 'document-dark';
  header?: {
    /** How to show the pre-chapter block label. */
    title?: USFMHeaderTitleMode;
    /** Visible label when `title` is `text` (ignored for `none`). */
    titleText?: string;
  };
  /** Label row for the `\\mt` / `\\mte` book-titles region (separate from identification). */
  bookTitles?: {
    title?: USFMHeaderTitleMode;
    titleText?: string;
  };
  /** Label row for the book introduction region (`\\ip`, `\\is#`, …). */
  bookIntroduction?: {
    title?: USFMHeaderTitleMode;
    titleText?: string;
  };
  markers?: {
    /**
     * When false, hide decorative marker chips (e.g. the `\\c` bar glyph). Book-header rows still
     * show each paragraph’s marker id (`h`, `mt`, `toc1`, …) so identification fields stay labeled.
     * Verse number pills are unchanged.
     */
    showGlyph?: boolean;
  };
  bookId?: {
    /**
     * `split` — book code in its own field; remainder of `\\id` line is editable inline after it.
     * `inline` — same fields, flatter styling (class `usfm-book--layout-inline` on the wrapper).
     */
    layout?: 'split' | 'inline';
  };
}

export interface ResolvedUSFMChrome {
  preset: string;
  theme: 'dark' | 'document' | 'document-dark';
  header: {
    title: USFMHeaderTitleMode;
    titleText: string;
  };
  bookTitles: {
    title: USFMHeaderTitleMode;
    titleText: string;
  };
  bookIntroduction: {
    title: USFMHeaderTitleMode;
    titleText: string;
  };
  markers: {
    showGlyph: boolean;
  };
  bookId: {
    layout: 'split' | 'inline';
  };
}

const PRESET_BASE: Record<
  string,
  Pick<
    ResolvedUSFMChrome,
    'theme' | 'header' | 'bookTitles' | 'bookIntroduction' | 'markers' | 'bookId'
  > & {
    preset: string;
  }
> = {
  default: {
    preset: 'default',
    theme: 'document',
    header: { title: 'text', titleText: 'Book identification' },
    bookTitles: { title: 'text', titleText: 'Book titles' },
    bookIntroduction: { title: 'text', titleText: 'Book introduction' },
    markers: { showGlyph: true },
    bookId: { layout: 'split' },
  },
  minimal: {
    preset: 'minimal',
    theme: 'document',
    header: { title: 'none', titleText: 'Book identification' },
    bookTitles: { title: 'none', titleText: 'Book titles' },
    bookIntroduction: { title: 'none', titleText: 'Book introduction' },
    markers: { showGlyph: false },
    bookId: { layout: 'split' },
  },
  developer: {
    preset: 'developer',
    theme: 'dark',
    header: { title: 'text', titleText: 'Book identification' },
    bookTitles: { title: 'text', titleText: 'Book titles' },
    bookIntroduction: { title: 'text', titleText: 'Book introduction' },
    markers: { showGlyph: true },
    bookId: { layout: 'split' },
  },
};

function mergeChrome(base: ResolvedUSFMChrome, patch?: USFMEditorChrome): ResolvedUSFMChrome {
  if (!patch) return base;
  return {
    preset: patch.preset ?? base.preset,
    theme: patch.theme ?? base.theme,
    header: {
      title: patch.header?.title ?? base.header.title,
      titleText: patch.header?.titleText ?? base.header.titleText,
    },
    bookTitles: {
      title: patch.bookTitles?.title ?? base.bookTitles.title,
      titleText: patch.bookTitles?.titleText ?? base.bookTitles.titleText,
    },
    bookIntroduction: {
      title: patch.bookIntroduction?.title ?? base.bookIntroduction.title,
      titleText: patch.bookIntroduction?.titleText ?? base.bookIntroduction.titleText,
    },
    markers: {
      showGlyph: patch.markers?.showGlyph ?? base.markers.showGlyph,
    },
    bookId: {
      layout: patch.bookId?.layout ?? base.bookId.layout,
    },
  };
}

/**
 * Resolve preset + overrides into a full chrome config (for node views, `data-*` attrs, CSS).
 */
export function resolveUSFMChrome(input?: USFMEditorChrome): ResolvedUSFMChrome {
  const name = input?.preset ?? 'default';
  const preset = PRESET_BASE[name] ?? PRESET_BASE.default!;
  const base: ResolvedUSFMChrome = {
    preset: preset.preset,
    theme: preset.theme,
    header: { ...preset.header },
    bookTitles: { ...preset.bookTitles },
    bookIntroduction: { ...preset.bookIntroduction },
    markers: { ...preset.markers },
    bookId: { ...preset.bookId },
  };
  return mergeChrome(base, input);
}
