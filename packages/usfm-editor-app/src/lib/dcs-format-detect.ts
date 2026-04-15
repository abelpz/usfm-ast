import { getFileContent, listRepoContents } from '@/dcs-client';
import {
  booksFromDetectedProject,
  detectRepoFormatFromRootEntries,
  parseResourceContainer,
  parseScriptureBurrito,
  type DetectedDcsProject,
  type DcsRepoFormat,
  type RepoProjectDescriptor,
} from '@usfm-tools/project-formats';

export type { DetectedDcsProject, DcsRepoFormat, RepoProjectDescriptor };

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
  return detectRepoFormatFromRootEntries(entries);
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

export { booksFromDetectedProject };
