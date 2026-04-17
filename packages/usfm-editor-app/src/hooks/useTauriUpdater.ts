/**
 * Checks for application updates using `@tauri-apps/plugin-updater`.
 *
 * On mount, checks the GitHub Releases endpoint for a newer version.
 * Returns the available update (with install function) or `null` when
 * up-to-date. Only active inside Tauri.
 */
import { useCallback, useEffect, useState } from 'react';
import { usePlatform } from '@/platform/PlatformContext';
import { notifyUpdateAvailable } from '@/lib/tauri-notifications';

export type TauriUpdate = {
  version: string;
  body: string | null;
  install: () => Promise<void>;
};

export function useTauriUpdater(): {
  update: TauriUpdate | null;
  dismiss: () => void;
  checking: boolean;
} {
  const { platform } = usePlatform();
  const [update, setUpdate] = useState<TauriUpdate | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (platform !== 'tauri') return;
    let cancelled = false;

    setChecking(true);
    void import('@tauri-apps/plugin-updater')
      .then(async ({ check }) => {
        try {
          const available = await check();
          if (cancelled || !available) return;
          notifyUpdateAvailable(available.version);
          setUpdate({
            version: available.version,
            body: available.body ?? null,
            install: async () => {
              await available.downloadAndInstall();
              // The installer will restart the app.
            },
          });
        } catch {
          /* update check is non-fatal */
        } finally {
          if (!cancelled) setChecking(false);
        }
      })
      .catch(() => { if (!cancelled) setChecking(false); });

    return () => { cancelled = true; };
  }, [platform]);

  const dismiss = useCallback(() => setUpdate(null), []);

  return { update, dismiss, checking };
}
