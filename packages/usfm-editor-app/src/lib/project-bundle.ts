/**
 * Offline export/import of a project snapshot as `*.bible.project.zip` (JSZip),
 * with a root `project-manifest.json` listing file checksums.
 */

import JSZip from 'jszip';
import type { ConflictBaseSource, FileConflict, ProjectDocSyncSidecar, ProjectStorage } from '@usfm-tools/types';
import { mergeProjectMaps } from '@usfm-tools/editor-adapters';
import { writeFileWithCrdt } from './crdt-storage';

/** Root manifest filename inside the zip (schema 1). */
export const PROJECT_BUNDLE_MANIFEST = 'project-manifest.json';

/**
 * Paths under these prefixes are local bookkeeping (per-device state).
 * They must never be exported into a bundle and must never overwrite
 * the receiver's own copy on import.
 */
const LOCAL_STATE_PREFIXES = ['.sync/', 'journal/'];

function isLocalStateFile(p: string): boolean {
  const norm = p.replace(/\\/g, '/');
  return LOCAL_STATE_PREFIXES.some((pre) => norm.startsWith(pre));
}

export type BundleManifest = {
  schema: 1;
  projectId: string;
  exportedAt: string;
  /** repo-relative path → sha256 hex of UTF-8 content */
  files: Record<string, string>;
};

/** Strip characters illegal in common OS file names; collapse whitespace. */
export function sanitizeProjectDisplayNameForFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Suggested download basename: `Name (ID).bible.project.zip`, or `ID.bible.project.zip` if the name is empty after sanitizing.
 */
export function bibleProjectZipDownloadBasename(displayName: string, projectId: string): string {
  const safe = sanitizeProjectDisplayNameForFilename(displayName);
  if (!safe) return `${projectId}.bible.project.zip`;
  return `${safe} (${projectId}).bible.project.zip`;
}

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
    // Sidecars and journals are local bookkeeping — never bundle them
    if (isLocalStateFile(p)) continue;
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
  zip.file(PROJECT_BUNDLE_MANIFEST, JSON.stringify(manifest, null, 2));

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

// ---------------------------------------------------------------------------
// Bundle base resolution chain
// ---------------------------------------------------------------------------

function sidecarPathForFilePath(filePath: string): string | undefined {
  const l = filePath.toLowerCase();
  if (!l.endsWith('.usfm') && !l.endsWith('.sfm')) return undefined;
  const base = filePath.replace(/\.(usfm|sfm)$/i, '');
  const bookCode = base.split('/').pop() ?? base;
  return `.sync/${bookCode.toUpperCase()}.json`;
}

function parseSidecar(raw: string | null | undefined): ProjectDocSyncSidecar | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as ProjectDocSyncSidecar;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the common ancestor (base) text for importing one file (bundle zip or plain USFM handoff).
 *
 * Strategy: if optional **incoming** sidecar and receiver `.sync/<BOOK>.json` share the same
 * `baseCommit`, return empty base with `sidecar-match`; else `none`.
 * Plain USFM has no sidecar — pass `incomingSidecarText` as `undefined`.
 */
export async function resolveImportBaseForFilePath(opts: {
  storage: ProjectStorage;
  projectId: string;
  filePath: string;
  /** From bundle `files/.sync/…` or omit for plain USFM. */
  incomingSidecarText?: string | null;
}): Promise<{ base: string; source: ConflictBaseSource }> {
  const { storage, projectId, filePath, incomingSidecarText } = opts;
  const sidecarPath = sidecarPathForFilePath(filePath);
  if (!sidecarPath) return { base: '', source: 'none' };
  const incomingSidecar = parseSidecar(incomingSidecarText ?? null);
  const receiverSidecarRaw = await storage.readFile(projectId, sidecarPath);
  const receiverSidecar = parseSidecar(receiverSidecarRaw);
  if (
    incomingSidecar?.baseCommit &&
    receiverSidecar?.baseCommit &&
    incomingSidecar.baseCommit === receiverSidecar.baseCommit
  ) {
    return { base: '', source: 'sidecar-match' };
  }
  return { base: '', source: 'none' };
}

/**
 * @internal — bundle import only; use {@link resolveImportBaseForFilePath} for new code.
 */
