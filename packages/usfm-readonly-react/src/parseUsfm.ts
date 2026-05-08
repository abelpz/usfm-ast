import type { AlignmentMap } from '@usfm-tools/usj-core';
import type { UsjDocument } from '@usfm-tools/usj-core';
import { splitUsjByChapter } from '@usfm-tools/usj-core';
import { stripAlignmentsForDisplay, type StripAlignmentsInput } from './stripAlignmentsForDisplay.js';
import * as ParserNs from '@usfm-tools/parser';
import { cjsNamed } from './interop.js';

const USFMParser = cjsNamed<
  new (options?: { silentConsole?: boolean }) => {
    parse(input?: string): unknown;
    toJSON(): unknown;
  }
>(ParserNs, 'USFMParser');

export type ParseUsfmOptions = {
  /**
   * When true (default), strip USFM alignment milestones so the tree is easier to render as plain text.
   * Same approach as `UsfmChapterDiffView` in usfm-editor-app.
   */
  stripAlignment?: boolean;
};

/**
 * Parse USFM string to a USJ document suitable for {@link splitUsjByChapter} / {@link collectSegments}.
 */
export function parseUsfmToUsj(usfm: string, options?: ParseUsfmOptions): UsjDocument | null {
  const r = parseUsfmToUsjWithAlignments(usfm, options);
  return r?.usj ?? null;
}

/**
 * Return the ordered list of chapter numbers present in an already-parsed
 * {@link UsjDocument}.
 *
 * Prefer this over {@link getUsfmChapters} when you are also passing the
 * document to `<UsfmReadonlyView usj={…}>` — parse once, share everywhere:
 *
 * ```ts
 * // Parse once
 * const usj = useMemo(() => parseUsfmToUsj(myUsfm), [myUsfm]);
 * const chapters = useMemo(() => getUsjChapters(usj), [usj]);
 * const [chapter, setChapter] = useState(() => chapters[0] ?? 1);
 *
 * // Component receives the pre-parsed document — no second parse
 * <UsfmReadonlyView usj={usj} chapter={chapter} />
 * ```
 *
 * The returned array may be non-contiguous for partial USFM files.
 * Returns `[]` for a null/undefined document.
 */
export function getUsjChapters(usj: UsjDocument | null | undefined): number[] {
  if (!usj) return [];
  return splitUsjByChapter(usj).map((s) => s.chapter);
}

/**
 * Convenience wrapper that parses a USFM string and returns its chapter list
 * in one call. Useful when you only need the chapter list and are **not**
 * rendering `<UsfmReadonlyView usfm={…}>` with the same string — otherwise
 * use {@link getUsjChapters} with a shared parsed document to avoid parsing
 * twice.
 *
 * Returns `[]` when the input cannot be parsed.
 */
export function getUsfmChapters(usfm: string): number[] {
  return getUsjChapters(parseUsfmToUsj(usfm, { stripAlignment: false }));
}

/**
 * Parse USFM to USJ and, when `stripAlignment` is not `false`, return the same
 * {@link stripAlignments} map the editor uses (`verseSid` → groups).
 */
export function parseUsfmToUsjWithAlignments(
  usfm: string,
  options?: ParseUsfmOptions,
): { usj: UsjDocument; alignments: AlignmentMap } | null {
  const stripAlignment = options?.stripAlignment !== false;
  try {
    const p = new USFMParser({ silentConsole: true });
    p.parse(usfm?.trim() ? usfm : '\\id XXX\n');
    let doc = p.toJSON() as UsjDocument;
    let alignments: AlignmentMap = {};
    if (stripAlignment) {
      const stripped = stripAlignmentsForDisplay(doc as StripAlignmentsInput);
      doc = stripped.usj;
      alignments = stripped.alignments;
    }
    return { usj: doc, alignments };
  } catch {
    return null;
  }
}
