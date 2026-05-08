/**
 * Open a local project from an offline `.bible.project.zip` (see {@link exportProjectBundle}).
 */

import JSZip from 'jszip';
import {
  listRCBooks,
  listSBBooks,
  parseResourceContainer,
  parseScriptureBurrito,
} from '@usfm-tools/project-formats';
import type { FileConflict, ProjectMeta, ProjectStorage } from '@usfm-tools/types';
import { addRecentProject } from './recent-projects';
import {
  importProjectBundle,
  PROJECT_BUNDLE_MANIFEST,
  type BundleManifest,
} from './project-bundle';

async function readBundleManifest(blob: Blob): Promise<{ manifest: BundleManifest; zip: JSZip }> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const manifestRaw = await zip.file(PROJECT_BUNDLE_MANIFEST)?.async('string');
  if (!manifestRaw) throw new Error('Bundle missing project-manifest.json');
  let manifest: BundleManifest;
  try {
    manifest = JSON.parse(manifestRaw) as BundleManifest;
  } catch {
    throw new Error('Invalid bundle manifest (could not parse JSON)');
  }
  if (manifest.schema !== 1 || !manifest.files || typeof manifest.projectId !== 'string' || !manifest.projectId.trim()) {
    throw new Error('Invalid bundle manifest');
  }
  return { manifest, zip };
}

async function deriveNewProjectMetaFromBundleZip(
  zip: JSZip,
  projectId: string,
): Promise<{ name: string; language: string; firstBookCode: string }> {
  const filesFolder = zip.folder('files');
  if (!filesFolder) throw new Error('Bundle missing files/ folder');

  const yamlText = await filesFolder.file('manifest.yaml')?.async('string');
  if (yamlText) {
    const rc = parseResourceContainer(yamlText);
    const books = listRCBooks(rc);
    const language = rc.dublin_core?.language?.identifier?.trim() || 'en';
    const name = rc.dublin_core?.title?.trim() || projectId;
    return {
      name,
      language,
      firstBookCode: books[0]?.code ?? '',
    };
  }

  const jsonText = await filesFolder.file('metadata.json')?.async('string');
  if (jsonText) {
    const sb = parseScriptureBurrito(JSON.parse(jsonText) as unknown);
    const books = listSBBooks(sb);
    const language = sb.languages?.[0]?.tag ?? 'en';
    const dc = sb.identification;
    const title =
      (typeof dc?.name?.en === 'string' && dc.name.en) ||
      (dc?.name && typeof dc.name[Object.keys(dc.name)[0] ?? ''] === 'string'
        ? (dc.name[Object.keys(dc.name)[0]!] as string)
        : undefined);
    const name = (typeof title === 'string' && title.trim() ? title.trim() : null) ?? projectId;
    return {
      name,
      language,
      firstBookCode: books[0]?.code ?? '',
    };
  }

  throw new Error(
    'New project from bundle requires files/manifest.yaml (Resource Container) or files/metadata.json (Scripture Burrito) inside the zip.',
  );
}

export async function openLocalProjectFromBundle(options: {
  storage: ProjectStorage;
  blob: Blob;
}): Promise<{ id: string; isNew: boolean; conflicts: FileConflict[] }> {
  const { storage, blob } = options;
  const { manifest, zip } = await readBundleManifest(blob);
  const projectId = manifest.projectId;

  const existing = await storage.getProject(projectId);

  if (existing) {
    const { conflicts } = await importProjectBundle({
      storage,
      projectId,
      blob,
      enableMerge: true,
    });
    if (conflicts.length > 0) {
      await storage.updateProject(projectId, { pendingConflicts: conflicts });
    }
    return { id: projectId, isNew: false, conflicts };
  }

  const { name, language, firstBookCode } = await deriveNewProjectMetaFromBundleZip(zip, projectId);
  const now = new Date().toISOString();
  const meta: ProjectMeta = {
    id: projectId,
    name,
    language,
    format: 'resource-container',
    created: now,
    updated: now,
  };

  await storage.createProject(meta);

  try {
    const { conflicts } = await importProjectBundle({
      storage,
      projectId,
      blob,
      enableMerge: false,
    });
    addRecentProject({
      name,
      bookCode: firstBookCode,
      source: 'continue',
    });
    return { id: projectId, isNew: true, conflicts };
  } catch (e) {
    try {
      await storage.deleteProject(projectId);
    } catch {
      /* ignore */
    }
    throw e;
  }
}
