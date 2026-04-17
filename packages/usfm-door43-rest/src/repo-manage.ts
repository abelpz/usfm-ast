import {
  DOOR43_HOST_DEFAULT,
  DOOR43_LEGACY_DEFAULT_BRANCH,
  DOOR43_SCRIPTURE_DEFAULT_BRANCH,
  door43ApiV1BaseUrl,
} from './constants';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

/** Append Gitea `message` from JSON body when present (helps debug 403/422 in the browser Network tab). */
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
    /* ignore */
  }
  throw new Error(`${prefix} ${res.status}: ${res.statusText}${extra}`);
}

export type Door43RepoInfo = {
  fullName: string;
  name: string;
  htmlUrl: string;
  owner: string;
  defaultBranch: string;
  empty?: boolean;
};

function mapRepoInfo(raw: unknown): Door43RepoInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const fullName = typeof o.full_name === 'string' ? o.full_name.trim() : '';
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  const htmlUrl = typeof o.html_url === 'string' ? o.html_url.trim() : '';
  let owner = '';
  if (typeof o.owner === 'object' && o.owner !== null) {
    const login = (o.owner as { login?: unknown }).login;
    if (typeof login === 'string') owner = login.trim();
  }
  const defaultBranch =
    typeof o.default_branch === 'string' && o.default_branch.trim()
      ? o.default_branch.trim()
      : DOOR43_LEGACY_DEFAULT_BRANCH;
  if (!fullName || !name || !htmlUrl) return null;
  const empty = typeof o.empty === 'boolean' ? o.empty : undefined;
  return { fullName, name, htmlUrl, owner, defaultBranch, empty };
}

export type GetRepoInfoOptions = {
  host?: string;
  token?: string;
  owner: string;
  repo: string;
  fetch?: typeof fetch;
};

/** Returns repository metadata, or `null` if not found (404). */
export async function getRepoInfo(options: GetRepoInfoOptions): Promise<Door43RepoInfo | null> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const url = `${base}/repos/${enc(options.owner)}/${enc(options.repo)}`;
  const fetchFn = options.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.token) headers.Authorization = `token ${options.token}`;
  const res = await fetchFn(url, { headers, cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) await door43HttpError('Door43 get repo', res);
  return mapRepoInfo(await res.json());
}

export type CreateRepoBranchOptions = {
  host?: string;
  token: string;
  owner: string;
  repo: string;
  newBranchName: string;
  /** Existing branch name (e.g. `master`) or commit SHA to branch from. */
  oldRefName: string;
  fetch?: typeof fetch;
};

/** `POST /repos/{owner}/{repo}/branches` (Gitea `CreateBranchRepoOption`). */
export async function createRepoBranch(options: CreateRepoBranchOptions): Promise<void> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const fetchFn = options.fetch ?? globalThis.fetch;
  const url = `${base}/repos/${enc(options.owner)}/${enc(options.repo)}/branches`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: authHeaders(options.token),
    body: JSON.stringify({
      new_branch_name: options.newBranchName,
      old_ref_name: options.oldRefName,
    }),
    cache: 'no-store',
  });
  if (res.status === 409) return;
  if (res.status === 201 || res.status === 200) return;
  if (!res.ok) await door43HttpError('Door43 create branch', res);
}

export type EnsureBranchOptions = {
  host?: string;
  token: string;
  owner: string;
  repo: string;
  /** Branch name to ensure exists. */
  branch: string;
  /** Branch or commit SHA to fork from if `branch` does not exist yet. */
  fromBranch: string;
  fetch?: typeof fetch;
};

/**
 * Ensure `branch` exists on the remote repository.
 * If it already exists the function is a no-op.
 * If it does not exist it is created from `fromBranch`.
 */
export async function ensureBranch(options: EnsureBranchOptions): Promise<void> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const fetchFn = options.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.token) headers.Authorization = `token ${options.token}`;

  // Check if it already exists.
  const checkRes = await fetchFn(
    `${base}/repos/${enc(options.owner)}/${enc(options.repo)}/branches/${enc(options.branch)}`,
    { headers, cache: 'no-store' },
  );
  if (checkRes.ok) return; // branch already exists

  // Create it from the base.
  await createRepoBranch({
    host,
    token: options.token,
    owner: options.owner,
    repo: options.repo,
    newBranchName: options.branch,
    oldRefName: options.fromBranch,
    fetch: fetchFn,
  });
}

export type GetBranchHeadCommitOptions = {
  host?: string;
  token: string;
  owner: string;
  repo: string;
  branch: string;
  fetch?: typeof fetch;
};

