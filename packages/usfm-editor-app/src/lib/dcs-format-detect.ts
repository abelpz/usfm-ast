import { getFileContent, listRepoContents, type Door43ContentEntry } from '@/dcs-client';
import { parseResourceContainer, listRCBooks, type ResourceContainerManifest } from '@/lib/resource-container';
import { parseScriptureBurrito, listSBBooks, type ScriptureBurritoMeta } from '@/lib/scripture-burrito';

export type DcsRepoFormat = 'scripture-burrito' | 'resource-container' | 'raw-usfm';

export type DetectedDcsProject =
  | {
      format: 'scripture-burrito';
      ref: string;
      meta: ScriptureBurritoMeta;
    }
  | {
      format: 'resource-container';
      ref: string;
      manifest: ResourceContainerManifest;
    }
  | {
      format: 'raw-usfm';
      ref: string;
      /** Root-level .usfm files */
      files: { name: string; path: string }[];
    };

function rootHas(entries: Door43ContentEntry[], name: string): boolean {
  return entries.some((e) => e.name === name && e.type === 'file');
}

/**
 * Inspect repository root to detect Scripture Burrito, Resource Container, or flat USFM layout.
 */
export async function detectDcsRepoFormat(options: {
  host?: string;
  token?: string;
  owner: string;
  repo: string;
  ref: string;
}): Promise<DcsRepoFormat> {
  const entries = await listRepoContents({
    host: options.host,
    token: options.token,
    owner: options.owner,
    repo: options.repo,
    path: '',
    ref: options.ref,
  });
  if (rootHas(entries, 'metadata.json')) return 'scripture-burrito';
  if (rootHas(entries, 'manifest.yaml')) return 'resource-container';
  const usfm = entries.filter((e) => e.type === 'file' && /\.usfm$/i.test(e.name));
  if (usfm.length > 0) return 'raw-usfm';
  return 'raw-usfm';
}

/**
 * Load manifest / metadata and return structured project info for book picking.
 */
export async function loadDcsProjectDescriptor(options: {
  host?: string;
  token?: string;
  owner: string;
  repo: string;
  ref: string;
}): Promise<DetectedDcsProject> {
  const fmt = await detectDcsRepoFormat(options);
  const { host, token, owner, repo, ref } = options;

  if (fmt === 'scripture-burrito') {
    const file = await getFileContent({ host, token, owner, repo, path: 'metadata.json', ref });
    const meta = parseScriptureBurrito(JSON.parse(file.content) as unknown);
    return { format: 'scripture-burrito', ref, meta };
  }

  if (fmt === 'resource-container') {
    const file = await getFileContent({ host, token, owner, repo, path: 'manifest.yaml', ref });
    const manifest = parseResourceContainer(file.content);
    return { format: 'resource-container', ref, manifest };
  }

  const entries = await listRepoContents({ host, token, owner, repo, path: '', ref });
  const files = entries
    .filter((e) => e.type === 'file' && /\.usfm$/i.test(e.name))
    .map((e) => ({ name: e.name, path: e.path }));
  return { format: 'raw-usfm', ref, files };
}

export function booksFromDetectedProject(project: DetectedDcsProject): { code: string; name: string; path: string }[] {
  if (project.format === 'scripture-burrito') return listSBBooks(project.meta);
  if (project.format === 'resource-container') return listRCBooks(project.manifest);
  return project.files.map((f) => {
    const base = f.name.replace(/\.usfm$/i, '');
    const code = base.replace(/^[0-9]{2}-/i, '').toUpperCase();
    return { code, name: f.name, path: f.path };
  });
}
