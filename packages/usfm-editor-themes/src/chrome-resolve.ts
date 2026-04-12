/**
 * Chrome preset resolution and theme ids for `@usfm-tools/editor-themes`.
 */

export type USFMHeaderTitleMode = 'none' | 'text' | 'icon';

/** Built-in `data-usfm-theme` values; any other string is allowed for custom CSS. */
export type BuiltinTheme = 'dark' | 'document' | 'document-dark';

export interface USFMEditorChrome {
  preset?: 'default' | 'minimal' | 'developer';
  theme?: string;
  header?: {
    title?: USFMHeaderTitleMode;
    titleText?: string;
  };
  bookTitles?: {
    title?: USFMHeaderTitleMode;
    titleText?: string;
  };
  bookIntroduction?: {
    title?: USFMHeaderTitleMode;
    titleText?: string;
  };
  markers?: {
    showGlyph?: boolean;
  };
  bookId?: {
    layout?: 'split' | 'inline';
  };
}

export interface ResolvedUSFMChrome {
  preset: string;
  theme: string;
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

/** Resolve preset + overrides into a full chrome config (for node views, `data-*` attrs, CSS). */
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
