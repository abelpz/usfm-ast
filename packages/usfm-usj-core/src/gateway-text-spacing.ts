/**
 * When stripping alignments or flattening verse inline, adjacent string fragments can lack a
 * literal space in the USJ array (e.g. consecutive `\\w` nodes). Insert a single ASCII space only
 * when boundaries would otherwise glue (Latin/CJK letters, digits, marks).
 */

export function needsSpaceBetween(prev: string, next: string): boolean {
  if (!prev || !next) return false;
  if (/\s$/u.test(prev) || /^\s/u.test(next)) return false;

  const a = prev[prev.length - 1]!;
  const b = next[0]!;

  const isLetter = (c: string) => /\p{L}/u.test(c);
  const isMark = (c: string) => /\p{M}/u.test(c);
  const isNum = (c: string) => /\p{N}/u.test(c);

  const isWordContinue = (c: string) => isLetter(c) || isNum(c) || isMark(c);

  if (/\d$/u.test(a) && isLetter(b)) return true;
  if (/[)\]}"'»]/u.test(a) && isWordContinue(b)) return true;
  if (isWordContinue(a) && /^[([{"'«„]/u.test(next)) return true;
  if (/[.!?:;]$/u.test(a) && isLetter(b)) return true;
  if (/[,;]$/u.test(a) && isLetter(b)) return true;
  if (isWordContinue(a) && isWordContinue(b)) return true;

  return false;
}

export function appendGatewayText(prev: string, next: string): string {
  if (!next) return prev;
  if (!prev) return next;
  return needsSpaceBetween(prev, next) ? `${prev} ${next}` : `${prev}${next}`;
}
