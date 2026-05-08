/**
 * Single-book USFM handoff: export one file for offline work; import/merge a `.usfm` back into the project.
 * Resource Container: can add a new book from a file. Scripture Burrito: replace existing ingredient only.
 */

import { mergeProjectMaps } from '@usfm-tools/editor-adapters';
import { USFM_BOOK_CODES } from '@usfm-tools/editor';
import {
  listRCBooks,
  listSBBooks,
  parseResourceContainer,
  parseScriptureBurrito,
  serializeResourceContainer,
  type ResourceContainerManifest,
} from '@usfm-tools/project-formats';
import type { ConflictBaseSource, FileConflict, ProjectStorage } from '@usfm-tools/types';
import { extractBookCodeFromUsfm, extractUsfmTitle } from '@/lib/usfm-project';
import { resolveImportBaseForFilePath } from '@/lib/project-bundle';

const ERR_NO_ID = 'This file does not start with a book id (\\id …).';
const ERR_SB_NEW =
  'Adding a new book from a file is not supported for this project type yet. Add the book here first, then import your file to update it.';
const ERR_NO_MANIFEST = 'manifest.yaml or metadata.json not found.';

function norm(p: string): string {
  return p.replace(/\\/g, '/');
}

function bookSortIndex(code: string): number {
  const i = USFM_BOOK_CODES.findIndex(([c]) => c === code);
  return i >= 0 ? i + 1 : 1000;
}

async function captureFullSnapshot(storage: ProjectStorage, projectId: string): Promise<Record<string, string | null>> {
  const list = await storage.listFiles(projectId);
  const out: Record<string, string | null> = {};
  for (const p of list) {
    out[norm(p)] = (await storage.readFile(projectId, p)) ?? null;
  }
  return out;
}

export type ImportSingleBookResult = {
  importedPaths: string[];
  conflicts: FileConflict[];
};

/**
 * Triggers a browser download of a UTF-8 string as `filename` (e.g. `45-ROM.usfm`).
 */
