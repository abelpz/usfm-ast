/**
 * Push the same `alignments/`, `checking/`, and manifest hooks as home-page–created projects.
 */

import { createOrUpdateRepoFile, getFileContent } from '@/dcs-client';
import type { DetectedDcsProject } from '@/lib/dcs-format-detect';
import {
  enhancedLayoutSupportFiles,
  mergeResourceContainerForEnhancedLayout,
  mergeScriptureBurritoForEnhancedLayout,
  parseResourceContainer,
  parseScriptureBurrito,
  serializeResourceContainer,
} from '@usfm-tools/project-formats';

export async function pushEnhancedLayoutToRemote(options: {
  host?: string;
  token: string;
  owner: string;
  repo: string;
  ref: string;
  project: DetectedDcsProject;
}): Promise<void> {
  const { host, token, owner, repo, ref, project } = options;
  if (project.format === 'raw-usfm') {
    throw new Error('Standard editor layout requires a Scripture Burrito or Resource Container manifest.');
  }

  const base = { host, token, owner, repo, branch: ref } as const;
  const msgStatic = 'Add standard editor layout (alignments/, checking/)';

  const staticFiles: Record<string, string> = enhancedLayoutSupportFiles();
  for (const [path, text] of Object.entries(staticFiles)) {
    await createOrUpdateRepoFile({
      ...base,
      path,
      content: text,
      message: msgStatic,
    });
  }

  if (project.format === 'resource-container') {
    const f = await getFileContent({ host, token, owner, repo, path: 'manifest.yaml', ref });
    const m = parseResourceContainer(f.content);
    const merged = mergeResourceContainerForEnhancedLayout(m);
    await createOrUpdateRepoFile({
      ...base,
      path: 'manifest.yaml',
      content: serializeResourceContainer(merged),
      message: 'Declare enhanced layout in manifest (x_extensions)',
      sha: f.sha,
    });
    return;
  }

  const f = await getFileContent({ host, token, owner, repo, path: 'metadata.json', ref });
  const meta = parseScriptureBurrito(JSON.parse(f.content) as unknown);
  const merged = mergeScriptureBurritoForEnhancedLayout(meta);
  await createOrUpdateRepoFile({
    ...base,
    path: 'metadata.json',
    content: `${JSON.stringify(merged, null, 2)}\n`,
    message: 'Register alignments/checking ingredients (Scripture Burrito)',
    sha: f.sha,
  });
}
