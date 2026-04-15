import type { HelpLink } from '@usfm-tools/types';

import { normalizeDoor43Host } from '@usfm-tools/door43-rest';

export type Door43WebRawParams = {
  host?: string;
  owner: string;
  repo: string;
  /** Branch, tag, or commit. */
  ref?: string;
  /** Repo-relative path, e.g. `bible/kt/grace.md`. */
  path: string;
};

/**
 * Browser-friendly raw file URL (`/{owner}/{repo}/raw/{ref}/{path}`) on Door43 / Gitea.
 * Public repos load without a token; private repos need API + auth instead.
 */
export function door43WebRawFileUrl(params: Door43WebRawParams): string {
  const h = normalizeDoor43Host(params.host ?? '');
  const ref = (params.ref ?? 'master').trim();
  const path = params.path
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return `https://${h}/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/raw/${encodeURIComponent(ref)}/${path}`;
}

/**
 * Parse unfoldingWord-style `rc:` support-reference cells into a repo-relative markdown path.
 *
 * Examples: rc scheme with tw/dict → bible/kt/grace.md; tw/dict bible/names → bible/names/aaron.md
 */
export function twArticlePathFromSupportReference(supportRef: string): string | null {
  const s = supportRef.trim();
  const m = /tw\/dict\/(.+)/i.exec(s);
  if (!m) return null;
  let rest = m[1]!.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!rest) return null;
  if (!rest.endsWith('.md')) rest = `${rest}.md`;
  return rest;
}

/** e.g. rc scheme with ta/man/translate/… → translate/figs-metaphor.md */
export function taArticlePathFromSupportReference(supportRef: string): string | null {
  const s = supportRef.trim();
  const m = /ta\/man\/(.+)/i.exec(s);
  if (!m) return null;
  let rest = m[1]!.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!rest) return null;
  if (!rest.endsWith('.md')) rest = `${rest}.md`;
  return rest;
}

export function helpLinksFromSupportReference(supportRef: string): HelpLink[] {
  const s = supportRef.trim();
  if (!s) return [];
  const twPath = twArticlePathFromSupportReference(s);
  if (twPath) {
    const id = twPath.replace(/\.md$/i, '');
    return [{ type: 'tw', id, displayText: id.split('/').pop() ?? id }];
  }
  const taPath = taArticlePathFromSupportReference(s);
  if (taPath) {
    const id = taPath.replace(/\.md$/i, '');
    return [{ type: 'ta', id, displayText: id.split('/').pop() ?? id }];
  }
  return [{ type: 'custom', id: s, displayText: s.slice(0, 80) }];
}
