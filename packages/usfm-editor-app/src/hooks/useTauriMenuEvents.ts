/**
 * Listens for native application menu events forwarded by the Tauri Rust host
 * and calls the appropriate handler.
 *
 * The Rust side emits a `menu-event` Tauri event with the menu item ID as the
 * payload. This hook subscribes once on mount and unsubscribes on unmount.
 *
 * Only active when running inside Tauri (`platform === 'tauri'`).
 */
import { useEffect } from 'react';
import { usePlatform } from '@/platform/PlatformContext';

export type TauriMenuHandlers = {
  /** File → New Project */
  onNewProject?: () => void;
  /** File → Open File… */
  onOpenFile?: () => void;
  /** File → Export USFM… */
  onExportUsfm?: () => void;
  /** View → Toggle Reference Panel */
  onToggleReference?: () => void;
  /** View → Toggle USFM Source */
  onToggleUsfmSource?: () => void;
  /** View → Offline Source Cache */
  onOpenSourceCache?: () => void;
  /** Help → Help & Shortcuts */
  onHelp?: () => void;
  /** Help → Online Documentation */
  onHelpDocs?: () => void;
};

export function useTauriMenuEvents(handlers: TauriMenuHandlers): void {
  const { platform } = usePlatform();

  useEffect(() => {
    if (platform !== 'tauri') return;

    let unlisten: (() => void) | undefined;

    // Dynamically import Tauri API to avoid errors in web builds.
    void import('@tauri-apps/api/event').then(({ listen }) => {
      void listen<string>('menu-event', (event) => {
        const id = event.payload;
        switch (id) {
          case 'file-new-project':   handlers.onNewProject?.();      break;
          case 'file-open':          handlers.onOpenFile?.();         break;
          case 'file-export-usfm':   handlers.onExportUsfm?.();      break;
          case 'view-reference-panel': handlers.onToggleReference?.(); break;
          case 'view-usfm-source':   handlers.onToggleUsfmSource?.(); break;
          case 'view-source-cache':  handlers.onOpenSourceCache?.();  break;
          case 'help-shortcuts':     handlers.onHelp?.();             break;
          case 'help-docs':          handlers.onHelpDocs?.();         break;
        }
      }).then((fn) => { unlisten = fn; });
    });

    return () => { unlisten?.(); };
    // handlers object changes every render, but we only want to subscribe once.
    // Callers should memoize handler references (useCallback) for correctness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);
}
