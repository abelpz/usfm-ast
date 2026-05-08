import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { EditorContentPage } from '@usfm-tools/editor';
import type { FileConflict } from '@usfm-tools/types';
import { affectedChaptersFromUsfm } from '@usfm-tools/editor-adapters';
import { conflictsForBook } from '@/lib/file-conflict-helpers';

export type BookConflictsContextValue = {
  bookCode: string | null;
  bookConflicts: FileConflict[];
  /** Chapter numbers (>0) that genuinely differ in at least one conflict for this book. */
  conflictChapters: ReadonlySet<number>;
  /** True when at least one conflict has genuine front-matter differences. */
  hasFrontMatterConflict: boolean;
  /** True when the given EditorContentPage should render the conflict solver instead of the editor. */
  pageHasConflict: (page: EditorContentPage | null | undefined) => boolean;
};

const EMPTY_VALUE: BookConflictsContextValue = {
  bookCode: null,
  bookConflicts: [],
  conflictChapters: new Set(),
  hasFrontMatterConflict: false,
  pageHasConflict: () => false,
};

const BookConflictsContext = createContext<BookConflictsContextValue>(EMPTY_VALUE);

function isUsfmConflict(c: FileConflict): boolean {
  const l = c.path.toLowerCase();
  return l.endsWith('.usfm') || l.endsWith('.sfm');
}

/**
 * Derive genuinely-affected chapters for a single conflict.
 *
 * For USFM files: use the body-diff helper (slices by \c N, normalises
 * whitespace) — this avoids the OT engine's false chapter-0 attribution.
 * For everything else: fall back to chapterIndices from the engine.
 */
function resolvedChaptersForConflict(c: FileConflict): Set<number> {
  if (isUsfmConflict(c)) {
    // If either side is empty (deletion conflict), the full document changed.
    if (!c.oursText || !c.theirsText) {
      return new Set([0]);
    }
    return affectedChaptersFromUsfm(c.oursText, c.theirsText);
  }
  return new Set(c.chapterIndices);
}

export function BookConflictsProvider({
  bookCode,
  allPendingConflicts,
  children,
}: {
  bookCode: string | null;
  allPendingConflicts: FileConflict[];
  children: ReactNode;
}) {
  const value = useMemo<BookConflictsContextValue>(() => {
    if (!bookCode) return EMPTY_VALUE;
    const bookConflicts = conflictsForBook(allPendingConflicts, bookCode);
    if (bookConflicts.length === 0) return { ...EMPTY_VALUE, bookCode };

    const conflictChapters = new Set<number>();
    let hasFrontMatterConflict = false;

    for (const c of bookConflicts) {
      const affected = resolvedChaptersForConflict(c);
      for (const ch of affected) {
        if (ch === 0) {
          hasFrontMatterConflict = true;
        } else {
          conflictChapters.add(ch);
        }
      }
      // Non-USFM conflicts with empty chapterIndices → treat as front matter.
      if (!isUsfmConflict(c) && c.chapterIndices.length === 0) {
        hasFrontMatterConflict = true;
      }
    }

    return {
      bookCode,
      bookConflicts,
      conflictChapters,
      hasFrontMatterConflict,
      pageHasConflict: (page) => {
        if (!page) return false;
        if (page.kind === 'chapter') return conflictChapters.has(page.chapter);
        // identification + introduction map to "front matter"
        return hasFrontMatterConflict;
      },
    };
  }, [bookCode, allPendingConflicts]);

  return <BookConflictsContext.Provider value={value}>{children}</BookConflictsContext.Provider>;
}

export function useBookConflicts(): BookConflictsContextValue {
  return useContext(BookConflictsContext);
}
