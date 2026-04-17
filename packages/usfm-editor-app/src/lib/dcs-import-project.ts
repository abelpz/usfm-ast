/**
 * Import a Door43 repository into {@link ProjectStorage} as a normal local project
 * with {@link ProjectSyncConfig} (same flow as “New project”).
 */

import { getFileContent } from '@/dcs-client';
import { booksFromDetectedProject, type DetectedDcsProject } from '@/lib/dcs-format-detect';
import { DcsRestProjectSync } from '@usfm-tools/editor-adapters';
import { USFM_BOOK_CODES } from '@usfm-tools/editor';
import {
  CC_BY_SA_4_LICENSE_TEXT,
  defaultRcProjectReadme,
  enhancedLayoutSupportFiles,
  listSBBooks,
  mergeResourceContainerForEnhancedLayout,
  parseResourceContainer,
  parseScriptureBurrito,
  serializeResourceContainer,
  type ResourceContainerManifest,
  type ScriptureBurritoMeta,
} from '@usfm-tools/project-formats';
import type { ProjectMeta, ProjectStorage, ProjectSyncConfig } from '@usfm-tools/types';

function bookSortIndex(code: string): number {
  const i = USFM_BOOK_CODES.findIndex(([c]) => c === code);
  return i >= 0 ? i + 1 : 1000;
}

/** Suffix A, B, … Z, AA, AB, … for collision-free IDs (letters only). */
function letterSuffix(i: number): string {
  if (i <= 0) return '';
  let n = i;
  let s = '';
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

function deriveBaseProjectId(project: DetectedDcsProject, owner: string, repo: string): string {
  let raw = '';
  if (project.format === 'resource-container') {
    raw = project.manifest.dublin_core?.identifier?.trim() ?? '';
  } else if (project.format === 'scripture-burrito') {
    const primary = project.meta.identification?.primary;
    if (primary && typeof primary === 'object') {
      const keys = Object.keys(primary);
      if (keys[0]) raw = keys[0]!;
    }
  }
  if (!raw) raw = `${owner}_${repo}`;
  const letters = raw.toUpperCase().replace(/[^A-Z]/g, '');
  let base = letters.slice(0, 8);
  if (base.length < 3) base = (base + 'PRJ').slice(0, 8);
  return base.slice(0, 8);
}

async function allocateProjectId(storage: ProjectStorage, baseRaw: string): Promise<string> {
  const base = baseRaw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8);
  const padded = base.length >= 3 ? base : (base + 'PRJ').slice(0, 8);
  for (let i = 0; i < 10_000; i++) {
    const suf = letterSuffix(i);
    const candidate = (padded.slice(0, Math.max(0, 8 - suf.length)) + suf).slice(0, 8);
    if (candidate.length < 3 || candidate.length > 8) continue;
    if (!/^[A-Z]{3,8}$/.test(candidate)) continue;
    const existing = await storage.getProject(candidate);
    if (!existing) return candidate;
  }
  throw new Error('Could not allocate a unique project ID');
}

function inferTargetType(owner: string): 'user' | 'org' {
  const o = owner.trim().toLowerCase();
  if (o === 'unfoldingword' || o === 'door43-catalog') return 'org';
  return 'user';
}

function scriptureBurritoToRcManifest(meta: ScriptureBurritoMeta, projectId: string): ResourceContainerManifest {
  const books = listSBBooks(meta);
  const dc = meta.identification;
  const title =
    (typeof dc?.name?.en === 'string' && dc.name.en) ||
    (dc?.name && typeof dc.name[Object.keys(dc.name)[0] ?? ''] === 'string'
      ? (dc.name[Object.keys(dc.name)[0]!] as string)
      : undefined) ||
    projectId;
  const lang = meta.languages?.[0]?.tag ?? 'en';
  const today = new Date().toISOString().slice(0, 10);
  const projects = books.map((b) => ({
    identifier: b.code,
    title: b.name,
    path: b.path.startsWith('./') ? b.path : `./${b.path}`,
    sort: bookSortIndex(b.code),
  }));
  return {
    dublin_core: {
      conformsto: 'rc0.2',
      type: 'bundle',
      format: 'text/usfm',
      identifier: projectId.toLowerCase(),
      title,
      language: { identifier: lang, title: lang, direction: 'ltr' },
      version: typeof meta.meta?.version === 'string' ? meta.meta.version : '0.0.1',
      issued: today,
      modified: today,
    },
    checking: { checking_entity: [], checking_level: '1' },
    projects,
  };
}

async function seedSyncShasFromRemote(
  storage: ProjectStorage,
  projectId: string,
  sync: ProjectSyncConfig,
  token: string,
): Promise<void> {
  const adapter = new DcsRestProjectSync({
    host: sync.host,
    token,
    owner: sync.owner,
    repo: sync.repo,
    branch: sync.branch,
    targetType: sync.targetType,
  });
  const idx = await adapter.getRemoteFileIndex();
  const localPaths = new Set(await storage.listFiles(projectId));
  const next: Record<string, string> = {};
  for (const e of idx) {
    const localKey = e.path.startsWith('content/') ? e.path.slice('content/'.length) : e.path;
    if (localPaths.has(localKey) || localPaths.has(e.path)) {
      next[localKey] = e.sha;
    }
  }
  await storage.setSyncShas(projectId, next);
}

/**
 * Returns an existing local project id when {@link ProjectMeta.syncConfig} matches the repo.
 */
