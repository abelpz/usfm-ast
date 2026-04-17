/**
 * Offline Source Cache management page.
 *
 * Lets translators download full language bundles from the DCS catalog so the
 * app works without internet access. Displays download progress, cached repos,
 * and allows deleting individual snapshots or running GC.
 */
import { Button } from '@/components/ui/button';
import { getSourceCacheStorage } from '@/hooks/useSourceCache';
import { useSourceCache } from '@/hooks/useSourceCache';
import type { CachedSourceRepo, ProjectSourcePin } from '@usfm-tools/types';
import {
  clearProjectSourcePins,
  pinProjectToLatestCachedRelease,
  upgradeProjectPin,
} from '@usfm-tools/editor-adapters';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpCircle,
  CheckCircle2,
  Download,
  Loader2,
  Pin,
  RefreshCw,
  Trash2,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function groupReposByLang(repos: CachedSourceRepo[]): Map<string, CachedSourceRepo[]> {
  const map = new Map<string, CachedSourceRepo[]>();
  for (const r of repos) {
    const arr = map.get(r.langCode) ?? [];
    arr.push(r);
    map.set(r.langCode, arr);
  }
  return map;
}

export function SourceCachePage() {
  const cache = useSourceCache();

  const [langInput, setLangInput] = useState('');
  const [hostInput, setHostInput] = useState('git.door43.org');
  const [gcMessage, setGcMessage] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    repoId: string;
    releaseTag: string;
  } | null>(null);

  // Version pins state
  const [pins, setPins] = useState<ProjectSourcePin[]>([]);
  const [upgradingPin, setUpgradingPin] = useState<string | null>(null);

  const loadAllPins = useCallback(async () => {
    const storage = getSourceCacheStorage();
    const allPins = await storage.listAllPins().catch(() => []);
    setPins(allPins);
  }, []);

  useEffect(() => {
    void loadAllPins();
  }, [loadAllPins, cache.repos]);

  const handleUpgrade = useCallback(
    async (pin: ProjectSourcePin) => {
      const storage = getSourceCacheStorage();
      setUpgradingPin(`${pin.projectId}:${pin.repoId}`);
      try {
        await upgradeProjectPin(storage, pin.projectId, pin.repoId);
        await loadAllPins();
      } catch {
        /* ignore — no upgrade available */
      } finally {
        setUpgradingPin(null);
      }
    },
    [loadAllPins],
  );

  const handleRepinToLatest = useCallback(
    async (pin: ProjectSourcePin) => {
      const storage = getSourceCacheStorage();
      setUpgradingPin(`${pin.projectId}:${pin.repoId}`);
      try {
        await pinProjectToLatestCachedRelease(storage, pin.projectId, pin.repoId);
        await loadAllPins();
      } catch {
        /* ignore */
      } finally {
        setUpgradingPin(null);
      }
    },
    [loadAllPins],
  );

  const handleClearPins = useCallback(
    async (projectId: string) => {
      const storage = getSourceCacheStorage();
      try {
        await clearProjectSourcePins(storage, projectId);
        await loadAllPins();
      } catch {
        /* ignore */
      }
    },
    [loadAllPins],
  );

  const handleDownload = useCallback(() => {
    const lang = langInput.trim();
    if (!lang) return;
    void cache.downloadLanguage(lang, hostInput.trim() || undefined);
  }, [cache, langInput, hostInput]);

  const handleGc = useCallback(async () => {
    const removed = await cache.garbageCollect();
    setGcMessage(
      removed === 0
        ? 'No unused snapshots found.'
        : `Removed ${removed} unreferenced snapshot${removed === 1 ? '' : 's'}.`,
    );
    setTimeout(() => setGcMessage(null), 4000);
  }, [cache]);

  const handleDelete = useCallback(
    async (repoId: string, releaseTag: string) => {
      await cache.deleteRepo(repoId, releaseTag);
      setDeleteConfirm(null);
    },
    [cache],
  );

  const byLang = groupReposByLang(cache.repos);
  const isDownloading = cache.downloadStatus === 'downloading';
  const totalSize = cache.repos.reduce((s, r) => s + r.sizeBytes, 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      {/* Back navigation */}
      <Link
        to="/"
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors w-fit"
      >
        <ArrowLeft className="size-4" />
        Back to Home
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Offline Source Cache</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Download translation resources for offline use. Cached resources are pinned to a
            specific release so they remain stable for ongoing projects.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={cache.refresh} aria-label="Refresh">
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {/* Download panel */}
      <div className="bg-card border-border rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-medium">Download a language bundle</h2>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-muted-foreground text-xs">Language code (BCP 47)</label>
              <input
                className="border-input bg-background rounded-md border px-3 py-1.5 text-sm"
                placeholder="e.g. en, es, fr, pt-BR"
                value={langInput}
                onChange={(e) => setLangInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDownload()}
                disabled={isDownloading}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-muted-foreground text-xs">DCS host</label>
              <input
                className="border-input bg-background rounded-md border px-3 py-1.5 text-sm"
                placeholder="git.door43.org"
                value={hostInput}
                onChange={(e) => setHostInput(e.target.value)}
                disabled={isDownloading}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleDownload}
              disabled={isDownloading || !langInput.trim()}
            >
              {isDownloading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              {isDownloading ? 'Downloading…' : 'Download'}
            </Button>
            {isDownloading && (
              <Button variant="outline" size="sm" onClick={cache.cancelDownload}>
                Cancel
              </Button>
            )}
          </div>

          {/* Progress */}
          {cache.progress && (
            <div className="bg-muted/60 rounded-md p-3 text-xs">
              <div className="text-foreground font-medium">{cache.progress.message}</div>
              {cache.progress.filesTotal > 0 && (
                <div className="bg-muted mt-2 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round(
                        (cache.progress.filesCompleted / cache.progress.filesTotal) * 100,
                      )}%`,
                    }}
                  />
                </div>
              )}
              <div className="text-muted-foreground mt-1">
                {formatBytes(cache.progress.totalBytesDownloaded)} downloaded
              </div>
            </div>
          )}

          {/* Error */}
          {cache.error && (
            <div className="text-destructive flex items-start gap-2 text-xs">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{cache.error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Cached repos */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">
            Cached resources
            {cache.repos.length > 0 && (
              <span className="text-muted-foreground ml-2 font-normal">
                {cache.repos.length} snapshot{cache.repos.length !== 1 ? 's' : ''} ·{' '}
                {formatBytes(totalSize)} total
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {gcMessage && (
              <span className="text-muted-foreground text-xs">{gcMessage}</span>
            )}
            <Button variant="ghost" size="sm" className="text-xs" onClick={handleGc}>
              <Trash2 className="mr-1 size-3" />
              Clean up
            </Button>
          </div>
        </div>

        {cache.loading && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        )}

        {!cache.loading && cache.repos.length === 0 && (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-sm">
            <WifiOff className="size-8 opacity-30" />
            <span>No resources cached yet. Download a language bundle above.</span>
          </div>
        )}

        {[...byLang.entries()].map(([lang, langRepos]) => (
          <div key={lang} className="border-border rounded-lg border overflow-hidden">
            <div className="bg-muted/40 border-border border-b px-3 py-2 text-xs font-medium uppercase tracking-wide">
              {lang}
            </div>
            <div className="divide-border divide-y">
              {langRepos.map((repo) => {
                const isPendingDelete =
                  deleteConfirm?.repoId === repo.repoId &&
                  deleteConfirm?.releaseTag === repo.releaseTag;
                return (
                  <div
                    key={`${repo.repoId}@${repo.releaseTag}`}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <CheckCircle2 className="text-muted-foreground size-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{repo.repoId}</div>
                      <div className="text-muted-foreground text-xs">
                        {repo.subject} · {repo.releaseTag} · {formatBytes(repo.sizeBytes)} ·{' '}
                        {repo.fileCount} files
                      </div>
                    </div>
                    {isPendingDelete ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground text-xs">Delete?</span>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => handleDelete(repo.repoId, repo.releaseTag)}
                        >
                          Yes
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => setDeleteConfirm(null)}
                        >
                          No
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive size-7 shrink-0"
                        aria-label="Delete snapshot"
                        onClick={() =>
                          setDeleteConfirm({
                            repoId: repo.repoId,
                            releaseTag: repo.releaseTag,
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Version pins */}
      {pins.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Project source pins</h2>
          <div className="border-border rounded-lg border overflow-hidden divide-border divide-y">
            {pins.map((pin) => {
              const key = `${pin.projectId}:${pin.repoId}`;
              const isUpgrading = upgradingPin === key;
              return (
                <div key={key} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{pin.repoId}</div>
                    <div className="text-muted-foreground text-xs">
                      Project: {pin.projectId} · Pinned: {pin.pinnedTag}
                      {pin.availableTag && (
                        <span className="text-amber-600 ml-2">→ {pin.availableTag} available</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {pin.availableTag && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleUpgrade(pin)}
                        disabled={isUpgrading}
                      >
                        {isUpgrading ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <ArrowUpCircle className="size-3.5" />
                        )}
                        Upgrade
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-muted-foreground"
                      title="Re-pin to latest cached release"
                      onClick={() => handleRepinToLatest(pin)}
                      disabled={isUpgrading}
                    >
                      <Pin className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-muted-foreground hover:text-destructive"
                      title="Clear all pins for this project"
                      onClick={() => handleClearPins(pin.projectId)}
                      disabled={isUpgrading}
                    >
                      <XCircle className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
