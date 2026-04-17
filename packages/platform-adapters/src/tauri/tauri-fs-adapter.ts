/**
 * Tauri filesystem adapter backed by `@tauri-apps/plugin-fs`.
 *
 * All paths are resolved relative to `BaseDirectory.AppData` by default
 * (platform-appropriate: `%APPDATA%` on Windows,
 * `~/Library/Application Support` on macOS, `~/.local/share` on Linux).
 *
 * NOTE: Only available inside a Tauri runtime.
 */
import type { FileSystemAdapter } from '../interfaces/fs-adapter';

export class TauriFileSystemAdapter implements FileSystemAdapter {
  async readFile(path: string): Promise<Uint8Array> {
    const { readFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    return readFile(path, { baseDir: BaseDirectory.AppData });
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const { writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await writeFile(path, data, { baseDir: BaseDirectory.AppData });
  }

  async readText(path: string): Promise<string> {
    const { readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    return readTextFile(path, { baseDir: BaseDirectory.AppData });
  }

  async writeText(path: string, text: string): Promise<void> {
    const { writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(path, text, { baseDir: BaseDirectory.AppData });
  }

  async exists(path: string): Promise<boolean> {
    const { exists, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    return exists(path, { baseDir: BaseDirectory.AppData });
  }

  async mkdir(path: string, recursive = true): Promise<void> {
    const { mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await mkdir(path, { recursive, baseDir: BaseDirectory.AppData });
  }

  async listDir(path: string): Promise<string[]> {
    const { readDir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const entries = await readDir(path, { baseDir: BaseDirectory.AppData });
    return entries.map((e: { name?: string }) => e.name ?? '').filter(Boolean);
  }

  async remove(path: string, recursive = false): Promise<void> {
    const { remove, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await remove(path, { recursive, baseDir: BaseDirectory.AppData });
  }

  async copy(src: string, dest: string): Promise<void> {
    const { copyFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await copyFile(src, dest, { baseDir: BaseDirectory.AppData });
  }
}
