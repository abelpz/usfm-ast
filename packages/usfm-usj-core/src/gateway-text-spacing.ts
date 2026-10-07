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

  // What can only open a word or a quotation: brackets, opening quotes and the inverted marks of Spanish.
  const opens = /^[([{«„“‘¡¿]/u.test(next);

  if (/\d$/u.test(a) && isLetter(b)) return true;
  if (/[)\]}"'»]/u.test(a) && isWordContinue(b)) return true;
  if (isWordContinue(a) && (opens || /^["']/u.test(next))) return true;
  // After the punctuation that ends a clause or closes a quotation, what opens the next one stands apart
  // («dijo:» + «¡Que»). A straight quote opens and closes alike, so it is left to the rule above.
  if (/[.!?:;,»”’)\]}]/u.test(a) && opens) return true;
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
