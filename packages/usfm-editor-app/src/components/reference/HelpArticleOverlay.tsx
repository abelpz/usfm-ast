import { HelpMarkdown, rcHrefToTwTaArticle, removeFirstHeading } from '@usfm-tools/help-markdown';
import type { HelpLink } from '@usfm-tools/types';
import { X } from 'lucide-react';
import { useCallback } from 'react';

import { Button } from '@/components/ui/button';
import type { GetEntryTitleFromRc } from '@/hooks/useArticleTitles';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string | null;
  loading: boolean;
  error: string | null;
  /** Localized TW/TA titles for `rc://` links inside the article (same language as catalog). */
  getEntryTitleFromRc?: GetEntryTitleFromRc;
  /** Open TW/TA when user follows a resource link in the article body. */
  onOpenResource?: (link: HelpLink) => void;
};

/**
 * Full-bleed overlay inside the reference column (not a root modal dialog).
 */
export function HelpArticleOverlay({
  open,
  onClose,
  title,
  body,
  loading,
  error,
  getEntryTitleFromRc,
  onOpenResource,
}: Props) {
  const onInternalLinkClick = useCallback(
    (href: string, linkType: 'rc' | 'relative' | 'unknown') => {
      if (linkType !== 'rc' || !onOpenResource) return;
      const art = rcHrefToTwTaArticle(href);
      if (!art) return;
      const resolved = getEntryTitleFromRc?.(href);
      onOpenResource({
        type: art.kind,
        id: art.id,
        displayText: resolved ?? art.id,
      });
    },
    [onOpenResource, getEntryTitleFromRc],
  );

  if (!open) return null;

  const md = body && onOpenResource ? removeFirstHeading(body) : body;

  return (
    <div className="bg-background border-border absolute inset-0 z-30 flex min-h-0 flex-col rounded-md border shadow-md">
      <div className="border-border flex shrink-0 items-center justify-between gap-2 border-b px-2 py-1.5">
        <h2 className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
        <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onClose} aria-label="Close article">
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="text-foreground min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 text-sm leading-relaxed">
        {loading ? <p className="text-muted-foreground">Loading…</p> : null}
        {error ? <p className="text-destructive">{error}</p> : null}
        {!loading && !error && md ? (
          onOpenResource ? (
            <HelpMarkdown
              content={md}
              className="help-article-md min-w-0 max-w-full break-words [overflow-wrap:anywhere]"
              getEntryTitle={getEntryTitleFromRc}
              onInternalLinkClick={onInternalLinkClick}
            />
          ) : (
            <pre className="text-muted-foreground whitespace-pre-wrap font-mono text-xs">{md}</pre>
          )
        ) : null}
      </div>
    </div>
  );
}
