import { DOOR43_HOST_DEFAULT, door43ApiV1BaseUrl } from './constants';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

async function door43HttpError(prefix: string, res: Response): Promise<never> {
  let extra = '';
  try {
    const text = await res.text();
    if (text) {
      try {
        const j = JSON.parse(text) as { message?: unknown };
        if (typeof j.message === 'string' && j.message.trim()) extra = ` — ${j.message.trim()}`;
        else if (text.length < 240) extra = ` — ${text.trim()}`;
      } catch {
        if (text.length < 240) extra = ` — ${text.trim()}`;
      }
    }
  } catch {
    // ignore body read errors
  }
  throw new Error(`${prefix} ${res.status}${extra}`);
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PullRequestState = 'open' | 'closed' | 'all';

export type PullRequestInfo = {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  /** Whether the PR can be merged automatically (no conflicts). */
  mergeable: boolean | null;
  head: { label: string; ref: string; sha: string };
  base: { label: string; ref: string; sha: string };
};

export type ListPullRequestsOptions = {
  host?: string;
  token: string;
  owner: string;
  repo: string;
  state?: PullRequestState;
  /** Filter by head branch (e.g. `username/tit`). */
  head?: string;
  /** Filter by base branch (e.g. `tit`). */
  base?: string;
  fetch?: typeof globalThis.fetch;
};

export type CreatePullRequestOptions = {
  host?: string;
  token: string;
  owner: string;
  repo: string;
  /** Source branch (head). */
  head: string;
  /** Target branch (base). */
  base: string;
  title: string;
  body?: string;
  fetch?: typeof globalThis.fetch;
};

export type MergeMethod = 'merge' | 'rebase' | 'squash';

export type MergePullRequestOptions = {
  host?: string;
  token: string;
  owner: string;
  repo: string;
  /** Pull request number (index). */
  index: number;
  method?: MergeMethod;
  /** Custom commit message for the merge commit. */
  message?: string;
  fetch?: typeof globalThis.fetch;
};

export type MergePullRequestResult =
  | { merged: true; prHtmlUrl: string }
  | { merged: false; prHtmlUrl: string };

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapPullRequest(raw: Record<string, unknown>): PullRequestInfo {
  const head = isRecord(raw.head) ? raw.head : {};
  const base = isRecord(raw.base) ? raw.base : {};
  return {
    number: typeof raw.number === 'number' ? raw.number : 0,
    title: typeof raw.title === 'string' ? raw.title : '',
    state: typeof raw.state === 'string' ? raw.state : 'open',
    htmlUrl: typeof raw.html_url === 'string' ? raw.html_url : '',
    mergeable: typeof raw.mergeable === 'boolean' ? raw.mergeable : null,
    head: {
      label: typeof head.label === 'string' ? head.label : '',
      ref: typeof head.ref === 'string' ? head.ref : '',
      sha: typeof head.sha === 'string' ? head.sha : '',
    },
    base: {
      label: typeof base.label === 'string' ? base.label : '',
      ref: typeof base.ref === 'string' ? base.ref : '',
      sha: typeof base.sha === 'string' ? base.sha : '',
    },
  };
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * List pull requests for a repository.
 * Optionally filter by `head` branch (e.g. `owner:branch` or just `branch`)
 * and/or `base` branch.
 */
export async function listPullRequests(
  options: ListPullRequestsOptions,
): Promise<PullRequestInfo[]> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const fetchFn = options.fetch ?? globalThis.fetch;

  const params = new URLSearchParams();
  params.set('state', options.state ?? 'open');
  params.set('limit', '50');
  if (options.head) params.set('head', options.head);
  if (options.base) params.set('base', options.base);

  const url = `${base}/repos/${enc(options.owner)}/${enc(options.repo)}/pulls?${params.toString()}`;
  const res = await fetchFn(url, { headers: authHeaders(options.token) });
  if (!res.ok) await door43HttpError('Door43 list pull requests', res);
  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map(mapPullRequest);
}

/**
 * Create a pull request. Returns the new PR's info.
 * If an open PR already exists between the same branches, you should call
 * `listPullRequests` first to reuse it.
 */
export async function createPullRequest(
  options: CreatePullRequestOptions,
): Promise<PullRequestInfo> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const fetchFn = options.fetch ?? globalThis.fetch;

  const body: Record<string, unknown> = {
    head: options.head,
    base: options.base,
    title: options.title,
  };
  if (options.body) body.body = options.body;

  const res = await fetchFn(
    `${base}/repos/${enc(options.owner)}/${enc(options.repo)}/pulls`,
    {
      method: 'POST',
      headers: authHeaders(options.token),
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) await door43HttpError('Door43 create pull request', res);
  const raw: unknown = await res.json();
  if (!isRecord(raw)) throw new Error('Door43 create pull request: unexpected response shape');
  return mapPullRequest(raw);
}

/**
 * Attempt to merge an open pull request.
 *
 * Returns `{ merged: true }` on success.
 * Returns `{ merged: false }` when Gitea reports the PR is not mergeable
 * (HTTP 405 after retries, 409, or response body says cannot merge) — the
 * caller should surface the `prHtmlUrl` to the user as a link to resolve the
 * conflict.
 *
 * Any other HTTP error is thrown.
 *
 * ### Why retries on 405?
 * Gitea computes PR mergeability **asynchronously** after PR creation.  While
 * it is still calculating, `POST …/merge` returns 405 even for a clean PR.
 * We retry up to `MAX_MERGE_ATTEMPTS` times with an exponential back-off
 * before giving up and treating the 405 as a genuine conflict.
 */
export async function mergePullRequest(
  options: MergePullRequestOptions,
): Promise<MergePullRequestResult> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const fetchFn = options.fetch ?? globalThis.fetch;

  const prHtmlUrl = `${host.replace(/\/$/, '')}/${options.owner}/${options.repo}/pulls/${options.index}`;

  const body: Record<string, unknown> = {
    Do: options.method ?? 'merge',
  };
  if (options.message) body.merge_message_field = options.message;

  const mergeUrl = `${base}/repos/${enc(options.owner)}/${enc(options.repo)}/pulls/${options.index}/merge`;

  const MAX_MERGE_ATTEMPTS = 5;
  const BASE_DELAY_MS = 1500;

  for (let attempt = 1; attempt <= MAX_MERGE_ATTEMPTS; attempt++) {
    const res = await fetchFn(mergeUrl, {
      method: 'POST',
      headers: authHeaders(options.token),
      body: JSON.stringify(body),
    });

    // 200 / 204 = merged successfully
    if (res.status === 200 || res.status === 204) {
      return { merged: true, prHtmlUrl };
    }

    // 409 = real conflict — no point retrying
    if (res.status === 409) {
      return { merged: false, prHtmlUrl };
    }

    // 405 = Gitea may still be calculating mergeability — retry with back-off,
    // but on the last attempt treat it as a genuine "not mergeable" result.
    if (res.status === 405) {
      if (attempt < MAX_MERGE_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, BASE_DELAY_MS * attempt));
        continue;
      }
      return { merged: false, prHtmlUrl };
    }

    // For any other status, check the body for conflict keywords before throwing.
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      // ignore
    }
    const lower = bodyText.toLowerCase();
    if (
      lower.includes('not mergeable') ||
      lower.includes('cannot merge') ||
      lower.includes('conflict')
    ) {
      return { merged: false, prHtmlUrl };
    }

    // Unrecognised error — throw. door43HttpError always throws; the return
    // below is unreachable but satisfies TypeScript.
    return await door43HttpError('Door43 merge pull request', res);
  }

  // Exhausted retries (all 405s) — treat as not mergeable.
  return { merged: false, prHtmlUrl };
}

/**
 * Find an existing open PR between `head` → `base`, or create one if none exists.
 * Returns the PR number and HTML URL.
 */
export async function ensureOpenPullRequest(options: {
  host?: string;
  token: string;
  owner: string;
  repo: string;
  head: string;
  base: string;
  title: string;
  body?: string;
  fetch?: typeof globalThis.fetch;
}): Promise<PullRequestInfo> {
  const existing = await listPullRequests({
    host: options.host,
    token: options.token,
    owner: options.owner,
    repo: options.repo,
    state: 'open',
    head: options.head,
    base: options.base,
    fetch: options.fetch,
  });

  // Gitea may return PRs that don't exactly match the head filter — confirm.
  const matched = existing.find(
    (pr) =>
      pr.head.ref === options.head &&
      pr.base.ref === options.base,
  );
  if (matched) return matched;

  return createPullRequest({
    host: options.host,
    token: options.token,
    owner: options.owner,
    repo: options.repo,
    head: options.head,
    base: options.base,
    title: options.title,
    body: options.body,
    fetch: options.fetch,
  });
}
