import { door43WebRawFileUrl } from '@usfm-tools/editor-adapters';

import { getFileContent } from '@/dcs-client';
import type { HelpsResourceConfig } from '@/lib/helps-config-storage';

export async function fetchHelpArticleMarkdown(options: {
  kind: 'tw' | 'ta';
  /** Repo-relative path without .md, e.g. bible/kt/grace */
  articleId: string;
  config: HelpsResourceConfig;
  token?: string;
}): Promise<string> {
  const path = `${options.articleId.replace(/\.md$/i, '')}.md`;
  const owner =
    options.kind === 'tw' ? options.config.twArticleOwner : options.config.taArticleOwner;
  const repo =
    options.kind === 'tw' ? options.config.twArticleRepo : options.config.taArticleRepo;
  const ref =
    options.kind === 'tw' ? options.config.twArticleRef : options.config.taArticleRef;
  const host = options.config.host || 'git.door43.org';
  if (options.token) {
    const r = await getFileContent({
      host,
      token: options.token,
      owner,
      repo,
      path,
      ref,
    });
    return r.content;
  }
  const url = door43WebRawFileUrl({ host, owner, repo, ref, path });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load article (${res.status})`);
  return res.text();
}
