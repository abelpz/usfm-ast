/**
 * Capacitor filesystem adapter backed by `@capacitor/filesystem`.
 *
 * Paths are relative to `Directory.Data` (app-private data directory) by
 * default. Change `baseDir` to `Directory.Documents` for user-visible files.
 *
 * NOTE: Only available inside a Capacitor runtime.
 */
import type { FileSystemAdapter } from '../interfaces/fs-adapter';

export class CapacitorFileSystemAdapter implements FileSystemAdapter {
  async readFile(path: string): Promise<Uint8Array> {
    const { Filesystem } = await import('@capacitor/filesystem');
    const result = await Filesystem.readFile({ path });
    const b64 = typeof result.data === 'string' ? result.data : await (result.data as Blob).text();
    const raw = atob(b64);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    return buf;
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const { Filesystem } = await import('@capacitor/filesystem');
    let b64 = '';
    for (let i = 0; i < data.length; i++) b64 += String.fromCharCode(data[i]!);
    await Filesystem.writeFile({ path, data: btoa(b64) });
  }

  async readText(path: string): Promise<string> {
    const { Filesystem, Encoding } = await import('@capacitor/filesystem');
    const result = await Filesystem.readFile({
      path,
      encoding: Encoding.UTF8 as typeof Encoding.UTF8,
    });
    return typeof result.data === 'string' ? result.data : await (result.data as Blob).text();
  }

  async writeText(path: string, text: string): Promise<void> {
    const { Filesystem, Encoding } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({
      path,
      data: text,
      encoding: Encoding.UTF8 as typeof Encoding.UTF8,
    });
  }

  async exists(path: string): Promise<boolean> {
    const { Filesystem } = await import('@capacitor/filesystem');
    try {
      await Filesystem.stat({ path });
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string, _recursive?: boolean): Promise<void> {
    const { Filesystem } = await import('@capacitor/filesystem');
    await Filesystem.mkdir({ path, recursive: true });
  }

  async listDir(path: string): Promise<string[]> {
    const { Filesystem } = await import('@capacitor/filesystem');
    const result = await Filesystem.readdir({ path });
    return result.files.map((f: string | { name: string }) => (typeof f === 'string' ? f : f.name));
  }

  async remove(path: string, _recursive?: boolean): Promise<void> {
    const { Filesystem } = await import('@capacitor/filesystem');
    try {
      await Filesystem.deleteFile({ path });
    } catch {
      await Filesystem.rmdir({ path, recursive: true });
    }
  }

  async copy(src: string, dest: string): Promise<void> {
    const { Filesystem } = await import('@capacitor/filesystem');
    await Filesystem.copy({ from: src, to: dest });
  }
}
