import type { SelectedText, TextReferenceResult, TextReferenceStatus, VerseSnapshot } from '@usfm-tools/types';

function snapKey(v: VerseSnapshot): string {
  return `${v.chapter}:${v.verse}`;
}

/** Order `current` to match `selected.verseSnapshots` book order (same chapter:verse sequence). */
function alignSnapshots(
  selected: SelectedText,
  current: VerseSnapshot[],
): VerseSnapshot[] | null {
  if (selected.verseSnapshots.length === 0) return current.length ? current : null;
  const byKey = new Map(current.map((v) => [snapKey(v), v] as const));
  const out: VerseSnapshot[] = [];
  for (const s of selected.verseSnapshots) {
    const c = byKey.get(snapKey(s));
    if (!c) return null;
    out.push(c);
  }
  return out;
}

function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  let match = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] === longer[i]!) match++;
  }
  return match / longer.length;
}

/**
 * Resolve immutable `selectedText` against current verse text.
 * @see Enhanced project model — text reference resolution.
 */
export function resolveTextReference(selected: SelectedText, current: VerseSnapshot[]): TextReferenceResult {
  const aligned = alignSnapshots(selected, current);
  if (!aligned || aligned.length === 0) {
    return { status: 'stale' as TextReferenceStatus };
  }

  const first = aligned[0]!;
  const last = aligned[aligned.length - 1]!;

  if (aligned.length === 1) {
    const t = first.text;
    const slice = t.slice(selected.startOffset, selected.endOffset);
    if (slice === selected.text) {
      return {
        status: 'exact',
        highlightStart: selected.startOffset,
        highlightEnd: selected.endOffset,
      };
    }
    const idx = t.indexOf(selected.text);
    if (idx >= 0) {
      return {
        status: 'relocated',
        highlightStart: idx,
        highlightEnd: idx + selected.text.length,
      };
    }
    const sim = similarity(selected.text, t);
    if (sim >= 0.7) {
      return { status: 'approximate', highlightStart: 0, highlightEnd: Math.min(t.length, selected.text.length) };
    }
    return { status: 'stale' };
  }

  const joined = aligned.map((v) => v.text).join(' ');
  const snapJoined = selected.verseSnapshots.map((v) => v.text).join(' ');
  const idx = joined.indexOf(selected.text);
  if (idx >= 0) {
    const expectedAtZero =
      selected.startOffset === 0 &&
      selected.endOffset === last.text.length &&
      selected.text === joined.slice(0, selected.text.length);
    if (expectedAtZero && joined.startsWith(selected.text)) {
      return { status: 'exact', highlightStart: idx, highlightEnd: idx + selected.text.length };
    }
    return { status: 'relocated', highlightStart: idx, highlightEnd: idx + selected.text.length };
  }

  const sim = similarity(snapJoined, joined);
  if (sim >= 0.7) {
    return { status: 'approximate', highlightStart: 0, highlightEnd: Math.min(joined.length, selected.text.length) };
  }
  return { status: 'stale' };
}
