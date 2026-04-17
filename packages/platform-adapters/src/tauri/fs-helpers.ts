/**
 * Shared filesystem helpers for the Tauri FS storage implementations.
 * These are internal utilities — do not re-export from the package barrel.
 */
import type { FileSystemAdapter } from '../interfaces/fs-adapter';

/**
 * Read and JSON-parse a file. Returns `null` if the file does not exist or
 * cannot be parsed, so callers can treat missing files as empty state.
 */
export async function readJsonOrNull<T>(
  fs: FileSystemAdapter,
  path: string,
): Promise<T | null> {
  try {
    const text = await fs.readText(path);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * JSON-serialize `value` and write it to `path`, creating parent directories
 * as needed.
 */
export async function writeJson(
  fs: FileSystemAdapter,
  path: string,
  value: unknown,
): Promise<void> {
  const dir = path.substring(0, path.lastIndexOf('/'));
  if (dir) await fs.mkdir(dir, true);
  await fs.writeText(path, JSON.stringify(value, null, 2));
}

/**
 * Recursively list all files under `absDir`, returning paths relative to
 * `baseDir`.
 *
 * The `FileSystemAdapter.listDir` contract is to throw (or reject) when the
 * path does not exist or is not a directory. We therefore classify an entry
 * as a **directory** only when `listDir` succeeds AND returns at least one
 * child. An empty `listDir` result (no children) is treated as a **file** to
 * avoid silently dropping empty-looking leaf nodes.
 */
export async function listFilesRecursive(
  fs: FileSystemAdapter,
  absDir: string,
  baseDir: string,
): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.listDir(absDir);
  } catch {
    return [];
  }

  const out: string[] = [];

  for (const entry of entries) {
    const abs = `${absDir}/${entry}`;
    const rel = baseDir ? `${baseDir}/${entry}` : entry;

    let children: string[] | null = null;
    try {
      children = await fs.listDir(abs);
    } catch {
      // listDir threw → entry is a file.
    }

    if (children !== null && children.length > 0) {
      // Entry is a non-empty directory — recurse.
      const nested = await listFilesRecursive(fs, abs, rel);
      out.push(...nested);
    } else {
      // Entry is either a file, or an empty directory — treat as file.
      out.push(rel);
    }
  }

  return out;
}
