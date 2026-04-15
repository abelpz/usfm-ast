/**
 * Gitea / DCS Contents API: commit USFM snapshots and three-way merge via OT.
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

export class DcsGitSyncAdapter implements GitSyncAdapter {
  private lastSha: string | undefined;
  private readonly api: string;
  private readonly branch: string;
  private readonly headers: Record<string, string>;

  constructor(private readonly opts: DcsGitSyncAdapterOptions) {
    const base = opts.baseUrl.replace(/\/$/, '');
    const pathSeg = opts.path
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
    this.api = `${base}/api/v1/repos/${encodeURIComponent(opts.owner)}/${encodeURIComponent(opts.repo)}/contents/${pathSeg}`;
    this.branch = opts.branch ?? 'main';
    this.headers = {
      Authorization: `token ${opts.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private async fetchFile(ref: string): Promise<{ sha?: string; text: string } | null> {
    const res = await fetch(`${this.api}?ref=${encodeURIComponent(ref)}`, { headers: this.headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`DCS GET ${this.opts.path}: ${res.status}`);
    const data = (await res.json()) as GiteaFileResponse;
    if (data.type !== 'file' || !data.content) return { sha: data.sha, text: '' };
    this.lastSha = data.sha;
    return { sha: data.sha, text: decodeBase64Utf8(data.content) };
  }

  async commit(
    doc: DocumentStore,
    message: string,
    _ops: Operation[],
    snapshotUsj?: UsjDocument
  ): Promise<string> {
    void _ops;
    const usfm = convertUSJDocumentToUSFM(snapshotUsj ?? doc.getFullUSJ());
    const commitSha = await this.putFile(usfm, message);
    return commitSha;
  }

  /**
   * PUT the file content to DCS, retrying once if the cached SHA is stale
   * (409 conflict or 422 unprocessable — Gitea returns 422 on SHA mismatch).
   * Avoids a redundant GET on every sync by trusting {@link lastSha} after a
   * successful read or prior commit.
   */
  private async putFile(usfm: string, message: string): Promise<string> {
    const attempt = async (sha: string | undefined): Promise<Response> => {
      const payload = {
        branch: this.branch,
        content: encodeBase64Utf8(usfm),
        message,
        ...(sha ? { sha } : {}),
      };
      return fetch(this.api, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(payload),
      });
    };

    let res = await attempt(this.lastSha);

    // SHA mismatch: re-fetch to get the current SHA and retry once.
    if (res.status === 409 || res.status === 422) {
      const file = await this.fetchFile(this.branch);
      res = await attempt(file?.sha ?? this.lastSha);
    }

    if (!res.ok) throw new Error(`DCS commit: ${res.status}`);
    const out = (await res.json()) as { commit?: { sha?: string }; content?: { sha?: string } };
    const newSha = out?.commit?.sha ?? out?.content?.sha;
    if (newSha) this.lastSha = newSha;
    return newSha ?? 'unknown';
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