export function downloadUsfmFileInBrowser(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readBookUsfmForExport(options: {
  storage: ProjectStorage;
  projectId: string;
  path: string;
  /** If set, used as the download filename instead of the path basename. */
  downloadBasename?: string;
}): Promise<{ content: string; filename: string }> {
  const { storage, projectId, path, downloadBasename } = options;
  const content = await storage.readFile(projectId, path);
  if (content === null) throw new Error('Book file not found.');
  const filename =
    (downloadBasename?.trim() && sanitizeFilename(downloadBasename.trim())) ||
    norm(path).split('/').pop() ||
    'book.usfm';
  return { content, filename };
}

function sanitizeFilename(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[/\\:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim() || 'book.usfm';
}

async function addNewBookRc(options: {
  storage: ProjectStorage;
  projectId: string;
  manifest: ResourceContainerManifest;
  text: string;
  code: string;
}): Promise<ImportSingleBookResult> {
  const { storage, projectId, manifest, text, code } = options;
  const sort = bookSortIndex(code);
  const path = `${String(sort).padStart(2, '0')}-${code}.usfm`;
  const existing = await storage.readFile(projectId, path);
  if (existing !== null) {
    return applyExistingBookCommon({ storage, projectId, repoPath: path, text, enableMerge: true });
  }

  const fullSnap = await captureFullSnapshot(storage, projectId);
  await storage.updateProject(projectId, {
    bundleImportSnapshot: { createdAt: new Date().toISOString(), files: fullSnap },
  });

  const title = extractUsfmTitle(text) || code;
  const row = USFM_BOOK_CODES.find(([c]) => c === code);
  const nameForManifest = title || row?.[1] || code;

  await storage.writeFile(projectId, path, text);
  const nextProjects = [...(manifest.projects ?? [])];
  nextProjects.push({ identifier: code, title: nameForManifest, path: `./${path}`, sort });
  const nextManifest: ResourceContainerManifest = { ...manifest, projects: nextProjects };
  await storage.writeFile(projectId, 'manifest.yaml', serializeResourceContainer(nextManifest));
  const updated = new Date().toISOString();
  await storage.updateProject(projectId, { updated });
  return { importedPaths: [path, 'manifest.yaml'], conflicts: [] };
}

async function applyExistingBookCommon(options: {
  storage: ProjectStorage;
  projectId: string;
  repoPath: string;
  text: string;
  enableMerge: boolean;
}): Promise<ImportSingleBookResult> {
  const { storage, projectId, repoPath, text, enableMerge } = options;
  const existingPaths = await storage.listFiles(projectId);
  const existingFiles = new Map<string, string>();
  for (const p of existingPaths) {
    const v = await storage.readFile(projectId, p);
    if (v !== null) existingFiles.set(p, v);
  }
  const bundleFiles = new Map<string, string>([[repoPath, text]]);

  if (!enableMerge) {
    const allSnap = new Set<string>([...existingFiles.keys(), ...bundleFiles.keys()]);
    const snapshotOverwrite: Record<string, string | null> = {};
    for (const p of allSnap) {
      snapshotOverwrite[norm(p)] = (await storage.readFile(projectId, p)) ?? null;
    }
    await storage.updateProject(projectId, {
      bundleImportSnapshot: { createdAt: new Date().toISOString(), files: snapshotOverwrite },
    });
    await storage.writeFile(projectId, repoPath, text);
    return { importedPaths: [repoPath], conflicts: [] };
  }

  const baseInfo = await resolveImportBaseForFilePath({
    storage,
    projectId,
    filePath: repoPath,
    incomingSidecarText: null,
  });
  const baseMap = new Map<string, { base: string; source: ConflictBaseSource }>([[repoPath, baseInfo]]);

  const allPaths = new Set<string>([repoPath]);
  const fullSnap = await captureFullSnapshot(storage, projectId);
  await storage.updateProject(projectId, {
    bundleImportSnapshot: { createdAt: new Date().toISOString(), files: fullSnap },
  });

  const { merged, conflicts: mergeConflicts, deleted } = mergeProjectMaps({
    paths: allPaths,
    getBase: (p) => baseMap.get(p)?.base,
    getOurs: (p) => existingFiles.get(p),
    getTheirs: (p) => bundleFiles.get(p),
  });
  for (const [p, c] of merged) {
    await storage.writeFile(projectId, p, c);
  }
  for (const p of deleted) {
    await storage.deleteFile(projectId, p);
  }
  const conflicts: FileConflict[] = [];
  for (const c of mergeConflicts) {
    const b = baseMap.get(c.path);
    const source = b?.source ?? 'none';
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
      theirsLabel: 'From imported file',
      baseLabel,
    });
  }
  return { importedPaths: [...merged.keys()], conflicts };
}

/**
 * Merge or write one USFM string into the project. Book code comes from `\\id`.
 * @throws {Error} with user-facing text when the file is invalid or the operation is not supported.
 */
export async function importSingleBookUsfmFile(options: {
  storage: ProjectStorage;
  projectId: string;
  text: string;
  /** When `false`, overwrites the book file. Default `true` (3-way merge when both sides have content). */
  enableMerge?: boolean;
}): Promise<ImportSingleBookResult> {
  const { storage, projectId, text, enableMerge = true } = options;
  const code = extractBookCodeFromUsfm(text);
  if (!code) throw new Error(ERR_NO_ID);

  const yaml = await storage.readFile(projectId, 'manifest.yaml');
  if (yaml) {
    const manifest = parseResourceContainer(yaml);
    const books = listRCBooks(manifest);
    const found = books.find((b) => b.code === code);
    if (found) {
      return applyExistingBookCommon({
        storage,
        projectId,
        repoPath: norm(found.path),
        text,
        enableMerge,
      });
    }
    return addNewBookRc({ storage, projectId, manifest, text, code });
  }

  const md = await storage.readFile(projectId, 'metadata.json');
  if (md) {
    const sb = parseScriptureBurrito(JSON.parse(md) as unknown);
    const books = listSBBooks(sb);
    const found = books.find((b) => b.code === code);
    if (found) {
      return applyExistingBookCommon({
        storage,
        projectId,
        repoPath: norm(found.path),
        text,
        enableMerge,
      });
    }
    throw new Error(ERR_SB_NEW);
  }

  throw new Error(ERR_NO_MANIFEST);
}
