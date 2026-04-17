/**
 * Tests for CatalogSyncEngine with mocked fetch and in-memory storage.
 */
import type { CachedSourceFile, CachedSourceRepo, SourceCacheStorage } from '@usfm-tools/types';
import { CatalogSyncEngine, type CatalogEntryInfo, type DownloadProgress } from '../src/source-cache/catalog-sync-engine';

// ---------------------------------------------------------------------------
// In-memory SourceCacheStorage mock
// ---------------------------------------------------------------------------

class InMemoryCacheStorage implements SourceCacheStorage {
  private repos = new Map<string, CachedSourceRepo>();
  private files = new Map<string, CachedSourceFile>();
  private pins = new Map<string, import('@usfm-tools/types').ProjectSourcePin>();

  private repoKey(repoId: string, tag: string) { return `${repoId}@${tag}`; }
  private fileKey(repoId: string, tag: string, path: string) { return `${repoId}@${tag}:${path}`; }

  async listLanguages() {
    const langs = new Set([...this.repos.values()].map((r) => r.langCode).filter(Boolean));
    return [...langs].sort();
  }

  async listCachedRepos(langCode?: string) {
    const all = [...this.repos.values()];
    return langCode ? all.filter((r) => r.langCode === langCode) : all;
  }
  async getCachedRepo(repoId: string, tag: string) {
    return this.repos.get(this.repoKey(repoId, tag)) ?? null;
  }
  async putCachedRepo(repo: CachedSourceRepo, files: CachedSourceFile[]) {
    this.repos.set(this.repoKey(repo.repoId, repo.releaseTag), repo);
    for (const f of files) this.files.set(this.fileKey(f.repoId, f.releaseTag, f.path), f);
  }
  async deleteCachedRepo(repoId: string, tag: string) {
    this.repos.delete(this.repoKey(repoId, tag));
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(`${repoId}@${tag}:`)) this.files.delete(key);
    }
  }
  async getCachedFile(repoId: string, tag: string, path: string) {
    return this.files.get(this.fileKey(repoId, tag, path)) ?? null;
  }
  async listCachedFiles(repoId: string, tag: string) {
    const prefix = `${repoId}@${tag}:`;
    return [...this.files.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  }
  async getPin(projectId: string, repoId: string) {
    return this.pins.get(`${projectId}:${repoId}`) ?? null;
  }
  async listPins(projectId: string) {
    return [...this.pins.values()].filter((p) => p.projectId === projectId);
  }
  async listAllPins() {
    return [...this.pins.values()];
  }
  async setPin(pin: import('@usfm-tools/types').ProjectSourcePin) {
    this.pins.set(`${pin.projectId}:${pin.repoId}`, pin);
  }
  async removePin(projectId: string, repoId: string) {
    this.pins.delete(`${projectId}:${repoId}`);
  }
  async getReferencedSnapshots() {
    return [...this.pins.values()].map((p) => ({ repoId: p.repoId, releaseTag: p.pinnedTag }));
  }
  async garbageCollect() {
    const refs = await this.getReferencedSnapshots();
    const refSet = new Set(refs.map((r) => this.repoKey(r.repoId, r.releaseTag)));
    let removed = 0;
    for (const [key, repo] of this.repos) {
      if (!refSet.has(this.repoKey(repo.repoId, repo.releaseTag))) {
        this.repos.delete(key);
        removed++;
      }
    }
    return removed;
  }
}

// ---------------------------------------------------------------------------
// Helpers to build fake catalog API responses
// ---------------------------------------------------------------------------

function fakeCatalogResponse(entries: object[]): object {
  return { data: entries, metadata: { total_count: entries.length } };
}

function fakeCatalogEntry(repoId: string, tag: string, langCode = 'en'): object {
  return {
    full_name: repoId,
    language: langCode,
    subject: 'Aligned Bible',
    release: { tag_name: tag },
    ingredients: [
      { path: './01-GEN.usfm', identifier: 'gen' },
      { path: 'README.md', identifier: 'readme' },
    ],
  };
}

function fakeFileContent(content: string): object {
  const b64 = Buffer.from(content, 'utf8').toString('base64');
  return { content: b64 };
}

// ---------------------------------------------------------------------------
// listCatalogEntries
// ---------------------------------------------------------------------------

