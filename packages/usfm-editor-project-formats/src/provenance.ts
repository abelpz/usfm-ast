import type { BookSourceProvenance, ProjectSourceSummary } from '@usfm-tools/types';
import type { ScriptureBurritoMeta, SBIngredient } from './scripture-burrito';
import type { ResourceContainerManifest } from './resource-container';
import { bookFromIngredientPath } from './scripture-burrito';

export { parseBookSourceProvenance } from './book-source-provenance';

const scopeKeyOk = /^([1-4][A-Z]{2}|[A-Z]{3})$/i;

function bookCodesForIngredient(path: string, ing: SBIngredient): string[] {
  const codes: string[] = [];
  if (ing.scope && typeof ing.scope === 'object') {
    for (const k of Object.keys(ing.scope)) {
      const ku = k.toUpperCase();
      if (scopeKeyOk.test(ku)) codes.push(ku);
    }
  }
  const fromPath = bookFromIngredientPath(path);
  if (codes.length === 0 && fromPath) codes.push(fromPath);
  return codes;
}

/** Per-book provenance from SB `ingredients[*]['x-source']` (shared across scope keys on that ingredient). */
export function projectSourceSummaryFromSb(meta: ScriptureBurritoMeta): ProjectSourceSummary {
  const byBook: Record<string, BookSourceProvenance[]> = {};
  for (const [path, ing] of Object.entries(meta.ingredients)) {
    const src = ing['x-source'];
    if (!src?.length) continue;
    for (const code of bookCodesForIngredient(path, ing)) {
      byBook[code] = src;
    }
  }
  return { byBook };
}

/** Per-book provenance from RC `projects[].x_source`. */
export function projectSourceSummaryFromRc(manifest: ResourceContainerManifest): ProjectSourceSummary {
  const byBook: Record<string, BookSourceProvenance[]> = {};
  for (const p of manifest.projects ?? []) {
    const code = (p.identifier ?? '').trim().toUpperCase();
    if (!code || !p.x_source?.length) continue;
    byBook[code] = p.x_source;
  }
  return { byBook };
}

/**
 * Mark books outdated when any recorded source for that book differs from `latest[book][sourceId].version`.
 * `sourceId` matches `BookSourceProvenance.identifier`.
 */
export function outdatedBooksBySource(
  summary: ProjectSourceSummary,
  latest: Record<string, Record<string, { version: string }>>,
): string[] {
  const bad = new Set<string>();
  for (const [book, sources] of Object.entries(summary.byBook)) {
    const want = latest[book];
    if (!want) continue;
    for (const s of sources) {
      const w = want[s.identifier];
      if (w && w.version !== s.version) bad.add(book);
    }
  }
  return [...bad].sort();
}
