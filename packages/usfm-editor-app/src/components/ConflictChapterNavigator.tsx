import type { EditorContentPage, ScriptureSession } from '@usfm-tools/editor';
import { Book, ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ConflictChapterNavigatorProps = {
  session: ScriptureSession;
  conflictChapters: number[];
  onConflictChapterNavigate?: (chapter: number) => void;
};

function pageKey(p: EditorContentPage): string {
  if (p.kind === 'chapter') return `chapter:${p.chapter}`;
  return p.kind;
}

function paginatedPageAriaLabel(p: EditorContentPage): string {
  if (p.kind === 'identification') return 'Book information';
  if (p.kind === 'introduction') return 'Introduction';
  return String(p.chapter);
}

function PaginatedPageGlyph({
  page,
  iconClass = 'size-4',
}: {
  page: EditorContentPage;
  iconClass?: string;
}) {
  if (page.kind === 'identification') {
    return <Book className={cn('shrink-0', iconClass)} aria-hidden />;
  }
  if (page.kind === 'introduction') {
    return <ScrollText className={cn('shrink-0', iconClass)} aria-hidden />;
  }
  return <span className="tabular-nums">{page.chapter}</span>;
}

export const ConflictChapterNavigator = memo(function ConflictChapterNavigator({
  session,
  conflictChapters,
  onConflictChapterNavigate,
}: ConflictChapterNavigatorProps) {
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);

  useEffect(() => {
    const unsub = session.onChange(() => rerender());
    return unsub;
  }, [session, rerender]);

  const pages = useMemo(() => session.getNavigableContentPages(), [session]);
  const current = session.getContentPage();
  const conflictSet = useMemo(() => new Set(conflictChapters), [conflictChapters]);
  const currentIndex = pages.findIndex((p) => pageKey(p) === pageKey(current));
  const canPrev = currentIndex > 0;
  const canNext = currentIndex >= 0 && currentIndex < pages.length - 1;

  const goToPage = useCallback((page: EditorContentPage) => {
    if (page.kind === 'chapter') {
      session.navigateToChapter(page.chapter);
      onConflictChapterNavigate?.(page.chapter);
      return;
    }
    session.setContentPage(page);
  }, [onConflictChapterNavigate, session]);

  if (pages.length === 0) return null;

  return (
    <div className="border-border bg-card/50 rounded-xl border px-2 py-1 shadow-sm">
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          disabled={!canPrev}
          aria-label="Previous page"
          onClick={() => {
            const prev = pages[currentIndex - 1];
            if (prev) goToPage(prev);
          }}
        >
          <ChevronLeft className="size-4" />
        </Button>

        <div className="scrollbar-thin bg-muted/60 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-md px-1.5 py-1">
          {pages.map((page) => {
            const active = pageKey(page) === pageKey(current);
            const conflicted = page.kind === 'chapter' && conflictSet.has(page.chapter);
            return (
              <Button
                key={pageKey(page)}
                type="button"
                size={page.kind === 'chapter' ? 'sm' : 'icon'}
                variant={active ? 'default' : 'outline'}
                className={cn(
                  page.kind === 'chapter'
                    ? 'h-7 min-w-7 px-1.5 text-xs font-medium tabular-nums'
                    : 'h-7 w-7 shrink-0',
                  conflicted && !active && 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50',
                  conflicted && active && 'border-red-600 bg-red-600 text-white hover:bg-red-600 dark:border-red-500 dark:bg-red-600 dark:text-white',
                )}
                aria-current={active ? 'true' : undefined}
                aria-label={page.kind === 'chapter' ? undefined : paginatedPageAriaLabel(page)}
                title={conflicted ? 'Chapter has conflicts' : paginatedPageAriaLabel(page)}
                onClick={() => goToPage(page)}
              >
                <PaginatedPageGlyph page={page} iconClass="size-3.5" />
              </Button>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          disabled={!canNext}
          aria-label="Next page"
          onClick={() => {
            const next = pages[currentIndex + 1];
            if (next) goToPage(next);
          }}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
});
