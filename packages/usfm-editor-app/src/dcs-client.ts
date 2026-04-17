/**
 * Door43 / Gitea API client for the editor app.
 * Repo **contents** I/O is re-exported from `@usfm-tools/door43-rest` (shared with `@usfm-tools/editor-adapters`).
 */

import * as door43Rest from '@usfm-tools/door43-rest';

const DEFAULT_HOST = 'git.door43.org';

/**
 * Match `@biblia-studio/door43` — scoped Gitea requires `read:user` for `GET /api/v1/user`.
 * `write:organization` is required for `POST /api/v1/orgs`, `POST /api/v1/orgs/{org}/repos`, and
 * related org APIs used by local project sync; without it those calls return **403**.
 */
const DEFAULT_TOKEN_SCOPES = [
  'read:user',
  'read:repository',
  'write:repository',
  'read:organization',
  'write:organization',
] as const;

function normalizeHost(host: string): string {
  let h = host.trim();
  if (!h) return DEFAULT_HOST;
  h = h.replace(/^https?:\/\//i, '');
  const slash = h.indexOf('/');
  if (slash >= 0) h = h.slice(0, slash);
  h = h.trim().toLowerCase();
  return h || DEFAULT_HOST;
}

function apiV1(host: string): string {
  return `https://${normalizeHost(host)}/api/v1`;
}

function encodeBasicAuth(username: string, password: string): string {
  const creds = `${username}:${password}`;
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(creds, 'utf8').toString('base64');
  }
  return btoa(creds);
}

export type Door43UserInfo = {
  id: number;
  login: string;
  fullName: string;
  email: string;
  avatarUrl: string;
};

export type Door43TokenInfo = {
  id: number;
  name: string;
  sha1: string;
};

