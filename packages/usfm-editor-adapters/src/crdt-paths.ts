/**
 * crdt-paths — helpers for the `crdt/<BOOK>.ybin` storage convention.
 *
 * Design (docs/31-online-sync-redesign.md §4 Phase 4):
 *   files/JHN.usfm  ←→  crdt/JHN.ybin
 *
 * The `.ybin` file is a Yjs V2 state update (binary, base64-encoded in
 * the string-only ProjectStorage layer).  It is stored *alongside* the
 * canonical `.usfm` text so legacy readers are never broken.
 */

/** True when `path` is a Yjs CRDT binary blob. */
export function isYbinPath(path: string): boolean {
  return path.replace(/\\/g, '/').toLowerCase().endsWith('.ybin');
}

/**
 * Derive the `.ybin` storage path from a USFM file path.
 *
 * @example
 *   crdtPathFromUsfm('files/JHN.usfm')   // → 'crdt/JHN.ybin'
 *   crdtPathFromUsfm('65-3JN.usfm')       // → 'crdt/65-3JN.ybin'
 */
export function crdtPathFromUsfm(usfmPath: string): string {
  const norm = usfmPath.replace(/\\/g, '/');
  const filename = norm.split('/').pop() ?? norm;
  const base = filename.replace(/\.(usfm|sfm)$/i, '');
  return `crdt/${base}.ybin`;
}

/**
 * Resolve back to the USFM path stored under `files/` from a `.ybin` path.
 * Returns `null` for paths that do not follow the `crdt/` convention.
 *
 * @example
 *   usfmPathFromCrdt('crdt/JHN.ybin')   // → 'files/JHN.usfm'
 */
export function usfmPathFromCrdt(ybinPath: string): string | null {
  const norm = ybinPath.replace(/\\/g, '/');
  const m = norm.match(/(?:^|\/)crdt\/(.+)\.ybin$/i);
  if (!m) return null;
  return `files/${m[1]}.usfm`;
}
