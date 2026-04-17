/**
 * OS notification helpers for the Tauri desktop shell.
 *
 * Wraps `@tauri-apps/plugin-notification` with:
 *  - Tauri environment check (no-op on web)
 *  - Permission request on first use
 *  - Convenience functions for sync events
 *
 * All functions are safe to call from non-Tauri environments; they silently
 * do nothing when `window.__TAURI_INTERNALS__` is absent.
 */

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let permissionGranted = false;
let permissionChecked = false;

async function ensurePermission(): Promise<boolean> {
  if (!isTauri) return false;
  if (permissionGranted) return true;
  if (permissionChecked) return false;
  permissionChecked = true;
  try {
    const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
    if (await isPermissionGranted()) {
      permissionGranted = true;
      return true;
    }
    const result = await requestPermission();
    permissionGranted = result === 'granted';
    return permissionGranted;
  } catch {
    return false;
  }
}

async function sendNotification(title: string, body: string): Promise<void> {
  if (!(await ensurePermission())) return;
  try {
    const { sendNotification: send } = await import('@tauri-apps/plugin-notification');
    send({ title, body });
  } catch {
    /* best-effort */
  }
}

/** Notify the user that changes were successfully synced to Door43. */
export function notifySyncSuccess(projectName: string, target: string): void {
  void sendNotification('Sync complete', `"${projectName}" was pushed to ${target}.`);
}

/** Notify the user that a sync permanently failed (max retries exceeded). */
export function notifySyncFailure(projectId: string, reason: string): void {
  void sendNotification('Sync failed', `Could not sync "${projectId}": ${reason}`);
}

/** Notify the user that an auto-merge conflict was detected. */
export function notifySyncConflict(projectName: string, prUrl: string): void {
  void sendNotification(
    'Merge conflict detected',
    `"${projectName}" needs manual resolution. Open Door43: ${prUrl}`,
  );
}

/** Notify the user that a software update is available. */
export function notifyUpdateAvailable(version: string): void {
  void sendNotification('Update available', `USFM Editor ${version} is ready to install.`);
}
