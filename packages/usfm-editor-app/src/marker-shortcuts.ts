import { SHORTCUT_SPECIAL, type MarkerShortcut } from '@usfm-tools/editor';

const STORAGE_KEY = 'usfm-editor.markerShortcuts';

/**
 * Default shortcuts that mirror the existing built-in keymap bindings so users
 * can see and override them from the settings UI.
 */
export const DEFAULT_MARKER_SHORTCUTS: ReadonlyArray<MarkerShortcut> = [
  { marker: SHORTCUT_SPECIAL.VERSE, key: 'Mod-Shift-v' },
  { marker: SHORTCUT_SPECIAL.CHAPTER, key: 'Mod-Shift-c' },
  { marker: SHORTCUT_SPECIAL.SPLIT, key: 'Mod-Shift-p' },
];

export function getStoredMarkerShortcuts(): MarkerShortcut[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return (parsed as unknown[]).filter(
          (x): x is MarkerShortcut =>
            typeof x === 'object' &&
            x !== null &&
            typeof (x as MarkerShortcut).marker === 'string' &&
            typeof (x as MarkerShortcut).key === 'string',
        );
      }
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_MARKER_SHORTCUTS];
}

export function setStoredMarkerShortcuts(shortcuts: MarkerShortcut[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
  } catch {
    /* ignore */
  }
}

/** Human-readable label for a marker id (used in the settings UI). */
export const MARKER_SHORTCUT_LABELS: ReadonlyArray<{ marker: string; label: string }> = [
  { marker: SHORTCUT_SPECIAL.VERSE, label: 'Next verse (\\v)' },
  { marker: SHORTCUT_SPECIAL.CHAPTER, label: 'Next chapter (\\c)' },
  { marker: SHORTCUT_SPECIAL.SPLIT, label: 'New paragraph (\\p)' },
  { marker: SHORTCUT_SPECIAL.TS_SECTION, label: 'Translator section (\\ts)' },
  { marker: SHORTCUT_SPECIAL.BOOK_TITLES, label: 'Book titles section' },
  { marker: 'p', label: '\\p — Paragraph' },
  { marker: 'q', label: '\\q — Poetic line' },
  { marker: 'q1', label: '\\q1 — Poetic line 1' },
  { marker: 'q2', label: '\\q2 — Poetic line 2' },
  { marker: 'q3', label: '\\q3 — Poetic line 3' },
  { marker: 'm', label: '\\m — Continuation paragraph' },
  { marker: 'nb', label: '\\nb — No break paragraph' },
  { marker: 'b', label: '\\b — Blank line' },
  { marker: 's', label: '\\s — Section heading' },
  { marker: 's1', label: '\\s1 — Section heading 1' },
  { marker: 's2', label: '\\s2 — Section heading 2' },
  { marker: 'r', label: '\\r — Parallel passage reference' },
  { marker: 'd', label: '\\d — Descriptive title' },
  { marker: 'ms', label: '\\ms — Major section heading' },
  { marker: 'mr', label: '\\mr — Major section reference range' },
  { marker: 'pi', label: '\\pi — Indented paragraph' },
  { marker: 'li', label: '\\li — List item' },
  { marker: 'li1', label: '\\li1 — List item 1' },
  { marker: 'li2', label: '\\li2 — List item 2' },
];

export function labelForMarker(marker: string): string {
  return MARKER_SHORTCUT_LABELS.find((m) => m.marker === marker)?.label ?? `\\${marker}`;
}

/** Re-export for convenience so consumers only need to import from this module. */
export { SHORTCUT_SPECIAL };
export type { MarkerShortcut };
