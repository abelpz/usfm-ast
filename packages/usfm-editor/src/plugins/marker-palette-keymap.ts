import { keydownHandler } from 'prosemirror-keymap';
import type { Command } from 'prosemirror-state';
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

export interface MarkerPaletteKeymapOptions {
  /**
   * ProseMirror key binding (same format as `keymap()` from `prosemirror-keymap`).
   * Examples: `'\\'`, `'Mod-Shift-m'`, `'F2'`.
   * @default '\\'
   */
  triggerKey?: string;
  /**
   * Dynamic trigger (e.g. user preference). When set and returns a non-empty string,
   * overrides {@link triggerKey}.
   */
  getTriggerKey?: () => string;
}

function resolveBinding(options?: MarkerPaletteKeymapOptions): string {
  const fromGetter = options?.getTriggerKey?.();
  if (fromGetter != null && fromGetter !== '') return fromGetter;
  return options?.triggerKey ?? '\\';
}

/**
 * Intercept a configurable key (default `\`) to open the marker palette in the host app (no DOM here).
 * Returns `true` so the trigger key is not inserted into the document when it is a printable character.
 *
 * Wire {@link onOpen} to UI that shows a searchable marker list; call `view.focus()` when closing.
 *
 * Use {@link MarkerPaletteKeymapOptions.getTriggerKey} so users can change the shortcut at runtime
 * (e.g. `Mod-Shift-m` when backslash is awkward on their keyboard layout) without recreating the editor.
 */
export function markerPaletteKeymap(
  onOpen: (view: EditorView) => void,
  options?: MarkerPaletteKeymapOptions
): Plugin {
  const cmd: Command = (_state, _dispatch, view) => {
    if (!view) return false;
    onOpen(view);
    return true;
  };

  let cachedBinding: string | undefined;
  let cachedHandler: ((view: EditorView, event: KeyboardEvent) => boolean) | undefined;

  function handlerFor(binding: string) {
    if (binding !== cachedBinding) {
      cachedBinding = binding;
      try {
        cachedHandler = keydownHandler({ [binding]: cmd });
      } catch {
        cachedHandler = undefined;
      }
    }
    return cachedHandler;
  }

  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        const binding = resolveBinding(options);
        const h = handlerFor(binding);
        if (!h) return false;
        try {
          return h(view, event);
        } catch {
          return false;
        }
      },
    },
  });
}
