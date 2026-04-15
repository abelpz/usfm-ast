import { DOOR43_HOST_DEFAULT, door43ApiV1BaseUrl } from './constants';

export type Door43ContentEntry = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha: string;
  size: number;
};

export type ListRepoContentsOptions = {
  host?: string;
  token?: string;
  owner: string;
  repo: string;
  path?: string;
  ref?: string;
  fetch?: typeof fetch;
};

function contentsUrl(base: string, owner: string, repo: string, path: string, ref?: string): string {
  const enc = encodeURIComponent;
  const pathSeg = path
    .split('/')
    .filter(Boolean)
    .map(enc)
    .join('/');
  const suffix = pathSeg ? `/${pathSeg}` : '';
  const u = new URL(`${base}/repos/${enc(owner)}/${enc(repo)}/contents${suffix}`);
  if (ref) u.searchParams.set('ref', ref);
  return u.toString();
}

function authHeaders(token?: string): HeadersInit {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (token) h.Authorization = `token ${token}`;
  return h;
}

export async function listRepoContents(options: ListRepoContentsOptions): Promise<Door43ContentEntry[]> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const url = contentsUrl(base, options.owner, options.repo, options.path ?? '', options.ref);
  const fetchFn = options.fetch ?? globalThis.fetch;
  const res = await fetchFn(url, {
    headers: authHeaders(options.token),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Door43 list contents ${res.status}: ${res.statusText}`);
  }
  const body: unknown = await res.json();
  if (Array.isArray(body)) {
    return body.map(parseContentEntry);
  }
  if (typeof body === 'object' && body !== null) {
    return [parseContentEntry(body)];
  }
  throw new Error('Invalid Door43 contents response');
}

function parseContentEntry(raw: unknown): Door43ContentEntry {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid content entry');
  }
  const o = raw as Record<string, unknown>;
  const name = o.name;
  const path = o.path;
  const type = o.type;
  const sha = o.sha;
  const size = o.size;
  if (typeof name !== 'string' || typeof path !== 'string' || typeof sha !== 'string') {
    throw new Error('Invalid content entry fields');
  }
  if (type !== 'file' && type !== 'dir') {
    throw new Error('Invalid content entry type');
  }
  const sizeNum = typeof size === 'number' ? size : 0;
  return { name, path, type, sha, size: sizeNum };
}

export type GetFileContentOptions = {
  host?: string;
  token?: string;
  owner: string;
  repo: string;
  path: string;
  ref?: string;
  fetch?: typeof fetch;
};

export type Door43FileContent = {
  content: string;
  sha: string;
  name: string;
  path: string;
};

function decodeBase64Utf8(b64: string): string {
  const cleaned = b64.replace(/\s/g, '');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(cleaned, 'base64').toString('utf8');
  }
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

export async function getFileContent(options: GetFileContentOptions): Promise<Door43FileContent> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const url = contentsUrl(base, options.owner, options.repo, options.path, options.ref);
  const fetchFn = options.fetch ?? globalThis.fetch;
  const res = await fetchFn(url, {
    headers: authHeaders(options.token),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Door43 get file ${res.status}: ${res.statusText}`);
  }
  const o = (await res.json()) as Record<string, unknown>;
  if (o.type !== 'file') {
    throw new Error('Door43 contents path is not a file');
  }
  const name = o.name;
  const path = o.path;
  const sha = o.sha;
  const content = o.content;
  const encoding = o.encoding;
  if (
    typeof name !== 'string' ||
    typeof path !== 'string' ||
    typeof sha !== 'string' ||
    typeof content !== 'string'
  ) {
    throw new Error('Invalid Door43 file response');
  }
  if (encoding !== 'base64') {
    throw new Error(`Unexpected content encoding: ${String(encoding)}`);
  }
  const text = decodeBase64Utf8(content);
  return { content: text, sha, name, path };
}

function encodeBase64Utf8(s: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'utf8').toString('base64');
  }
  // In the browser, btoa() only handles Latin1. Encode to UTF-8 bytes first.
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export type CreateOrUpdateRepoFileOptions = {
  host?: string;
  token: string;
  owner: string;
  repo: string;
  path: string;
  /** UTF-8 text file body */
  content: string;
  message: string;
  branch?: string;
  /** Existing blob sha — required to update; omit for create */
  sha?: string;
  fetch?: typeof fetch;
};

export type Door43ContentsWriteResult = {
  content: { sha: string };
  commit: { sha: string; url?: string };
};

function parseDoor43ContentsWriteResult(json: Record<string, unknown>): Door43ContentsWriteResult {
  const content = json.content as Record<string, unknown> | undefined;
  const commit = json.commit as Record<string, unknown> | undefined;
  const csha = content && typeof content.sha === 'string' ? content.sha : '';
  const comSha = commit && typeof commit.sha === 'string' ? commit.sha : '';
  if (!csha || !comSha) throw new Error('Invalid Door43 file write response');
  return {
    content: { sha: csha },
    commit: {
      sha: comSha,
      url: commit && typeof commit.url === 'string' ? commit.url : undefined,
    },
  };
}

async function door43ContentsError(prefix: string, res: Response, bodyText: string): Promise<never> {
  let extra = '';
  try {
    const j = JSON.parse(bodyText) as { message?: unknown };
    if (typeof j.message === 'string' && j.message.trim()) extra = ` — ${j.message.trim()}`;
    else if (bodyText.trim() && bodyText.length < 240) extra = ` — ${bodyText.trim()}`;
  } catch {
    if (bodyText.trim() && bodyText.length < 240) extra = ` — ${bodyText.trim()}`;
  }
  throw new Error(`${prefix} ${res.status}: ${res.statusText}${extra}`);
}

