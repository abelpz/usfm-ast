/**
 * Gitea / DCS Contents API: commit USFM snapshots and three-way merge via OT.
 * Supports optional extra repo-relative paths (e.g. `alignments/`, `checking/`) on each commit.
 */

import { convertUSJDocumentToUSFM } from '@usfm-tools/adapters';
import { USFMParser } from '@usfm-tools/parser';
import {
  DocumentStore,
  diffUsjDocuments,
  transformOpLists,
  type GitSyncAdapter,
  type MergeResult,
  type Operation,
  type UsjDocument,
} from '@usfm-tools/editor-core';

export interface DcsGitSyncAdapterOptions {
  baseUrl: string;
  token: string;
  owner: string;
  repo: string;
  /** Path to the USFM/USJ file in the repo. */
  path: string;
  branch?: string;
  /**
   * Additional repo-relative paths (UTF-8 text) committed with the same message after the primary USFM file.
   * Used for enhanced projects (`alignments/`, `checking/`).
   */
  extraFiles?: () => Promise<Record<string, string>>;
}

interface GiteaFileResponse {
  sha?: string;
  content?: string;
  type?: string;
}

function decodeBase64Utf8(b64: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf8');
  }
  return atob(b64.replace(/\s/g, ''));
}

function encodeBase64Utf8(s: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'utf8').toString('base64');
  }
  return btoa(s);
}

function parseUsjFromUsfm(usfm: string): UsjDocument {
  const parser = new USFMParser({ silentConsole: true });
  parser.parse(usfm);
  return parser.toJSON() as UsjDocument;
}

function contentsApiUrl(baseUrl: string, owner: string, repo: string, relativePath: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const pathSeg = relativePath
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return `${base}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${pathSeg}`;
}

export class DcsGitSyncAdapter implements GitSyncAdapter {
  private readonly lastShaByPath = new Map<string, string | undefined>();
  private readonly primaryApi: string;
  private readonly branch: string;
  private readonly headers: Record<string, string>;
  private readonly baseUrl: string;
  private readonly owner: string;
  private readonly repo: string;

  constructor(private readonly opts: DcsGitSyncAdapterOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.owner = opts.owner;
    this.repo = opts.repo;
    this.primaryApi = contentsApiUrl(this.baseUrl, this.owner, this.repo, opts.path);
    this.branch = opts.branch ?? 'main';
    this.headers = {
      Authorization: `token ${opts.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private apiForPath(relativePath: string): string {
    return contentsApiUrl(this.baseUrl, this.owner, this.repo, relativePath);
  }

  private async fetchFileAt(api: string, ref: string): Promise<{ sha?: string; text: string } | null> {
    const res = await fetch(`${api}?ref=${encodeURIComponent(ref)}`, { headers: this.headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`DCS GET: ${res.status}`);
    const data = (await res.json()) as GiteaFileResponse;
    if (data.type !== 'file' || !data.content) return { sha: data.sha, text: '' };
    return { sha: data.sha, text: decodeBase64Utf8(data.content) };
  }

  private async fetchFile(ref: string): Promise<{ sha?: string; text: string } | null> {
    const file = await this.fetchFileAt(this.primaryApi, ref);
    if (file?.sha) this.lastShaByPath.set(this.opts.path, file.sha);
    return file;
  }

  /**
   * PUT one file; retries once on SHA conflict. Updates per-path SHA cache.
   */
  private async putFileAt(relativePath: string, text: string, message: string): Promise<string> {
    const api = this.apiForPath(relativePath);
    let lastSha: string | undefined = this.lastShaByPath.get(relativePath);

    const attempt = async (sha: string | undefined): Promise<Response> => {
      const payload = {
        branch: this.branch,
        content: encodeBase64Utf8(text),
        message,
        ...(sha ? { sha } : {}),
      };
      return fetch(api, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(payload),
      });
    };

    let res = await attempt(lastSha);

    if (res.status === 409 || res.status === 422) {
      const file = await this.fetchFileAt(api, this.branch);
      lastSha = file?.sha ?? lastSha;
      res = await attempt(lastSha);
    }

    if (!res.ok) throw new Error(`DCS commit ${relativePath}: ${res.status}`);
    const out = (await res.json()) as { commit?: { sha?: string }; content?: { sha?: string } };
    const newSha = out?.content?.sha ?? out?.commit?.sha;
    if (newSha) this.lastShaByPath.set(relativePath, newSha);
    return newSha ?? 'unknown';
  }

  async commit(
    doc: DocumentStore,
    message: string,
    _ops: Operation[],
    snapshotUsj?: UsjDocument
  ): Promise<string> {
    void _ops;
    if (!snapshotUsj) {
      console.warn(
        '[DcsGitSyncAdapter] commit() called without snapshotUsj — alignment milestones ' +
          'may be missing from this commit. Ensure DcsSyncEngine is constructed with getSnapshotUsj.',
      );
    }
    const usfm = convertUSJDocumentToUSFM(snapshotUsj ?? doc.getFullUSJ());
    const primarySha = await this.putFileAt(this.opts.path, usfm, message);

    const extras = await this.opts.extraFiles?.();
    if (extras && Object.keys(extras).length > 0) {
      for (const [rel, content] of Object.entries(extras)) {
        const p = rel.replace(/\\/g, '/').replace(/^\/+/, '');
        if (!p) continue;
        await this.putFileAt(p, content, message);
      }
    }

    return primarySha;
  }

  /** Upload extra paths without touching the primary USFM (e.g. alignment-only save). */
  async commitExtraFiles(files: Record<string, string>, message: string): Promise<void> {
    for (const [rel, content] of Object.entries(files)) {
      const p = rel.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!p) continue;
      await this.putFileAt(p, content, message);
    }
  }

  async checkout(rev: string): Promise<string> {
    const file = await this.fetchFile(rev);
    return file?.text ?? '';
  }

  async diffRevisions(rev1: string, rev2: string): Promise<Operation[]> {
    const [a, b] = await Promise.all([this.checkout(rev1), this.checkout(rev2)]);
    const ua = parseUsjFromUsfm(a);
    const ub = parseUsjFromUsfm(b);
    return diffUsjDocuments(ua, ub);
  }

  async merge(baseRev: string, oursRev: string, theirsRev: string): Promise<MergeResult> {
    const [baseS, oursS, theirsS] = await Promise.all([
      this.checkout(baseRev),
      this.checkout(oursRev),
      this.checkout(theirsRev),
    ]);
    const baseDoc = parseUsjFromUsfm(baseS);
    const oursDoc = parseUsjFromUsfm(oursS);
    const theirsDoc = parseUsjFromUsfm(theirsS);
    const oursOps = diffUsjDocuments(baseDoc, oursDoc);
    const theirsOps = diffUsjDocuments(baseDoc, theirsDoc);
    const { clientPrime, serverPrime } = transformOpLists(oursOps, theirsOps);
    const merged = new DocumentStore({ silentConsole: true });
    merged.loadUSJ(baseDoc);
    try {
      merged.applyOperations(serverPrime);
      merged.applyOperations(clientPrime);
      return { ok: true, merged, ops: [...serverPrime, ...clientPrime] };
    } catch {
      return {
        ok: false,
        conflicts: [{ chapter: 0, oursOps, theirsOps }],
      };
    }
  }
}
