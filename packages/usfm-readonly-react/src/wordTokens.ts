/**
 * Whitespace-preserving word split for read-only token spans (verse-scoped index + occurrence).
 */

import type { RenderSegment } from './segments.js';

export type WordOrGap = { kind: 'gap'; text: string } | { kind: 'word'; text: string };

/**
 * Strips leading/trailing Unicode punctuation (General_Category=P) for identity / occurrence.
 * E.g. `"Isaac;"` and `"Isaac"` both become `"Isaac"`. Inner punctuation (e.g. `don't`) is kept.
 * If nothing remains, returns the original string so purely punctual tokens stay distinct.
 */
export function normalizeWordIdentity(surface: string): string {
  if (!surface) return surface;
  let out = surface;
  const lead = /^\p{P}/u;
  const trail = /\p{P}$/u;
  while (out.length && lead.test(out)) out = out.slice(1);
  while (out.length && trail.test(out)) out = out.slice(0, -1);
  return out.length ? out : surface;
}

/** Split into runs of non-whitespace (“words”) and runs of whitespace (gaps), in order. */
export function splitWordsAndGaps(s: string): WordOrGap[] {
  if (!s) return [];
  return [...s.matchAll(/\S+|\s+/g)].map((m) => {
    const t = m[0];
    return /^\s+$/.test(t) ? ({ kind: 'gap', text: t } as const) : ({ kind: 'word', text: t } as const);
  });
}

export type VerseTokenBump = (verse: string, surface: string) => {
  wordIndexInVerse: number;
  occurrenceInVerse: number;
};

/**
 * Build a function that assigns the next 1-based word index **per verse** (document order)
 * and 1-based **occurrence** of the token’s {@link normalizeWordIdentity} within that verse
 * (so `"Isaac;"` and `"Isaac"` share one counter).
 */
export function createVerseTokenBumper(): VerseTokenBump {
  const wordIndexByVerse = new Map<string, number>();
  const occByVerse = new Map<string, Map<string, number>>();

  return (verse: string, surface: string) => {
    const wi = (wordIndexByVerse.get(verse) ?? 0) + 1;
    wordIndexByVerse.set(verse, wi);
    let m = occByVerse.get(verse);
    if (!m) {
      m = new Map();
      occByVerse.set(verse, m);
    }
    const identity = normalizeWordIdentity(surface);
    const occ = (m.get(identity) ?? 0) + 1;
    m.set(identity, occ);
    return { wordIndexInVerse: wi, occurrenceInVerse: occ };
  };
}

export type VerseTokenMeta = {
  wordIndexInVerse: number;
  occurrenceInVerse: number;
  /** 0-based index in {@link tokenizeGatewayUsj} for this verse, when resolved. */
  gatewayTokenIndex?: number;
};

/**
 * Stable 1-based word index and occurrence **per verse** for each word token.
 * Call once per document snapshot (e.g. `useMemo` on `groups`); do not call from render
 * with a long-lived bumper — that would double-count on every React re-render.
 */
export function buildTokenMetaByPieceKey(
  groups: { inline: RenderSegment[] }[],
  segmentKey: (gi: number, si: number, seg: RenderSegment) => string,
): Map<string, VerseTokenMeta> {
  const bump = createVerseTokenBumper();
  const out = new Map<string, VerseTokenMeta>();
  const verseCursor = { verse: '' };

  for (let gi = 0; gi < groups.length; gi++) {
    const inline = groups[gi].inline;
    for (let si = 0; si < inline.length; si++) {
      const seg = inline[si]!;
      const sk = segmentKey(gi, si, seg);

      if (seg.kind === 'verse') {
        verseCursor.verse = (seg.verseNum ?? '').trim();
        continue;
      }
      if (seg.kind === 'footnote') continue;
      if (
        seg.kind === 'text' ||
        seg.kind === 'intro-heading' ||
        seg.kind === 'heading-text' ||
        seg.kind === 'word'
      ) {
        const vRaw = (seg.enclosingVerse || verseCursor.verse || '').trim();
        const parts = splitWordsAndGaps(seg.text ?? '');
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (p.kind === 'word' && vRaw) {
            out.set(`${sk}-${i}`, bump(vRaw, p.text));
          }
        }
      }
    }
  }
  return out;
}
