import { HelpMarkdown, rcHrefToTwTaArticle } from '@usfm-tools/help-markdown';
import type { HelpEntry, HelpLink } from '@usfm-tools/types';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Fragment, memo, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { GetArticleTitle, GetEntryTitleFromRc } from '@/hooks/useArticleTitles';
import type { ProcessedHelpEntry } from '@/lib/helps-compute';
import { cn } from '@/lib/utils';

type Props = {
  /** Pre-computed in a Web Worker — gateway quotes, alignment, and render flags. */
  processedEntries: ProcessedHelpEntry[];
  /** True while the worker is catching up after a chapter or source change. */
  busy?: boolean;
  onOpenLink: (link: HelpLink) => void;
  /** Clear token-based filter (shown as icon button when {@link filtered}). */
  onClearFilter?: () => void;
  filtered?: boolean;
  /** Resolved TA/TW article titles -- hides the raw ID slug on link buttons. */
  getTitle?: GetArticleTitle;
  /** Same titles keyed by full `rc://…` href for markdown bodies (tc-study parity). */
  getEntryTitleFromRc?: GetEntryTitleFromRc;
  /** Block direction for gateway-language quotes (from loaded reference `langCode`). */
  sourceTextDir?: 'ltr' | 'rtl';
};

/**
 * Render a gateway-language quote, styling the " … " gap markers that appear when
 * matched tokens are non-contiguous (e.g. "Y … oró" where "Jonás" is between them).
 */
function GatewayQuote({ text }: { text: string }) {
  const GAP = ' \u2026 ';
  if (!text.includes(GAP)) return <>{text}</>;
  const parts = text.split(GAP);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="text-muted-foreground/70 mx-0.5 not-italic text-xs" aria-label="gap">
              {'\u2026'}
            </span>
          )}
          {part}
        </Fragment>
      ))}
    </>
  );
}

/** Kebab-slug to human readable fallback, e.g. "figs-explicit". */
function slugLabel(id: string): string {
  return id.split('/').pop() ?? id;
}

const HelpsNoteMarkdown = memo(function HelpsNoteMarkdown({
  content,
  onOpenLink,
  getEntryTitleFromRc,
}: {
  content: string;
  onOpenLink: (link: HelpLink) => void;
  getEntryTitleFromRc?: GetEntryTitleFromRc;
}) {
  const t = content.trim();
  const onInternalLinkClick = useCallback(
    (href: string, linkType: 'rc' | 'relative' | 'unknown') => {
      if (linkType === 'rc') {
        const art = rcHrefToTwTaArticle(href);
        if (art) {
          const resolved = getEntryTitleFromRc?.(href);
          onOpenLink({
            type: art.kind,
            id: art.id,
            displayText: resolved ?? art.id,
          });
        }
      }
    },
    [onOpenLink, getEntryTitleFromRc],
  );

  if (!t) return null;
  return (
    <HelpMarkdown
      content={t}
      className="help-note-md text-muted-foreground min-w-0 max-w-full break-words text-sm leading-relaxed [overflow-wrap:anywhere]"
      getEntryTitle={getEntryTitleFromRc}
      onInternalLinkClick={onInternalLinkClick}
    />
  );
});

function helpSectionKey(e: HelpEntry): string {
  if (e.ref.segment === 'bookIntro') return 'book-intro';
  if (e.ref.segment === 'chapterIntro') return `ch-${e.ref.chapter}-intro`;
  return `v-${e.ref.chapter}-${e.ref.verse}`;
}

function helpSectionHeading(e: HelpEntry): string {
  const seg = e.ref.segment;
  if (seg === 'bookIntro') return 'Book introduction';
  if (seg === 'chapterIntro') return `Chapter ${e.ref.chapter} introduction`;
  return `Verse ${e.ref.verse}`;
}

function resourceAccentClass(resourceType: string): { border: string; badge: string } {
  const u = resourceType.toUpperCase();
  if (u.includes('TWL') || u.includes('WORDS')) {
    return {
      border: 'border-l-purple-500',
      badge: 'bg-purple-100/80 text-purple-800 dark:bg-purple-950/50 dark:text-purple-200',
    };
  }
  if (u.includes('TN') || u.includes('NOTE')) {
    return {
      border: 'border-l-amber-500',
      badge: 'bg-amber-100/80 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100',
    };
  }
  return { border: 'border-l-primary/50', badge: 'bg-muted text-muted-foreground' };
}

