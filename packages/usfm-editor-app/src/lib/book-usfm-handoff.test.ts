import { describe, expect, test } from 'bun:test';
import type { ProjectMeta, ProjectRelease, ProjectStorage } from '@usfm-tools/types';
import {
  importSingleBookUsfmFile,
  readBookUsfmForExport,
} from './book-usfm-handoff';

function makeStorage(): ProjectStorage & { _files: Map<string, string> } {
  const files = new Map<string, string>();
  const now = new Date().toISOString();
  let storedMeta: ProjectMeta = {
    id: 'p1',
    name: 'P',
    language: 'en',
    format: 'resource-container',
    created: now,
    updated: now,
  };
  const releases: ProjectRelease[] = [];
  let syncShas: Record<string, string> = {};

  return {
    _files: files,
    createProject: async () => 'p1',
    listProjects: async () => [storedMeta],
    getProject: async () => storedMeta,
    updateProject: async (_pid, patch) => {
      storedMeta = { ...storedMeta, ...patch };
    },
    deleteProject: async () => {},
    writeFile: async (_pid, path, content) => {
      files.set(path, content);
    },
    readFile: async (_pid, path) => files.get(path) ?? null,
    deleteFile: async (_pid, path) => {
      files.delete(path);
    },
    listFiles: async () => [...files.keys()],
    createRelease: async (_pid, rel) => {
      releases.push(rel);
    },
    listReleases: async () => releases,
    updateRelease: async (_pid, ver, patch) => {
      const i = releases.findIndex((r) => r.version === ver);
      if (i >= 0) releases[i] = { ...releases[i], ...patch };
    },
    getSyncShas: async () => ({ ...syncShas }),
    setSyncShas: async (_pid, shas) => {
      syncShas = { ...shas };
    },
  };
}

const RC_EMPTY_PROJECTS = `dublin_core:
  type: book
  conformsto: rc0.2
  format: text/usfm
  language:
    identifier: en
    title: English
  rights: CC BY-SA 4.0
projects: []
`;

const titUsfm = String.raw`\id TIT EN
\h Titus
\c 1
\p
\v 1 One
`;

const titUsfmChanged = String.raw`\id TIT EN
\h Titus
\c 1
\p
\v 1 Two
`;

const RC_WITH_TIT = `dublin_core:
  type: book
  conformsto: rc0.2
  format: text/usfm
  language:
    identifier: en
  rights: CC BY-SA 4.0
projects:
  - identifier: TIT
    title: Titus
    path: ./56-TIT.usfm
    sort: 56
`;

describe('importSingleBookUsfmFile', () => {
  test('throws when file has no \\\\id', async () => {
    const s = makeStorage();
    await s.writeFile('p1', 'manifest.yaml', RC_EMPTY_PROJECTS);
    await expect(importSingleBookUsfmFile({ storage: s, projectId: 'p1', text: 'no marker' })).rejects.toThrow(
      'book id',
    );
  });

  test('RC: adds a new book from file when not in manifest', async () => {
    const s = makeStorage();
    await s.writeFile('p1', 'manifest.yaml', RC_EMPTY_PROJECTS);
    const gen = String.raw`\id GEN
\h Genesis
\c 1
\p
\v 1 In the beginning
`;
    const { importedPaths, conflicts } = await importSingleBookUsfmFile({ storage: s, projectId: 'p1', text: gen });
    expect(conflicts).toHaveLength(0);
    expect(importedPaths).toContain('01-GEN.usfm');
    expect(await s.readFile('p1', '01-GEN.usfm')).toBe(gen);
    const y = await s.readFile('p1', 'manifest.yaml');
    expect(y).toContain('01-GEN.usfm');
    expect(y).toContain('identifier: GEN');
  });

  test('RC: same content as local produces no conflict', async () => {
    const s = makeStorage();
    await s.writeFile('p1', 'manifest.yaml', RC_WITH_TIT);
    await s.writeFile('p1', '56-TIT.usfm', titUsfm);
    const { conflicts } = await importSingleBookUsfmFile({ storage: s, projectId: 'p1', text: titUsfm });
    expect(conflicts).toHaveLength(0);
  });

  test('RC: divergent content yields a file conflict', async () => {
    const s = makeStorage();
    await s.writeFile('p1', 'manifest.yaml', RC_WITH_TIT);
    await s.writeFile('p1', '56-TIT.usfm', titUsfm);
    const { conflicts, importedPaths } = await importSingleBookUsfmFile({
      storage: s,
      projectId: 'p1',
      text: titUsfmChanged,
    });
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0]?.path).toBe('56-TIT.usfm');
    expect(conflicts[0]?.oursText).toContain('One');
    expect(conflicts[0]?.theirsText).toContain('Two');
    expect(importedPaths).toHaveLength(0);
  });
});

describe('readBookUsfmForExport', () => {
  test('returns content and filename from path basename', async () => {
    const s = makeStorage();
    await s.writeFile('p1', '56-TIT.usfm', titUsfm);
    const r = await readBookUsfmForExport({ storage: s, projectId: 'p1', path: '56-TIT.usfm' });
    expect(r.content).toBe(titUsfm);
    expect(r.filename).toBe('56-TIT.usfm');
  });
});