export async function loginAndCreateToken(options: {
  host?: string;
  username: string;
  password: string;
  tokenName: string;
  scopes?: readonly string[];
}): Promise<Door43TokenInfo> {
  const host = options.host !== undefined && options.host.trim() !== '' ? options.host : DEFAULT_HOST;
  const base = apiV1(host);
  const scopes = options.scopes?.length ? [...options.scopes] : [...DEFAULT_TOKEN_SCOPES];
  const res = await fetch(`${base}/users/${encodeURIComponent(options.username)}/tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${encodeBasicAuth(options.username, options.password)}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ name: options.tokenName, scopes }),
  });
  if (!res.ok) throw new Error(`DCS create token ${res.status}: ${res.statusText}`);
  const body = (await res.json()) as Record<string, unknown>;
  const id = body.id;
  const name = body.name;
  const sha1 =
    typeof body.sha1 === 'string'
      ? body.sha1
      : typeof body.token === 'string'
        ? body.token
        : '';
  if (typeof id !== 'number' || typeof name !== 'string' || !sha1) {
    throw new Error('Invalid DCS token response');
  }
  return { id, name, sha1 };
}

export async function fetchAuthenticatedUser(options: {
  host?: string;
  token: string;
}): Promise<Door43UserInfo> {
  const host = options.host ?? DEFAULT_HOST;
  const res = await fetch(`${apiV1(host)}/user`, {
    headers: { Authorization: `token ${options.token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`DCS user ${res.status}: ${res.statusText}`);
  const o = (await res.json()) as Record<string, unknown>;
  if (typeof o.id !== 'number' || typeof o.login !== 'string') {
    throw new Error('Invalid DCS user response');
  }
  return {
    id: o.id,
    login: o.login,
    fullName: typeof o.full_name === 'string' ? o.full_name : '',
    email: typeof o.email === 'string' ? o.email : '',
    avatarUrl: typeof o.avatar_url === 'string' ? o.avatar_url : '',
  };
}

export type Door43RepoRow = {
  fullName: string;
  name: string;
  htmlUrl: string;
  owner?: string;
  private?: boolean;
  description?: string;
  defaultBranch?: string;
  /** Gitea: repository has no commits / no default branch content. */
  empty?: boolean;
  archived?: boolean;
};

/**
 * Drops repos the scripture editor launcher is very unlikely to open as USFM projects
 * (Door43 profile repo, personal placeholder `user/user`, archived, empty).
 */
export function isLikelyScriptureProjectRepo(row: Door43RepoRow): boolean {
  const name = row.name.trim();
  const ownerFromFull = row.fullName.includes('/') ? row.fullName.split('/')[0]!.trim() : '';
  const owner = (row.owner ?? ownerFromFull).trim();
  if (!name) return false;
  const nameLower = name.toLowerCase();
  if (nameLower === '.profile') return false;
  if (owner && nameLower === owner.toLowerCase()) return false;
  if (row.archived === true) return false;
  if (row.empty === true) return false;
  return true;
}

function mapRepo(raw: unknown): Door43RepoRow {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid repo');
  const o = raw as Record<string, unknown>;
  const fullName = o.full_name;
  const name = o.name;
  const htmlUrl = o.html_url;
  if (typeof fullName !== 'string' || typeof name !== 'string' || typeof htmlUrl !== 'string') {
    throw new Error('Invalid repo fields');
  }
  const row: Door43RepoRow = { fullName, name, htmlUrl };
  if (typeof o.owner === 'object' && o.owner !== null) {
    const login = (o.owner as { login?: unknown }).login;
    if (typeof login === 'string') row.owner = login;
  }
  if (typeof o.private === 'boolean') row.private = o.private;
  if (typeof o.description === 'string') row.description = o.description;
  if (typeof o.default_branch === 'string') row.defaultBranch = o.default_branch;
  if (typeof o.empty === 'boolean') row.empty = o.empty;
  if (typeof o.archived === 'boolean') row.archived = o.archived;
  return row;
}

function reposSearchRowsFromBody(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (isRecord(body) && Array.isArray(body.data)) return body.data;
  throw new Error('Invalid repos/search response');
}

/**
 * Search public repositories (no auth required on Door43 / Gitea).
 * Response shape: `{ data: Repository[] }` or a bare array depending on server version.
 */
export async function searchPublicRepos(options: {
  host?: string;
  /** Search query (owner, repo name, topic, …). */
  q: string;
  page?: number;
  limit?: number;
}): Promise<Door43RepoRow[]> {
  const host = options.host ?? DEFAULT_HOST;
  const u = new URL(`${apiV1(host)}/repos/search`);
  u.searchParams.set('q', options.q);
  if (options.page !== undefined) u.searchParams.set('page', String(options.page));
  u.searchParams.set('limit', String(options.limit ?? 30));
  const res = await fetch(u.toString(), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`DCS repos/search ${res.status}: ${res.statusText}`);
  const body: unknown = await res.json();
  return reposSearchRowsFromBody(body).map(mapRepo);
}

/** Door43 catalog search: Bibles and aligned Bibles (comma-separated subject filter). */
export const DEFAULT_SCRIPTURE_REPO_SUBJECT = 'Bible, Aligned Bible';

/**
 * Door43 `GET /repos/search` with `lang` + `subject` (and optional `uid` for repos your account may use).
 * Paginates until a short page or `maxPages`.
 */
export async function searchReposForScriptureLanguage(options: {
  host?: string;
  token?: string;
  /** Numeric user id from `GET /user` — narrows to resources that user can access for this language. */
  uid?: number;
  /** Language tag as in langnames (`lc`), e.g. `es-419`. */
  lang: string;
  subject?: string;
  /** Page size per request (Door43 typically allows up to 100). */
  limit?: number;
  maxPages?: number;
}): Promise<Door43RepoRow[]> {
  const host = options.host ?? DEFAULT_HOST;
  const lang = options.lang.trim();
  if (!lang) return [];
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 100);
  const maxPages = Math.min(Math.max(options.maxPages ?? 20, 1), 50);
  const subject = options.subject ?? DEFAULT_SCRIPTURE_REPO_SUBJECT;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.token) headers.Authorization = `token ${options.token}`;

  const seen = new Set<string>();
  const all: Door43RepoRow[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const u = new URL(`${apiV1(host)}/repos/search`);
    u.searchParams.set('lang', lang);
    u.searchParams.set('subject', subject);
    if (options.uid !== undefined) u.searchParams.set('uid', String(options.uid));
    u.searchParams.set('page', String(page));
    u.searchParams.set('limit', String(limit));
    const res = await fetch(u.toString(), { headers, cache: 'no-store' });
    if (!res.ok) throw new Error(`DCS repos/search ${res.status}: ${res.statusText}`);
    const body: unknown = await res.json();
    const rows = reposSearchRowsFromBody(body);
    for (const raw of rows) {
      try {
        const r = mapRepo(raw);
        if (seen.has(r.fullName)) continue;
        seen.add(r.fullName);
        all.push(r);
      } catch {
        /* skip */
      }
    }
    if (rows.length < limit) break;
  }

  return all.filter(isLikelyScriptureProjectRepo);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Slim language row (code, native name, English name, optional text direction) from catalog or langnames APIs. */
