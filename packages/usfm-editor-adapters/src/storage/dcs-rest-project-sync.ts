import {
  createOrgRepo,
  createUserRepo,
  createRepoFile,
  updateRepoFile,
  deleteRepoFile,
  getFileContent,
  getRepoInfo,
  listRepoGitTree,
  DOOR43_SCRIPTURE_DEFAULT_BRANCH,
  type GitTreeEntry,
} from '@usfm-tools/door43-rest';
import type { ProjectPushResult, ProjectSyncAdapter, RemoteFileEntry } from '@usfm-tools/types';

export type DcsRestProjectSyncOptions = {
  host: string;
  token: string;
  owner: string;
  repo: string;
  branch?: string;
  targetType: 'user' | 'org';
  fetch?: typeof fetch;
};

/** Git blob object SHA-1 (hex), matching `git hash-object` for UTF-8 text. */
export async function gitBlobShaHex(content: string): Promise<string> {
  const enc = new TextEncoder();
  const body = enc.encode(content);
  const header = enc.encode(`blob ${body.length}\0`);
  const full = new Uint8Array(header.length + body.length);
  full.set(header, 0);
  full.set(body, header.length);
  const digest = await crypto.subtle.digest('SHA-1', full);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isTextSyncPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.includes('/.git/')) return false;
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
  const textish =
    ext === '' ||
    [
      '.md',
      '.yaml',
      '.yml',
      '.json',
      '.usfm',
      '.sfm',
      '.txt',
      '.tsv',
      '.css',
      '.html',
    ].includes(ext);
  return textish;
}

function treeEntriesToRemoteFiles(entries: GitTreeEntry[]): RemoteFileEntry[] {
  return entries
    .filter((e) => e.type === 'blob' && isTextSyncPath(e.path))
    .map((e) => ({ path: e.path, sha: e.sha, size: e.size }));
}

/** Local project paths (e.g. `56-TIT.usfm`) vs Door43 RC paths (`content/56-TIT.usfm`). */
function localPathCoversRemote(remotePath: string, localNormPaths: Set<string>): boolean {
  const rp = remotePath.replace(/\\/g, '/');
  if (localNormPaths.has(rp)) return true;
  if (rp.startsWith('content/')) {
    const stripped = rp.slice('content/'.length);
    if (localNormPaths.has(stripped)) return true;
  }
  const slash = rp.lastIndexOf('/');
  const base = slash >= 0 ? rp.slice(slash + 1) : rp;
  return Boolean(base && localNormPaths.has(base));
}

/**
 * Sync a local virtual file tree to Door43 via Gitea Contents API + git tree listing.
 */
export class DcsRestProjectSync implements ProjectSyncAdapter {
  private readonly host: string;
  private readonly token: string;
  private readonly owner: string;
  private readonly repo: string;
  /** Resolved against the remote after `ensureRemoteRepo` may create the repo. */
  private branch: string;
  private readonly targetType: 'user' | 'org';
  private readonly fetchImpl: typeof fetch;