export async function findLocalProjectForDcsRepo(
  storage: ProjectStorage,
  owner: string,
  repo: string,
): Promise<string | null> {
  const projects = await storage.listProjects();
  const o = owner.trim().toLowerCase();
  const r = repo.trim().toLowerCase();
  for (const p of projects) {
    const s = p.syncConfig;
    if (s && s.owner.toLowerCase() === o && s.repo.toLowerCase() === r) return p.id;
  }
  return null;
}

export type ImportDcsRepoAsProjectOptions = {
  storage: ProjectStorage;
  host: string;
  /** Optional for anonymous read of public repos; required to seed remote SHAs after import. */
  token?: string;
  owner: string;
  repo: string;
  ref: string;
  project: DetectedDcsProject;
};

/**
 * Download manifest + scripture files, create {@link ProjectMeta} with {@link ProjectSyncConfig},
 * write standard editor layout files locally, and seed sync SHAs from the remote tree.
 *
 * @returns New or existing project id (existing when the same owner/repo was already imported).
 */
export async function importDcsRepoAsProject(options: ImportDcsRepoAsProjectOptions): Promise<string> {
  const { storage, host, token, owner, repo, ref, project } = options;

  if (project.format === 'raw-usfm') {
    throw new Error(
      'This repository has no Scripture Burrito or Resource Container manifest. Project-level import requires manifest.yaml or metadata.json.',
    );
  }

  const existing = await findLocalProjectForDcsRepo(storage, owner, repo);
  if (existing) return existing;

  const books = booksFromDetectedProject(project);
  if (books.length === 0) {
    throw new Error('No USFM books found for this repository.');
  }

  const baseId = deriveBaseProjectId(project, owner, repo);
  const id = await allocateProjectId(storage, baseId);

  const syncConfig: ProjectSyncConfig = {
    host,
    owner,
    repo,
    branch: ref,
    targetType: inferTargetType(owner),
  };

  let language = 'en';
  let name = `${owner}/${repo}`;
  if (project.format === 'resource-container') {
    language = project.manifest.dublin_core?.language?.identifier?.trim() || language;
    name = project.manifest.dublin_core?.title?.trim() || name;
  } else {
    language = project.meta.languages?.[0]?.tag ?? language;
    const dc = project.meta.identification;
    const title =
      (typeof dc?.name?.en === 'string' && dc.name.en) ||
      (dc?.name && typeof dc.name[Object.keys(dc.name)[0] ?? ''] === 'string'
        ? (dc.name[Object.keys(dc.name)[0]!] as string)
        : undefined);
    if (typeof title === 'string' && title.trim()) name = title.trim();
  }

  const now = new Date().toISOString();
  const meta: ProjectMeta = {
    id,
    name,
    language,
    format: 'resource-container',
    created: now,
    updated: now,
    syncConfig,
  };

  await storage.createProject(meta);

  try {
    if (project.format === 'resource-container') {
      const yaml = await getFileContent({ host, token, owner, repo, path: 'manifest.yaml', ref });
      let manifest = parseResourceContainer(yaml.content);
      manifest = mergeResourceContainerForEnhancedLayout(manifest);
      await storage.writeFile(id, 'manifest.yaml', serializeResourceContainer(manifest));
    } else {
      const metaFile = await getFileContent({ host, token, owner, repo, path: 'metadata.json', ref });
      await storage.writeFile(id, 'metadata.json', metaFile.content);
      const sbMeta = parseScriptureBurrito(JSON.parse(metaFile.content) as unknown);
      let rc = scriptureBurritoToRcManifest(sbMeta, id);
      rc = mergeResourceContainerForEnhancedLayout(rc);
      await storage.writeFile(id, 'manifest.yaml', serializeResourceContainer(rc));
    }

    const staticFiles = enhancedLayoutSupportFiles();
    for (const [path, content] of Object.entries(staticFiles)) {
      try {
        const f = await getFileContent({ host, token, owner, repo, path, ref });
        await storage.writeFile(id, path, f.content);
      } catch {
        await storage.writeFile(id, path, content);
      }
    }

    let importedReadme = false;
    try {
      const readme = await getFileContent({ host, token, owner, repo, path: 'README.md', ref });
      await storage.writeFile(id, 'README.md', readme.content);
      importedReadme = true;
    } catch {
      /* optional on remote */
    }
    if (!importedReadme) {
      await storage.writeFile(
        id,
        'README.md',
        defaultRcProjectReadme({ title: name, identifier: id, languageTag: language }),
      );
    }

    let importedLicense = false;
    for (const licPath of ['LICENSE', 'LICENSE.md'] as const) {
      try {
        const lic = await getFileContent({ host, token, owner, repo, path: licPath, ref });
        await storage.writeFile(id, licPath, lic.content);
        importedLicense = true;
      } catch {
        /* optional on remote */
      }
    }
    if (!importedLicense) {
      await storage.writeFile(id, 'LICENSE', CC_BY_SA_4_LICENSE_TEXT);
    }

    for (const b of books) {
      const rel = b.path.replace(/^\.\//, '');
      const file = await getFileContent({ host, token, owner, repo, path: rel, ref });
      await storage.writeFile(id, rel, file.content);
    }

    if (token) {
      await seedSyncShasFromRemote(storage, id, syncConfig, token);
    }
    await storage.updateProject(id, { updated: new Date().toISOString() });

    return id;
  } catch (e) {
    try {
      await storage.deleteProject(id);
    } catch {
      /* ignore */
    }
    throw e;
  }
}
