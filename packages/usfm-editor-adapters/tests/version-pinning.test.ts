/**
 * Tests for version-pinning utilities.
 * Uses a mock SourceCacheStorage to avoid IndexedDB dependency.
 */
import type { CachedSourceRepo, ProjectSourcePin, SourceCacheStorage } from '@usfm-tools/types';
import {
  pinProjectToLatestCachedRelease,
  upgradeProjectPin,
  clearProjectSourcePins,
} from '../src/source-cache/version-pinning';

// ---------------------------------------------------------------------------
// In-memory SourceCacheStorage stub for pinning tests
// ---------------------------------------------------------------------------

class PinTestStorage implements SourceCacheStorage {
  private repos: CachedSourceRepo[] = [];
  private pins = new Map<string, ProjectSourcePin>();

  addRepo(repo: CachedSourceRepo) { this.repos.push(repo); return this; }

  async listLanguages() {
    const langs = new Set(this.repos.map((r) => r.langCode).filter(Boolean));
    return [...langs].sort();
  }

  async listCachedRepos(langCode?: string) {
    return langCode ? this.repos.filter((r) => r.langCode === langCode) : [...this.repos];
  }
  async getCachedRepo(repoId: string, tag: string) {
    return this.repos.find((r) => r.repoId === repoId && r.releaseTag === tag) ?? null;
  }
  async putCachedRepo(_repo: CachedSourceRepo, _files: import('@usfm-tools/types').CachedSourceFile[]) {}
  async deleteCachedRepo(repoId: string, tag: string) {
    this.repos = this.repos.filter((r) => !(r.repoId === repoId && r.releaseTag === tag));
  }
  async getCachedFile() { return null; }
  async listCachedFiles() { return []; }
  async getPin(projectId: string, repoId: string) {
    return this.pins.get(`${projectId}:${repoId}`) ?? null;
  }
  async listPins(projectId: string) {
    return [...this.pins.values()].filter((p) => p.projectId === projectId);
  }
  async listAllPins() {
    return [...this.pins.values()];
  }
  async setPin(pin: ProjectSourcePin) {
    this.pins.set(`${pin.projectId}:${pin.repoId}`, pin);
  }
  async removePin(projectId: string, repoId: string) {
    this.pins.delete(`${projectId}:${repoId}`);
  }
  async getReferencedSnapshots() {
    return [...this.pins.values()].map((p) => ({ repoId: p.repoId, releaseTag: p.pinnedTag }));
  }
  gcCount = 0;
  async garbageCollect() { this.gcCount++; return 0; }
}

function makeRepo(tag: string, downloadedAt?: string): CachedSourceRepo {
  return {
    repoId: 'en/en_ult',
    langCode: 'en',
    subject: 'Aligned Bible',
    releaseTag: tag,
    downloadedAt: downloadedAt ?? `2026-01-0${tag.slice(-1)}T00:00:00Z`,
    sizeBytes: 0,
    fileCount: 0,
  };
}

// ---------------------------------------------------------------------------
// pinProjectToLatestCachedRelease
// ---------------------------------------------------------------------------

describe('pinProjectToLatestCachedRelease', () => {
  it('pins to the most recently downloaded release', async () => {
    const storage = new PinTestStorage();
    storage.addRepo(makeRepo('v80', '2026-01-01T00:00:00Z'));
    storage.addRepo(makeRepo('v81', '2026-01-02T00:00:00Z'));

    const pin = await pinProjectToLatestCachedRelease(storage, 'proj1', 'en/en_ult');
    expect(pin.pinnedTag).toBe('v81');
    expect(pin.availableTag).toBeNull();
  });

  it('is idempotent when pinned to the latest tag', async () => {
    const storage = new PinTestStorage();
    storage.addRepo(makeRepo('v80', '2026-01-01T00:00:00Z'));
    // Pin once.
    await pinProjectToLatestCachedRelease(storage, 'proj1', 'en/en_ult');
    // Pin again — should return the same pin without changes.
    const pin = await pinProjectToLatestCachedRelease(storage, 'proj1', 'en/en_ult');
    expect(pin.pinnedTag).toBe('v80');
    expect(pin.availableTag).toBeNull();
  });

  it('sets availableTag when already pinned to an older tag', async () => {
    const storage = new PinTestStorage();
    storage.addRepo(makeRepo('v80', '2026-01-01T00:00:00Z'));
    // Manually set an older pin.
    await storage.setPin({ projectId: 'proj1', repoId: 'en/en_ult', pinnedTag: 'v79', availableTag: null });
    // Now a newer release is in the cache.
    const pin = await pinProjectToLatestCachedRelease(storage, 'proj1', 'en/en_ult');
    expect(pin.pinnedTag).toBe('v79');
    expect(pin.availableTag).toBe('v80');
  });

  it('throws when no cached release exists for the repo', async () => {
    const storage = new PinTestStorage();
    await expect(
      pinProjectToLatestCachedRelease(storage, 'proj1', 'en/en_ult'),
    ).rejects.toThrow(/no cached release found/i);
  });
});

// ---------------------------------------------------------------------------
// upgradeProjectPin
// ---------------------------------------------------------------------------

describe('upgradeProjectPin', () => {
  it('moves pinnedTag to availableTag and clears availableTag', async () => {
    const storage = new PinTestStorage();
    await storage.setPin({ projectId: 'proj1', repoId: 'en/en_ult', pinnedTag: 'v79', availableTag: 'v80' });

    const newPin = await upgradeProjectPin(storage, 'proj1', 'en/en_ult');
    expect(newPin.pinnedTag).toBe('v80');
    expect(newPin.availableTag).toBeNull();
  });

  it('throws when no upgrade is available', async () => {
    const storage = new PinTestStorage();
    await storage.setPin({ projectId: 'proj1', repoId: 'en/en_ult', pinnedTag: 'v80', availableTag: null });

    await expect(
      upgradeProjectPin(storage, 'proj1', 'en/en_ult'),
    ).rejects.toThrow(/no upgrade available/i);
  });

  it('throws when no pin exists', async () => {
    const storage = new PinTestStorage();
    await expect(
      upgradeProjectPin(storage, 'proj1', 'en/en_ult'),
    ).rejects.toThrow(/no upgrade available/i);
  });
});

// ---------------------------------------------------------------------------
// clearProjectSourcePins
// ---------------------------------------------------------------------------

describe('clearProjectSourcePins', () => {
  it('removes all pins for a project', async () => {
    const storage = new PinTestStorage();
    await storage.setPin({ projectId: 'proj1', repoId: 'en/en_ult', pinnedTag: 'v80', availableTag: null });
    await storage.setPin({ projectId: 'proj1', repoId: 'en/en_ust', pinnedTag: 'v50', availableTag: null });
    await storage.setPin({ projectId: 'proj2', repoId: 'en/en_ult', pinnedTag: 'v80', availableTag: null });

    await clearProjectSourcePins(storage, 'proj1');

    expect(await storage.listPins('proj1')).toHaveLength(0);
    // proj2 pins must remain.
    expect(await storage.listPins('proj2')).toHaveLength(1);
  });

  it('runs garbageCollect after clearing pins', async () => {
    const storage = new PinTestStorage();
    await storage.setPin({ projectId: 'proj1', repoId: 'en/en_ult', pinnedTag: 'v80', availableTag: null });
    await clearProjectSourcePins(storage, 'proj1');
    expect(storage.gcCount).toBeGreaterThanOrEqual(1);
  });
});
