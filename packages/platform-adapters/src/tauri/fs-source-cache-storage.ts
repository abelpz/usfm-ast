/**
 * Filesystem-backed `SourceCacheStorage` for the Tauri desktop shell.
 *
 * Directory layout under `{basePath}/` in AppData:
 *
 *   {basePath}/
 *     repos/
 *       {owner}/{repo}/{releaseTag}/
 *         manifest.json          – CachedSourceRepo metadata
 *         files/
 *           {encoded-path}.json  – CachedSourceFile (raw content only)
 *     pins/
 *       {projectId}.json         – ProjectSourcePin[]
 *
 * `repoId` format is `{owner}/{repo}` (e.g. `"unfoldingWord/en_ult"`).
 * Forward slashes in the repoId naturally create subdirectory nesting.
 *
 * File paths within a snapshot are stored with a URL-percent-encoding scheme:
 *   `/` → `%2F`,  `%` → `%25`
 * This is injective (no collisions with literal `_` sequences) and round-trips
 * correctly for any path character set.
 *
 * `basePath` defaults to `"usfm-editor/source-cache"`.
 */
import type {
  CachedSourceFile,
  CachedSourceRepo,
  ProjectSourcePin,
  RepoId,
  SourceCacheStorage,
} from '@usfm-tools/types';
import type { FileSystemAdapter } from '../interfaces/fs-adapter';
import { readJsonOrNull, writeJson } from './fs-helpers';

/**
 * Encode a file path for use as a single filename.
 * Uses URL-percent-encoding for `/` and `%` so the scheme is injective.
 */
