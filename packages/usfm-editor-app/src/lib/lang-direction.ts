/**
 * Resolve block text direction for a BCP-47 language tag using Door43 langnames (`ld`)
 * when available, with hardcoded fallbacks for common RTL codes (including OL `hbo`).
 */

import { getLangnames, type DcsLangnameEntry } from '@/lib/dcs-langnames-cache';

/** Guaranteed RTL when langnames is unavailable (offline first boot). */
const HARDCODED_RTL = new Set([
  'hbo',
  'arc',
  'ar',
  'fa',
  'ur',
  'he',
  'yi',
  'ps',
  'dv',
  'syr',
  'ku-arab',
]);

export function directionForLangSync(
  lc: string | undefined,
  entries?: Pick<DcsLangnameEntry, 'lc' | 'ld'>[],
): 'ltr' | 'rtl' {
  if (!lc) return 'ltr';
  const norm = lc.trim().toLowerCase();
  if (HARDCODED_RTL.has(norm)) return 'rtl';
  const root = norm.split('-')[0] ?? '';
  if (root && HARDCODED_RTL.has(root)) return 'rtl';
  const hit = entries?.find((e) => e.lc.toLowerCase() === norm);
  return hit?.ld === 'rtl' ? 'rtl' : 'ltr';
}

export async function directionForLang(
  lc: string | undefined,
  host?: string,
): Promise<'ltr' | 'rtl'> {
  if (!lc) return 'ltr';
  const entries = await getLangnames(host).catch(() => [] as DcsLangnameEntry[]);
  return directionForLangSync(lc, entries);
}
