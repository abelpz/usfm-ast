const STORAGE_KEY = 'usfm-editor.markerPaletteTrigger';

/** Preset values are ProseMirror keymap names (see `prosemirror-keymap`). */
export const MARKER_PALETTE_TRIGGER_PRESETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '\\', label: 'Backslash (\\)' },
  { value: 'Mod-Shift-m', label: 'Ctrl+Shift+M (⌘⇧M on Mac)' },
  { value: 'F2', label: 'F2' },
];

export function getStoredMarkerPaletteTrigger(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v != null && v !== '') return v;
  } catch {
    /* ignore */
  }
  return '\\';
}

export function setStoredMarkerPaletteTrigger(binding: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, binding);
  } catch {
    /* ignore */
  }
}

/** Plain text for help lines (no HTML). */
export function formatMarkerPaletteTriggerForHelp(binding: string): string {
  if (binding === '\\') return '\\';
  if (binding === 'Mod-Shift-m') return 'Ctrl+Shift+M (⌘⇧M on Mac)';
  if (binding === 'F2') return 'F2';
  return binding;
}