  constructor(options: DcsRestProjectSyncOptions) {
    this.host = options.host;
    this.token = options.token;
    this.owner = options.owner;
    this.repo = options.repo;
    this.branch = options.branch ?? 'main';
    this.targetType = options.targetType;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async ensureRemoteRepo(): Promise<{ owner: string; repo: string; created: boolean }> {
    const existing = await getRepoInfo({
      host: this.host,
      token: this.token,
      owner: this.owner,
      repo: this.repo,
      fetch: this.fetchImpl,
    });
    if (existing) {
      return { owner: this.owner, repo: this.repo, created: false };
    }
    if (this.targetType === 'org') {
      const created = await createOrgRepo({
        host: this.host,
        token: this.token,
        org: this.owner,
        name: this.repo,
        private: false,
        autoInit: true,
        defaultBranch: DOOR43_SCRIPTURE_DEFAULT_BRANCH,
        fetch: this.fetchImpl,
      });
      this.branch = created.defaultBranch;
    } else {
      const created = await createUserRepo({
        host: this.host,
        token: this.token,
        name: this.repo,
        private: false,
        autoInit: true,
        defaultBranch: DOOR43_SCRIPTURE_DEFAULT_BRANCH,
        fetch: this.fetchImpl,
      });
      this.branch = created.defaultBranch;
    }
    return { owner: this.owner, repo: this.repo, created: true };
  }

  async getRemoteFileIndex(): Promise<RemoteFileEntry[]> {
    const entries = await listRepoGitTree({
      host: this.host,
      token: this.token,
      owner: this.owner,
      repo: this.repo,
      ref: this.branch,
      recursive: true,
      fetch: this.fetchImpl,
    });
    return treeEntriesToRemoteFiles(entries);
  }

  async pushFiles(
    localFiles: Map<string, string>,
    message: string,
  ): Promise<ProjectPushResult> {
    const remoteIndex = await this.getRemoteFileIndex();
    const remoteByPath = new Map(remoteIndex.map((e) => [e.path, e]));

    let filesCreated = 0;
    let filesUpdated = 0;
    let filesDeleted = 0;
    let lastCommitSha: string | undefined;

    // Track the final remote state so callers avoid a second getRemoteFileIndex() call.
    // Start with the current remote index; update in-place as we create/update/delete.
    const syncedByLocalPath = new Map<string, RemoteFileEntry>();
    for (const e of remoteIndex) {
      const localKey = e.path.startsWith('content/') ? e.path.slice('content/'.length) : e.path;
      syncedByLocalPath.set(localKey, e);
    }

    const normPaths = new Set<string>();
    for (const p of localFiles.keys()) {
      normPaths.add(p.replace(/\\/g, '/').replace(/^\.\//, ''));
    }

    for (const [rawPath, content] of localFiles) {
      const path = rawPath.replace(/\\/g, '/').replace(/^\.\//, '');
      if (!isTextSyncPath(path)) continue;

      const blobSha = await gitBlobShaHex(content);
      const remoteAtRoot = remoteByPath.get(path);
      const remoteInContent = remoteByPath.get(`content/${path}`);
      const remote = remoteAtRoot ?? remoteInContent;
      const remotePath = remoteAtRoot ? path : remoteInContent ? `content/${path}` : path;

      // Skip only when the file IS on remote with the exact same content.
      // Never skip a file that is missing from remote — it must be (re-)created.
      if (remote && remote.sha === blobSha) continue;

      let res: Awaited<ReturnType<typeof createRepoFile>>;
      if (remote) {
        res = await updateRepoFile({
          host: this.host,
          token: this.token,
          owner: this.owner,
          repo: this.repo,
          path: remotePath,
          content,
          message: `${message} (${path})`,
          branch: this.branch,
          sha: remote.sha,
          fetch: this.fetchImpl,
        });
      } else {
        res = await createRepoFile({
          host: this.host,
          token: this.token,
          owner: this.owner,
          repo: this.repo,
          path,
          content,
          message: `${message} (${path})`,
          branch: this.branch,
          fetch: this.fetchImpl,
        });
      }
      lastCommitSha = res.commit.sha;
      if (remote) {
        filesUpdated += 1;
      } else {
        filesCreated += 1;
      }
      // Update our tracking map with the new blob SHA and size.
      const finalPath = remote ? remotePath : path;
      const localKey = finalPath.startsWith('content/')
        ? finalPath.slice('content/'.length)
        : finalPath;
      syncedByLocalPath.set(localKey, { path: finalPath, sha: blobSha, size: content.length });
    }

    const localSet = new Set(normPaths);
    for (const r of remoteIndex) {
      if (!localPathCoversRemote(r.path, localSet) && isTextSyncPath(r.path)) {
        await deleteRepoFile({
          host: this.host,
          token: this.token,
          owner: this.owner,
          repo: this.repo,
          path: r.path,
          fileSha: r.sha,
          message: `${message} (delete ${r.path})`,
          branch: this.branch,
          fetch: this.fetchImpl,
        });
        filesDeleted += 1;
        const localKey = r.path.startsWith('content/') ? r.path.slice('content/'.length) : r.path;
        syncedByLocalPath.delete(localKey);
      }
    }

    return {
      filesCreated,
      filesUpdated,
      filesDeleted,
      commitSha: lastCommitSha,
      syncedFiles: Array.from(syncedByLocalPath.values()),
    };
  }

  async pullFiles(): Promise<Map<string, string>> {
    const remoteIndex = await this.getRemoteFileIndex();
    const out = new Map<string, string>();
    for (const r of remoteIndex) {
      const fc = await getFileContent({
        host: this.host,
        token: this.token,
        owner: this.owner,
        repo: this.repo,
        path: r.path,
        ref: this.branch,
        fetch: this.fetchImpl,
      });
      const localPath = r.path.startsWith('content/') ? r.path.slice('content/'.length) : r.path;
      out.set(localPath, fc.content);
    }
    return out;
  }
}