/**
 * Create a new file via `POST /repos/{owner}/{repo}/contents/{path}`.
 * Gitea: `repoCreateFile` — does NOT accept `sha`.
 */
export async function createRepoFile(
  options: Omit<CreateOrUpdateRepoFileOptions, 'sha'>,
): Promise<Door43ContentsWriteResult> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const pathSeg = options.path.split('/').filter(Boolean).map(enc).join('/');
  const url = `${base}/repos/${enc(options.owner)}/${enc(options.repo)}/contents/${pathSeg}`;
  const branch = options.branch ?? 'main';
  const fetchFn = options.fetch ?? globalThis.fetch;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { ...authHeaders(options.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch, content: encodeBase64Utf8(options.content), message: options.message }),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) await door43ContentsError('Door43 create file', res, text);
  let json: Record<string, unknown>;
  try { json = JSON.parse(text) as Record<string, unknown>; }
  catch { throw new Error('Invalid Door43 create file response'); }
  return parseDoor43ContentsWriteResult(json);
}

/**
 * Update an existing file via `PUT /repos/{owner}/{repo}/contents/{path}`.
 * Gitea: `repoUpdateFile` — `sha` of the existing blob is **required**.
 */
export async function updateRepoFile(
  options: CreateOrUpdateRepoFileOptions & { sha: string },
): Promise<Door43ContentsWriteResult> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const pathSeg = options.path.split('/').filter(Boolean).map(enc).join('/');
  const url = `${base}/repos/${enc(options.owner)}/${enc(options.repo)}/contents/${pathSeg}`;
  const branch = options.branch ?? 'main';
  const fetchFn = options.fetch ?? globalThis.fetch;
  const res = await fetchFn(url, {
    method: 'PUT',
    headers: { ...authHeaders(options.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch, sha: options.sha, content: encodeBase64Utf8(options.content), message: options.message }),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) await door43ContentsError('Door43 update file', res, text);
  let json: Record<string, unknown>;
  try { json = JSON.parse(text) as Record<string, unknown>; }
  catch { throw new Error('Invalid Door43 update file response'); }
  return parseDoor43ContentsWriteResult(json);
}

/**
 * Create or update a single text file.
 *
 * - If `options.sha` is supplied, goes straight to `PUT` (update).
 * - Otherwise tries `POST` (create). If Gitea responds with 422 "already
 *   exists", it fetches the current blob SHA via `GET` and retries as `PUT`.
 *   This handles the case where the file was introduced on the branch by a
 *   prior merge (e.g. another user's changes landed on `main` before this
 *   branch was forked).
 */
export async function createOrUpdateRepoFile(
  options: CreateOrUpdateRepoFileOptions,
): Promise<Door43ContentsWriteResult> {
  if (options.sha) {
    return updateRepoFile(options as CreateOrUpdateRepoFileOptions & { sha: string });
  }

  // Try to create first.
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const pathSeg = options.path.split('/').filter(Boolean).map(enc).join('/');
  const url = `${base}/repos/${enc(options.owner)}/${enc(options.repo)}/contents/${pathSeg}`;
  const branch = options.branch ?? 'main';
  const fetchFn = options.fetch ?? globalThis.fetch;

  const createRes = await fetchFn(url, {
    method: 'POST',
    headers: { ...authHeaders(options.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch, content: encodeBase64Utf8(options.content), message: options.message }),
    cache: 'no-store',
  });

  if (createRes.ok) {
    const text = await createRes.text();
    let json: Record<string, unknown>;
    try { json = JSON.parse(text) as Record<string, unknown>; }
    catch { throw new Error('Invalid Door43 create file response'); }
    return parseDoor43ContentsWriteResult(json);
  }

  // On 422 "already exists", fall back to GET-then-PUT.
  if (createRes.status === 422) {
    const bodyText = await createRes.text().catch(() => '');
    if (bodyText.toLowerCase().includes('already exists')) {
      const existing = await getFileContent({ ...options, ref: branch });
      return updateRepoFile({ ...options, sha: existing.sha, branch });
    }
    await door43ContentsError('Door43 create file', createRes, bodyText);
  }

  const bodyText = await createRes.text().catch(() => '');
  return await door43ContentsError('Door43 create file', createRes, bodyText);
}

export type DeleteRepoFileOptions = {
  host?: string;
  token: string;
  owner: string;
  repo: string;
  path: string;
  /** Current file sha from getFileContent */
  fileSha: string;
  message: string;
  branch?: string;
  fetch?: typeof fetch;
};

/**
 * Delete a file via `DELETE /repos/{owner}/{repo}/contents/{path}`.
 */
export async function deleteRepoFile(options: DeleteRepoFileOptions): Promise<void> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const pathSeg = options.path
    .split('/')
    .filter(Boolean)
    .map(enc)
    .join('/');
  const url = `${base}/repos/${enc(options.owner)}/${enc(options.repo)}/contents/${pathSeg}`;
  const branch = options.branch ?? 'main';
  const fetchFn = options.fetch ?? globalThis.fetch;
  const res = await fetchFn(url, {
    method: 'DELETE',
    headers: {
      ...authHeaders(options.token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      branch,
      sha: options.fileSha,
      message: options.message,
    }),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Door43 delete file ${res.status}: ${res.statusText}`);
  }
}
