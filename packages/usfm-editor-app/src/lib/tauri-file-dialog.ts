/**
 * Native file open/save helpers using `@tauri-apps/plugin-dialog`.
 *
 * On Tauri, these replace `<input type="file">` and `<a download>` flows with
 * OS-native pickers. On web they fall back to the browser-based approach so
 * the module is safe to import unconditionally.
 *
 * All functions guard against non-Tauri environments by checking
 * `window.__TAURI_INTERNALS__` before importing the native plugin.
 */

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

type OpenResult = { path: string; content: string } | null;

/**
 * Show a native "Open file" dialog and read the selected file as text.
 * Returns `null` if the user cancels or the environment is not Tauri.
 */
export async function nativeOpenFile(opts?: {
  filters?: Array<{ name: string; extensions: string[] }>;
}): Promise<OpenResult> {
  if (!isTauri) return null;
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      filters: opts?.filters ?? [
        { name: 'Scripture files', extensions: ['usfm', 'sfm', 'txt', 'usx', 'xml', 'usj', 'json'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (!selected || typeof selected !== 'string') return null;

    const { readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    // `open` returns an absolute path; readTextFile with no baseDir handles that.
    void BaseDirectory; // imported for type completeness only
    const content = await readTextFile(selected);
    return { path: selected, content };
  } catch {
    return null;
  }
}

/**
 * Show a native "Save file" dialog and write `content` to the chosen path.
 * Returns `true` on success, `false` if the user cancels or on error.
 */
export async function nativeSaveFile(
  content: string,
  opts?: {
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  },
): Promise<boolean> {
  if (!isTauri) return false;
  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const selected = await save({
      defaultPath: opts?.defaultPath ?? 'export.usfm',
      filters: opts?.filters ?? [
        { name: 'USFM', extensions: ['usfm', 'sfm', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (!selected) return false;

    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(selected, content);
    return true;
  } catch {
    return false;
  }
}