export type Door43LanguageOption = {
  lc: string;
  ln: string;
  ang?: string;
  /** Text direction when the API provides it (`ld` or `direction`). */
  ld?: 'ltr' | 'rtl';
};

function catalogEnvelopeData(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (isRecord(body) && Array.isArray(body.data)) return body.data;
  throw new Error('Invalid catalog response');
}

/** Only catalog entries tagged for translationCore-ready published sources. */
export const DEFAULT_CATALOG_TOPIC = 'tc-ready';

/** Comma-separated subject filter for scripture-aligned resources in catalog search. */
export const DEFAULT_CATALOG_SUBJECT = 'Bible,Aligned Bible';

/**
 * Published-resource languages (`GET /api/v1/catalog/list/languages`).
 * Same field shape as langnames entries; much smaller than full `langnames.json`.
 * Defaults match `searchCatalogSources` (`topic`, `subject`).
 */
export async function fetchCatalogLanguages(
  host?: string,
  topic: string = DEFAULT_CATALOG_TOPIC,
  subject: string = DEFAULT_CATALOG_SUBJECT,
): Promise<Door43LanguageOption[]> {
  const hostNorm = host ?? DEFAULT_HOST;
  const u = new URL(`${apiV1(hostNorm)}/catalog/list/languages`);
  if (topic) u.searchParams.set('topic', topic);
  if (subject) u.searchParams.set('subject', subject);
  const res = await fetch(u.toString(), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`DCS catalog/list/languages ${res.status}: ${res.statusText}`);
  const body: unknown = await res.json();
  const rows = catalogEnvelopeData(body);
  const out: Door43LanguageOption[] = [];
  for (const item of rows) {
    if (!isRecord(item)) continue;
    const lc = item.lc;
    if (typeof lc !== 'string' || !lc.trim()) continue;
    const lcTrim = lc.trim();
    const ln =
      typeof item.ln === 'string' && item.ln.trim()
        ? item.ln.trim()
        : typeof item.ang === 'string' && item.ang.trim()
          ? item.ang.trim()
          : lcTrim;
    const ang = typeof item.ang === 'string' && item.ang.trim() ? item.ang.trim() : undefined;
    const ldRaw = item.ld ?? item.direction;
    const ld: 'ltr' | 'rtl' | undefined =
      ldRaw === 'rtl' || ldRaw === 'RTL'
        ? 'rtl'
        : ldRaw === 'ltr' || ldRaw === 'LTR'
          ? 'ltr'
          : undefined;
    out.push({ lc: lcTrim, ln, ang, ...(ld ? { ld } : {}) });
  }
  out.sort((a, b) => a.ln.localeCompare(b.ln, undefined, { sensitivity: 'base' }));
  return out;
}

export type CatalogIngredient = {
  identifier: string;
  path: string;
  sort: number;
  title?: string;
};

export type CatalogEntry = {
  fullName: string;
  name: string;
  ownerLogin: string;
  repoName: string;
  subject: string;
  language: string;
  title: string;
  abbreviation: string;
  /** Published release tag (e.g. `v41`) for `getFileContent` `ref`. */
  releaseTag: string;
  ingredients: CatalogIngredient[];
  defaultBranch?: string;
  /** From catalog `repo.owner.avatar_url` (organization or user that owns the repo). */
  ownerAvatarUrl?: string;
};

function catalogRepoOwnerAvatarUrl(raw: Record<string, unknown>): string | undefined {
  const repo = raw.repo;
  if (!isRecord(repo)) return undefined;
  const owner = repo.owner;
  if (!isRecord(owner)) return undefined;
  const u = owner.avatar_url;
  if (typeof u !== 'string' || !u.trim()) return undefined;
  return u.trim();
}

/** Book code from a USFM ingredient path (`01-GEN.usfm`, `ingredients/GEN.usfm`, …). */
function bookIdentifierFromUsfmPath(path: string): string {
  const norm = path.replace(/\\/g, '/').trim();
  const m = /(?:^|\/)(?:[0-9]{2}-)?([A-Za-z0-9]{2,5})\.(?:usfm|sfm)$/i.exec(norm);
  return m ? m[1]!.toLowerCase() : '';
}

