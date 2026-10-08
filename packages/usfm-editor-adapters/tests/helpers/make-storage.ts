import type { ProjectMeta, ProjectRelease, ProjectStorage } from '@usfm-tools/types';

/** Minimal in-memory ProjectStorage — reused across multiple test suites. */
export function makeStorage(
  meta: Partial<ProjectMeta> & Pick<ProjectMeta, 'id' | 'name' | 'language'>,
): ProjectStorage & { _files: Map<string, string>; _meta: ProjectMeta } {
  const files = new Map<string, string>();
  const now = new Date().toISOString();
  let storedMeta: ProjectMeta = {
    format: 'resource-container',
    created: now,
    updated: now,
    ...meta,
  };
  let syncShas: Record<string, string> = {};
  const releases: ProjectRelease[] = [];

  const storage: ProjectStorage & { _files: Map<string, string>; get _meta(): ProjectMeta } = {
    _files: files,
    get _meta() { return storedMeta; },
    createProject: async () => storedMeta.id,
    listProjects: async () => [storedMeta],
    getProject: async () => storedMeta,
    updateProject: async (_id, patch) => { storedMeta = { ...storedMeta, ...patch }; },
    deleteProject: async () => {},
    writeFile: async (_pid, path, content) => { files.set(path, content); },
    readFile: async (_pid, path) => files.get(path) ?? null,
    deleteFile: async (_pid, path) => { files.delete(path); },
    listFiles: async () => [...files.keys()],
    createRelease: async (_pid, rel) => { releases.push(rel); },
    listReleases: async () => releases,
    updateRelease: async (_pid, ver, patch) => {
      const i = releases.findIndex((r) => r.version === ver);
      if (i >= 0) releases[i] = { ...releases[i], ...patch };
    },
    getSyncShas: async () => ({ ...syncShas }),
    setSyncShas: async (_pid, shas) => { syncShas = { ...shas }; },
  };
  return storage;
}
