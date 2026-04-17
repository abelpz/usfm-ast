import { getFileContent, listRepoContents } from '@/dcs-client';
import {
  booksFromDetectedProject,
  detectRepoFormatFromRootEntries,
  parseResourceContainer,
  parseScriptureBurrito,
  probeEnhancedLayoutFromRootEntries,
  probeEnhancedLayoutWithFetcher,
  type DetectedDcsProject,
  type DcsRepoFormat,
  type RepoProjectDescriptor,
  type RepoProjectDescriptorWithRef,
} from '@usfm-tools/project-formats';

export type { DetectedDcsProject, DcsRepoFormat, RepoProjectDescriptor, RepoProjectDescriptorWithRef };

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

  const layoutFromRoot = async (): Promise<ReturnType<typeof probeEnhancedLayoutFromRootEntries>> => {
    const entries = await listRepoContents({ host, token, owner, repo, path: '', ref });
    return probeEnhancedLayoutFromRootEntries(entries);
  };

  const mergeLayout = async (
    base: RepoProjectDescriptorWithRef,
  ): Promise<DetectedDcsProject> => {
    if (base.format === 'raw-usfm') {
      return {
        ...base,
        enhanced: false,
        alignmentsManifest: false,
        checkingManifest: false,
      };
    }
    let flags = await layoutFromRoot();
    if (!flags.alignmentsManifest || !flags.checkingManifest) {
      flags = await probeEnhancedLayoutWithFetcher((path) =>
        getFileContent({ host, token, owner, repo, path, ref }).then((f) => f.content),
      );
    }
    return { ...base, ...flags };
  };

  if (fmt === 'scripture-burrito') {
    const file = await getFileContent({ host, token, owner, repo, path: 'metadata.json', ref });
    const meta = parseScriptureBurrito(JSON.parse(file.content) as unknown);
    return mergeLayout({ format: 'scripture-burrito', ref, meta });
  }

  if (fmt === 'resource-container') {
    const file = await getFileContent({ host, token, owner, repo, path: 'manifest.yaml', ref });
    const manifest = parseResourceContainer(file.content);
    return mergeLayout({ format: 'resource-container', ref, manifest });
  }

  const entries = await listRepoContents({ host, token, owner, repo, path: '', ref });
  const files = entries
    .filter((e) => e.type === 'file' && /\.usfm$/i.test(e.name))
    .map((e) => ({ name: e.name, path: e.path }));
  return {
    format: 'raw-usfm',
    ref,
    files,
    enhanced: false,
    alignmentsManifest: false,
    checkingManifest: false,
  };
}

export { booksFromDetectedProject };
