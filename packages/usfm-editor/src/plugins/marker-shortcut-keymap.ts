import { keydownHandler } from 'prosemirror-keymap';
import type { Command } from 'prosemirror-state';
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  insertBookTitlesSection,
  insertNextChapter,
  insertNextVerse,
  insertParagraph,
  insertTranslatorSection,
} from '../commands';

/**
 * Well-known pseudo-marker IDs that map to structural insertions rather than
 * plain paragraph markers.  These mirror the `SPECIAL_MARKER` constants in the
 * Chrome layer so a single string can be used consistently across storage,
 * the plugin, and the settings UI.
 */
export const SHORTCUT_SPECIAL = {
  VERSE: '__verse__',
  CHAPTER: '__chapter__',
  /** Insert a new paragraph (`\\p`) at the cursor — same as the Palette "split" action. */
  SPLIT: '__split__',
  BOOK_TITLES: '__book_titles__',
  TS_SECTION: '__ts_section__',
} as const;

export type ShortcutSpecial = (typeof SHORTCUT_SPECIAL)[keyof typeof SHORTCUT_SPECIAL];

export interface MarkerShortcut {
  /** Marker tag (`p`, `s1`, …) or one of the {@link SHORTCUT_SPECIAL} values. */
  marker: string;
  /**
   * ProseMirror key binding string, e.g. `Mod-Shift-v`, `F3`.
   * Uses the same format as `prosemirror-keymap`.
   */
  key: string;
}

function commandForMarker(marker: string): Command {
  switch (marker) {
    case SHORTCUT_SPECIAL.VERSE:
      return insertNextVerse();
    case SHORTCUT_SPECIAL.CHAPTER:
      return insertNextChapter();
    case SHORTCUT_SPECIAL.SPLIT:
      return insertParagraph('p');
    case SHORTCUT_SPECIAL.BOOK_TITLES:
      return insertBookTitlesSection();
    case SHORTCUT_SPECIAL.TS_SECTION:
      return insertTranslatorSection();
    default:
      return insertParagraph(marker);
  }
}

/**
 * Dynamic ProseMirror plugin that fires configurable key bindings to insert
 * USFM markers.  Shortcuts are re-read from {@link getShortcuts} on every
 * keydown so changes made in the settings UI take effect immediately without
 * rebuilding the editor.
 *
 * Handlers are cached by `key:marker` to avoid recreating them on every event.
 */
export function markerShortcutKeymap(getShortcuts: () => MarkerShortcut[]): Plugin {
  const cache = new Map<string, ((view: EditorView, event: KeyboardEvent) => boolean) | null>();

  function getHandler(key: string, marker: string) {
    const cacheKey = `${key}\0${marker}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;
    let handler: ((view: EditorView, event: KeyboardEvent) => boolean) | null = null;
    try {
      handler = keydownHandler({ [key]: commandForMarker(marker) });
    } catch {
      handler = null;
    }
    cache.set(cacheKey, handler);
    return handler;
  }

  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        const shortcuts = getShortcuts();
        for (const sc of shortcuts) {
          if (!sc.key || !sc.marker) continue;
          const handler = getHandler(sc.key, sc.marker);
          if (handler?.(view, event)) return true;
        }
        return false;
      },
    },
  });
}