/**
 * Resolves a branch to its tip commit SHA (`GET …/branches/{branch}`).
 */
export async function getBranchHeadCommit(options: GetBranchHeadCommitOptions): Promise<string> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const fetchFn = options.fetch ?? globalThis.fetch;
  const url = `${base}/repos/${enc(options.owner)}/${enc(options.repo)}/branches/${enc(options.branch)}`;
  const res = await fetchFn(url, {
    headers: authHeaders(options.token),
    cache: 'no-store',
  });
  if (!res.ok) await door43HttpError('Door43 get branch', res);
  const raw: unknown = await res.json();
  if (!isRecord(raw)) throw new Error('Door43 get branch: invalid JSON');
  const commit = raw.commit;
  if (!isRecord(commit)) throw new Error('Door43 get branch: missing commit');
  const sha = typeof commit.sha === 'string' ? commit.sha.trim() : '';
  if (!sha) throw new Error('Door43 get branch: missing commit.sha');
  return sha;
}

export type UpdateRepoDefaultBranchOptions = {
  host?: string;
  token: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  fetch?: typeof fetch;
};

/** `PATCH /repos/{owner}/{repo}` — sets `default_branch` (Gitea `EditRepoOption`). */
export async function updateRepoDefaultBranch(options: UpdateRepoDefaultBranchOptions): Promise<void> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const fetchFn = options.fetch ?? globalThis.fetch;
  const url = `${base}/repos/${enc(options.owner)}/${enc(options.repo)}`;
  const res = await fetchFn(url, {
    method: 'PATCH',
    headers: authHeaders(options.token),
    body: JSON.stringify({ default_branch: options.defaultBranch }),
    cache: 'no-store',
  });
  if (!res.ok) await door43HttpError('Door43 update default branch', res);
}

export type EnsureRepoUsesMainDefaultBranchOptions = {
  host?: string;
  token: string;
  owner: string;
  repo: string;
  fetch?: typeof fetch;
};

export type EnsureRepoUsesMainDefaultBranchResult = {
  /** True if `main` was created and/or set as the repository default. */
  changed: boolean;
  previousDefault: string;
};

const MAIN_BRANCH = 'main';

/**
 * Ensures branch `main` exists and is the repository default (Gitea often uses `master` after `auto_init`).
 * Call before syncing when the project targets `main` (Scripture Burritos convention).
 */
export async function ensureRepoUsesMainDefaultBranch(
  options: EnsureRepoUsesMainDefaultBranchOptions,
): Promise<EnsureRepoUsesMainDefaultBranchResult> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const fetchFn = options.fetch ?? globalThis.fetch;
  const info = await getRepoInfo({
    host,
    token: options.token,
    owner: options.owner,
    repo: options.repo,
    fetch: fetchFn,
  });
  if (!info) throw new Error('Door43 repository not found.');
  if (info.empty) {
    throw new Error(
      'This Door43 repository has no commits yet. Add an initial commit on the server, then sync again.',
    );
  }
  const previousDefault = info.defaultBranch.trim();
  if (previousDefault.toLowerCase() === MAIN_BRANCH) {
    return { changed: false, previousDefault };
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `token ${options.token}`,
  };
  const branchMainUrl = `${base}/repos/${enc(options.owner)}/${enc(options.repo)}/branches/${enc(MAIN_BRANCH)}`;
  let brMain = await fetchFn(branchMainUrl, { headers, cache: 'no-store' });
  if (!brMain.ok && brMain.status === 404) {
    await createRepoBranch({
      host,
      token: options.token,
      owner: options.owner,
      repo: options.repo,
      newBranchName: MAIN_BRANCH,
      oldRefName: previousDefault,
      fetch: fetchFn,
    });
    brMain = await fetchFn(branchMainUrl, { headers, cache: 'no-store' });
  }
  if (!brMain.ok) await door43HttpError('Door43 get branch main', brMain);

  await updateRepoDefaultBranch({
    host,
    token: options.token,
    owner: options.owner,
    repo: options.repo,
    defaultBranch: MAIN_BRANCH,
    fetch: fetchFn,
  });
  return { changed: true, previousDefault };
}

export type CreateUserRepoOptions = {
  host?: string;
  token: string;
  name: string;
  description?: string;
  private?: boolean;
  autoInit?: boolean;
  /**
   * Gitea `default_branch` on create. Defaults to `main` (`DOOR43_SCRIPTURE_DEFAULT_BRANCH`) so
   * `auto_init` does not leave the repo on the server’s legacy `master` default.
   */
  defaultBranch?: string;
  fetch?: typeof fetch;
};

