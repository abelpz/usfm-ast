import type { SourceTextSession, ScriptureSession } from '@usfm-tools/editor';
import type { HelpEntry } from '@usfm-tools/types';
import { useEffect, useMemo } from 'react';

import { getPrimaryVerseContext } from '@/lib/verse-at-caret';

export type AnnotatedVerseModel = {
  chapter: number;
  verse: number;
};

/**
 * Current target chapter:verse from the editor caret (for helps context).
 */
export function useAnnotatedVerse(
  targetSession: ScriptureSession | null,
  _sourceSession: SourceTextSession | null,
  /** Kept for API stability; helps are pushed via {@link useHelpsDecorations}. */
  _twl: HelpEntry[],
  _tn: HelpEntry[],
  /** Increment when the target editor document or selection changes (e.g. `session.onChange`). */
  revision = 0,
): AnnotatedVerseModel | null {
  return useMemo(() => {
    void revision;
    void _twl;
    void _tn;
    if (!targetSession) return null;
    const ctx = getPrimaryVerseContext(targetSession);
    if (!ctx) return null;
    return { chapter: ctx.chapter, verse: ctx.verse };
    // sourceSession is intentionally excluded: this memo only reads from
    // targetSession. Listing sourceSession caused an extra recompute on every
    // tab switch even though the chapter:verse result was always the same.
  }, [targetSession, _twl, _tn, revision]);
}

/**
 * Push TWL/TN rows into the active reference {@link SourceTextSession} as ProseMirror decorations.
 */
export function useHelpsDecorations(
  sourceSession: SourceTextSession | null,
  twl: HelpEntry[],
  tn: HelpEntry[],
  /** Same revision as target editor (caret / doc changes). */
  revision: number,
): void {
  useEffect(() => {
    void revision;
    if (!sourceSession?.isLoaded()) return;
    sourceSession.setHelpsAnnotations(twl, tn);
  }, [sourceSession, twl, tn, revision]);
}

/** Aligns with {@link ScriptureSession.getContentPage} for TN/TWL scope in the Helps panel. */
export type HelpsContentPage =
  | { kind: 'introduction' }
  | { kind: 'chapter'; chapter: number };

/**
 * TWL + TN rows for the current editor page: book introduction (`front:intro`) on the
 * introduction/identification screens, or chapter N (including `N:intro` + normal verses).
 */
export function useHelpsForContentPage(
  twl: HelpEntry[],
  tn: HelpEntry[],
  page: HelpsContentPage | null,
): HelpEntry[] {
  return useMemo(() => {
    if (!page) return [];
    if (page.kind === 'introduction') {
      const rows = [...twl, ...tn].filter((e) => e.ref.segment === 'bookIntro');
      rows.sort((a, b) => a.id.localeCompare(b.id));
      return rows;
    }
    const ch = page.chapter;
    if (ch < 1) return [];
    const rows = [...twl, ...tn].filter((e) => {
      if (e.ref.segment === 'bookIntro') return false;
      if (e.ref.chapter !== ch) return false;
      return e.ref.segment === 'chapterIntro' || e.ref.verse > 0;
    });
    // Chapter `N:intro` rows must appear before `N:1`, `N:2`, … (TN/TWL often use verse 0 for intros).
    rows.sort((a, b) => {
      const aIntro = a.ref.segment === 'chapterIntro' ? -1 : a.ref.verse;
      const bIntro = b.ref.segment === 'chapterIntro' ? -1 : b.ref.verse;
      if (aIntro !== bIntro) return aIntro - bIntro;
      return a.id.localeCompare(b.id);
    });
    return rows;
  }, [twl, tn, page]);
}
