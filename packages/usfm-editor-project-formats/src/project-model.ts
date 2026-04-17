import type { AlignmentDirectoryEntry, EnhancedProjectSummary } from '@usfm-tools/types';
import type { ScriptureBurritoMeta } from './scripture-burrito';
import { listSBBooks } from './scripture-burrito';
import type { ResourceContainerManifest } from './resource-container';
import { listRCBooks } from './resource-container';

/** What a Door43 / local project root looks like from marker files only */
export type DcsRepoFormat = 'scripture-burrito' | 'resource-container' | 'raw-usfm';

/** Parsed project body without sync ref (I/O layer adds `ref`). */
export type RepoProjectDescriptor =
  | { format: 'scripture-burrito'; meta: ScriptureBurritoMeta }
  | { format: 'resource-container'; manifest: ResourceContainerManifest }
  | { format: 'raw-usfm'; files: { name: string; path: string }[] };

export type RepoProjectDescriptorWithRef = RepoProjectDescriptor & { ref: string };

/** Layout flags for `alignments/` + `checking/` (see docs/30-project-format.md). */
export type EnhancedLayoutFlags = {
  /** Both `alignments/manifest.json` and `checking/manifest.json` exist */
  enhanced: boolean;
  alignmentsManifest: boolean;
  checkingManifest: boolean;
};

/** Loaded repo descriptor + git ref (editor / DCS I/O). */
export type DetectedDcsProject = RepoProjectDescriptorWithRef & EnhancedLayoutFlags;

