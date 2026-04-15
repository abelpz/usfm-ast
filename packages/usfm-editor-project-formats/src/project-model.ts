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

/** Loaded repo descriptor + git ref (editor / DCS I/O). */
export type DetectedDcsProject = RepoProjectDescriptorWithRef;

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
      checkingsPath: xe?.checkings?.path,
      stagesFile: xe?.checkings?.stagesFile,
      resourcesPath: xe?.resources?.path,
    };
  }
  return {
    format: 'raw-usfm',
    books: booksFromDetectedProject(project),
    alignmentSources: [],
  };
}