function catalogIngredientIdentifier(ing: Record<string, unknown>, path: string): string {
  const idRaw = ing.identifier;
  if (typeof idRaw === 'string' && idRaw.trim()) return idRaw.trim();
  if (typeof idRaw === 'number' && Number.isFinite(idRaw)) return String(idRaw);
  const scope = ing.scope;
  if (isRecord(scope)) {
    const keys = Object.keys(scope);
    if (keys.length) return keys[0]!.trim().toLowerCase();
  }
  return bookIdentifierFromUsfmPath(path);
}

/**
 * Normalize Door43 `ingredients` whether the API returns an array (usual) or a path-keyed object
 * (Scripture-burrito style), and tolerate numeric `identifier` values.
 */
function parseCatalogIngredients(raw: Record<string, unknown>): CatalogIngredient[] {
  const ingredientsRaw = raw.ingredients;
  const ingredients: CatalogIngredient[] = [];
  if (Array.isArray(ingredientsRaw)) {
    for (const ing of ingredientsRaw) {
      if (!isRecord(ing)) continue;
      const path = typeof ing.path === 'string' ? ing.path.trim() : '';
      if (!path) continue;
      const identifier = catalogIngredientIdentifier(ing, path);
      if (!identifier) continue;
      const sort = typeof ing.sort === 'number' ? ing.sort : 0;
      const title = typeof ing.title === 'string' ? ing.title : undefined;
      ingredients.push({ identifier, path, sort, title });
    }
  } else if (isRecord(ingredientsRaw)) {
    for (const [pathKey, ing] of Object.entries(ingredientsRaw)) {
      if (!isRecord(ing)) continue;
      const path =
        typeof ing.path === 'string' && ing.path.trim()
          ? ing.path.trim()
          : pathKey.trim().replace(/^\.\//, '');
      if (!path || !/\.(usfm|sfm)$/i.test(path)) continue;
      const identifier = catalogIngredientIdentifier(ing, path);
      if (!identifier) continue;
      const sort = typeof ing.sort === 'number' ? ing.sort : 0;
      const title = typeof ing.title === 'string' ? ing.title : undefined;
      ingredients.push({ identifier, path, sort, title });
    }
  }
  ingredients.sort((a, b) => a.sort - b.sort);
  return ingredients;
}

function mapCatalogEntry(raw: unknown): CatalogEntry | null {
  if (!isRecord(raw)) return null;
  const fullName = typeof raw.full_name === 'string' ? raw.full_name.trim() : '';
  if (!fullName.includes('/')) return null;
  const slash = fullName.indexOf('/');
  const ownerLogin = fullName.slice(0, slash).trim();
  const repoName = fullName.slice(slash + 1).trim();
  if (!ownerLogin || !repoName) return null;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : repoName;
  const rel = raw.release;
  let tagName = '';
  if (isRecord(rel) && typeof rel.tag_name === 'string') tagName = rel.tag_name.trim();
  if (!tagName && typeof raw.branch_or_tag_name === 'string') tagName = raw.branch_or_tag_name.trim();
  if (!tagName) return null;
  const ingredients = parseCatalogIngredients(raw);
  let defaultBranch: string | undefined;
  if (typeof raw.default_branch === 'string' && raw.default_branch.trim()) {
    defaultBranch = raw.default_branch.trim();
  } else if (isRecord(raw.repo) && typeof raw.repo.default_branch === 'string') {
    defaultBranch = raw.repo.default_branch.trim();
  }
  return {
    fullName,
    name,
    ownerLogin,
    repoName,
    subject: typeof raw.subject === 'string' ? raw.subject : '',
    language: typeof raw.language === 'string' ? raw.language : '',
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : name,
    abbreviation: typeof raw.abbreviation === 'string' ? raw.abbreviation : '',
    releaseTag: tagName,
    ingredients,
    defaultBranch,
    ownerAvatarUrl: catalogRepoOwnerAvatarUrl(raw),
  };
}

/**
 * Door43 published catalog: `GET /api/v1/catalog/search` with `topic=tc-ready` and scripture subjects.
 */
export async function searchCatalogSources(options: {
  host?: string;
  lang: string;
  topic?: string;
  subject?: string;
  limit?: number;
  maxPages?: number;
}): Promise<CatalogEntry[]> {
  const host = options.host ?? DEFAULT_HOST;
  const lang = options.lang.trim();
  if (!lang) return [];
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const maxPages = Math.min(Math.max(options.maxPages ?? 30, 1), 60);
  const topic = options.topic ?? DEFAULT_CATALOG_TOPIC;
  const subject = options.subject ?? DEFAULT_CATALOG_SUBJECT;
  const seen = new Set<string>();
  const all: CatalogEntry[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const u = new URL(`${apiV1(host)}/catalog/search`);
    u.searchParams.set('lang', lang);
    // Empty string = omit topic filter (e.g. Greek NT / Hebrew OT resources excluded from tc-ready).
    if (topic) u.searchParams.set('topic', topic);
    u.searchParams.set('subject', subject);
    u.searchParams.set('page', String(page));
    u.searchParams.set('limit', String(limit));
    const res = await fetch(u.toString(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`DCS catalog/search ${res.status}: ${res.statusText}`);
    const body: unknown = await res.json();
    const rows = catalogEnvelopeData(body);
    for (const raw of rows) {
      const e = mapCatalogEntry(raw);
      if (!e) continue;
      const key = `${e.fullName}@${e.releaseTag}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(e);
    }
    if (rows.length < limit) break;
  }

  return all;
}

/**
 * Full catalog metadata for one published release (includes `ingredients` when search results are slim).
 * `GET /api/v1/catalog/entry/{owner}/{repo}/{tag}`
 */
export async function fetchCatalogSourceEntry(options: {
  host?: string;
  owner: string;
  repo: string;
  tag: string;
}): Promise<CatalogEntry | null> {
  const host = options.host ?? DEFAULT_HOST;
  const base = apiV1(host);
  const owner = encodeURIComponent(options.owner.trim());
  const repo = encodeURIComponent(options.repo.trim());
  const tag = encodeURIComponent(options.tag.trim());
  const res = await fetch(`${base}/catalog/entry/${owner}/${repo}/${tag}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const body: unknown = await res.json();
  const raw =
    isRecord(body) && body.data !== undefined
      ? ((Array.isArray(body.data) ? body.data[0] : body.data) as unknown)
      : body;
  return mapCatalogEntry(raw);
}

/** Gitea caps vary; 100 keeps round-trips low while staying within typical limits. */
const USER_REPOS_PAGE_SIZE = 100;
const MAX_USER_REPO_PAGES = 80;
const MAX_ORG_LIST_PAGES = 40;
const MAX_ORG_REPO_PAGES = 80;

async function fetchAuthorizedJson(
  url: string,
  token: string,
): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `token ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`DCS ${url.split('?')[0]} ${res.status}: ${res.statusText}`);
  return res.json();
}

function orgUsernameFromApi(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  const u = raw.username;
  if (typeof u === 'string' && u.trim()) return u.trim();
  return null;
}

/**
 * All pages of `GET /api/v1/user/repos` (personal + direct access; Gitea often omits org-owned repos here).
 */
async function listAllUserRepoPages(host: string, token: string): Promise<Door43RepoRow[]> {
  const out: Door43RepoRow[] = [];
  for (let page = 1; page <= MAX_USER_REPO_PAGES; page += 1) {
    const u = new URL(`${apiV1(host)}/user/repos`);
    u.searchParams.set('page', String(page));
    u.searchParams.set('limit', String(USER_REPOS_PAGE_SIZE));
    const body = await fetchAuthorizedJson(u.toString(), token);
    if (!Array.isArray(body)) throw new Error('Invalid user/repos response');
    for (const raw of body) {
      try {
        out.push(mapRepo(raw));
      } catch {
        /* skip malformed row */
      }
    }
    if (body.length < USER_REPOS_PAGE_SIZE) break;
  }
  return out;
}

/**
 * All pages of `GET /api/v1/user/orgs` — organizations the authenticated user belongs to.
 */
async function listAllUserOrgLogins(host: string, token: string): Promise<string[]> {
  const logins: string[] = [];
  for (let page = 1; page <= MAX_ORG_LIST_PAGES; page += 1) {
    const u = new URL(`${apiV1(host)}/user/orgs`);
    u.searchParams.set('page', String(page));
    u.searchParams.set('limit', String(USER_REPOS_PAGE_SIZE));
    const body = await fetchAuthorizedJson(u.toString(), token);
    if (!Array.isArray(body)) throw new Error('Invalid user/orgs response');
    for (const raw of body) {
      const login = orgUsernameFromApi(raw);
      if (login) logins.push(login);
    }
    if (body.length < USER_REPOS_PAGE_SIZE) break;
  }
  return logins;
}

/**
 * All pages of `GET /api/v1/orgs/{org}/repos` for repos visible with the token (respects org membership / rights).
 */
async function listAllOrgRepoPages(host: string, token: string, org: string): Promise<Door43RepoRow[]> {
  const out: Door43RepoRow[] = [];
  const enc = encodeURIComponent;
  for (let page = 1; page <= MAX_ORG_REPO_PAGES; page += 1) {
    const u = new URL(`${apiV1(host)}/orgs/${enc(org)}/repos`);
    u.searchParams.set('page', String(page));
    u.searchParams.set('limit', String(USER_REPOS_PAGE_SIZE));
    const body = await fetchAuthorizedJson(u.toString(), token);
    if (!Array.isArray(body)) throw new Error(`Invalid org/${org}/repos response`);
    for (const raw of body) {
      try {
        out.push(mapRepo(raw));
      } catch {
        /* skip malformed row */
      }
    }
    if (body.length < USER_REPOS_PAGE_SIZE) break;
  }
  return out;
}

/**
 * Repositories you can open with this token: paginated `user/repos` plus every org you belong to
 * (`user/orgs` + `orgs/{org}/repos`), de-duplicated by `full_name`, then scripture-launcher filtered.
 *
 * Gitea’s `user/repos` alone often does not list all organization repositories; merging org listings
 * fixes missing orgs such as `idiomasPuentes` or `es-419_gl` for members.
 *
 * `page` / `limit` on options are ignored (kept for call-site compatibility); internal page size is fixed.
 */
export async function listAuthenticatedUserRepos(options: {
  host?: string;
  token: string;
  page?: number;
  limit?: number;
}): Promise<Door43RepoRow[]> {
  const host = options.host ?? DEFAULT_HOST;
  const token = options.token;
  const userRows = await listAllUserRepoPages(host, token);
  let orgRows: Door43RepoRow[] = [];
  try {
    const orgs = await listAllUserOrgLogins(host, token);
    const batches = await Promise.all(
      orgs.map((org) =>
        listAllOrgRepoPages(host, token, org).catch(() => [] as Door43RepoRow[]),
      ),
    );
    orgRows = batches.flat();
  } catch {
    orgRows = [];
  }
  const byFullName = new Map<string, Door43RepoRow>();
  for (const r of userRows) {
    if (!byFullName.has(r.fullName)) byFullName.set(r.fullName, r);
  }
  for (const r of orgRows) {
    if (!byFullName.has(r.fullName)) byFullName.set(r.fullName, r);
  }
  const merged = [...byFullName.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
  return merged.filter(isLikelyScriptureProjectRepo);
}

export async function createUserRepo(options: {
  host?: string;
  token: string;
  name: string;
  description?: string;
  private?: boolean;
  autoInit?: boolean;
  /** Gitea default branch for `auto_init`. Defaults to `main` (Scripture Burritos). */
  defaultBranch?: string;
}): Promise<Door43RepoRow> {
  const info = await door43Rest.createUserRepo({
    host: options.host,
    token: options.token,
    name: options.name,
    description: options.description,
    private: options.private,
    autoInit: options.autoInit,
    defaultBranch: options.defaultBranch,
  });
  return {
    fullName: info.fullName,
    name: info.name,
    htmlUrl: info.htmlUrl,
    owner: info.owner,
    defaultBranch: info.defaultBranch,
    empty: info.empty,
  };
}

export async function createOrgRepo(options: {
  host?: string;
  token: string;
  org: string;
  name: string;
  description?: string;
  private?: boolean;
  autoInit?: boolean;
  /** Gitea default branch for `auto_init`. Defaults to `main` (Scripture Burritos). */
  defaultBranch?: string;
}): Promise<Door43RepoRow> {
  const info = await door43Rest.createOrgRepo({
    host: options.host,
    token: options.token,
    org: options.org,
    name: options.name,
    description: options.description,
    private: options.private,
    autoInit: options.autoInit,
    defaultBranch: options.defaultBranch,
  });
  return {
    fullName: info.fullName,
    name: info.name,
    htmlUrl: info.htmlUrl,
    owner: info.owner,
    defaultBranch: info.defaultBranch,
    empty: info.empty,
  };
}

export type Door43RepoInfo = {
  fullName: string;
  name: string;
  htmlUrl: string;
  owner: string;
  defaultBranch: string;
  empty?: boolean;
};

function mapRepoInfoFromJson(raw: unknown): Door43RepoInfo | null {
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
      : door43Rest.DOOR43_LEGACY_DEFAULT_BRANCH;
  if (!fullName || !name || !htmlUrl) return null;
  const empty = typeof o.empty === 'boolean' ? o.empty : undefined;
  return { fullName, name, htmlUrl, owner, defaultBranch, empty };
}

/** Returns repository metadata, or `null` if not found (404). */
export async function getRepoInfo(options: {
  host?: string;
  token?: string;
  owner: string;
  repo: string;
}): Promise<Door43RepoInfo | null> {
  const host = options.host ?? DEFAULT_HOST;
  const enc = encodeURIComponent;
  const url = `${apiV1(host)}/repos/${enc(options.owner)}/${enc(options.repo)}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.token) headers.Authorization = `token ${options.token}`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`DCS get repo ${res.status}: ${res.statusText}`);
  return mapRepoInfoFromJson(await res.json());
}

export type Door43OrgSummary = { username: string; fullName?: string };

export async function listUserOrgs(options: {
  host?: string;
  token: string;
  pageSize?: number;
  maxPages?: number;
}): Promise<Door43OrgSummary[]> {
  const host = options.host ?? DEFAULT_HOST;
  const limit = Math.min(Math.max(options.pageSize ?? 100, 1), 100);
  const maxPages = Math.min(Math.max(options.maxPages ?? 40, 1), 80);
  const out: Door43OrgSummary[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page += 1) {
    const u = new URL(`${apiV1(host)}/user/orgs`);
    u.searchParams.set('page', String(page));
    u.searchParams.set('limit', String(limit));
    const res = await fetch(u.toString(), {
      headers: { Authorization: `token ${options.token}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`DCS list orgs ${res.status}: ${res.statusText}`);
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

export async function createOrganization(options: {
  host?: string;
  token: string;
  username: string;
  fullName?: string;
  description?: string;
  visibility?: 'public' | 'limited' | 'private';
}): Promise<Door43OrgSummary> {
  const host = options.host ?? DEFAULT_HOST;
  const body: Record<string, unknown> = {
    username: options.username,
    visibility: options.visibility ?? 'public',
  };
  if (options.fullName) body.full_name = options.fullName;
  if (options.description) body.description = options.description;
  const res = await fetch(`${apiV1(host)}/orgs`, {
    method: 'POST',
    headers: {
      Authorization: `token ${options.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`DCS create org ${res.status}: ${res.statusText}`);
  const raw: unknown = await res.json();
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid create org response');
  const o = raw as Record<string, unknown>;
  const username = typeof o.username === 'string' ? o.username.trim() : '';
  if (!username) throw new Error('Invalid create org response');
  const fullName = typeof o.full_name === 'string' ? o.full_name.trim() : undefined;
  return { username, fullName };
}

/**
 * Revoke a PAT via Gitea. Often returns **403** when the same token is used to authorize the
 * request (Door43 policy). Prefer clearing local credentials in the app; users can revoke the
 * token under Door43 → Settings → Applications.
 */
export async function deleteToken(options: {
  host?: string;
  username: string;
  token: string;
  tokenIdOrName: string | number;
}): Promise<void> {
  const host = options.host ?? DEFAULT_HOST;
  const base = apiV1(host);
  const id = String(options.tokenIdOrName);
  const url = `${base}/users/${encodeURIComponent(options.username)}/tokens/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `token ${options.token}`, Accept: 'application/json' },
  });
  if (res.ok || res.status === 204) return;
  if (res.status === 401 || res.status === 403 || res.status === 404) return;
  throw new Error(`DCS delete token ${res.status}: ${res.statusText}`);
}

export const listRepoContents = door43Rest.listRepoContents;
export const getFileContent = door43Rest.getFileContent;
export const createOrUpdateRepoFile = door43Rest.createOrUpdateRepoFile;
export const deleteRepoFile = door43Rest.deleteRepoFile;

export type {
  Door43ContentEntry,
  Door43FileContent,
  ListRepoContentsOptions,
  GetFileContentOptions,
  CreateOrUpdateRepoFileOptions,
  DeleteRepoFileOptions,
  Door43ContentsWriteResult,
} from '@usfm-tools/door43-rest';
