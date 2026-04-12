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
    const file = await this.fetchFile(this.branch);
    const body = usfm;
    const sha = file?.sha ?? this.lastSha;
    const payload = {
      branch: this.branch,
      content: encodeBase64Utf8(body),
      message,
      ...(sha ? { sha } : {}),
    };
    const res = await fetch(this.api, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`DCS commit: ${res.status}`);
    const out = (await res.json()) as { commit?: { sha?: string }; content?: { sha?: string } };
    return out?.commit?.sha ?? out?.content?.sha ?? 'unknown';
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