describe('CatalogSyncEngine — listCatalogEntries', () => {
  it('parses a single catalog entry with release tag', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeCatalogResponse([fakeCatalogEntry('en/en_ult', 'v87', 'en')]),
    });
    const storage = new InMemoryCacheStorage();
    const engine = new CatalogSyncEngine(storage, {
      httpFetch: mockFetch as unknown as typeof fetch,
      subjects: ['Aligned Bible'],
    });
    const entries = await engine.listCatalogEntries('en');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.repoId).toBe('en/en_ult');
    expect(entries[0]!.releaseTag).toBe('v87');
    expect(entries[0]!.langCode).toBe('en');
  });

  it('skips entries with no tag_name', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeCatalogResponse([
        { full_name: 'en/en_ult', language: 'en', subject: 'Aligned Bible', release: {} },
      ]),
    });
    const storage = new InMemoryCacheStorage();
    const engine = new CatalogSyncEngine(storage, {
      httpFetch: mockFetch as unknown as typeof fetch,
      subjects: ['Aligned Bible'],
    });
    const entries = await engine.listCatalogEntries('en');
    expect(entries).toHaveLength(0);
  });

  it('parses object-style ingredients', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeCatalogResponse([
        {
          full_name: 'en/en_ult',
          language: 'en',
          subject: 'Aligned Bible',
          release: { tag_name: 'v87' },
          ingredients: {
            './01-GEN.usfm': { identifier: 'gen', size: 1000 },
            './README.md': { identifier: 'readme', size: 200 },
          },
        },
      ]),
    });
    const storage = new InMemoryCacheStorage();
    const engine = new CatalogSyncEngine(storage, {
      httpFetch: mockFetch as unknown as typeof fetch,
      subjects: ['Aligned Bible'],
    });
    const entries = await engine.listCatalogEntries('en');
    expect(entries[0]?.ingredients).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// downloadLanguage
// ---------------------------------------------------------------------------

describe('CatalogSyncEngine — downloadLanguage', () => {
  it('calls putCachedRepo for each repo in the catalog', async () => {
    const catalogResponse = fakeCatalogResponse([fakeCatalogEntry('en/en_ult', 'v87')]);
    const fileResponse = fakeFileContent('\\id GEN\n\\c 1\n\\v 1 In the beginning');

    const mockFetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/catalog/search')) {
        return Promise.resolve({ ok: true, json: async () => catalogResponse });
      }
      return Promise.resolve({ ok: true, json: async () => fileResponse });
    });

    const storage = new InMemoryCacheStorage();
    const progressEvents: DownloadProgress[] = [];
    const engine = new CatalogSyncEngine(storage, {
      httpFetch: mockFetch as unknown as typeof fetch,
      subjects: ['Aligned Bible'],
      onProgress: (p) => progressEvents.push(p),
    });

    await engine.downloadLanguage('en');
    const repos = await storage.listCachedRepos();
    expect(repos.some((r) => r.repoId === 'en/en_ult')).toBe(true);
    expect(progressEvents.length).toBeGreaterThan(0);
  });

  it('skipIfCached=true skips already-cached repo', async () => {
    const catalogResponse = fakeCatalogResponse([fakeCatalogEntry('en/en_ult', 'v87')]);
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => catalogResponse,
    });

    const storage = new InMemoryCacheStorage();
    // Pre-populate the cache.
    await storage.putCachedRepo({
      repoId: 'en/en_ult', langCode: 'en', subject: 'Aligned Bible',
      releaseTag: 'v87', downloadedAt: '2026-01-01T00:00:00Z', sizeBytes: 0, fileCount: 0,
    }, []);

    const engine = new CatalogSyncEngine(storage, {
      httpFetch: mockFetch as unknown as typeof fetch,
      subjects: ['Aligned Bible'],
    });

    await engine.downloadLanguage('en', { skipIfCached: true });
    // The file content fetch (second API call) should NOT have been made.
    const contentFetchCalls = mockFetch.mock.calls.filter(
      ([url]: [string]) => url.includes('/contents/'),
    );
    expect(contentFetchCalls).toHaveLength(0);
  });

  it('aborts download when signal is aborted', async () => {
    const catalogResponse = fakeCatalogResponse([
      fakeCatalogEntry('en/en_ult', 'v87'),
      fakeCatalogEntry('en/en_ust', 'v50'),
    ]);
    const fileResponse = fakeFileContent('content');

    const mockFetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/catalog/search')) {
        return Promise.resolve({ ok: true, json: async () => catalogResponse });
      }
      return Promise.resolve({ ok: true, json: async () => fileResponse });
    });

    const storage = new InMemoryCacheStorage();
    const engine = new CatalogSyncEngine(storage, {
      httpFetch: mockFetch as unknown as typeof fetch,
      subjects: ['Aligned Bible'],
    });

    const controller = new AbortController();
    // Abort immediately before calling download.
    controller.abort();
    await engine.downloadLanguage('en', { signal: controller.signal });

    // No repos should have been cached since signal was already aborted.
    const repos = await storage.listCachedRepos();
    expect(repos).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// checkForUpdates
// ---------------------------------------------------------------------------

describe('CatalogSyncEngine — checkForUpdates', () => {
  it('returns map of repoId → latest release tag', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ tag_name: 'v88' }],
    });
    const storage = new InMemoryCacheStorage();
    const engine = new CatalogSyncEngine(storage, {
      httpFetch: mockFetch as unknown as typeof fetch,
    });
    const tags = await engine.checkForUpdates(['en/en_ult']);
    expect(tags.get('en/en_ult')).toBe('v88');
  });

  it('ignores repos with no releases', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    const storage = new InMemoryCacheStorage();
    const engine = new CatalogSyncEngine(storage, {
      httpFetch: mockFetch as unknown as typeof fetch,
    });
    const tags = await engine.checkForUpdates(['en/en_ult']);
    expect(tags.has('en/en_ult')).toBe(false);
  });
});
