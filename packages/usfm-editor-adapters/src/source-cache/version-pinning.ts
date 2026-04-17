/**
 * Version pinning utilities for project source repos.
 *
 * When a project opens a cached source, the current latest cached release is
 * pinned to it. Subsequent downloads of newer releases update the
 * `availableTag` field so the user can see an update is available — but the
 * project keeps loading from the pinned version until the user explicitly
 * upgrades.
 */
import type { ProjectSourcePin, RepoId, SourceCacheStorage } from '@usfm-tools/types';

/**
 * Pin a project to the latest cached release of a repo (or keep the current
 * pin if already pinned to the same tag). After this call, `getPin()` will
 * return a pin entry for this project+repo.
 */
export async function pinProjectToLatestCachedRelease(
  cache: SourceCacheStorage,
  projectId: string,
  repoId: RepoId,
): Promise<ProjectSourcePin> {
  const repos = await cache.listCachedRepos();
  const matching = repos
    .filter((r) => r.repoId === repoId)
    .sort((a, b) => (b.downloadedAt > a.downloadedAt ? 1 : -1));

  if (matching.length === 0) {
    throw new Error(`pinProjectToLatestCachedRelease: no cached release found for ${repoId}`);
  }

  const latest = matching[0]!;
  const existing = await cache.getPin(projectId, repoId);

  if (existing && existing.pinnedTag === latest.releaseTag) {
    return existing;
  }

  const pin: ProjectSourcePin = {
    projectId,
    repoId,
    pinnedTag: existing?.pinnedTag ?? latest.releaseTag,
    availableTag:
      existing && existing.pinnedTag !== latest.releaseTag ? latest.releaseTag : null,
  };

  await cache.setPin(pin);
  return pin;
}

/**
 * Mark that a newer release is available for all projects pinned to a repo.
 * Sets `availableTag = newTag` on every pin whose `pinnedTag` differs from `newTag`.
 * Call this after successfully downloading a newer release.
 */
export async function notifyNewReleaseAvailable(
  cache: SourceCacheStorage,
  repoId: RepoId,
  newTag: string,
): Promise<void> {
  const allPins = await cache.listAllPins();
  const affected = allPins.filter(
    (p) => p.repoId === repoId && p.pinnedTag !== newTag,
  );
  for (const pin of affected) {
    await cache.setPin({ ...pin, availableTag: newTag });
  }
}

/**
 * Upgrade a project's pin to the latest available cached release.
 * Clears `availableTag` on the new pin.
 */
export async function upgradeProjectPin(
  cache: SourceCacheStorage,
  projectId: string,
  repoId: RepoId,
): Promise<ProjectSourcePin> {
  const pin = await cache.getPin(projectId, repoId);
  if (!pin?.availableTag) {
    throw new Error(
      `upgradeProjectPin: no upgrade available for project ${projectId} repo ${repoId}`,
    );
  }

  const newPin: ProjectSourcePin = {
    projectId,
    repoId,
    pinnedTag: pin.availableTag,
    availableTag: null,
  };

  await cache.setPin(newPin);
  return newPin;
}

/**
 * Remove all source pins for a project and garbage-collect unreferenced
 * snapshots.
 */
export async function clearProjectSourcePins(
  cache: SourceCacheStorage,
  projectId: string,
): Promise<void> {
  const pins = await cache.listPins(projectId);
  for (const pin of pins) {
    await cache.removePin(projectId, pin.repoId);
  }
  await cache.garbageCollect();
}
