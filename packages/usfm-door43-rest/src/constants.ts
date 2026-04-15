/** Default Gitea host for Door43 (HTTPS). */
export const DOOR43_HOST_DEFAULT = 'git.door43.org' as const;

/**
 * Default Git branch for **new** repos created via Gitea `auto_init`.
 * Door43’s Gitea often initializes `master` unless `default_branch` is set in the create payload;
 * Scripture Burritos / enhanced projects in this stack expect `main`.
 */
export const DOOR43_SCRIPTURE_DEFAULT_BRANCH = 'main' as const;

/**
 * Fallback when `GET …/repos/{owner}/{repo}` omits `default_branch` (older Gitea / resource repos).
 */
export const DOOR43_LEGACY_DEFAULT_BRANCH = 'master' as const;

export function normalizeDoor43Host(host: string): string {
  let h = host.trim();
  if (!h) return DOOR43_HOST_DEFAULT;
  h = h.replace(/^https?:\/\//i, '');
  const slash = h.indexOf('/');
  if (slash >= 0) h = h.slice(0, slash);
  h = h.trim().toLowerCase();
  return h || DOOR43_HOST_DEFAULT;
}

export function door43ApiV1BaseUrl(host?: string): string {
  const h =
    host !== undefined && host.trim() !== '' ? normalizeDoor43Host(host) : DOOR43_HOST_DEFAULT;
  return `https://${h}/api/v1`;
}
