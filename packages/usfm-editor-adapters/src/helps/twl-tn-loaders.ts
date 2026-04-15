import type { HelpEntry } from '@usfm-tools/types';

import { helpLinksFromSupportReference } from './content-helpers';
import { parseHelpsTsvReference } from './parse-helps-reference';

function splitTsvLine(line: string): string[] {
  return line.split('\t').map((c) => c.trim());
}

/** Minimal TSV Translation Words Links → {@link HelpEntry} rows (caller supplies `reference` column index). */
export function parseTwlTsv(tsv: string, options?: { referenceCol?: number; origWordsCol?: number; occurrenceCol?: number }): HelpEntry[] {
  const lines = tsv.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  if (lines.length < 2) return [];
  const header = splitTsvLine(lines[0]!);
  const refIdx = options?.referenceCol ?? header.findIndex((h) => /reference/i.test(h));
  const owIdx = options?.origWordsCol ?? header.findIndex((h) => /origwords/i.test(h));
  const occIdx = options?.occurrenceCol ?? header.findIndex((h) => /^occurrence$/i.test(h));
  // unfoldingWord en_twl uses "TWLink" as the column name; older/other repos use "SupportReference"
  const supIdx = header.findIndex((h) => /supportreference|twlink/i.test(h));
  // TWL rows are mostly structured columns (ref, id, tags, OL word, occurrence, rc link).
  // Do not dump the whole row into `content` — that reads like broken UI. Use a prose
  // column only when the sheet actually has one (some custom TWL variants do).
  const proseIdx = header.findIndex((h) =>
    /^(note|annotation|comment|definition|description)$/i.test(h.trim()),
  );
  const out: HelpEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitTsvLine(lines[i]!);
    const ref = refIdx >= 0 ? cols[refIdx] : '';
    const origWords = owIdx >= 0 ? cols[owIdx] : '';
    const occRawTwl = occIdx >= 0 ? cols[occIdx] : '';
    const occParsedTwl = Number(occRawTwl);
    const occ =
      occRawTwl !== '' && Number.isFinite(occParsedTwl) ? occParsedTwl : 1;
    const support = supIdx >= 0 ? cols[supIdx] : '';
    const content = proseIdx >= 0 ? (cols[proseIdx] ?? '').trim() : '';
    const parsed = parseHelpsTsvReference(ref);
    if (!parsed) continue;
    const { chapter, verse, segment } = parsed;
    const introSeg = segment === 'bookIntro' || segment === 'chapterIntro';
    if (!origWords.trim() && !introSeg) continue;
    if (introSeg && !origWords.trim() && !content.trim()) continue;
    if (segment === 'bookIntro') {
      // ok
    } else if (segment === 'chapterIntro') {
      if (!chapter) continue;
    } else {
      if (!chapter || !verse) continue;
    }
    const links = support ? helpLinksFromSupportReference(support) : undefined;
    const refObj =
      segment === 'bookIntro'
        ? { chapter: 0, verse: 0, segment: 'bookIntro' as const }
        : segment === 'chapterIntro'
          ? { chapter, verse: 0, segment: 'chapterIntro' as const }
          : { chapter, verse };
    out.push({
      id: `twl-${i}`,
      resourceType: 'words-links',
      ref: refObj,
      origWords,
      occurrence: occ,
      content,
      ...(links?.length ? { links } : {}),
    });
  }
  return out;
}

/** Minimal TSV Translation Notes → {@link HelpEntry} rows. */
export function parseTnTsv(tsv: string): HelpEntry[] {
  const lines = tsv.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  if (lines.length < 2) return [];
  const header = splitTsvLine(lines[0]!);
  const refIdx = header.findIndex((h) => /reference/i.test(h));
  const quoteIdx = header.findIndex((h) => /^quote$/i.test(h));
  const occIdx = header.findIndex((h) => /^occurrence$/i.test(h));
  const noteIdx = header.findIndex((h) => /note/i.test(h));
  const supIdx = header.findIndex((h) => /supportreference/i.test(h));
  const out: HelpEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitTsvLine(lines[i]!);
    const ref = refIdx >= 0 ? cols[refIdx] : '';
    const quote = quoteIdx >= 0 ? cols[quoteIdx] : '';
    const occRawTn = occIdx >= 0 ? cols[occIdx] : '';
    const occParsedTn = Number(occRawTn);
    const occ = occRawTn !== '' && Number.isFinite(occParsedTn) ? occParsedTn : 1;
    const content = noteIdx >= 0 ? cols[noteIdx] : '';
    const support = supIdx >= 0 ? cols[supIdx] : '';
    const parsed = parseHelpsTsvReference(ref);
    if (!parsed) continue;
    const { chapter, verse, segment } = parsed;
    const introSeg = segment === 'bookIntro' || segment === 'chapterIntro';
    if (!quote.trim() && !introSeg) continue;
    if (introSeg && !quote.trim() && !content.trim()) continue;
    if (segment === 'bookIntro') {
      // ok
    } else if (segment === 'chapterIntro') {
      if (!chapter) continue;
    } else {
      if (!chapter || !verse) continue;
    }
    const links = support ? helpLinksFromSupportReference(support) : undefined;
    const refObj =
      segment === 'bookIntro'
        ? { chapter: 0, verse: 0, segment: 'bookIntro' as const }
        : segment === 'chapterIntro'
          ? { chapter, verse: 0, segment: 'chapterIntro' as const }
          : { chapter, verse };
    out.push({
      id: `tn-${i}`,
      resourceType: 'notes',
      ref: refObj,
      origWords: quote,
      occurrence: occ,
      content,
      ...(links?.length ? { links } : {}),
    });
  }
  return out;
}
