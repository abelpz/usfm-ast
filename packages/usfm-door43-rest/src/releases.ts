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

export type CreateDcsReleaseOptions = {
  host?: string;
  token: string;
  owner: string;
  repo: string;
  /** Git tag name, e.g. "v1.0.0" */
  tag: string;
  /** Human-readable release title */
  name: string;
  /** Optional markdown body / changelog */
  body?: string;
  /** Create as a draft (not yet published). Defaults to false. */
  isDraft?: boolean;
  /** Create as a pre-release. Defaults to false. */
  isPrerelease?: boolean;
  /** Custom fetch implementation (defaults to globalThis.fetch). */
  fetch?: typeof globalThis.fetch;
};

export type DcsReleaseInfo = {
  id: number;
  tagName: string;
  name: string;
  htmlUrl: string;
  publishedAt: string;
  isDraft: boolean;
};

function mapRelease(raw: Record<string, unknown>): DcsReleaseInfo {
  return {
    id: typeof raw.id === 'number' ? raw.id : 0,
    tagName: typeof raw.tag_name === 'string' ? raw.tag_name : '',
    name: typeof raw.name === 'string' ? raw.name : '',
    htmlUrl: typeof raw.html_url === 'string' ? raw.html_url : '',
    publishedAt: typeof raw.published_at === 'string' ? raw.published_at : new Date().toISOString(),
    isDraft: raw.draft === true,
  };
}

/**
 * Create a Gitea release (tag + metadata) via `POST /repos/{owner}/{repo}/releases`.
 *
 * The matching git tag is created automatically by Gitea if it does not already exist
 * (Gitea creates it at HEAD of the default branch).
 */
export async function createDcsRelease(options: CreateDcsReleaseOptions): Promise<DcsReleaseInfo> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const fetchFn = options.fetch ?? globalThis.fetch;

  const body: Record<string, unknown> = {
    tag_name: options.tag,
    name: options.name,
    draft: options.isDraft ?? false,
    prerelease: options.isPrerelease ?? false,
  };
  if (options.body) body.body = options.body;

  const res = await fetchFn(
    `${base}/repos/${enc(options.owner)}/${enc(options.repo)}/releases`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${options.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) await door43HttpError('Door43 create release', res);
  const raw: unknown = await res.json();
  if (!isRecord(raw)) throw new Error('Door43 create release: unexpected response shape');
  return mapRelease(raw);
}

export type ListDcsReleasesOptions = {
  host?: string;
  token?: string;
  owner: string;
  repo: string;
  fetch?: typeof globalThis.fetch;
};

/** List all releases for a repository. */
export async function listDcsReleases(
  options: ListDcsReleasesOptions,
): Promise<DcsReleaseInfo[]> {
  const host = options.host ?? DOOR43_HOST_DEFAULT;
  const base = door43ApiV1BaseUrl(host);
  const enc = encodeURIComponent;
  const fetchFn = options.fetch ?? globalThis.fetch;

  const headers: HeadersInit = { Accept: 'application/json' };
  if (options.token) (headers as Record<string, string>).Authorization = `token ${options.token}`;

  const res = await fetchFn(
    `${base}/repos/${enc(options.owner)}/${enc(options.repo)}/releases`,
    { headers },
  );

  if (!res.ok) await door43HttpError('Door43 list releases', res);
  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map(mapRelease);
}
