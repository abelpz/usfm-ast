/**
 * Listens for Tauri file drop events on the main window and passes dropped
 * files to the provided handler as `{ name, content }` pairs.
 *
 * Tauri v2 uses `onDragDropEvent` on the webview window. The event fires with
 * a list of absolute paths; we read each file as text and forward it.
 *
 * Only active when `platform === 'tauri'`. On web, use the browser's
 * native drag-and-drop events directly.
 */
import { useEffect } from 'react';
import { usePlatform } from '@/platform/PlatformContext';

export type DroppedFile = {
  name: string;
  path: string;
  content: string;
};

export function useTauriFileDrop(
  onFiles: (files: DroppedFile[]) => void,
): void {
  const { platform } = usePlatform();

  useEffect(() => {
    if (platform !== 'tauri') return;

    let unlisten: (() => void) | undefined;

    void Promise.all([
      import('@tauri-apps/api/window'),
      import('@tauri-apps/plugin-fs'),
    ]).then(async ([{ getCurrentWindow }, { readTextFile }]) => {
      const win = getCurrentWindow();
      unlisten = await win.onDragDropEvent(async (event) => {
        if (event.payload.type !== 'drop') return;
        const paths: string[] = event.payload.paths ?? [];

        const results: DroppedFile[] = [];
        for (const p of paths) {
          try {
            const content = await readTextFile(p);
            const parts = p.replace(/\\/g, '/').split('/');
            const name = parts[parts.length - 1] ?? p;
            results.push({ name, path: p, content });
          } catch {
            /* skip unreadable files */
          }
        }
        if (results.length > 0) onFiles(results);
      });
    });

    return () => { unlisten?.(); };
    // onFiles identity is managed by the caller (useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);
}
