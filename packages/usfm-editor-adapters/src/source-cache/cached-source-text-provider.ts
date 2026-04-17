/**
 * `SourceTextProvider` backed by the offline source cache (Layer 1).
 *
 * Reads raw USFM from `SourceCacheStorage` and parses it on demand.
 * Prefer `CacheFirstSourceTextProvider` when a `ProcessedCacheStorage` is
 * available — it adds a Layer 2 USJ cache so repeat loads are instant.
 */
import type { SourceTextProvider } from '@usfm-tools/editor-core';
import type { UsjDocument } from '@usfm-tools/editor-core';
import type { RepoId, SourceCacheStorage } from '@usfm-tools/types';

export interface CachedSourceTextProviderOptions {
  cache: SourceCacheStorage;
  repoId: RepoId;
  releaseTag: string;
  /** Relative ingredient path within the repo, e.g. `"01-GEN.usfm"`. */
  ingredientPath: string;
  /** BCP 47 language code — used for `langCode` on the provider. */
  langCode: string;
  /** Human-readable display name (e.g. `"ULT – English"`) */
  displayName: string;
}

export class CachedSourceTextProvider implements SourceTextProvider {
  readonly id: string;
  readonly displayName: string;
  readonly langCode: string;

  private readonly opts: CachedSourceTextProviderOptions;

  constructor(opts: CachedSourceTextProviderOptions) {
    this.opts = opts;
    this.id = `cached:${opts.repoId}@${opts.releaseTag}:${opts.ingredientPath}`;
    this.displayName = opts.displayName;
    this.langCode = opts.langCode;
  }

  async load(): Promise<UsjDocument> {
    const { cache, repoId, releaseTag, ingredientPath } = this.opts;

    const file = await cache.getCachedFile(repoId, releaseTag, ingredientPath);
    if (!file) {
      throw new Error(
        `CachedSourceTextProvider: file not found in cache — ` +
          `${repoId}@${releaseTag}:${ingredientPath}`,
      );
    }

    const { USFMParser } = await import('@usfm-tools/parser');
    const parser = new USFMParser({ silentConsole: true });
    parser.parse(file.content);
    return parser.toJSON() as UsjDocument;
  }
}
