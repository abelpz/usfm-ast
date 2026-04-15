import type { HelpRefSegment } from '@usfm-tools/types';

export type ParsedHelpsReference = {
  chapter: number;
  verse: number;
  segment?: HelpRefSegment;
};

/**
 * Parse unfoldingWord-style TN/TWL `Reference` cells:
 * - `front:intro` — book-level introduction
 * - `2:intro` — chapter 2 introduction (before \\v 1)
 * - `3:15` — normal verse
 */
export function parseHelpsTsvReference(refRaw: string): ParsedHelpsReference | null {
  const ref = refRaw.trim();
  if (!ref) return null;
  const lower = ref.toLowerCase();
  if (lower === 'front:intro') {
    return { chapter: 0, verse: 0, segment: 'bookIntro' };
  }
  const intro = /^(\d+):intro$/i.exec(ref);
  if (intro) {
    const chapter = Number(intro[1]);
    if (!chapter) return null;
    return { chapter, verse: 0, segment: 'chapterIntro' };
  }
  const verse = /^(\d+):(\d+)$/.exec(ref);
  if (!verse) return null;
  const chapter = Number(verse[1]);
  const v = Number(verse[2]);
  if (!chapter || !v) return null;
  return { chapter, verse: v };
}