function encodeFilename(path: string): string {
  return path.replace(/%/g, '%25').replace(/\//g, '%2F');
}

/**
 * Decode a filename back to the original relative path.
 * Also strips the `.json` suffix added when the file is written.
 */
function decodeFilename(encoded: string): string {
  return encoded
    .replace(/\.json$/, '')
    .replace(/%2F/gi, '/')
    .replace(/%25/gi, '%');
}

export class FsSourceCacheStorage implements SourceCacheStorage {
  private readonly fs: FileSystemAdapter;
  private readonly base: string;

  /**
   * @param fs       `FileSystemAdapter` (paths relative to AppData).
   * @param basePath Root folder for the source cache (default `"usfm-editor/source-cache"`).
   */
  constructor(fs: FileSystemAdapter, basePath = 'usfm-editor/source-cache') {
    this.fs = fs;
    this.base = basePath;
  }

  private repoDir(repoId: RepoId, releaseTag: string): string {
    return `${this.base}/repos/${repoId}/${releaseTag}`;
  }
  private manifestPath(repoId: RepoId, releaseTag: string): string {
    return `${this.repoDir(repoId, releaseTag)}/manifest.json`;
  }
  private filesDir(repoId: RepoId, releaseTag: string): string {
    return `${this.repoDir(repoId, releaseTag)}/files`;
  }
  private cachedFilePath(repoId: RepoId, releaseTag: string, path: string): string {
    return `${this.filesDir(repoId, releaseTag)}/${encodeFilename(path)}.json`;
  }
  private pinsPath(projectId: string): string {
    return `${this.base}/pins/${projectId}.json`;
  }

  // ── Repo snapshots ────────────────────────────────────────────────────────

  async listLanguages(): Promise<string[]> {
    const repos = await this.listCachedRepos();
    const langs = new Set(repos.map((r) => r.langCode).filter(Boolean));
    return [...langs].sort();
  }

  async listCachedRepos(langCode?: string): Promise<CachedSourceRepo[]> {
    const reposBase = `${this.base}/repos`;
    // Directory tree is: repos/{owner}/{repo}/{tag}/manifest.json
    let owners: string[];
    try {
      owners = await this.fs.listDir(reposBase);
    } catch {
      return [];
    }

    const results: CachedSourceRepo[] = [];
    for (const owner of owners) {
      let repos: string[];
      try {
        repos = await this.fs.listDir(`${reposBase}/${owner}`);
      } catch {
        continue;
      }
      for (const repo of repos) {
        let tags: string[];
        try {
          tags = await this.fs.listDir(`${reposBase}/${owner}/${repo}`);
        } catch {
          continue;
        }
        for (const tag of tags) {
          const manifest = await readJsonOrNull<CachedSourceRepo>(
            this.fs,
            `${reposBase}/${owner}/${repo}/${tag}/manifest.json`,
          );
          if (!manifest) continue;
          if (langCode && manifest.langCode !== langCode) continue;
          results.push(manifest);
        }
      }
    }
    return results;
  }

  async getCachedRepo(repoId: RepoId, releaseTag: string): Promise<CachedSourceRepo | null> {
    return readJsonOrNull<CachedSourceRepo>(this.fs, this.manifestPath(repoId, releaseTag));
  }

  async putCachedRepo(repo: CachedSourceRepo, files: CachedSourceFile[]): Promise<void> {
    // Remove existing files for this snapshot.
    try {
      await this.fs.remove(this.filesDir(repo.repoId, repo.releaseTag), true);
    } catch {
      // May not exist yet.
    }
    await writeJson(this.fs, this.manifestPath(repo.repoId, repo.releaseTag), repo);
    for (const file of files) {
      await writeJson(
        this.fs,
        this.cachedFilePath(repo.repoId, repo.releaseTag, file.path),
        file,
      );
    }
  }

  async deleteCachedRepo(repoId: RepoId, releaseTag: string): Promise<void> {
    try {
      await this.fs.remove(this.repoDir(repoId, releaseTag), true);
    } catch {
      // Ignore if not found.
    }
  }

  // ── Files ─────────────────────────────────────────────────────────────────

  async getCachedFile(
    repoId: RepoId,
    releaseTag: string,
    path: string,
  ): Promise<CachedSourceFile | null> {
    return readJsonOrNull<CachedSourceFile>(
      this.fs,
      this.cachedFilePath(repoId, releaseTag, path),
    );
  }

  async listCachedFiles(repoId: RepoId, releaseTag: string): Promise<string[]> {
    let entries: string[];
    try {
      entries = await this.fs.listDir(this.filesDir(repoId, releaseTag));
    } catch {
      return [];
    }
    // Decode filenames back to relative paths (strip .json suffix, unescape).
    return entries.map(decodeFilename).sort();
  }

  // ── Version pins ──────────────────────────────────────────────────────────

  async getPin(projectId: string, repoId: RepoId): Promise<ProjectSourcePin | null> {
    const pins = await readJsonOrNull<ProjectSourcePin[]>(this.fs, this.pinsPath(projectId));
    return pins?.find((p) => p.repoId === repoId) ?? null;
  }

  async listPins(projectId: string): Promise<ProjectSourcePin[]> {
    return (
      (await readJsonOrNull<ProjectSourcePin[]>(this.fs, this.pinsPath(projectId))) ?? []
    );
  }

  async listAllPins(): Promise<ProjectSourcePin[]> {
    const pinsBase = `${this.base}/pins`;
    let files: string[];
    try {
      files = await this.fs.listDir(pinsBase);
    } catch {
      return [];
    }
    const allPins: ProjectSourcePin[] = [];
    for (const file of files) {
      const pins = await readJsonOrNull<ProjectSourcePin[]>(this.fs, `${pinsBase}/${file}`);
      if (pins) allPins.push(...pins);
    }
    return allPins;
  }

  async setPin(pin: ProjectSourcePin): Promise<void> {
    const existing = await this.listPins(pin.projectId);
    const idx = existing.findIndex((p) => p.repoId === pin.repoId);
    if (idx >= 0) {
      existing[idx] = pin;
    } else {
      existing.push(pin);
    }
    await writeJson(this.fs, this.pinsPath(pin.projectId), existing);
  }

  async removePin(projectId: string, repoId: RepoId): Promise<void> {
    const existing = await this.listPins(projectId);
    const filtered = existing.filter((p) => p.repoId !== repoId);
    await writeJson(this.fs, this.pinsPath(projectId), filtered);
  }

  async getReferencedSnapshots(): Promise<Array<{ repoId: RepoId; releaseTag: string }>> {
    const pinsBase = `${this.base}/pins`;
    let files: string[];
    try {
      files = await this.fs.listDir(pinsBase);
    } catch {
      return [];
    }

    const seen = new Map<string, { repoId: RepoId; releaseTag: string }>();
    for (const file of files) {
      const pins = await readJsonOrNull<ProjectSourcePin[]>(this.fs, `${pinsBase}/${file}`);
      if (!pins) continue;
      for (const pin of pins) {
        const key = `${pin.repoId}@${pin.pinnedTag}`;
        if (!seen.has(key)) seen.set(key, { repoId: pin.repoId, releaseTag: pin.pinnedTag });
      }
    }
    return [...seen.values()];
  }

  async garbageCollect(): Promise<number> {
    const referenced = await this.getReferencedSnapshots();
    const refSet = new Set(referenced.map((r) => `${r.repoId}@${r.releaseTag}`));
    const allRepos = await this.listCachedRepos();
    let removed = 0;
    for (const repo of allRepos) {
      const key = `${repo.repoId}@${repo.releaseTag}`;
      if (!refSet.has(key)) {
        await this.deleteCachedRepo(repo.repoId, repo.releaseTag);
        removed++;
      }
    }
    return removed;
  }
}