/** `POST /user/repos` */
export async function createUserRepo(options: CreateUserRepoOptions): Promise<Door43RepoInfo> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const fetchFn = options.fetch ?? globalThis.fetch;
  const body: Record<string, unknown> = {
    name: options.name,
    private: options.private ?? false,
    auto_init: options.autoInit ?? true,
    default_branch: options.defaultBranch ?? DOOR43_SCRIPTURE_DEFAULT_BRANCH,
  };
  if (options.description) body.description = options.description;
  const res = await fetchFn(`${base}/user/repos`, {
    method: 'POST',
    headers: authHeaders(options.token),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) await door43HttpError('Door43 create user repo', res);
  const info = mapRepoInfo(await res.json());
  if (!info) throw new Error('Invalid Door43 create repo response');
  return info;
}

export type CreateOrgRepoOptions = CreateUserRepoOptions & {
  org: string;
};

/** `POST /orgs/{org}/repos` */
export async function createOrgRepo(options: CreateOrgRepoOptions): Promise<Door43RepoInfo> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const fetchFn = options.fetch ?? globalThis.fetch;
  const body: Record<string, unknown> = {
    name: options.name,
    private: options.private ?? false,
    auto_init: options.autoInit ?? true,
    default_branch: options.defaultBranch ?? DOOR43_SCRIPTURE_DEFAULT_BRANCH,
  };
  if (options.description) body.description = options.description;
  const res = await fetchFn(`${base}/orgs/${enc(options.org)}/repos`, {
    method: 'POST',
    headers: authHeaders(options.token),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) await door43HttpError('Door43 create org repo', res);
  const info = mapRepoInfo(await res.json());
  if (!info) throw new Error('Invalid Door43 create org repo response');
  return info;
}

export type CreateOrganizationOptions = {
  host?: string;
  token: string;
  /** Organization username (slug). */
  username: string;
  fullName?: string;
  description?: string;
  /** Gitea: `public` | `limited` | `private` */
  visibility?: 'public' | 'limited' | 'private';
  fetch?: typeof fetch;
};

/** `POST /orgs` — returns organization summary (Gitea returns an org object, not a repo). */
export async function createOrganization(options: CreateOrganizationOptions): Promise<Door43OrgSummary> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const fetchFn = options.fetch ?? globalThis.fetch;
  const body: Record<string, unknown> = {
    username: options.username,
    visibility: options.visibility ?? 'public',
  };
  if (options.fullName) body.full_name = options.fullName;
  if (options.description) body.description = options.description;
  const res = await fetchFn(`${base}/orgs`, {
    method: 'POST',
    headers: authHeaders(options.token),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) await door43HttpError('Door43 create org', res);
  const raw: unknown = await res.json();
  if (!isRecord(raw)) throw new Error('Invalid Door43 create org response');
  const username = typeof raw.username === 'string' ? raw.username.trim() : '';
  if (!username) throw new Error('Invalid Door43 create org response');
  const fullName = typeof raw.full_name === 'string' ? raw.full_name.trim() : undefined;
  return { username, fullName };
}

export type Door43OrgSummary = {
  username: string;
  fullName?: string;
};

export type ListUserOrgsOptions = {
  host?: string;
  token: string;
  pageSize?: number;
  maxPages?: number;
  fetch?: typeof fetch;
};

/** Paginated `GET /user/orgs`. */
export async function listUserOrgs(options: ListUserOrgsOptions): Promise<Door43OrgSummary[]> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const fetchFn = options.fetch ?? globalThis.fetch;
  const limit = Math.min(Math.max(options.pageSize ?? 100, 1), 100);
  const maxPages = Math.min(Math.max(options.maxPages ?? 40, 1), 80);
  const out: Door43OrgSummary[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page += 1) {
    const u = new URL(`${base}/user/orgs`);
    u.searchParams.set('page', String(page));
    u.searchParams.set('limit', String(limit));
    const res = await fetchFn(u.toString(), {
      headers: authHeaders(options.token),
      cache: 'no-store',
    });
    if (!res.ok) await door43HttpError('Door43 list orgs', res);
    const body: unknown = await res.json();
    if (!Array.isArray(body)) throw new Error('Invalid user/orgs response');
    for (const raw of body) {
      if (typeof raw !== 'object' || raw === null) continue;
      const o = raw as Record<string, unknown>;
      const username = typeof o.username === 'string' ? o.username.trim() : '';
      if (!username || seen.has(username)) continue;
      seen.add(username);
      const fullName = typeof o.full_name === 'string' ? o.full_name.trim() : undefined;
      out.push({ username, fullName });
    }
    if (body.length < limit) break;
  }
  return out.sort((a, b) => a.username.localeCompare(b.username));
}

