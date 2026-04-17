/**
 * Offline export/import of a project snapshot as `*.usfmbundle.zip` (JSZip).
 */

import JSZip from 'jszip';
import type { FileConflict, ProjectStorage } from '@usfm-tools/types';
import { mergeProjectMaps } from '@usfm-tools/editor-adapters';

export const BUNDLE_MANIFEST = 'bundle-manifest.json';

export type BundleManifest = {
  schema: 1;
  projectId: string;
  exportedAt: string;
  /** repo-relative path → sha256 hex of UTF-8 content */
  files: Record<string, string>;
};

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function exportProjectBundle(options: {
  storage: ProjectStorage;
  projectId: string;
  /**
   * Optional legacy extra `journal/project.jsonl` in the zip root.
   * Prefer relying on `journal/<BOOK>.jsonl` already included under `files/` from project storage.
   */
  journalJsonl?: string;
}): Promise<Blob> {
  const { storage, projectId } = options;
  const paths = await storage.listFiles(projectId);
  const zip = new JSZip();
  const filesFolder = zip.folder('files');
  if (!filesFolder) throw new Error('zip: failed to create files folder');

  const manifestFiles: Record<string, string> = {};

  for (const p of paths.sort()) {
    const content = await storage.readFile(projectId, p);
    if (content === null) continue;
    filesFolder.file(p.replace(/\\/g, '/'), content);
    manifestFiles[p.replace(/\\/g, '/')] = await sha256Hex(content);
  }

  if (options.journalJsonl?.trim()) {
    zip.file('journal/project.jsonl', options.journalJsonl);
  }
  /* Per-book `journal/<BOOK>.jsonl` is exported via `files/` when present in storage. */

  const manifest: BundleManifest = {
    schema: 1,
    projectId,
    exportedAt: new Date().toISOString(),
    files: manifestFiles,
  };
  zip.file(BUNDLE_MANIFEST, JSON.stringify(manifest, null, 2));

  return zip.generateAsync({ type: 'blob' });
}

export type ImportProjectBundleResult = {
  importedPaths: string[];
  /**
   * File-level merge conflicts that the caller must resolve before the bundle is
   * fully applied.  Only populated when `enableMerge` is `true` and a file exists
   * in receiver storage with different content.
   *
   * For each conflict `oursText` is the existing local file and `theirsText` is
   * the bundle file.  An empty string on either side means that side deleted the
   * file.  Resolve by writing `oursText` or `theirsText` (or deleting) and then
   * calling `onImported`.
   */
  conflicts: FileConflict[];
  /** Legacy `journal/project.jsonl` from older bundles (if present). */
  journalJsonl?: string;
};

export async function importProjectBundle(options: {
  storage: ProjectStorage;
  projectId: string;
  blob: Blob;
  /**
   * When `true`, files that already exist in receiver storage are three-way
   * merged (with empty-string as the common base, which conservatively surfaces
   * a conflict whenever local and bundle content differ).  Non-conflicting
   * files are written immediately; conflicting files are returned in `conflicts`
   * for the caller to resolve via {@link SyncConflictDialog}.
   *
   * Default: `false` (overwrite mode — same behaviour as before).
   */
  enableMerge?: boolean;
}): Promise<ImportProjectBundleResult> {
  const { storage, projectId, blob, enableMerge = false } = options;
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const manifestRaw = await zip.file(BUNDLE_MANIFEST)?.async('string');
  if (!manifestRaw) throw new Error('Bundle missing bundle-manifest.json');
  const manifest = JSON.parse(manifestRaw) as BundleManifest;
  if (manifest.schema !== 1 || !manifest.files) {
    throw new Error('Invalid bundle manifest');
  }

  // Build a map of bundle file contents (after checksum verification).
  const bundleFiles = new Map<string, string>();
  const filesFolder = zip.folder('files');
  if (filesFolder) {
    for (const [relPath, expectedSha] of Object.entries(manifest.files)) {
      const f = filesFolder.file(relPath);
      if (!f) continue;
      const content = await f.async('string');
      const h = await sha256Hex(content);
      if (h !== expectedSha) {
        throw new Error(`Checksum mismatch for ${relPath}`);
      }
      bundleFiles.set(relPath, content);
    }
  }

  const importedPaths: string[] = [];
  const conflicts: FileConflict[] = [];

  if (enableMerge) {
    // Pre-load existing storage files synchronously for mergeProjectMaps.
    const existingPaths = await storage.listFiles(projectId);
    const existingFiles = new Map<string, string>();
    for (const p of existingPaths) {
      const v = await storage.readFile(projectId, p);
      if (v !== null) existingFiles.set(p, v);
    }

    // Three-way merge: base = undefined (conservatively surfaces a conflict on any
    // divergence between local and bundle), ours = local storage, theirs = bundle.
    const allPaths = new Set([...bundleFiles.keys(), ...existingFiles.keys()]);
    const { merged, conflicts: mergeConflicts } = mergeProjectMaps({
      paths: allPaths,
      getBase: () => undefined,
      getOurs: (p) => existingFiles.get(p),
      getTheirs: (p) => bundleFiles.get(p),
    });

    // Write cleanly merged files immediately.
    for (const [path, content] of merged) {
      await storage.writeFile(projectId, path, content);
      importedPaths.push(path);
    }
    conflicts.push(...mergeConflicts);
  } else {
    // Simple overwrite mode.
    for (const [relPath, content] of bundleFiles) {
      await storage.writeFile(projectId, relPath, content);
      importedPaths.push(relPath);
    }
  }

  let journalJsonl: string | undefined;
  const legacyJournal = zip.file('journal/project.jsonl');
  if (legacyJournal) {
    journalJsonl = await legacyJournal.async('string');
  }

  return { importedPaths, conflicts, journalJsonl };
}
