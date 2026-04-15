/**
 * Async markdown shell (tc-study `MarkdownRenderer` pattern): cache by content unless titles are async.
 */

import { useEffect, useState, type ReactNode } from 'react';

import type { RemarkMarkdownRendererOptions } from './remark-markdown-renderer';
import { RemarkMarkdownRenderer } from './remark-markdown-renderer';

const RENDER_CACHE_MAX = 80;
const renderCache = new Map<string, ReactNode>();

function cacheGet(key: string): ReactNode | undefined {
  return renderCache.get(key);
}

function cacheSet(key: string, node: ReactNode) {
  if (renderCache.size >= RENDER_CACHE_MAX) {
    const firstKey = renderCache.keys().next().value;
    if (firstKey !== undefined) renderCache.delete(firstKey);
  }
  renderCache.set(key, node);
}

function MarkdownSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      <div className="h-3 w-full max-w-full animate-pulse rounded bg-muted" />
      <div className="h-3 max-w-[95%] animate-pulse rounded bg-muted" />
      <div className="h-3 max-w-[88%] animate-pulse rounded bg-muted" />
    </div>
  );
}

export type HelpMarkdownProps = {
  content: string;
  className?: string;
  onInternalLinkClick?: RemarkMarkdownRendererOptions['onInternalLinkClick'];
  getEntryTitle?: RemarkMarkdownRendererOptions['getEntryTitle'];
};

export function HelpMarkdown({ content, className = '', onInternalLinkClick, getEntryTitle }: HelpMarkdownProps) {
  const useCache = !getEntryTitle;
  const cacheKey = content;
  const cached = useCache && content ? cacheGet(cacheKey) : undefined;
  const [renderedContent, setRenderedContent] = useState<ReactNode>(cached ?? null);
  const [isLoading, setIsLoading] = useState(!cached && Boolean(content));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!content) {
      setRenderedContent(null);
      setIsLoading(false);
      return;
    }

    if (useCache) {
      const hit = cacheGet(cacheKey);
      if (hit !== undefined) {
        setRenderedContent(hit);
        setIsLoading(false);
        return;
      }
    }

    let cancelled = false;

    const run = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const renderer = new RemarkMarkdownRenderer({
          linkTarget: '_blank',
          headerBaseLevel: 3,
          allowDangerousHtml: false,
          onInternalLinkClick,
          getEntryTitle,
        });

        const result = await renderer.renderToReact(content);
        if (cancelled) return;
        if (useCache) cacheSet(cacheKey, result);
        setRenderedContent(result);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
        setRenderedContent(<span className="text-destructive text-sm">Error rendering markdown</span>);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [content, onInternalLinkClick, getEntryTitle, useCache, cacheKey]);

  if (!content) return null;

  if (isLoading) {
    return (
      <div className={['min-w-0 max-w-full', className].filter(Boolean).join(' ')}>
        <MarkdownSkeleton className="text-sm leading-relaxed" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={['min-w-0 max-w-full text-destructive', className].filter(Boolean).join(' ')}>
        <p className="text-sm font-semibold">Error rendering markdown</p>
        <p className="mt-1 text-xs">{error}</p>
      </div>
    );
  }

  return (
    <div className={['min-w-0 max-w-full', className].filter(Boolean).join(' ')}>{renderedContent}</div>
  );
}
