import type { ProjectMeta } from '@usfm-tools/types';

/** Paths that did not exist locally before the last bundle import (`null` in snapshot). */
export function newPathsFromSnapshot(
  meta?: { bundleImportSnapshot?: { files: Record<string, string | null> } } | null,
): string[] {
  const files = meta?.bundleImportSnapshot?.files;
  if (!files) return [];
  return Object.entries(files)
    .filter(([, v]) => v === null)
    .map(([p]) => p);
}

/** Book codes whose USFM path was newly added in the last import. */
export function newBookCodesFromSnapshot(
  meta: ProjectMeta | null | undefined,
  books: { code: string; path: string }[],
): Set<string> {
  const newPaths = new Set(newPathsFromSnapshot(meta));
  const out = new Set<string>();
  for (const b of books) {
    const norm = b.path.replace(/^\.\//, '').replace(/\\/g, '/');
    if (newPaths.has(norm)) {
      out.add(b.code);
      continue;
    }
    const fileName = norm.split('/').pop() ?? norm;
    for (const np of newPaths) {
      if (np === norm || np.endsWith(`/${fileName}`) || np === fileName) {
        out.add(b.code);
        break;
      }
    }
  }
  return out;
}
