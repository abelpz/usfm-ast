/**
 * Intercepts Tauri's `onCloseRequested` window event to:
 *  1. Flush any pending debounced save before the window is destroyed.
 *  2. Confirm with the user if there are still unsaved / un-synced changes.
 *
 * Only active when running inside Tauri (`platform === 'tauri'`).
 * On web, window-close behaviour is handled by the browser.
 */
import { useEffect } from 'react';
import { usePlatform } from '@/platform/PlatformContext';

export type CloseGuardOptions = {
  /**
   * Called before the close check. Should flush any pending debounced save
   * and return a promise that resolves when the flush is complete.
   */
  flushPendingSave?: () => Promise<void>;
  /**
   * Returns `true` if there are changes that haven't been synced to DCS yet.
   * When `true`, the user is prompted to confirm closing.
   */
  isDirty?: () => boolean;
};

export function useTauriCloseGuard(opts: CloseGuardOptions): void {
  const { platform } = usePlatform();

  useEffect(() => {
    if (platform !== 'tauri') return;

    let unlisten: (() => void) | undefined;

    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      void win.onCloseRequested(async (event) => {
        // Prevent the default close so we can do async work first.
        event.preventDefault();

        // Flush any pending debounced save.
        if (opts.flushPendingSave) {
          try {
            await opts.flushPendingSave();
          } catch {
            /* non-fatal */
          }
        }

        // If there are un-synced changes, confirm with the user.
        if (opts.isDirty?.()) {
          try {
            const { ask } = await import('@tauri-apps/plugin-dialog');
            const confirmed = await ask(
              'You have changes that have not been synced to Door43 yet. Close anyway?',
              { title: 'Unsaved sync', kind: 'warning' },
            );
            if (!confirmed) return;
          } catch {
            // If the dialog fails, allow close to proceed.
          }
        }

        // Allow the window to close.
        await win.destroy();
      }).then((fn) => { unlisten = fn; });
    });

    return () => { unlisten?.(); };
    // opts refs are stable if callers use useCallback/useRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);
}
