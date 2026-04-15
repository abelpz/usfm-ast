import { extractRcHrefs, rcHrefToTwTaArticle } from '@usfm-tools/help-markdown';
import type { HelpEntry } from '@usfm-tools/types';
import { useCallback, useEffect, useReducer, useRef } from 'react';

import { fetchHelpArticleMarkdown } from '@/lib/fetch-help-article';
import type { HelpsResourceConfig } from '@/lib/helps-config-storage';

/** Extract the first H1 heading line from a markdown file. */
export function extractMarkdownH1(md: string): string | null {
  const m = /^#\s+(.+)/m.exec(md);
  return m ? m[1].trim() : null;
}

/** Module-level cache survives HMR but is reset on hard reload. */
const titleCache = new Map<string, string>();

export type GetArticleTitle = (type: 'ta' | 'tw', id: string) => string | null;

export type GetEntryTitleFromRc = (rcHref: string) => string | null;

export type ArticleTitleResolvers = {
  getTitle: GetArticleTitle;
  getEntryTitleFromRc: GetEntryTitleFromRc;
};

function cacheKey(config: HelpsResourceConfig, type: 'ta' | 'tw', id: string): string {
  const repo = type === 'tw' ? config.twArticleRepo : config.taArticleRepo;
  return `${repo}:${type}:${id}`;
}

/**
 * Lazily fetches TA and TW article titles for all links found in `entries`
 * (both `links[]` array and any `rc://…` in `content`).
 *
 * Cache keys include the TW/TA repo so switching languages does not reuse the wrong locale.
 */
export function useArticleTitles(
  entries: HelpEntry[],
  config: HelpsResourceConfig,
  token?: string,
): ArticleTitleResolvers {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const pending = useRef(new Set<string>());
  const configRef = useRef(config);
  const tokenRef = useRef(token);
  configRef.current = config;
  tokenRef.current = token;

  const repoSig = [
    config.twArticleOwner,
    config.twArticleRepo,
    config.twArticleRef,
    config.taArticleOwner,
    config.taArticleRepo,
    config.taArticleRef,
  ].join('|');

  const prevRepoSig = useRef<string | null>(null);
  useEffect(() => {
    if (prevRepoSig.current != null && prevRepoSig.current !== repoSig) {
      titleCache.clear();
      pending.current.clear();
    }
    prevRepoSig.current = repoSig;

    const toFetch: Array<{ type: 'ta' | 'tw'; id: string }> = [];
    const cfg = configRef.current;

    for (const e of entries) {
      for (const link of e.links ?? []) {
        if (link.type !== 'ta' && link.type !== 'tw') continue;
        const key = cacheKey(cfg, link.type as 'ta' | 'tw', link.id);
        if (!titleCache.has(key) && !pending.current.has(key)) {
          toFetch.push({ type: link.type as 'ta' | 'tw', id: link.id });
          pending.current.add(key);
        }
      }
      for (const href of extractRcHrefs(e.content)) {
        const art = rcHrefToTwTaArticle(href);
        if (!art) continue;
        const key = cacheKey(cfg, art.kind, art.id);
        if (!titleCache.has(key) && !pending.current.has(key)) {
          toFetch.push({ type: art.kind, id: art.id });
          pending.current.add(key);
        }
      }
    }

    if (!toFetch.length) return;

    for (const { type, id } of toFetch) {
      const key = cacheKey(configRef.current, type, id);
      const articleId = type === 'ta' ? `${id}/title` : id;
      void fetchHelpArticleMarkdown({
        kind: type,
        articleId,
        config: configRef.current,
        token: tokenRef.current,
      })
        .then((md) => {
          const title = type === 'ta' ? md.trim() : extractMarkdownH1(md);
          if (title) {
            titleCache.set(key, title);
            bump();
          }
        })
        .catch(() => {})
        .finally(() => {
          pending.current.delete(key);
        });
    }
  }, [entries, repoSig, token]);

  const getTitle = useCallback((type: 'ta' | 'tw', id: string) => {
    return titleCache.get(cacheKey(configRef.current, type, id)) ?? null;
  }, []);

  const getEntryTitleFromRc = useCallback((href: string) => {
    const art = rcHrefToTwTaArticle(href);
    if (!art) return null;
    return titleCache.get(cacheKey(configRef.current, art.kind, art.id)) ?? null;
  }, []);

  return { getTitle, getEntryTitleFromRc };
}