export type GitTreeEntry = {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size: number;
};

export type ListRepoGitTreeOptions = {
  host?: string;
  token?: string;
  owner: string;
  repo: string;
  /** Branch or tag name (resolved via branches API). */
  ref: string;
  recursive?: boolean;
  fetch?: typeof fetch;
};

/** Resolve Git tree object SHA from a `tree` field (string, `{ sha }`, or `{ url }` only). */
function treeObjectToSha(tree: unknown): string {
  if (typeof tree === 'string') {
    const t = tree.trim();
    if (/^[0-9a-f]{40}$/i.test(t)) return t;
    return '';
  }
  if (!isRecord(tree)) return '';
  if (typeof tree.sha === 'string' && tree.sha.trim()) return tree.sha.trim();
  const url = tree.url;
  if (typeof url === 'string') {
    const m = url.match(/\/(?:git\/)?trees\/([0-9a-f]{40})/i);
    if (m?.[1]) return m[1];
  }
  return '';
}

function treeShaFromCommitPayload(commit: Record<string, unknown>): string {
  return treeObjectToSha(commit.tree);
}

/** Gitea `GET .../git/commits/{sha}` often returns `{ sha, commit: { tree: { sha }, ... } }` (no top-level `tree`). */
function treeShaFromGitCommitApiBody(body: Record<string, unknown>): string {
  let sha = treeShaFromCommitPayload(body);
  if (!sha && isRecord(body.commit)) {
    sha = treeShaFromCommitPayload(body.commit as Record<string, unknown>);
  }
  return sha;
}

function commitOidFromBranchCommitPayload(commit: Record<string, unknown>): string {
  const id = commit.id;
  if (typeof id === 'string' && id.trim()) return id.trim();
  const sha = commit.sha;
  if (typeof sha === 'string' && sha.trim()) return sha.trim();
  const commitId = commit.commit_id;
  if (typeof commitId === 'string' && commitId.trim()) return commitId.trim();
  return '';
}

/**
 * `GET /repos/{owner}/{repo}/commits/{ref}` — stable way to read `commit.tree.sha` on Door43/Gitea
 * (avoids using the commit OID as a tree OID when `/git/trees/{commit}` still returns 200).
 */
async function fetchRootTreeShaFromCommitsApi(options: {
  base: string;
  enc: typeof encodeURIComponent;
  owner: string;
  repo: string;
  ref: string;
  headers: Record<string, string>;
  fetchFn: typeof fetch;
}): Promise<string | null> {
  const { base, enc, owner, repo, ref, headers, fetchFn } = options;
  const u = `${base}/repos/${enc(owner)}/${enc(repo)}/commits/${enc(ref)}`;
  const res = await fetchFn(u, { headers, cache: 'no-store' });
  if (!res.ok) return null;
  const j: unknown = await res.json();
  if (!isRecord(j)) return null;
  let sha = treeShaFromGitCommitApiBody(j);
  const head = typeof j.sha === 'string' ? j.sha.trim().toLowerCase() : '';
  if (sha && head && sha.toLowerCase() === head) {
    const inner = isRecord(j.commit) ? (j.commit as Record<string, unknown>) : null;
    const innerTree = inner ? treeObjectToSha(inner.tree) : '';
    if (innerTree && innerTree.toLowerCase() !== head) sha = innerTree;
    else sha = '';
  }
  return sha || null;
}

/** `GET .../git/commits/{sha}` — full commit includes `tree` even when `GET .../branches/{ref}` omits it. */
async function fetchTreeShaFromGitCommit(options: {
  base: string;
  enc: typeof encodeURIComponent;
  owner: string;
  repo: string;
  commitOid: string;
  headers: Record<string, string>;
  fetchFn: typeof fetch;
}): Promise<string> {
  const { base, enc, owner, repo, commitOid, headers, fetchFn } = options;
  const u = `${base}/repos/${enc(owner)}/${enc(repo)}/git/commits/${enc(commitOid)}`;
  const res = await fetchFn(u, { headers, cache: 'no-store' });
  if (!res.ok) await door43HttpError('Door43 get git commit', res);
  const j: unknown = await res.json();
  if (!isRecord(j)) throw new Error('Invalid git commit response');
  let sha = treeShaFromGitCommitApiBody(j);
  const head = typeof j.sha === 'string' ? j.sha.trim().toLowerCase() : '';
  if (sha && head && sha.toLowerCase() === head) {
    const inner = isRecord(j.commit) ? (j.commit as Record<string, unknown>) : null;
    const innerTree = inner ? treeObjectToSha(inner.tree) : '';
    if (innerTree && innerTree.toLowerCase() !== head) sha = innerTree;
  }
  if (!sha) throw new Error('Missing tree sha');
  return sha;
}