function normPath(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Collect `alignments/{lang}/` directory entries from SB ingredient paths and optional `x-activeAlignment`. */
function alignmentSourcesFromSb(meta: ScriptureBurritoMeta): AlignmentDirectoryEntry[] {
  const byId = new Map<string, AlignmentDirectoryEntry>();
  for (const path of Object.keys(meta.ingredients)) {
    const n = normPath(path);
    const m = /^alignments\/([^/]+)\//i.exec(n);
    if (m) {
      const id = m[1]!;
      if (!byId.has(id)) {
        byId.set(id, { identifier: id, path: `alignments/${id}/`, source_language: id });
      }
    }
  }
  const active = meta['x-activeAlignment'];
  if (active) {
    for (const ptr of Object.values(active)) {
      const sl = ptr.sourceLanguage;
      if (!sl) continue;
      if (!byId.has(sl)) {
        const dir = normPath(ptr.path).replace(/[^/]+\.json$/i, '');
        byId.set(sl, { identifier: sl, path: dir.endsWith('/') ? dir : `${dir}/`, source_language: sl });
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.identifier.localeCompare(b.identifier));
}

function activeAlignmentBooksFromSb(meta: ScriptureBurritoMeta): Record<string, string> | undefined {
  const active = meta['x-activeAlignment'];
  if (!active) return undefined;
  const out: Record<string, string> = {};
  for (const [book, ptr] of Object.entries(active)) {
    out[book.toUpperCase()] = ptr.sourceLanguage;
  }
  return Object.keys(out).length ? out : undefined;
}

function alignmentSourcesFromRc(manifest: ResourceContainerManifest): AlignmentDirectoryEntry[] {
  const src = manifest.x_extensions?.alignments?.sources;
  if (src?.length) return [...src].sort((a, b) => a.identifier.localeCompare(b.identifier));
  return [];
}

function activeAlignmentBooksFromRc(manifest: ResourceContainerManifest): Record<string, string> | undefined {
  const raw = manifest.x_extensions?.alignments?.active;
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' && v.trim()) out[k.toUpperCase()] = v.trim();
  }
  return Object.keys(out).length ? out : undefined;
}

/** Root listing: classify SB / RC / flat USFM (same rules as previous editor-app helper). */
export function detectRepoFormatFromRootEntries(
  entries: Array<{ name: string; type: 'file' | 'dir' | string }>,
): DcsRepoFormat {
  const files = new Set(entries.filter((e) => e.type === 'file').map((e) => e.name));
  if (files.has('metadata.json')) return 'scripture-burrito';
  if (files.has('manifest.yaml')) return 'resource-container';
  const usfm = entries.filter((e) => e.type === 'file' && /\.usfm$/i.test(e.name));
  if (usfm.length > 0) return 'raw-usfm';
  return 'raw-usfm';
}

/**
 * From a **root** listing only: detect presence of enhanced marker files.
 * Prefer {@link probeEnhancedLayoutWithFetcher} when using the DCS API (paths may not appear as root files).
 */
export function probeEnhancedLayoutFromRootEntries(
  entries: Array<{ name: string; path?: string; type: 'file' | 'dir' | string }>,
): EnhancedLayoutFlags {
  const normalize = (p: string) => p.replace(/\\/g, '/').replace(/^\/+/, '');
  let alignmentsManifest = false;
  let checkingManifest = false;
  for (const e of entries) {
    const p = normalize(e.path ?? e.name);
    if (p === 'alignments/manifest.json' || p.toLowerCase() === 'alignments/manifest.json') {
      alignmentsManifest = true;
    }
    if (p === 'checking/manifest.json' || p.toLowerCase() === 'checking/manifest.json') {
      checkingManifest = true;
    }
  }
  const enhanced = alignmentsManifest && checkingManifest;
  return { enhanced, alignmentsManifest, checkingManifest };
}

/**
 * Probe enhanced layout by fetching manifest paths (works when root listing omits nested paths).
 */
export async function probeEnhancedLayoutWithFetcher(fetchText: (path: string) => Promise<string>): Promise<EnhancedLayoutFlags> {
  let alignmentsManifest = false;
  let checkingManifest = false;
  try {
    await fetchText('alignments/manifest.json');
    alignmentsManifest = true;
  } catch {
    /* missing */
  }
  try {
    await fetchText('checking/manifest.json');
    checkingManifest = true;
  } catch {
    /* missing */
  }
  const enhanced = alignmentsManifest && checkingManifest;
  return { enhanced, alignmentsManifest, checkingManifest };
}

export function booksFromDetectedProject(project: RepoProjectDescriptor): { code: string; name: string; path: string }[] {
  if (project.format === 'scripture-burrito') return listSBBooks(project.meta);
  if (project.format === 'resource-container') return listRCBooks(project.manifest);
  return project.files.map((f) => {
    const base = f.name.replace(/\.usfm$/i, '');
    const code = base.replace(/^[0-9]{2}-/i, '').toUpperCase();
    return { code, name: f.name, path: f.path };
  });
}

/** Build dashboard summary for ProjectPage / tooling. */
export function summarizeEnhancedProject(project: RepoProjectDescriptor): EnhancedProjectSummary {
  if (project.format === 'scripture-burrito') {
    const meta = project.meta;
    const dc = meta.identification;
    const lang0 = meta.languages?.[0]?.tag;
    const title =
      (typeof dc?.name?.en === 'string' && dc.name.en) ||
      (dc?.name && typeof dc.name[Object.keys(dc.name)[0] ?? ''] === 'string'
        ? (dc.name[Object.keys(dc.name)[0]!] as string)
        : undefined) ||
      meta.meta?.category;
    const primary = dc?.primary;
    let identifier: string | undefined;
    if (primary && typeof primary === 'object') {
      const keys = Object.keys(primary);
      if (keys.length) identifier = keys[0];
    }
    const xcc = meta['x-checkingConfig'];
    return {
      format: 'scripture-burrito',
      identifier,
      title: typeof title === 'string' ? title : undefined,
      language: lang0,
      books: booksFromDetectedProject(project),
      alignmentSources: alignmentSourcesFromSb(meta),
      activeAlignmentByBook: activeAlignmentBooksFromSb(meta),
      checkingsPath: xcc?.path,
      stagesFile: xcc?.stagesFile,
      resourcesPath: undefined,
    };
  }
  if (project.format === 'resource-container') {
    const m = project.manifest;
    const dc = m.dublin_core;
    const xe = m.x_extensions;
    return {
      format: 'resource-container',
      identifier: dc?.identifier,
      title: dc?.title,
      language: dc?.language?.identifier,
      books: booksFromDetectedProject(project),
      alignmentSources: alignmentSourcesFromRc(m),
      activeAlignmentByBook: activeAlignmentBooksFromRc(m),
      checkingsPath: xe?.checking?.path ?? xe?.checkings?.path,
      stagesFile: xe?.checking?.stagesFile ?? xe?.checkings?.stagesFile,
      resourcesPath: xe?.resources?.path,
    };
  }
  return {
    format: 'raw-usfm',
    books: booksFromDetectedProject(project),
    alignmentSources: [],
  };
}

/** When the manifest has no alignment sources yet, the editor still uses `alignments/` like new projects from the app. */
const CANONICAL_ALIGNMENT_PLACEHOLDER: AlignmentDirectoryEntry = {
  identifier: 'alignments',
  path: 'alignments/',
};

/**
 * Dashboard summary aligned with projects created on the home page: canonical `checking/`, `alignments/`, `resources/`
 * paths, plus whether this **branch** already contains the marker files on the server.
 */
export function summarizeEditorCanonicalProject(
  project: RepoProjectDescriptor,
  remoteEnhancedLayout: boolean,
): EnhancedProjectSummary {
  const base = summarizeEnhancedProject(project);
  if (base.format === 'raw-usfm') {
    return { ...base, remoteEnhancedLayout };
  }
  const alignmentSources =
    base.alignmentSources.length > 0 ? base.alignmentSources : [CANONICAL_ALIGNMENT_PLACEHOLDER];
  return {
    ...base,
    alignmentSources,
    checkingsPath: base.checkingsPath ?? 'checking/',
    stagesFile: base.stagesFile ?? 'checking/stages.json',
    resourcesPath: base.resourcesPath ?? 'resources/',
    remoteEnhancedLayout,
  };
}