export const HelpsTab = memo(function HelpsTab({
  processedEntries,
  busy = false,
  onOpenLink,
  onClearFilter,
  filtered,
  getTitle,
  getEntryTitleFromRc,
  sourceTextDir,
}: Props) {

  if (processedEntries.length === 0) {
    return (
      <div className="text-muted-foreground space-y-2 p-2 text-sm">
        <p>No translation helps loaded for this view.</p>
        <p className="text-xs">
          Pick a source language to auto-discover helps, or wait for catalog / TSV loading to finish.
        </p>
      </div>
    );
  }

  const showSectionHeaders = !filtered;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      {busy ? (
        <div className="text-muted-foreground flex shrink-0 items-center justify-center py-1" aria-label="Updating helps">
          <Loader2 className="size-4 animate-spin" aria-hidden />
        </div>
      ) : null}
      {filtered && onClearFilter ? (
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-xs"
            aria-label="Back"
            onClick={onClearFilter}
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back
          </Button>
        </div>
      ) : null}
      <ScrollArea className="min-h-[120px] min-w-0 flex-1 rounded-md border">
        <ul className="min-w-0 max-w-full space-y-3 p-3 text-sm">
          {processedEntries.map((row, idx, arr) => {
            const e = row.entry;
            const prev = arr[idx - 1]?.entry;
            const showV = showSectionHeaders && (!prev || helpSectionKey(prev) !== helpSectionKey(e));
            const accent = resourceAccentClass(e.resourceType);
            const { gateway, rawOrig, showCatalogQuote, showOrigAsQuote, showQuoteBlock } = row;
            return (
              <li key={e.id} className="min-w-0 max-w-full">
                {showV ? (
                  <div className="text-muted-foreground mb-1 border-b border-border/60 pb-0.5 font-mono text-xs">
                    {helpSectionHeading(e)}
                  </div>
                ) : null}
                <div
                  className={cn(
                    'border-border min-w-0 max-w-full overflow-x-hidden rounded-md border border-l-4 p-2',
                    accent.border,
                  )}
                >
                  {showQuoteBlock ? (
                    <div className="mb-2 min-w-0 max-w-full rounded-md bg-gradient-to-r from-blue-50/90 to-indigo-50/80 px-3 py-2 dark:from-blue-950/40 dark:to-indigo-950/30">
                      <div className="space-y-2">
                        {gateway ? (
                          <div className="text-base leading-relaxed" dir={sourceTextDir ?? 'auto'}>
                            <span className="text-foreground italic">
                              &ldquo;
                              <GatewayQuote text={gateway} />
                              &rdquo;
                            </span>
                          </div>
                        ) : null}
                        {showCatalogQuote ? (
                          <div
                            className={cn(
                              'space-y-0.5',
                              gateway && 'border-border/60 text-muted-foreground border-t pt-2 text-sm',
                            )}
                          >
                            <div className="text-muted-foreground font-mono text-[10px] font-medium uppercase tracking-wide">
                              {gateway ? 'Catalog quote (debug)' : 'Catalog quote'}
                            </div>
                            <div className="text-foreground/95 font-mono text-sm italic tracking-tight" lang="und" dir="auto">
                              &ldquo;{rawOrig}&rdquo;
                            </div>
                          </div>
                        ) : null}
                        {!gateway && !showCatalogQuote && showOrigAsQuote ? (
                          <div className="text-base leading-relaxed" dir={sourceTextDir ?? 'auto'}>
                            <span
                              className="text-foreground/95 font-mono text-sm italic tracking-tight"
                              lang="und"
                            >
                              &ldquo;{rawOrig}&rdquo;
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {e.content ? (
                    <div className="mb-2 break-words">
                      <HelpsNoteMarkdown
                        content={e.content}
                        onOpenLink={onOpenLink}
                        getEntryTitleFromRc={getEntryTitleFromRc}
                      />
                    </div>
                  ) : null}
                  {e.links?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {e.links.map((l) => {
                        const title =
                          l.type === 'ta' || l.type === 'tw' ? getTitle?.(l.type, l.id) : null;
                        const label = title ?? l.displayText ?? slugLabel(l.id);
                        return (
                          <Button
                            key={`${l.type}-${l.id}`}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => onOpenLink(l)}
                          >
                            {label}
                          </Button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
});