/**
 * Lists git tree entries for the ref’s root tree (blobs and trees).
 * Resolves `ref` (branch name) to a tree SHA via `GET .../branches/{ref}`.
 */
export async function listRepoGitTree(options: ListRepoGitTreeOptions): Promise<GitTreeEntry[]> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const fetchFn = options.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.token) headers.Authorization = `token ${options.token}`;

  let refName = options.ref;
  const branchUrl = (r: string) =>
    `${base}/repos/${enc(options.owner)}/${enc(options.repo)}/branches/${enc(r)}`;

  let br = await fetchFn(branchUrl(refName), { headers, cache: 'no-store' });
  if (!br.ok && options.token) {
    const info = await getRepoInfo({
      host,
      token: options.token,
      owner: options.owner,
      repo: options.repo,
      fetch: fetchFn,
    });
    const def = info?.defaultBranch?.trim();
    if (def && def !== refName) {
      refName = def;
      br = await fetchFn(branchUrl(refName), { headers, cache: 'no-store' });
    }
  }
  if (!br.ok) await door43HttpError('Door43 get branch', br);
  const branchBody: unknown = await br.json();
  if (!isRecord(branchBody)) throw new Error('Invalid branch response');
  const commit = branchBody.commit;
  if (!isRecord(commit)) throw new Error('Invalid branch commit');
  let oid = commitOidFromBranchCommitPayload(commit);
  if (!oid && isRecord(commit.commit)) {
    oid = commitOidFromBranchCommitPayload(commit.commit as Record<string, unknown>);
  }
  if (!oid && typeof branchBody.commit_sha === 'string' && branchBody.commit_sha.trim()) {
    oid = branchBody.commit_sha.trim();
  }

  // Try extracting tree SHA from the branch payload first (no extra request needed).
  let treeSha = treeShaFromGitCommitApiBody(commit);

  // If tree SHA == commit OID (Gitea returned the commit as the tree), clear it so we resolve properly.
  if (
    treeSha &&
    oid &&
    /^[0-9a-f]{40}$/i.test(oid) &&
    /^[0-9a-f]{40}$/i.test(treeSha) &&
    treeSha.toLowerCase() === oid.toLowerCase()
  ) {
    treeSha = '';
  }

  // Only call /commits/{ref} (Gitea v1.21+) when the branch payload didn't give us a usable tree SHA.
  if (!treeSha) {
    treeSha =
      (await fetchRootTreeShaFromCommitsApi({
        base,
        enc,
        owner: options.owner,
        repo: options.repo,
        ref: refName,
        headers,
        fetchFn,
      })) ?? '';
  }
  if (!treeSha) {
    if (!oid) throw new Error('Missing tree sha');
    treeSha = await fetchTreeShaFromGitCommit({
      base,
      enc,
      owner: options.owner,
      repo: options.repo,
      commitOid: oid,
      headers,
      fetchFn,
    });
  }

  const recursive = options.recursive !== false;
  const treeUrl = new URL(
    `${base}/repos/${enc(options.owner)}/${enc(options.repo)}/git/trees/${enc(treeSha)}`,
  );
  if (recursive) treeUrl.searchParams.set('recursive', 'true');

  const tr = await fetchFn(treeUrl.toString(), { headers, cache: 'no-store' });
  if (!tr.ok) await door43HttpError('Door43 get tree', tr);
  const treeJson: unknown = await tr.json();
  if (!isRecord(treeJson) || !Array.isArray(treeJson.tree)) {
    throw new Error('Invalid tree response');
  }

  const out: GitTreeEntry[] = [];
  for (const item of treeJson.tree) {
    if (!isRecord(item)) continue;
    const path = typeof item.path === 'string' ? item.path.replace(/\\/g, '/') : '';
    const type = item.type;
    const sha = typeof item.sha === 'string' ? item.sha : '';
    const size = typeof item.size === 'number' ? item.size : 0;
    if (!path || !sha) continue;
    if (type !== 'blob' && type !== 'tree' && type !== 'commit') continue;
    out.push({ path, type, sha, size });
  }
  return out;
}