async function resolveBundleBaseFromZip(opts: {
  zip: JSZip;
  storage: ProjectStorage;
  projectId: string;
  filePath: string;
}): Promise<{ base: string; source: ConflictBaseSource }> {
  const { zip, filePath } = opts;
  const sidecarPath = sidecarPathForFilePath(filePath);
  if (!sidecarPath) {
    return resolveImportBaseForFilePath({
      storage: opts.storage,
      projectId: opts.projectId,
      filePath,
      incomingSidecarText: null,
    });
  }
  const bundleSidecarFile = zip.folder('files')?.file(sidecarPath) ?? zip.file(`files/${sidecarPath}`);
  const bundleSidecarRaw = bundleSidecarFile ? await bundleSidecarFile.async('string') : null;
  return resolveImportBaseForFilePath({
    storage: opts.storage,
    projectId: opts.projectId,
    filePath,
    incomingSidecarText: bundleSidecarRaw,
  });
}

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
  const manifestRaw = await zip.file(PROJECT_BUNDLE_MANIFEST)?.async('string');
  if (!manifestRaw) throw new Error('Bundle missing project-manifest.json');
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

    // Partition bundle files into local-state (auto-handled) vs content files.
    // Local-state files (.sync/, journal/) are per-device bookkeeping and must
    // never overwrite the receiver's own copy.
    for (const p of [...bundleFiles.keys()]) {
      if (isLocalStateFile(p)) {
        bundleFiles.delete(p);
        // If receiver already has it, keep theirs (silent). If not, skip.
        // Either way: do not add it to the merge set.
      }
    }

    // Resolve bases for paths that exist in BOTH bundle and receiver storage.
    // For new-remote files (only in bundle) or local-only files (only in receiver),
    // we leave base as `undefined` so mergeProjectMaps applies its normal new-file logic.
    const allPaths = new Set([...bundleFiles.keys(), ...existingFiles.keys()]);
    const baseMap = new Map<string, { base: string; source: ConflictBaseSource }>();
    for (const p of allPaths) {
      const hasOurs = existingFiles.has(p);
      const hasTheirs = bundleFiles.has(p);
      if (hasOurs && hasTheirs) {
        // Only resolve base when both sides have the file (potential conflict scenario)
        const resolved = await resolveBundleBaseFromZip({ zip, storage, projectId, filePath: p });
        baseMap.set(p, resolved);
      }
      // Otherwise leave base as undefined → new-file / local-only logic in mergeProjectMaps
    }

    // Pre-import snapshot for "abandon import" rollback (all paths the merge may touch).
    const snapshotFiles: Record<string, string | null> = {};
    for (const p of allPaths) {
      const norm = p.replace(/\\/g, '/');
      snapshotFiles[norm] = existingFiles.has(p) ? existingFiles.get(p)! : null;
    }
    await storage.updateProject(projectId, {
      bundleImportSnapshot: {
        createdAt: new Date().toISOString(),
        files: snapshotFiles,
      },
    });

    const { merged, conflicts: mergeConflicts } = mergeProjectMaps({
      paths: allPaths,
      getBase: (p) => baseMap.get(p)?.base,
      getOurs: (p) => existingFiles.get(p),
      getTheirs: (p) => bundleFiles.get(p),
    });

    // Write cleanly merged files immediately.
    for (const [path, content] of merged) {
      await writeFileWithCrdt(storage, projectId, path, content);
      importedPaths.push(path);
    }

    // Annotate conflicts with bundle-import context labels and base source.
    for (const c of mergeConflicts) {
      const baseInfo = baseMap.get(c.path);
      const source = baseInfo?.source ?? 'none';
      const baseLabel =
        source === 'sidecar-match'
          ? 'Based on your last DCS sync'
          : source === 'receiver-commit'
            ? 'From DCS at last sync commit'
            : 'No common ancestor';
      conflicts.push({
        ...c,
        baseSource: source,
        oursLabel: 'Yours (existing)',
        theirsLabel: 'From bundle',
        baseLabel,
      });
    }

  } else {
    // Simple overwrite mode — still capture pre-import snapshot for undo + "new from import" UI.
    const listSnap = await storage.listFiles(projectId);
    const allSnap = new Set<string>([...listSnap, ...bundleFiles.keys()]);
    const snapshotOverwrite: Record<string, string | null> = {};
    for (const p of allSnap) {
      const norm = p.replace(/\\/g, '/');
      const cur = await storage.readFile(projectId, p);
      snapshotOverwrite[norm] = cur ?? null;
    }
    await storage.updateProject(projectId, {
      bundleImportSnapshot: {
        createdAt: new Date().toISOString(),
        files: snapshotOverwrite,
      },
    });
    for (const [relPath, content] of bundleFiles) {
      await writeFileWithCrdt(storage, projectId, relPath, content);
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
