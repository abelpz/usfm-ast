import type { ScriptureSession, SourceTextSession } from '@usfm-tools/editor';
import type { EditorContentPage } from '@usfm-tools/editor';
import { Book, ChevronDown, ChevronLeft, ChevronRight, ScrollText, SlidersHorizontal } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = {
  session: ScriptureSession;
  referenceSession?: SourceTextSession;
  onWindowNotice?: (msg: string) => void;
  /** When true, renders without the card border/background wrapper (for embedding in a topbar). */
  inline?: boolean;
};

function pageKey(p: EditorContentPage): string {
  if (p.kind === 'chapter') return `chapter:${p.chapter}`;
  return p.kind;
}

/** Visible label for non-paginated summary text only. */
function chapterRangeSummary(nums: number[], total: number): string {
  if (nums.length >= 1) {
    return nums[0] === nums[nums.length - 1]
      ? `${nums[0]} / ${total}`
      : `${nums[0]}–${nums[nums.length - 1]} / ${total}`;
  }
  return `${total}`;
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

/**
 * Merge the editor's navigable pages with additional chapters from the reference text.
 * Reference-only chapters are tagged so the UI can style them differently.
 */
function mergeWithReferencePages(
  editorPages: EditorContentPage[],
  refMaxChapter: number,
): { page: EditorContentPage; fromReference: boolean }[] {
  const editorChapters = new Set(
    editorPages.filter((p) => p.kind === 'chapter').map((p) => (p as { chapter: number }).chapter),
  );
  const result: { page: EditorContentPage; fromReference: boolean }[] = editorPages.map((p) => ({
    page: p,
    fromReference: false,
  }));
  for (let ch = 1; ch <= refMaxChapter; ch++) {
    if (!editorChapters.has(ch)) {
      result.push({ page: { kind: 'chapter', chapter: ch }, fromReference: true });
    }
  }
  result.sort((a, b) => {
    const aKind = a.page.kind;
    const bKind = b.page.kind;
    if (aKind !== 'chapter' && bKind !== 'chapter') return 0;
    if (aKind !== 'chapter') return -1;
    if (bKind !== 'chapter') return 1;
    return (a.page as { chapter: number }).chapter - (b.page as { chapter: number }).chapter;
  });
  return result;
}

export const SectionPicker = memo(function SectionPicker({ session, referenceSession, onWindowNotice, inline }: Props) {
  const maxSel = session.maxVisibleChapters;
  const contextN = session.getContextChapterRadius();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('1');
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);
  const lastSectionsRef = useRef(JSON.stringify(session.getVisibleSections()));

  useEffect(() => {
    const unsub = session.onVisibleSectionsChange(() => {
      const ser = JSON.stringify(session.getVisibleSections());
      if (ser !== lastSectionsRef.current) {
        lastSectionsRef.current = ser;
        onWindowNotice?.('Section window updated');
      }
      rerender();
    });
    const unsubCh = session.onChange(() => rerender());
    return () => {
      unsub();
      unsubCh();
    };
  }, [session, onWindowNotice, rerender]);

  // Re-render when a reference text is loaded / changes.
  useEffect(() => {
    if (!referenceSession) return;
    const unsub = referenceSession.onLoad(() => rerender());
    return unsub;
  }, [referenceSession, rerender]);

  const refMax = referenceSession?.isLoaded() ? referenceSession.getMaxChapterNumber() : 0;

  if (session.isPaginatedEditor()) {
    const editorPages = session.getNavigableContentPages();
    const allEntries = refMax > 0 ? mergeWithReferencePages(editorPages, refMax) : editorPages.map((p) => ({ page: p, fromReference: false }));
    const current = session.getContentPage();
    const idx = allEntries.findIndex((e) => pageKey(e.page) === pageKey(current));
    const canPrev = idx > 0;
    const canNext = idx >= 0 && idx < allEntries.length - 1;

    const goToEntry = (entry: { page: EditorContentPage; fromReference: boolean }) => {
      if (entry.page.kind === 'chapter') {
        session.navigateToChapter(entry.page.chapter);
      } else {
        session.setContentPage(entry.page);
      }
      rerender();
    };

    const inner = (
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          disabled={!canPrev}
          aria-label="Previous"
          onClick={() => {
            const prev = allEntries[idx - 1];
            if (prev) goToEntry(prev);
          }}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="scrollbar-thin bg-muted/60 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-md px-1.5 py-1">
          {allEntries.map(({ page: p, fromReference }) => {
            const active = pageKey(p) === pageKey(current);
            return (
              <Button
                key={pageKey(p)}
                type="button"
                size={p.kind === 'chapter' ? 'sm' : 'icon'}
                variant={active ? 'default' : fromReference ? 'ghost' : 'outline'}
                className={cn(
                  p.kind === 'chapter'
                    ? 'h-7 min-w-7 px-1.5 text-xs font-medium tabular-nums'
                    : 'h-7 w-7 shrink-0',
                  fromReference && !active && 'border border-dashed opacity-70',
                )}
                aria-label={p.kind === 'chapter' ? undefined : paginatedPageAriaLabel(p)}
                aria-current={active ? 'true' : undefined}
                title={fromReference && !active ? 'Chapter exists in reference only — will be created when visited' : undefined}
                onClick={() => goToEntry({ page: p, fromReference })}
              >
                {p.kind === 'chapter' ? (
                  p.chapter
                ) : (
                  <PaginatedPageGlyph page={p} iconClass="size-3.5" />
                )}
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
          aria-label="Next"
          onClick={() => {
            const next = allEntries[idx + 1];
            if (next) goToEntry(next);
          }}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    );
    if (inline) return inner;
    return (
      <div className="border-border bg-card/50 rounded-xl border px-2 py-1 shadow-sm">
        {inner}
      </div>
    );
  }

  // ── Non-paginated mode ─────────────────────────────────────────────────────

  const editorTotal = Math.max(1, session.getChapterCount());
  const total = Math.max(editorTotal, refMax);
  const selected = new Set(session.getVisibleChapterNumbers());
  const roles = session.getExpandedChapterRoles();
  const readonlySet = new Set(roles.filter((r) => r.readonly).map((r) => r.chapter));
  // Chapters present in the editor store (may be fewer than `total`)
  const editorChapterNums = new Set(
    session
      .getNavigableContentPages()
      .filter((p) => p.kind === 'chapter')
      .map((p) => (p as { chapter: number }).chapter),
  );

  const nums = [...selected].sort((a, b) => a - b);
  const limitText = chapterRangeSummary(nums, total);

  const hintText =
    nums.length >= 1
      ? nums.length > 1
        ? `±${contextN} · ${Math.min(...nums)}–${Math.max(...nums)}`
        : `±${contextN} · ${nums[0]}`
      : '';

  function goToChapter(c: number) {
    const cur = new Set(session.getVisibleChapterNumbers());
    if (cur.has(c)) cur.delete(c);
    else cur.add(c);
    let next = [...cur].sort((a, b) => a - b);
    if (next.length === 0) next = [1];
    if (next.length > maxSel) next = next.slice(0, maxSel);
    // Use navigateToChapter so reference-only chapters are created on demand.
    const refOnly = next.some((ch) => !editorChapterNums.has(ch));
    if (refOnly && next.length === 1) {
      session.navigateToChapter(next[0]!);
    } else {
      session.setVisibleChapters(next);
    }
    rerender();
  }

  function applyRange() {
    const a = Math.max(1, Math.min(total, Number(from) || 1));
    const b = Math.max(1, Math.min(total, Number(to) || a));
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const range: number[] = [];
    for (let i = lo; i <= hi; i++) range.push(i);
    const clamped = range.slice(0, maxSel);
    // If the target is a single reference-only chapter, use navigateToChapter.
    if (clamped.length === 1 && !editorChapterNums.has(clamped[0]!)) {
      session.navigateToChapter(clamped[0]!);
    } else {
      session.setVisibleChapters(clamped);
    }
    rerender();
  }

  const introOn = session.isIntroductionVisible();

  const nonPagInner = (
    <>
      <div className="flex items-center gap-2">
        <div className="scrollbar-none flex flex-1 gap-1 overflow-x-auto py-1">
          {Array.from({ length: total }, (_, i) => i + 1).map((c) => {
            const showMark = c > 1 && c % 10 === 0;
            const isSel = selected.has(c);
            const isRo = readonlySet.has(c);
            const isRefOnly = c > editorTotal && !editorChapterNums.has(c);
            return (
              <span key={c} className="flex items-center gap-1">
                {showMark ? (
                  <span className="text-muted-foreground px-0.5 text-[0.6rem] font-semibold">
                    {c}
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant={isSel ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    'h-8 min-w-8 px-2 font-medium',
                    isRo && !isSel && 'border-dashed opacity-60',
                    isRefOnly && !isSel && 'border-dashed opacity-60 text-muted-foreground',
                  )}
                  aria-pressed={isSel}
                  title={isRefOnly ? 'Chapter exists in reference only — will be created when visited' : undefined}
                  onClick={() => goToChapter(c)}
                >
                  {c}
                </Button>
              </span>
            );
          })}
        </div>
        <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
          {limitText}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-expanded={advancedOpen}
          aria-label="More navigation"
          onClick={() => setAdvancedOpen((o) => !o)}
        >
          {advancedOpen ? <ChevronDown className="size-4" /> : <SlidersHorizontal className="size-4" />}
        </Button>
      </div>
      {advancedOpen ? (
        <div className="border-border mt-2 flex flex-wrap items-center gap-2 border-t pt-2 text-sm">
          <Button
            type="button"
            variant={introOn ? 'secondary' : 'outline'}
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Introduction"
            aria-pressed={introOn}
            onClick={() => {
              session.setIntroductionVisible(!session.isIntroductionVisible());
              rerender();
            }}
          >
            <ScrollText className="size-4" aria-hidden />
          </Button>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              max={total}
              className="h-8 w-14 text-center"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              min={1}
              max={total}
              className="h-8 w-14 text-center"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <Button type="button" size="sm" variant="secondary" onClick={applyRange}>
              Go
            </Button>
          </div>
          {hintText ? <span className="text-muted-foreground text-xs">{hintText}</span> : null}
        </div>
      ) : null}
    </>
  );
  if (inline) return nonPagInner;
  return (
    <div className="border-border bg-card/50 rounded-xl border px-3 py-2 shadow-sm">
      {nonPagInner}
    </div>
  );
});
