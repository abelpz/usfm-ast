import { USFM_BOOK_CODES } from '@usfm-tools/editor';

const FIRST_NT = 'MAT';
const LAST_NT = 'REV';

export type BookCodeGroup = 'ot' | 'nt' | 'other';

export function bookCodeGroup(code: string): BookCodeGroup {
  const idx = USFM_BOOK_CODES.findIndex(([c]) => c === code);
  if (idx < 0) return 'other';
  const ntStart = USFM_BOOK_CODES.findIndex(([c]) => c === FIRST_NT);
  const ntEnd = USFM_BOOK_CODES.findIndex(([c]) => c === LAST_NT);
  if (ntStart < 0 || ntEnd < 0) return 'other';
  if (idx < ntStart) return 'ot';
  if (idx >= ntStart && idx <= ntEnd) return 'nt';
  return 'other';
}

export function groupedBookSelectItems(): {
  ot: { code: string; name: string }[];
  nt: { code: string; name: string }[];
  other: { code: string; name: string }[];
} {
  const ot: { code: string; name: string }[] = [];
  const nt: { code: string; name: string }[] = [];
  const other: { code: string; name: string }[] = [];
  for (const [code, name] of USFM_BOOK_CODES) {
    const g = bookCodeGroup(code);
    const row = { code, name };
    if (g === 'ot') ot.push(row);
    else if (g === 'nt') nt.push(row);
    else other.push(row);
  }
  return { ot, nt, other };
}
