/**
 * Filesystem-backed `ProcessedCacheStorage` for the Tauri desktop shell (Layer 2).
 *
 * Directory layout under `{basePath}/` in AppData:
 *
 *   {basePath}/
 *     {repoOwner}/{repoName}/{releaseTag}/{cacheType}/
 *       {encoded-path}.json  – ProcessedCacheEntry (without `data`, which is the file content)
 *       {encoded-path}.data  – raw data string (may be large)
 *
 * The entry metadata and data are split across two files to allow listing
 * entries cheaply (metadata only) and reading data on demand.
 *
 * `basePath` defaults to `"usfm-editor/processed-cache"`.
 */
import type { ProcessedCacheEntry, ProcessedCacheStorage, RepoId } from '@usfm-tools/types';
import type { FileSystemAdapter } from '../interfaces/fs-adapter';
import { listFilesRecursive, readJsonOrNull, writeJson } from './fs-helpers';

function encodeFilename(path: string): string {
  return path.replace(/%/g, '%25').replace(/\//g, '%2F');
}

function decodeFilename(encoded: string): string {
  return encoded.replace(/\.json$/, '').replace(/%2F/gi, '/').replace(/%25/g, '%');
}

export class FsProcessedCacheStorage implements ProcessedCacheStorage {
  private readonly base: string;
  private readonly fs: FileSystemAdapter;

  constructor(fs: FileSystemAdapter, basePath = 'usfm-editor/processed-cache') {
    this.fs = fs;
    this.base = basePath.replace(/\/+$/, '');
  }

  private entryDir(repoId: RepoId, releaseTag: string, cacheType: string): string {
    const [owner, repo] = repoId.split('/');
    return `${this.base}/${owner}/${repo}/${releaseTag}/${cacheType}`;
  }

  private metaPath(repoId: RepoId, releaseTag: string, path: string, cacheType: string): string {
    return `${this.entryDir(repoId, releaseTag, cacheType)}/${encodeFilename(path)}.json`;
  }

  private dataPath(repoId: RepoId, releaseTag: string, path: string, cacheType: string): string {
    return `${this.entryDir(repoId, releaseTag, cacheType)}/${encodeFilename(path)}.data`;
  }

  async get(
    repoId: RepoId,
    releaseTag: string,
    path: string,
    cacheType: ProcessedCacheEntry['cacheType'],
    currentParserVersion: string,
  ): Promise<ProcessedCacheEntry | null> {
    type MetaRecord = Omit<ProcessedCacheEntry, 'data'>;
    const meta = await readJsonOrNull<MetaRecord>(this.fs, this.metaPath(repoId, releaseTag, path, cacheType));
    if (!meta) return null;
    if (meta.parserVersion !== currentParserVersion) return null;
    try {
      const data = await this.fs.readText(this.dataPath(repoId, releaseTag, path, cacheType));
      return { ...meta, data };
    } catch {
      return null;
    }
  }

  async put(entry: ProcessedCacheEntry): Promise<void> {
    const { data, ...meta } = entry;
    await writeJson(this.fs, this.metaPath(entry.repoId, entry.releaseTag, entry.path, entry.cacheType), meta);
    const dataPath = this.dataPath(entry.repoId, entry.releaseTag, entry.path, entry.cacheType);
    const dir = dataPath.substring(0, dataPath.lastIndexOf('/'));
    if (dir) await this.fs.mkdir(dir, true);
    await this.fs.writeText(dataPath, data);
  }

  async invalidateByParserVersion(currentVersion: string): Promise<number> {
    const allMeta = await this.listAllMeta();
    let removed = 0;
    for (const { meta, metaPath } of allMeta) {
      if (meta.parserVersion !== currentVersion) {
        await this.deletePaths(metaPath);
        removed++;
      }
    }
    return removed;
  }

  async invalidateRepo(repoId: RepoId, releaseTag: string): Promise<void> {
    const [owner, repo] = repoId.split('/');
    const dir = `${this.base}/${owner}/${repo}/${releaseTag}`;
    try {
      await this.fs.remove(dir, true);
    } catch {
      // Directory may not exist.
    }
  }

  async estimateSize(): Promise<number> {
    const allMeta = await this.listAllMeta();
    let total = 0;
    for (const { meta } of allMeta) {
      const dataPath = this.dataPath(meta.repoId, meta.releaseTag, meta.path, meta.cacheType);
      try {
        const data = await this.fs.readText(dataPath);
        total += data.length * 2;
      } catch {
        // Skip missing data files.
      }
    }
    return total;
  }

  async evictLRU(targetBytes: number): Promise<number> {
    const allMeta = await this.listAllMeta();
    allMeta.sort((a, b) => a.meta.builtAt.localeCompare(b.meta.builtAt));

    let currentSize = await this.estimateSize();
    let removed = 0;

    for (const { meta, metaPath } of allMeta) {
      if (currentSize <= targetBytes) break;
      const dataPath = this.dataPath(meta.repoId, meta.releaseTag, meta.path, meta.cacheType);
      try {
        const data = await this.fs.readText(dataPath);
        currentSize -= data.length * 2;
      } catch {
        // Already missing — still count as removal.
      }
      await this.deletePaths(metaPath);
      removed++;
    }

    return removed;
  }

  async clear(): Promise<void> {
    try {
      await this.fs.remove(this.base, true);
    } catch {
      // Already empty.
    }
  }

  private async listAllMeta(): Promise<
    Array<{ meta: Omit<ProcessedCacheEntry, 'data'>; metaPath: string }>
  > {
    const files = await listFilesRecursive(this.fs, this.base, '');
    const result: Array<{ meta: Omit<ProcessedCacheEntry, 'data'>; metaPath: string }> = [];

    for (const rel of files) {
      if (!rel.endsWith('.json')) continue;
      const abs = `${this.base}/${rel}`;
      type MetaRecord = Omit<ProcessedCacheEntry, 'data'>;
      const meta = await readJsonOrNull<MetaRecord>(this.fs, abs);
      if (meta) result.push({ meta, metaPath: abs });
    }

    return result;
  }

  private async deletePaths(...paths: string[]): Promise<void> {
    for (const p of paths) {
      try {
        await this.fs.remove(p);
      } catch {
        // Ignore missing files.
      }
    }
  }
}
