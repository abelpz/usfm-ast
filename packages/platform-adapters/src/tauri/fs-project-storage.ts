/**
 * Filesystem-backed `ProjectStorage` for the Tauri desktop shell.
 *
 * All data lives under `{basePath}/` in the Tauri AppData directory:
 *
 *   {basePath}/
 *     {projectId}/
 *       meta.json         – ProjectMeta
 *       releases.json     – ProjectRelease[]
 *       sync-shas.json    – Record<string, string>
 *       files/
 *         {relative-path} – raw USFM/TSV text
 *
 * `basePath` defaults to `"usfm-editor/projects"`.
 */
import type { ProjectMeta, ProjectRelease, ProjectStorage } from '@usfm-tools/types';
import type { FileSystemAdapter } from '../interfaces/fs-adapter';
import { readJsonOrNull, writeJson, listFilesRecursive } from './fs-helpers';

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

export class FsProjectStorage implements ProjectStorage {
  private readonly fs: FileSystemAdapter;
  private readonly base: string;

  /**
   * @param fs       `FileSystemAdapter` (paths relative to AppData).
   * @param basePath Root folder for all projects (default `"usfm-editor/projects"`).
   */
  constructor(fs: FileSystemAdapter, basePath = 'usfm-editor/projects') {
    this.fs = fs;
    this.base = basePath;
  }

  private projectDir(id: string): string {
    return `${this.base}/${id}`;
  }
  private metaPath(id: string): string {
    return `${this.projectDir(id)}/meta.json`;
  }
  private releasesPath(id: string): string {
    return `${this.projectDir(id)}/releases.json`;
  }
  private syncShasPath(id: string): string {
    return `${this.projectDir(id)}/sync-shas.json`;
  }
  private filePath(projectId: string, path: string): string {
    return `${this.projectDir(projectId)}/files/${normalizePath(path)}`;
  }
  private filesDir(projectId: string): string {
    return `${this.projectDir(projectId)}/files`;
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  async createProject(meta: ProjectMeta): Promise<string> {
    const existing = await readJsonOrNull<ProjectMeta>(this.fs, this.metaPath(meta.id));
    if (existing) throw new Error(`Project already exists: ${meta.id}`);
    await writeJson(this.fs, this.metaPath(meta.id), meta);
    return meta.id;
  }

  async listProjects(): Promise<ProjectMeta[]> {
    let dirs: string[];
    try {
      dirs = await this.fs.listDir(this.base);
    } catch {
      return [];
    }
    const results: ProjectMeta[] = [];
    for (const dir of dirs) {
      const meta = await readJsonOrNull<ProjectMeta>(this.fs, `${this.base}/${dir}/meta.json`);
      if (meta) results.push(meta);
    }
    return results.sort((a, b) => b.updated.localeCompare(a.updated));
  }

  async getProject(id: string): Promise<ProjectMeta | null> {
    return readJsonOrNull<ProjectMeta>(this.fs, this.metaPath(id));
  }

  async updateProject(id: string, patch: Partial<ProjectMeta>): Promise<void> {
    const cur = await this.getProject(id);
    if (!cur) throw new Error(`Project not found: ${id}`);
    await writeJson(this.fs, this.metaPath(id), { ...cur, ...patch, id: cur.id });
  }

  async deleteProject(id: string): Promise<void> {
    try {
      await this.fs.remove(this.projectDir(id), true);
    } catch {
      // Directory may not exist — ignore.
    }
  }

  // ── Files ─────────────────────────────────────────────────────────────────

  async writeFile(projectId: string, path: string, content: string): Promise<void> {
    const fp = this.filePath(projectId, path);
    const dir = fp.substring(0, fp.lastIndexOf('/'));
    await this.fs.mkdir(dir, true);
    await this.fs.writeText(fp, content);
    // Update project timestamp.
    const meta = await this.getProject(projectId);
    if (meta) {
      await writeJson(this.fs, this.metaPath(projectId), {
        ...meta,
        updated: new Date().toISOString(),
      });
    }
  }

  async readFile(projectId: string, path: string): Promise<string | null> {
    try {
      return await this.fs.readText(this.filePath(projectId, path));
    } catch {
      return null;
    }
  }

  async deleteFile(projectId: string, path: string): Promise<void> {
    try {
      await this.fs.remove(this.filePath(projectId, path));
    } catch {
      // Ignore — file may not exist.
    }
    const meta = await this.getProject(projectId);
    if (meta) {
      await writeJson(this.fs, this.metaPath(projectId), {
        ...meta,
        updated: new Date().toISOString(),
      });
    }
  }

  async listFiles(projectId: string, prefix?: string): Promise<string[]> {
    const absBase = this.filesDir(projectId);
    const paths = await listFilesRecursive(this.fs, absBase, '');
    if (!prefix) return paths.sort();
    const norm = normalizePath(prefix);
    return paths.filter((p) => p.startsWith(norm)).sort();
  }

  // ── Releases ──────────────────────────────────────────────────────────────

  async createRelease(projectId: string, release: ProjectRelease): Promise<void> {
    const existing =
      (await readJsonOrNull<ProjectRelease[]>(this.fs, this.releasesPath(projectId))) ?? [];
    existing.push(release);
    await writeJson(this.fs, this.releasesPath(projectId), existing);
  }

  async listReleases(projectId: string): Promise<ProjectRelease[]> {
    const releases = await readJsonOrNull<ProjectRelease[]>(
      this.fs,
      this.releasesPath(projectId),
    );
    if (!releases) return [];
    return releases.sort((a, b) => b.version.localeCompare(a.version));
  }

  async updateRelease(
    projectId: string,
    version: string,
    patch: Partial<ProjectRelease>,
  ): Promise<void> {
    const releases = await readJsonOrNull<ProjectRelease[]>(
      this.fs,
      this.releasesPath(projectId),
    );
    if (!releases) throw new Error(`Release ${version} not found for project ${projectId}`);
    const idx = releases.findIndex((r) => r.version === version);
    if (idx === -1) throw new Error(`Release ${version} not found for project ${projectId}`);
    releases[idx] = { ...releases[idx]!, ...patch, version };
    await writeJson(this.fs, this.releasesPath(projectId), releases);
  }

  // ── Sync SHAs ─────────────────────────────────────────────────────────────

  async getSyncShas(projectId: string): Promise<Record<string, string>> {
    return (
      (await readJsonOrNull<Record<string, string>>(this.fs, this.syncShasPath(projectId))) ?? {}
    );
  }

  async setSyncShas(projectId: string, shas: Record<string, string>): Promise<void> {
    await writeJson(this.fs, this.syncShasPath(projectId), shas);
  }
}
